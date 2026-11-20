export type SensorStatus =
  | 'LIVE'
  | 'BETA'
  | 'SIMULATED'
  | 'NOT INSTALLED'
  | 'CALIBRATION REQUIRED'
  | 'FAULT'
  | 'OFFLINE';

export type SensorSource = 'hardware' | 'simulator';

export type SystemStatus =
  | 'NORMAL'
  | 'WARNING'
  | 'ABNORMAL'
  | 'SUSPECTED CONTAMINATION'
  | 'ELECTRICAL HAZARD'
  | 'UNKNOWN ANOMALY';

export type DiagnosticPattern =
  | 'NORMAL'
  | 'RUNOFF_SEDIMENT'
  | 'CHEMICAL_ACIDIC'
  | 'ORGANIC_WASTE'
  | 'SALINE_INTRUSION'
  | 'DISINFECTION_FAILURE'
  | 'AGRICULTURAL_RUNOFF'
  | 'ELECTRICAL_HAZARD'
  | 'UNKNOWN_ANOMALY';

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

export interface SensorReading {
  sensor: string;
  value: number;
  unit: string;
  source: SensorSource;
  status: SensorStatus;
  timestamp: string;
  z_score?: number;
  deviation_pct?: number;
  rate_of_change?: number;
  is_stuck?: boolean;
  is_noisy?: boolean;
}

export interface ActuatorState {
  valve_state: 'OPEN' | 'CLOSED';
  valve_mode: 'AUTO' | 'MANUAL';
  sample_preserved: boolean;
  sample_preserved_at?: string | null;
  sample_count: number;
  alarm_active: boolean;
  alarm_muted: boolean;
  last_actuation_reason?: string;
}

export interface AnomalyEvaluation {
  timestamp: string;
  status: SystemStatus;
  anomaly_score: number;
  is_electrical_hazard: boolean;
  critical_factors: string[];
  sensor_diagnostics?: Record<string, string>;
  recommended_actions?: string[];
  auto_actions_taken?: string[];
  diagnostic_pattern?: DiagnosticPattern;
  pattern_label?: string;
  layer_breakdown?: LayerBreakdown;
  safety_disclaimer?: string;
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  duration_seconds: number;
  transition_seconds: number;
  targets: Record<string, number>;
  faults?: {
    stuck_sensors?: string[];
  };
}

export interface AlertEvent {
  id: number;
  timestamp: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  status: SystemStatus;
  title: string;
  message: string;
  action_taken?: string;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

export interface PreservedSample {
  id: number;
  sample_id: string;
  timestamp: string;
  anomaly_score: number;
  status: SystemStatus;
  readings_snapshot: Record<string, SensorReading>;
  reason: string;
}

export interface TelemetryPacket {
  device_id: string;
  timestamp: string;
  readings: Record<string, SensorReading>;
  wifi_rssi?: number;
  firmware_version?: string;
}
