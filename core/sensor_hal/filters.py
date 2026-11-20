"""
Signal conditioning & noise filters for water sensor HAL
"""
from collections import deque
from typing import List


class MedianFilter:
    """
    Median filter for rejecting air bubbles in optical flow-cell and impulse noise.
    """
    def __init__(self, window_size: int = 5):
        self.window_size = window_size
        self.buffer = deque(maxlen=window_size)

    def filter(self, sample: float) -> float:
        self.buffer.append(sample)
        sorted_vals = sorted(self.buffer)
        mid = len(sorted_vals) // 2
        return sorted_vals[mid]

    def reset(self) -> None:
        self.buffer.clear()


class MovingAverageFilter:
    """
    Moving average filter for ADC thermal noise smoothing.
    """
    def __init__(self, window_size: int = 8):
        self.window_size = window_size
        self.buffer = deque(maxlen=window_size)

    def filter(self, sample: float) -> float:
        self.buffer.append(sample)
        return sum(self.buffer) / len(self.buffer)

    def reset(self) -> None:
        self.buffer.clear()


class ExponentialFilter:
    """
    Exponential Moving Average (EMA) filter.
    """
    def __init__(self, alpha: float = 0.2):
        self.alpha = max(0.01, min(1.0, alpha))
        self.val: float = None

    def filter(self, sample: float) -> float:
        if self.val is None:
            self.val = sample
        else:
            self.val = (self.alpha * sample) + ((1.0 - self.alpha) * self.val)
        return self.val

    def reset(self) -> None:
        self.val = None
