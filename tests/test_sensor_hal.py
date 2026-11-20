"""
Unit tests for Sensor HAL, Pluggable Drivers, Calibration, and Signal Filtering
"""
import pytest
from core.sensor_hal.filters import MedianFilter, MovingAverageFilter
from core.sensor_hal.calibration import CalibrationData, nernst_ph_compensation, ec_temp_compensation
from core.sensor_hal.drivers.ph_drivers import PHSimulatorDriver, PHAnalogDriver, PHModbusDriver
from core.sensor_hal.drivers.turbidity_drivers import TurbidityAnalogDriver
from core.sensor_hal.manager import HardwareProfileManager
from core.sensor_hal.interface import SensorStatus


def test_median_filter_rejects_bubble_spikes():
    """
    Simulates optical sensor reading water when a bubble passes by.
    A bubble causes a sudden 1-sample sharp drop in voltage (e.g., 2.8V -> 0.9V -> 2.8V).
    MedianFilter must completely reject this bubble spike!
    """
    mf = MedianFilter(window_size=5)
    
    # Baseline clear water
    for _ in range(5):
        mf.filter(2.80)
    
    # Bubble passes through (1 sample drop)
    filtered = mf.filter(0.90)
    # The output MUST remain around 2.80V, rejecting the 0.90V bubble dip
    assert filtered == 2.80


def test_moving_average_smoothes_adc_noise():
    """
    Simulates random ADC thermal noise around 2.50V (+-0.05V).
    Moving average filter reduces variance.
    """
    ma = MovingAverageFilter(window_size=4)
    samples = [2.48, 2.52, 2.49, 2.51]
    res = 0.0
    for s in samples:
        res = ma.filter(s)
    
    assert pytest.approx(res, 0.01) == 2.50


def test_nernst_ph_temperature_compensation():
    """
    Nernst slope changes with temperature:
    At 25°C, slope = -3.5.
    At 35°C (hotter water), slope magnitude decreases because mV/pH increases.
    """
    calib = CalibrationData(ph_v7=2.50, ph_v4=3.05)
    raw_v = 2.80 # Acidic voltage
    
    ph_at_25 = nernst_ph_compensation(raw_v, calib, temp_c=25.0)
    ph_at_35 = nernst_ph_compensation(raw_v, calib, temp_c=35.0)
    
    assert ph_at_25 < 7.00
    assert ph_at_35 < 7.00
    # Because of temperature compensation, pH readings differ realistically
    assert ph_at_25 != ph_at_35


def test_ph_2point_calibration():
    """
    2-point calibration with buffer 7.00 and buffer 4.01.
    """
    calib = CalibrationData()
    # User puts probe in buffer 7.00, voltage is 2.48V
    calib.calibrate_ph_neutral(2.48)
    # User puts probe in buffer 4.01, voltage is 3.12V
    calib.calibrate_ph_acid(3.12)
    
    # Calculated slope: (7.0 - 4.01) / (2.48 - 3.12) = 2.99 / -0.64 = -4.67
    assert calib.ph_slope < 0
    assert pytest.approx(calib.ph_slope, 0.05) == -4.67


def test_ec_temperature_compensation():
    """
    EC compensation to standard 25°C:
    Warmer water conducts more electricity (+1.91%/°C), so normalized EC_25 must be lower than measured EC at 35°C.
    """
    calib = CalibrationData()
    ec_at_25 = ec_temp_compensation(raw_voltage=1.2, calib=calib, temp_c=25.0)
    ec_at_35 = ec_temp_compensation(raw_voltage=1.2, calib=calib, temp_c=35.0)
    
    assert ec_at_35 < ec_at_25


def test_driver_abstraction_produces_identical_normalized_schema():
    """
    CRITICAL ARCHITECTURAL TEST:
    Verify that whether we use Simulator, Analog ADC, or Modbus RS485,
    the resulting dictionary conforms 100% to the exact same normalized JSON schema.
    """
    calib = CalibrationData()
    sim_driver = PHSimulatorDriver(baseline=7.21)
    analog_driver = PHAnalogDriver(calib, simulated_voltage=2.44)
    modbus_driver = PHModbusDriver(slave_id=1, register=1, initial_val=7.21)

    r_sim = sim_driver.read(temp_c=25.0).to_dict()
    r_analog = analog_driver.read(temp_c=25.0).to_dict()
    r_modbus = modbus_driver.read(temp_c=25.0).to_dict()

    expected_keys = {"sensor", "value", "raw_value", "unit", "source", "status", "error_code"}
    assert set(r_sim.keys()) == expected_keys
    assert set(r_analog.keys()) == expected_keys
    assert set(r_modbus.keys()) == expected_keys

    assert r_sim["unit"] == "pH"
    assert r_analog["unit"] == "pH"
    assert r_modbus["unit"] == "pH"


def test_modbus_fault_and_offline_handling():
    """
    Verify industrial Modbus driver error detection (Timeout -> OFFLINE, CRC fail -> FAULT).
    """
    driver = PHModbusDriver(slave_id=1, register=1, initial_val=7.21)
    
    # 1. Normal state
    r = driver.read()
    assert r.status == SensorStatus.LIVE
    assert r.error_code == 0

    # 2. Timeout (sensor disconnected)
    driver.is_connected = False
    r = driver.read()
    assert r.status == SensorStatus.OFFLINE
    assert r.error_code == 101

    # 3. CRC mismatch
    driver.is_connected = True
    driver.force_crc_error = True
    r = driver.read()
    assert r.status == SensorStatus.FAULT
    assert r.error_code == 102


def test_hardware_profile_manager_switching():
    """
    Verify switching between Demo Analog, Production Modbus, and Simulator profiles.
    """
    mgr = HardwareProfileManager(HardwareProfileManager.PROFILE_DEMO)
    data_demo = mgr.read_all_normalized()
    assert data_demo["hardware_profile"] == HardwareProfileManager.PROFILE_DEMO
    assert "ph" in data_demo["readings"]
    assert data_demo["readings"]["ph"]["source"] == "hardware"

    # Switch to Production Modbus
    mgr.load_profile(HardwareProfileManager.PROFILE_PRODUCTION)
    data_prod = mgr.read_all_normalized()
    assert data_prod["hardware_profile"] == HardwareProfileManager.PROFILE_PRODUCTION
    assert data_prod["readings"]["ph"]["source"] == "hardware"

    # Switch to Simulator
    mgr.load_profile(HardwareProfileManager.PROFILE_SIMULATOR)
    data_sim = mgr.read_all_normalized()
    assert data_sim["hardware_profile"] == HardwareProfileManager.PROFILE_SIMULATOR
    assert data_sim["readings"]["ph"]["source"] == "simulator"
