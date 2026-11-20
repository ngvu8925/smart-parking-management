"""
SQLite time-series and event storage for Smart Water Guardian
"""
import sqlite3
import json
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import config

logger = logging.getLogger("Database")


class WaterDatabase:
    def __init__(self, db_path: str = config.DATABASE_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            # Telemetry table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS telemetry (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                device_id TEXT NOT NULL,
                readings_json TEXT NOT NULL,
                anomaly_score REAL,
                status TEXT
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_ts ON telemetry(timestamp);")

            # Events / Alerts table
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                severity TEXT NOT NULL,
                status TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                action_taken TEXT
            );
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_alerts_ts ON alerts(timestamp);")

            # Actuator actions log
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS actuator_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                actuator TEXT NOT NULL,
                action TEXT NOT NULL,
                reason TEXT NOT NULL,
                source TEXT NOT NULL
            );
            """)

            # Preserved samples catalog
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS preserved_samples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sample_id TEXT NOT NULL UNIQUE,
                timestamp TEXT NOT NULL,
                anomaly_score REAL NOT NULL,
                status TEXT NOT NULL,
                readings_snapshot TEXT NOT NULL,
                reason TEXT NOT NULL
            );
            """)
            conn.commit()
            logger.info("Database schema initialized at %s", self.db_path)

    def record_telemetry(self, timestamp: str, device_id: str, readings_dict: Dict[str, Any], anomaly_score: float, status: str):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO telemetry (timestamp, device_id, readings_json, anomaly_score, status) VALUES (?, ?, ?, ?, ?)",
                (timestamp, device_id, json.dumps(readings_dict), anomaly_score, status)
            )
            conn.commit()

    def record_alert(self, timestamp: str, severity: str, status: str, title: str, message: str, action_taken: Optional[str] = None):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO alerts (timestamp, severity, status, title, message, action_taken) VALUES (?, ?, ?, ?, ?, ?)",
                (timestamp, severity, status, title, message, action_taken)
            )
            conn.commit()

    def record_actuator(self, timestamp: str, actuator: str, action: str, reason: str, source: str = "AUTO"):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO actuator_logs (timestamp, actuator, action, reason, source) VALUES (?, ?, ?, ?, ?)",
                (timestamp, actuator, action, reason, source)
            )
            conn.commit()

    def record_sample_preservation(self, sample_id: str, timestamp: str, anomaly_score: float, status: str, readings_dict: Dict[str, Any], reason: str):
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT OR REPLACE INTO preserved_samples (sample_id, timestamp, anomaly_score, status, readings_snapshot, reason) VALUES (?, ?, ?, ?, ?, ?)",
                (sample_id, timestamp, anomaly_score, status, json.dumps(readings_dict), reason)
            )
            conn.commit()

    def get_latest_telemetry(self, limit: int = 60) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM telemetry ORDER BY id DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            results = []
            for r in reversed(rows):
                item = dict(r)
                item["readings"] = json.loads(item["readings_json"])
                del item["readings_json"]
                results.append(item)
            return results

    def get_recent_alerts(self, limit: int = 50) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            return [dict(r) for r in rows]

    def get_preserved_samples(self, limit: int = 20) -> List[Dict[str, Any]]:
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM preserved_samples ORDER BY id DESC LIMIT ?", (limit,))
            rows = cursor.fetchall()
            results = []
            for r in rows:
                item = dict(r)
                item["readings_snapshot"] = json.loads(item["readings_snapshot"])
                results.append(item)
            return results
