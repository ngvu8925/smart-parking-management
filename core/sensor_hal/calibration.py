"""
Calibration and Temperature Compensation Models
"""
from dataclasses import dataclass


@dataclass
class CalibrationData:
    ph_v7: float = 2.500         # Voltage at pH 7.00 buffer (V)
    ph_v4: float = 3.050         # Voltage at pH 4.01 buffer (V)
    ph_slope: float = -3.500     # Default slope: (7.0 - 4.01) / (v7 - v4)

    ec_k_value: float = 1.000    # Cell constant multiplier K
    ec_temp_coeff: float = 0.0191# Standard temp coeff 1.91%/°C

    turb_clear_voltage: float = 2.80 # Clear water reference voltage
    temp_offset: float = 0.0

    def calibrate_ph_neutral(self, v7: float) -> None:
        self.ph_v7 = v7
        self._recalc_ph_slope()

    def calibrate_ph_acid(self, v4: float) -> None:
        self.ph_v4 = v4
        self._recalc_ph_slope()

    def calibrate_ec(self, measured_raw_ec: float, target_ec: float = 1413.0) -> None:
        if measured_raw_ec > 10.0:
            self.ec_k_value = target_ec / measured_raw_ec

    def _recalc_ph_slope(self) -> None:
        dv = self.ph_v7 - self.ph_v4
        if abs(dv) > 0.05:
            self.ph_slope = (7.00 - 4.01) / dv
        else:
            self.ph_slope = -3.500


def nernst_ph_compensation(raw_voltage: float, calib: CalibrationData, temp_c: float) -> float:
    """
    Nernst Equation Temperature Compensation for pH glass electrode:
    The Nernst potential slope changes by 0.1984 mV/°C:
    Slope(T) = Slope(25°C) * (T + 273.15) / 298.15
    """
    kelvin_ratio = (temp_c + 273.15) / 298.15
    kelvin_ratio = max(0.8, min(1.3, kelvin_ratio))

    compensated_slope = calib.ph_slope / kelvin_ratio
    ph = 7.00 + ((raw_voltage - calib.ph_v7) * compensated_slope)
    return max(0.0, min(14.0, ph))


def ec_temp_compensation(raw_voltage: float, calib: CalibrationData, temp_c: float) -> float:
    """
    Standard linear temperature compensation to reference 25°C:
    EC_25 = EC_T / (1 + alpha * (T - 25))
    """
    temp_coeff = 1.0 + calib.ec_temp_coeff * (temp_c - 25.0)
    temp_coeff = max(0.5, temp_coeff)
    comp_voltage = raw_voltage / temp_coeff

    # DFRobot Gravity TDS characteristic polynomial
    tds = (133.42 * (comp_voltage**3) - 255.86 * (comp_voltage**2) + 857.39 * comp_voltage) * 0.5
    ec = max(0.0, tds * 2.0)
    return ec * calib.ec_k_value
