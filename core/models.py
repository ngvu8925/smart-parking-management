"""
Data models and schemas for Smart Water Guardian
"""
from enum import Enum
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
from datetime import datetime, timezone


class SensorStatusEnum(str, Enum):
    LIVE = "LIVE"
    BETA = "BETA"
    SIMULATED = "SIMULATED"
    NOT_INSTALLED = "NOT INSTALLED"
    CALIBRATION_REQUIRED = "CALIBRATION REQUIRED"
    FAULT = "FAULT"
    OFFLINE = "OFFLINE"


class SensorSourceEnum(str, Enum):
    HARDWARE = "hardware"
    SIMULATOR = "simulator"


class SystemStatusEnum(str, Enum):
    NORMAL = "NORMAL"
    WARNING = "WARNING"
    ABNORMAL = "ABNORMAL"
    SUSPECTED_CONTAMINATION = "SUSPECTED CONTAMINATION"
    ELECTRICAL_HAZARD = "ELECTRICAL HAZARD"


class SensorReading(BaseModel):
    sensor: str
    value: float
    unit: str
    source: SensorSourceEnum = SensorSourceEnum.SIMULATOR
    status: SensorStatusEnum = SensorStatusEnum.SIMULATED
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    z_score: Optional[float] = None
    deviation_pct: Optional[float] = None
    is_stuck: bool = False
    is_noisy: bool = False


class TelemetryPacket(BaseModel):
    device_id: str = "water-guardian-node-01"
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    readings: Dict[str, SensorReading]
    wifi_rssi: Optional[int] = -58
    firmware_version: str = "1.2.0-sentinel"


class ActuatorState(BaseModel):
    valve_state: str = "OPEN"           # "OPEN" or "CLOSED"
    valve_mode: str = "AUTO"            # "AUTO" or "MANUAL"
    sample_preserved: bool = False
    sample_preserved_at: Optional[str] = None
    sample_count: int = 0
    alarm_active: bool = False
    alarm_muted: bool = False
    last_actuation_reason: Optional[str] = "System Initialized"


class AnomalyEvaluation(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    status: SystemStatusEnum = SystemStatusEnum.NORMAL
    anomaly_score: float = 0.0          # 0.0 to 100.0%
    is_electrical_hazard: bool = False
    critical_factors: List[str] = []
    sensor_diagnostics: Dict[str, str] = {}
    recommended_actions: List[str] = []
    auto_actions_taken: List[str] = []
    ml_prediction: Optional[Dict[str, Any]] = None


class AlertEvent(BaseModel):
    id: Optional[int] = None
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    severity: str = "INFO"              # INFO, WARNING, CRITICAL, EMERGENCY
    status: SystemStatusEnum = SystemStatusEnum.NORMAL
    title: str
    message: str
    action_taken: Optional[str] = None


class CommandPayload(BaseModel):
    action: str                         # e.g., "OPEN", "CLOSE", "TRIGGER_SAMPLE", "MUTE_ALARM", "SET_MODE"
    parameter: Optional[str] = None
    source: str = "dashboard"


class ScenarioConfig(BaseModel):
    id: str
    name: str
    description: str
    duration_seconds: int = 60
    transition_seconds: int = 10
    targets: Dict[str, float]
    noise_multipliers: Optional[Dict[str, float]] = None
    faults: Optional[Dict[str, Any]] = None
