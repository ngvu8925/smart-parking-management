import random
from ..interface import ISensorDriver, SensorReading, SensorStatus
from ..filters import MovingAverageFilter
from ..calibration import CalibrationData, nernst_ph_compensation


class PHSimulatorDriver(ISensorDriver):
    def __init__(self, baseline: float = 7.20):
        self.baseline = baseline
        self.current = baseline

    def init(self) -> None:
        self.current = self.baseline

    def read_raw(self) -> float:
        return 2.50 - ((self.current - 7.00) / 3.50)

    def calibrate_and_compensate(self, raw: float, temp_c: float) -> float:
        noise = random.uniform(-0.01, 0.01)
        self.current = max(0.0, min(14.0, self.current + noise))
        return self.current

    def apply_filter(self, calibrated_val: float) -> float:
        return calibrated_val

    def read(self, temp_c: float = 25.0) -> SensorReading:
        raw = self.read_raw()
        val = self.calibrate_and_compensate(raw, temp_c)
        return SensorReading(
            sensor="ph",
            value=val,
            raw_value=raw,
            unit="pH",
            source="simulator",
            status=SensorStatus.SIMULATED
        )

    @property
    def driver_name(self) -> str: return "ph_simulator"
    @property
    def sensor_type(self) -> str: return "ph"
    @property
    def unit(self) -> str: return "pH"


class PHAnalogDriver(ISensorDriver):
    def __init__(self, calib: CalibrationData, simulated_voltage: float = 2.45):
        self.calib = calib
        self.simulated_voltage = simulated_voltage
        self.filter = MovingAverageFilter(window_size=5)

    def init(self) -> None:
        self.filter.reset()

    def set_input_voltage(self, v: float) -> None:
        self.simulated_voltage = v

    def read_raw(self) -> float:
        # Simulates 10x oversampling on ADC pin
        noise = random.uniform(-0.002, 0.002)
        return max(0.0, min(3.3, self.simulated_voltage + noise))

    def calibrate_and_compensate(self, raw: float, temp_c: float) -> float:
        if raw < 0.05 or raw > 3.25:
            return -1.0 # Disconnected or faulty
        return nernst_ph_compensation(raw, self.calib, temp_c)

    def apply_filter(self, calibrated_val: float) -> float:
        return self.filter.filter(calibrated_val)

    def read(self, temp_c: float = 25.0) -> SensorReading:
        raw = self.read_raw()
        cal = self.calibrate_and_compensate(raw, temp_c)
        if cal < 0.0:
            return SensorReading("ph", 7.0, raw, "pH", "hardware", SensorStatus.FAULT, error_code=1)
        
        filtered = self.apply_filter(cal)
        status = SensorStatus.LIVE
        err = 0
        if abs(raw - self.calib.ph_v7) > 1.8:
            status = SensorStatus.CALIBRATION_REQUIRED
            err = 2

        return SensorReading("ph", filtered, raw, "pH", "hardware", status, error_code=err)

    @property
    def driver_name(self) -> str: return "ph_analog_generic"
    @property
    def sensor_type(self) -> str: return "ph"
    @property
    def unit(self) -> str: return "pH"


class PHModbusDriver(ISensorDriver):
    def __init__(self, slave_id: int = 1, register: int = 1, initial_val: float = 7.21):
        self.slave_id = slave_id
        self.register = register
        self.last_value = initial_val
        self.is_connected = True
        self.force_crc_error = False

    def init(self) -> None:
        pass

    def read_raw(self) -> float:
        if not self.is_connected:
            return -999.0 # Timeout
        if self.force_crc_error:
            return -998.0 # CRC mismatch
        return self.last_value

    def calibrate_and_compensate(self, raw: float, temp_c: float) -> float:
        return raw # Handled internally in industrial probe

    def apply_filter(self, calibrated_val: float) -> float:
        return calibrated_val

    def read(self, temp_c: float = 25.0) -> SensorReading:
        raw = self.read_raw()
        if raw == -999.0:
            return SensorReading("ph", self.last_value, raw, "pH", "hardware", SensorStatus.OFFLINE, error_code=101)
        if raw == -998.0:
            return SensorReading("ph", self.last_value, raw, "pH", "hardware", SensorStatus.FAULT, error_code=102)
        
        return SensorReading("ph", raw, raw, "pH", "hardware", SensorStatus.LIVE, error_code=0)

    @property
    def driver_name(self) -> str: return "ph_modbus_rtu"
    @property
    def sensor_type(self) -> str: return "ph"
    @property
    def unit(self) -> str: return "pH"
