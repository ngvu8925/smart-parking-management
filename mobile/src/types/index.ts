export type SensorStatus =
  | "LIVE"
  | "BETA"
  | "SIMULATED"
  | "NOT INSTALLED"
  | "CALIBRATION REQUIRED"
  | "FAULT"
  | "OFFLINE";

export type SensorSource = "hardware" | "simulator";

export type SystemStatus =
  | "NORMAL"
  | "WARNING"
  | "ABNORMAL"
  | "SUSPECTED CONTAMINATION"
  | "ELECTRICAL HAZARD";

export interface SensorReading {
  sensor: string;
  value: number;
  unit: string;
  source: SensorSource;
  status: SensorStatus;
  timestamp?: string;
  z_score?: number;
  deviation_pct?: number;
  is_stuck?: boolean;
  is_noisy?: boolean;
}

export interface ActuatorState {
  valve_state: "OPEN" | "CLOSED";
  valve_mode: "AUTO" | "MANUAL";
  sample_preserved: boolean;
  sample_preserved_at?: string | null;
  sample_count: number;
  alarm_active: boolean;
  alarm_muted: boolean;
  last_actuation_reason?: string;
}

export interface MLPrediction {
  ml_available: boolean;
  ml_anomaly_score: number;
  is_anomaly: boolean;
  predicted_class: string;
  predicted_label_vi: string;
  confidence_pct: number;
  top_features: [string, number][];
  model_version?: string;
}

export type DiagnosticPattern =
  | "NORMAL"
  | "RUNOFF_SEDIMENT"
  | "CHEMICAL_ACIDIC"
  | "ORGANIC_WASTE"
  | "SALINE_INTRUSION"
  | "DISINFECTION_FAILURE"
  | "AGRICULTURAL_RUNOFF"
  | "ELECTRICAL_HAZARD"
  | "UNKNOWN_ANOMALY";

export interface LayerBreakdown {
  layer1_rules: {
    triggered: boolean;
    violations: string[];
    is_hazard: boolean;
    sensor_faults: string[];
  };
  layer2_statistical: {
    z_score_avg: number;
    rate_of_change: Record<string, number>;
    rapid_shifts: string[];
  };
  layer3_ml: {
    model: string;
    anomaly_score: number;
    reconstruction_error: number;
    status_estimate: string;
  };
  layer4_classification: {
    pattern: DiagnosticPattern;
    pattern_label: string;
    confidence: number;
    similar_historical_profile: string;
  };
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  duration_seconds?: number;
  transition_seconds?: number;
}

export interface SystemStatusResponse {
  status: SystemStatus;
  anomaly_score: number;
  is_electrical_hazard: boolean;
  critical_factors: string[];
  sensor_diagnostics?: Record<string, string>;
  recommended_actions?: string[];
  diagnostic_pattern?: DiagnosticPattern;
  pattern_label?: string;
  layer_breakdown?: LayerBreakdown | null;
  safety_disclaimer?: string;
  ml_prediction?: MLPrediction | null;
  actuators: ActuatorState;
  active_scenario: Scenario;
  device_id: string;
}

export interface TelemetryPacket {
  type?: string;
  timestamp: string;
  device_id?: string;
  readings: Record<string, SensorReading>;
  anomaly_score: number;
  status: SystemStatus;
  is_electrical_hazard: boolean;
  critical_factors: string[];
  sensor_diagnostics?: Record<string, string>;
  recommended_actions?: string[];
  diagnostic_pattern?: DiagnosticPattern;
  pattern_label?: string;
  layer_breakdown?: LayerBreakdown | null;
  safety_disclaimer?: string;
  ml_prediction?: MLPrediction | null;
  actuators: ActuatorState;
  active_scenario?: Scenario;
}
