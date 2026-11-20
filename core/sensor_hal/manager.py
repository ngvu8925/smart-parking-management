"""
Hardware Profile Manager & Factory
"""
from typing import Dict, List, Any
from .interface import ISensorDriver, SensorReading, SensorStatus
from .calibration import CalibrationData
from .drivers.ph_drivers import PHSimulatorDriver, PHAnalogDriver, PHModbusDriver
from .drivers.turbidity_drivers import TurbidityAnalogDriver


class HardwareProfileManager:
    PROFILE_DEMO = "PROFILE_DEMO_ANALOG_I2C"
    PROFILE_PRODUCTION = "PROFILE_PRODUCTION_RS485_MODBUS"
    PROFILE_SIMULATOR = "PROFILE_SIMULATOR_TESTBED"

    def __init__(self, profile_name: str = PROFILE_DEMO):
        self.profile_name = profile_name
        self.calib = CalibrationData()
        self.drivers: Dict[str, ISensorDriver] = {}
        self.load_profile(profile_name)

    def load_profile(self, profile_name: str) -> None:
        self.profile_name = profile_name
        self.drivers.clear()

        if profile_name == self.PROFILE_DEMO:
            self.drivers["ph"] = PHAnalogDriver(self.calib)
            self.drivers["turbidity"] = TurbidityAnalogDriver(self.calib)
            # Simulated extensions
            self.drivers["orp"] = PHSimulatorDriver(baseline=620.0)
        elif profile_name == self.PROFILE_PRODUCTION:
            self.drivers["ph"] = PHModbusDriver(slave_id=1, register=1, initial_val=7.21)
            self.drivers["turbidity"] = TurbidityAnalogDriver(self.calib)
            self.drivers["orp"] = PHModbusDriver(slave_id=5, register=1, initial_val=620.0)
        else: # SIMULATOR
            self.drivers["ph"] = PHSimulatorDriver(baseline=7.20)
            self.drivers["turbidity"] = PHSimulatorDriver(baseline=0.40)
            self.drivers["orp"] = PHSimulatorDriver(baseline=620.0)

        for d in self.drivers.values():
            d.init()

    def read_all_normalized(self, temp_c: float = 27.5) -> Dict[str, Any]:
        """
        Produce normalized telemetry dictionary matching backend & dashboard contract.
        """
        readings = {}
        for key, driver in self.drivers.items():
            r = driver.read(temp_c)
            readings[key] = r.to_dict()

        return {
            "device_id": "water-guardian-node-01",
            "hardware_profile": self.profile_name,
            "readings": readings
        }
