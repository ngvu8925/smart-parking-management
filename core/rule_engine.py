"""
Rule Engine and Actuator Control for Smart Water Guardian
Handles automated safety actions (Valve shutoff, Sample preservation, Buzzer alarms)
and manual overrides.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any
import uuid

import config
from core.models import ActuatorState, AnomalyEvaluation, SystemStatusEnum, TelemetryPacket
from core.database import WaterDatabase
from core.event_bus import bus

logger = logging.getLogger("RuleEngine")


class WaterRuleEngine:
    def __init__(self, db: WaterDatabase):
        self.db = db
        self.state = ActuatorState(
            valve_state="OPEN",
            valve_mode="AUTO",
            sample_preserved=False,
            sample_count=0,
            alarm_active=False,
            alarm_muted=False,
            last_actuation_reason="Hệ thống khởi động bình thường"
        )
        self.last_sample_trigger_time: Optional[float] = None

    def process_evaluation(self, evaluation: AnomalyEvaluation, packet: TelemetryPacket):
        """
        Executes automated actions based on anomaly detection output and configured safety rules.
        """
        now_iso = evaluation.timestamp
        readings_snapshot = {k: r.model_dump() for k, r in packet.readings.items()}

        # 1. Electrical Hazard: Immediate top-priority emergency response
        if evaluation.status == SystemStatusEnum.ELECTRICAL_HAZARD:
            if config.AUTO_CLOSE_ON_ELECTRICAL_LEAK and self.state.valve_mode == "AUTO" and self.state.valve_state != "CLOSED":
                self._close_valve("Tự động ngắt khẩn cấp do phát hiện rò điện vào nguồn nước", "AUTO")

            if not self.state.alarm_muted:
                self.state.alarm_active = True

            self.db.record_alert(
                timestamp=now_iso,
                severity="EMERGENCY",
                status=evaluation.status.value,
                title="CẢNH BÁO NGUY HIỂM: RÒ ĐIỆN KHU VỰC NƯỚC",
                message="Phát hiện dòng rò trong cell đo nước. Khuyến cáo ngắt điện và không tiếp xúc trực tiếp!",
                action_taken="Đã ngắt van nước tự động & kích hoạt còi báo động"
            )

        # 2. Suspected Contamination: Valve shutoff & sample preservation
        elif evaluation.status == SystemStatusEnum.SUSPECTED_CONTAMINATION:
            if config.AUTO_CLOSE_ON_CONTAMINATION and self.state.valve_mode == "AUTO" and self.state.valve_state != "CLOSED":
                self._close_valve("Tự động khóa nguồn nước do nghi ngờ nhiễm bẩn/hóa chất nghiêm trọng", "AUTO")

            if config.AUTO_PRESERVE_SAMPLE_ON_CONTAMINATION and not self.state.sample_preserved:
                self._trigger_sample_preservation(
                    anomaly_score=evaluation.anomaly_score,
                    status=evaluation.status.value,
                    readings=readings_snapshot,
                    reason=f"Tự động khóa mẫu nước nghi vấn (Điểm bất thường: {evaluation.anomaly_score}%)"
                )

            if not self.state.alarm_muted:
                self.state.alarm_active = True

            factors_str = " | ".join(evaluation.critical_factors[:3])
            self.db.record_alert(
                timestamp=now_iso,
                severity="CRITICAL",
                status=evaluation.status.value,
                title="NGHI NGỜ Ô NHIỄM NGUỒN NƯỚC",
                message=f"Độ lệch bất thường cao: {evaluation.anomaly_score}%. Yếu tố: {factors_str}",
                action_taken="Đã đóng van nước và kích hoạt cơ chế lưu giữ mẫu nước kiểm nghiệm"
            )

        # 3. Abnormal or Warning
        elif evaluation.status == SystemStatusEnum.ABNORMAL:
            factors_str = " | ".join(evaluation.critical_factors[:2])
            self.db.record_alert(
                timestamp=now_iso,
                severity="WARNING",
                status=evaluation.status.value,
                title="DẤU HIỆU BẤT THƯỜNG",
                message=f"Chỉ số nước chênh lệch khỏi baseline ({evaluation.anomaly_score}%). {factors_str}",
                action_taken="Tăng tần suất giám sát và cảnh báo người dùng"
            )
            # Alarm tone on abnormal if desired
            if not self.state.alarm_muted:
                self.state.alarm_active = True

        # 4. Status restored to NORMAL
        elif evaluation.status == SystemStatusEnum.NORMAL:
            if self.state.alarm_active and not self.state.alarm_muted:
                self.state.alarm_active = False

    def _close_valve(self, reason: str, source: str = "AUTO"):
        self.state.valve_state = "CLOSED"
        self.state.last_actuation_reason = reason
        self.db.record_actuator(
            timestamp=datetime.now(timezone.utc).isoformat(),
            actuator="VALVE",
            action="CLOSED",
            reason=reason,
            source=source
        )
        logger.warning("ACTUATOR: Valve closed. Reason: %s", reason)

    def _open_valve(self, reason: str, source: str = "MANUAL"):
        self.state.valve_state = "OPEN"
        self.state.last_actuation_reason = reason
        self.db.record_actuator(
            timestamp=datetime.now(timezone.utc).isoformat(),
            actuator="VALVE",
            action="OPEN",
            reason=reason,
            source=source
        )
        logger.info("ACTUATOR: Valve opened. Reason: %s", reason)

    def _trigger_sample_preservation(self, anomaly_score: float, status: str, readings: Dict[str, Any], reason: str):
        now_iso = datetime.now(timezone.utc).isoformat()
        sample_id = f"SMP-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
        self.state.sample_preserved = True
        self.state.sample_preserved_at = now_iso
        self.state.sample_count += 1

        self.db.record_sample_preservation(
            sample_id=sample_id,
            timestamp=now_iso,
            anomaly_score=anomaly_score,
            status=status,
            readings_dict=readings,
            reason=reason
        )
        self.db.record_actuator(
            timestamp=now_iso,
            actuator="SAMPLE_COLLECTOR",
            action="TRIGGER_FILL_AND_SEAL",
            reason=reason,
            source="AUTO"
        )
        logger.warning("ACTUATOR: Water sample preserved! Sample ID: %s", sample_id)

    def set_valve(self, action: str, mode: Optional[str] = None, source: str = "DASHBOARD"):
        """Manual or operator command to change valve state"""
        if mode:
            self.state.valve_mode = mode.upper()
        if action.upper() == "OPEN":
            self._open_valve(f"Lệnh mở van thủ công từ {source}", source)
        elif action.upper() == "CLOSE":
            self._close_valve(f"Lệnh đóng van thủ công từ {source}", source)

    def trigger_sample_manually(self, readings: Dict[str, Any], anomaly_score: float = 0.0, status: str = "MANUAL_TRIGGER"):
        self._trigger_sample_preservation(
            anomaly_score=anomaly_score,
            status=status,
            readings=readings,
            reason="Kích hoạt lưu mẫu thủ công từ Dashboard điều khiển"
        )

    def reset_sample_vial(self):
        """Allows technician to replace vial and reset sample state"""
        self.state.sample_preserved = False
        self.state.sample_preserved_at = None
        self.db.record_actuator(
            timestamp=datetime.now(timezone.utc).isoformat(),
            actuator="SAMPLE_COLLECTOR",
            action="RESET_VIAL",
            reason="Kỹ thuật viên đã thay ống nghiệm mới và reset cơ chế",
            source="MANUAL"
        )

    def set_alarm_mute(self, muted: bool):
        self.state.alarm_muted = muted
        if muted:
            self.state.alarm_active = False
