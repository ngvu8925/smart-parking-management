import random
from ..interface import ISensorDriver, SensorReading, SensorStatus
from ..filters import MedianFilter, MovingAverageFilter
from ..calibration import CalibrationData


class TurbidityAnalogDriver(ISensorDriver):
    """
    Analog optical turbidity driver with Median filter specifically designed
    for eliminating air bubble spikes in the measuring flow-cell.
    """
    def __init__(self, calib: CalibrationData, simulated_voltage: float = 2.75):
        self.calib = calib
        self.simulated_voltage = simulated_voltage
        self.median_filter = MedianFilter(window_size=5) # Kills single-sample bubble dips
        self.ma_filter = MovingAverageFilter(window_size=4)

    def init(self) -> None:
        self.median_filter.reset()
        self.ma_filter.reset()

    def set_input_voltage(self, v: float) -> None:
        self.simulated_voltage = v

    def read_raw(self) -> float:
        # Raw voltage from optical sensor
        return self.simulated_voltage

    def calibrate_and_compensate(self, raw: float, temp_c: float) -> float:
        # Pre-filter using median filter to remove bubble dips
        clean_v = self.median_filter.filter(raw)
        
        c = self.calib
        if clean_v >= c.turb_clear_voltage - 0.05:
            return 0.10
        
        delta_v = max(0.0, c.turb_clear_voltage - clean_v)
        ntu = (delta_v**2 * 450.0) + (delta_v * 80.0)
        return max(0.0, min(3000.0, ntu))

    def apply_filter(self, calibrated_val: float) -> float:
        return self.ma_filter.filter(calibrated_val)

    def read(self, temp_c: float = 25.0) -> SensorReading:
        raw = self.read_raw()
        cal = self.calibrate_and_compensate(raw, temp_c)
        filtered = self.apply_filter(cal)

        if raw < 0.1:
            return SensorReading("turbidity", 3000.0, raw, "NTU", "hardware", SensorStatus.FAULT, error_code=1)

        return SensorReading("turbidity", filtered, raw, "NTU", "hardware", SensorStatus.LIVE, error_code=0)

    @property
    def driver_name(self) -> str: return "turbidity_analog_optical"
    @property
    def sensor_type(self) -> str: return "turbidity"
    @property
    def unit(self) -> str: return "NTU"
