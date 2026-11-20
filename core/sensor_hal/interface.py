"""
Hardware Abstraction Layer (HAL) - Sensor Interface & Types
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Optional, Dict, Any


class SensorStatus(str, Enum):
    LIVE = "LIVE"
    SIMULATED = "SIMULATED"
    BETA = "BETA"
    CALIBRATION_REQUIRED = "CALIBRATION_REQUIRED"
    FAULT = "FAULT"
    OFFLINE = "OFFLINE"


@dataclass
class SensorReading:
    sensor: str
    value: float
    raw_value: float
    unit: str
    source: str
    status: SensorStatus
    error_code: int = 0
    timestamp: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sensor": self.sensor,
            "value": round(self.value, 3),
            "raw_value": round(self.raw_value, 3),
            "unit": self.unit,
            "source": self.source,
            "status": self.status.value,
            "error_code": self.error_code
        }


class ISensorDriver(ABC):
    """
    Abstract Base Class for every sensor driver.
    No matter if it is Analog ADC, I2C, 1-Wire, UART, or RS485 Modbus,
    it implements the exact same pipeline and returns normalized SensorReading.
    """

    @abstractmethod
    def init(self) -> None:
        """Initialize hardware pins, registers, or state."""
        pass

    @abstractmethod
    def read_raw(self) -> float:
        """Read raw uncalibrated hardware signal (Volts, ADC counts, raw Modbus register)."""
        pass

    @abstractmethod
    def calibrate_and_compensate(self, raw: float, temp_c: float) -> float:
        """Apply calibration slope/offset and water temperature compensation."""
        pass

    @abstractmethod
    def apply_filter(self, calibrated_val: float) -> float:
        """Apply noise filter (Moving Average, Median Filter for bubbles)."""
        pass

    @abstractmethod
    def read(self, temp_c: float = 25.0) -> SensorReading:
        """Complete pipeline: RAW -> Calibration -> Temp Comp -> Filter -> Normalized Reading."""
        pass

    @property
    @abstractmethod
    def driver_name(self) -> str:
        pass

    @property
    @abstractmethod
    def sensor_type(self) -> str:
        pass

    @property
    @abstractmethod
    def unit(self) -> str:
        pass
