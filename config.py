"""
Global configuration for Smart Water Guardian (Hệ thống giám sát an toàn nguồn nước thông minh)
"""
import os
from typing import Dict, Any

# Network & Server Config
SERVER_HOST = os.getenv("SWG_SERVER_HOST", "0.0.0.0")
SERVER_PORT = int(os.getenv("SWG_SERVER_PORT", "8000"))

# MQTT Configuration
MQTT_HOST = os.getenv("SWG_MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("SWG_MQTT_PORT", "1883"))
MQTT_KEEPALIVE = 60
MQTT_CLIENT_ID_BACKEND = "water_backend_core"
MQTT_CLIENT_ID_SIMULATOR = "water_simulator_engine"

# MQTT Topics
TOPIC_TELEMETRY = "water/telemetry"
TOPIC_CMD_VALVE = "water/cmd/valve"
TOPIC_CMD_SAMPLE = "water/cmd/sample"
TOPIC_CMD_ALARM = "water/cmd/alarm"
TOPIC_STATUS_ACTUATORS = "water/status/actuators"
TOPIC_ALERTS = "water/alerts"
TOPIC_CONFIG_SENSORS = "water/config/sensors"

# Database Configuration
DATABASE_PATH = os.getenv("SWG_DB_PATH", "water_sentinel.db")

# Anomaly Thresholds & Weights
ANOMALY_WARNING_THRESHOLD = 35.0
ANOMALY_ABNORMAL_THRESHOLD = 65.0
ANOMALY_CONTAMINATION_THRESHOLD = 80.0

# Critical Auto-Shutoff Rules
AUTO_CLOSE_ON_CONTAMINATION = True
AUTO_CLOSE_ON_ELECTRICAL_LEAK = True
AUTO_PRESERVE_SAMPLE_ON_CONTAMINATION = True

# Water Health Baseline Parameters (Nominal Clean Tap Water)
BASELINE_PROFILE: Dict[str, Dict[str, Any]] = {
    "ph": {
        "nominal": 7.20,
        "std": 0.15,
        "min_safe": 6.5,
        "max_safe": 8.5,
        "weight": 1.5,
        "unit": "pH",
        "description": "Độ pH (tính kiềm/axit)"
    },
    "ec": {
        "nominal": 350.0,
        "std": 25.0,
        "min_safe": 100.0,
        "max_safe": 800.0,
        "weight": 1.2,
        "unit": "µS/cm",
        "description": "Độ dẫn điện (Electrical Conductivity)"
    },
    "tds": {
        "nominal": 175.0,
        "std": 15.0,
        "min_safe": 50.0,
        "max_safe": 400.0,
        "weight": 1.0,
        "unit": "ppm",
        "description": "Tổng chất rắn hòa tan (TDS)"
    },
    "turbidity": {
        "nominal": 0.40,
        "std": 0.10,
        "min_safe": 0.0,
        "max_safe": 3.0,
        "weight": 1.4,
        "unit": "NTU",
        "description": "Độ đục (Turbidity - cặn/bùn/lơ lửng)"
    },
    "orp": {
        "nominal": 620.0,
        "std": 25.0,
        "min_safe": 500.0,
        "max_safe": 850.0,
        "weight": 1.1,
        "unit": "mV",
        "description": "Khả năng oxy hóa-khử (ORP)"
    },
    "chlorine": {
        "nominal": 0.50,
        "std": 0.05,
        "min_safe": 0.20,
        "max_safe": 1.00,
        "weight": 1.3,
        "unit": "mg/L",
        "description": "Clo dư khử trùng (Free Chlorine)"
    },
    "temperature": {
        "nominal": 27.5,
        "std": 1.2,
        "min_safe": 15.0,
        "max_safe": 35.0,
        "weight": 0.6,
        "unit": "°C",
        "description": "Nhiệt độ nước (Temperature)"
    },
    "nh4": {
        "nominal": 0.03,
        "std": 0.01,
        "min_safe": 0.0,
        "max_safe": 0.15,
        "weight": 1.5,
        "unit": "mg/L",
        "description": "Ammonium/Ammonia (NH4+)"
    },
    "no3": {
        "nominal": 4.0,
        "std": 0.5,
        "min_safe": 0.0,
        "max_safe": 10.0,
        "weight": 1.2,
        "unit": "mg/L",
        "description": "Nitrate (NO3-)"
    },
    "uv254": {
        "nominal": 0.020,
        "std": 0.005,
        "min_safe": 0.005,
        "max_safe": 0.050,
        "weight": 1.3,
        "unit": "cm⁻¹",
        "description": "Hấp thụ UV 254nm (Hợp chất hữu cơ hòa tan)"
    },
    "electrical_leak": {
        "nominal": 0.0,
        "std": 0.0,
        "min_safe": 0.0,
        "max_safe": 0.0,
        "weight": 3.0,
        "unit": "state",
        "description": "Cảm biến an toàn rò điện (Electrical Leakage)"
    }
}

# Initial Default Sensor Configuration (Status & Source)
DEFAULT_SENSOR_METADATA: Dict[str, Dict[str, str]] = {
    "ph": {"source": "hardware", "status": "LIVE"},
    "ec": {"source": "hardware", "status": "LIVE"},
    "tds": {"source": "hardware", "status": "LIVE"},
    "turbidity": {"source": "hardware", "status": "LIVE"},
    "temperature": {"source": "hardware", "status": "LIVE"},
    "electrical_leak": {"source": "hardware", "status": "LIVE"},
    "orp": {"source": "simulator", "status": "SIMULATED"},
    "chlorine": {"source": "simulator", "status": "BETA"},
    "nh4": {"source": "simulator", "status": "SIMULATED"},
    "no3": {"source": "simulator", "status": "SIMULATED"},
    "uv254": {"source": "simulator", "status": "SIMULATED"},
}
