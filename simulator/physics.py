"""
Realistic Sensor Physics Simulator
Simulates continuous dynamics, Gaussian noise, sensor drift, first-order lag (inertia),
calibration offsets, bubble/particle spikes, stuck sensors, and packet dropouts.
"""
import random
import time
from typing import Dict, Any, Optional
import numpy as np


class SensorPhysicsChannel:
    def __init__(
        self,
        name: str,
        initial_value: float,
        nominal_std: float,
        time_constant: float = 2.5,  # seconds to reach ~63% of step change
        drift_rate: float = 0.0001,
        calibration_offset: float = 0.0
    ):
        self.name = name
        self.current_value = initial_value
        self.target_value = initial_value
        self.nominal_std = nominal_std
        self.time_constant = max(0.2, time_constant)
        self.drift_rate = drift_rate
        self.calibration_offset = calibration_offset

        # Fault injections
        self.is_stuck = False
        self.stuck_value: Optional[float] = None
        self.is_offline = False
        self.spike_probability = 0.02  # 2% chance of transient noise spike/bubble
        self.spike_multiplier = 1.0

        self.last_update = time.time()

    def set_target(self, target: float):
        self.target_value = target

    def inject_stuck(self, stuck: bool = True):
        self.is_stuck = stuck
        if stuck:
            self.stuck_value = self.current_value

    def inject_offline(self, offline: bool = True):
        self.is_offline = offline

    def step(self, dt: float) -> Optional[float]:
        """Advance physical simulation by dt seconds and return sensor measurement"""
        if self.is_offline:
            return None

        if self.is_stuck:
            # Completely frozen reading, zero noise
            return self.stuck_value

        # First order response lag (exponential approach to target)
        alpha = 1.0 - np.exp(-dt / self.time_constant)
        self.current_value += alpha * (self.target_value - self.current_value)

        # Slow thermal drift (random walk)
        self.current_value += np.random.normal(0, self.drift_rate * np.sqrt(dt))

        # Sensor measurement noise (Gaussian)
        noise = np.random.normal(0, self.nominal_std)

        # Transient bubble or particle spike (short-lived disturbance)
        transient = 0.0
        if random.random() < self.spike_probability:
            transient = (random.choice([-1, 1]) * self.nominal_std * 3.5) * self.spike_multiplier

        measured_value = self.current_value + noise + transient + self.calibration_offset

        # Physical clamping
        if self.name == "ph":
            measured_value = max(0.0, min(14.0, measured_value))
        elif self.name in ("ec", "tds", "turbidity", "chlorine", "nh4", "no3", "uv254"):
            measured_value = max(0.0, measured_value)
        elif self.name == "electrical_leak":
            measured_value = 1.0 if measured_value >= 0.5 else 0.0

        return measured_value


class WaterPhysicsEngine:
    """
    Coordinates physics channels for all 10 water quality & electrical safety metrics.
    """
    def __init__(self, baseline_config: Dict[str, Dict[str, Any]]):
        self.channels: Dict[str, SensorPhysicsChannel] = {}
        for key, conf in baseline_config.items():
            if key == "electrical_leak":
                ch = SensorPhysicsChannel(
                    name=key,
                    initial_value=0.0,
                    nominal_std=0.0,
                    time_constant=0.2,
                    drift_rate=0.0
                )
            else:
                nominal = float(conf["nominal"])
                std = float(conf["std"])
                ch = SensorPhysicsChannel(
                    name=key,
                    initial_value=nominal,
                    nominal_std=std * 0.4,  # measurement noise standard deviation
                    time_constant=2.0 if key in ("turbidity", "ec") else 4.0,
                    drift_rate=std * 0.005
                )
            self.channels[key] = ch

    def set_targets(self, targets: Dict[str, float]):
        for k, v in targets.items():
            if k in self.channels:
                self.channels[k].set_target(v)

    def set_stuck(self, sensor_key: str, stuck: bool = True):
        if sensor_key in self.channels:
            self.channels[sensor_key].inject_stuck(stuck)

    def set_offline(self, sensor_key: str, offline: bool = True):
        if sensor_key in self.channels:
            self.channels[sensor_key].inject_offline(offline)

    def reset_all_faults(self):
        for ch in self.channels.values():
            ch.inject_stuck(False)
            ch.inject_offline(False)

    def step(self, dt: float = 1.0) -> Dict[str, Optional[float]]:
        readings = {}
        for k, ch in self.channels.items():
            readings[k] = ch.step(dt)
        return readings
