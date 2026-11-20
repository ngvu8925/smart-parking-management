"""
Multi-variate Anomaly Detection Engine for Smart Water Guardian
Combines baseline statistical deviation, physical safety thresholds, rate of change,
and sensor diagnostic checks (stuck probe, noise, drift).
"""
import math
import logging
from collections import deque
from typing import Dict, List, Tuple, Any, Optional
import numpy as np

import config
from core.models import (
    SensorReading,
    TelemetryPacket,
    AnomalyEvaluation,
    SystemStatusEnum,
    SensorStatusEnum
)
from ml.inference import WaterMLInferenceEngine

logger = logging.getLogger("AnomalyDetector")


class WaterAnomalyDetector:
    def __init__(self, baseline_profile: Optional[Dict[str, Dict[str, Any]]] = None):
        self.baseline = baseline_profile or config.BASELINE_PROFILE
        # Rolling history per sensor for stuck/noise/drift detection (last 20 readings)
        self.history_len = 20
        self.sensor_history: Dict[str, deque] = {k: deque(maxlen=self.history_len) for k in self.baseline.keys()}
        self.baseline_learn_enabled = True
        self.normal_readings_counter = 0
        self.ml_engine = WaterMLInferenceEngine()

    def reset_history(self):
        for k in self.sensor_history:
            self.sensor_history[k].clear()

    def update_baseline(self, new_baseline: Dict[str, Dict[str, Any]]):
        self.baseline.update(new_baseline)
        logger.info("Baseline profile updated with %d keys", len(new_baseline))

    def evaluate(self, packet: TelemetryPacket) -> Tuple[AnomalyEvaluation, TelemetryPacket]:
        """
        Evaluates a telemetry packet against learned baseline and safety rules.
        Enriches sensor readings with z-score, deviation, and diagnostic flags.
        Returns evaluation result and the enriched packet.
        """
        readings = packet.readings
        critical_factors: List[str] = []
        diagnostics: Dict[str, str] = {}
        recommended_actions: List[str] = []
        auto_actions: List[str] = []

        is_electrical_hazard = False
        leak_reading = readings.get("electrical_leak")
        if leak_reading and leak_reading.value > 0.5:
            is_electrical_hazard = True
            critical_factors.append("RÒ RỈ ĐIỆN VÀO KHU VỰC NƯỚC (Electrical leakage detected in water cell!)")
            diagnostics["electrical_leak"] = "CRITICAL_HAZARD"

        # Calculate deviations and sensor diagnostics
        weighted_deviation_sum = 0.0
        total_weight = 0.0
        max_individual_score = 0.0

        for key, conf in self.baseline.items():
            if key == "electrical_leak":
                continue

            reading = readings.get(key)
            if not reading:
                continue

            val = float(reading.value)
            nominal = float(conf["nominal"])
            std = float(conf["std"])
            min_safe = float(conf["min_safe"])
            max_safe = float(conf["max_safe"])
            weight = float(conf.get("weight", 1.0))

            # Store in rolling history for diagnosis
            hist = self.sensor_history[key]
            hist.append(val)

            # 1. Stuck sensor diagnosis (if >= 10 points and zero variation)
            is_stuck = False
            if len(hist) >= 10:
                recent_vals = list(hist)[-10:]
                val_range = max(recent_vals) - min(recent_vals)
                if val_range < 1e-5:
                    is_stuck = True
                    reading.is_stuck = True
                    diagnostics[key] = "SENSOR STUCK SUSPECTED (Dữ liệu đứng yên bất thường)"
                    critical_factors.append(f"Cảm biến {key.upper()} bị kẹt số liệu ({val})")

            # 2. Excessive noise diagnosis
            if len(hist) >= 10:
                recent_vals = list(hist)[-10:]
                var = np.var(recent_vals)
                if var > (std * 6.0) ** 2:
                    reading.is_noisy = True
                    diagnostics[key] = "HIGH NOISE / BUBBLE DETECTED (Nhiễu bọt khí/đo lường bất ổn)"

            # 3. Z-score and percentage deviation
            z = abs(val - nominal) / (std if std > 1e-6 else 1.0)
            dev_pct = ((val - nominal) / nominal) * 100.0 if abs(nominal) > 1e-6 else 0.0
            reading.z_score = round(z, 2)
            reading.deviation_pct = round(dev_pct, 1)

            # Safety threshold check
            threshold_breached = False
            if val < min_safe or val > max_safe:
                threshold_breached = True
                direction = "thấp dưới mức an toàn" if val < min_safe else "vượt ngưỡng an toàn"
                factor_msg = f"{key.upper()} = {val:.2f} {reading.unit} ({direction}: [{min_safe} - {max_safe}])"
                critical_factors.append(factor_msg)

            # Non-linear metric penalty (capped at 100)
            metric_score = (1.0 - math.exp(-0.18 * (z ** 1.6))) * 100.0
            if threshold_breached:
                metric_score = max(metric_score, 75.0)
                # Severe breach check (e.g. pH < 5.5 or turbidity > 10 NTU)
                if key == "ph" and (val < 5.5 or val > 9.5):
                    metric_score = max(metric_score, 90.0)
                elif key == "turbidity" and val > 8.0:
                    metric_score = max(metric_score, 88.0)

            if metric_score > max_individual_score:
                max_individual_score = metric_score

            weighted_deviation_sum += metric_score * weight
            total_weight += weight

        # Composite Anomaly Score (0 - 100)
        base_anomaly_score = (weighted_deviation_sum / total_weight) if total_weight > 0 else 0.0

        # Safety rule: A single severe breach must elevate the overall anomaly score
        if max_individual_score >= 75.0:
            base_anomaly_score = max(base_anomaly_score, max_individual_score * 0.92)

        # Multi-sensor compound amplification:
        # If 3 or more sensors deviate strongly (z >= 3.0), compound threat is much higher
        high_deviating_count = sum(
            1 for k, r in readings.items()
            if k != "electrical_leak" and r.z_score and r.z_score >= 3.0
        )
        if high_deviating_count >= 3:
            base_anomaly_score = min(100.0, base_anomaly_score * 1.35 + 15.0)
            critical_factors.append(f"Đa chỉ số ({high_deviating_count} cảm biến) cùng lệch bất thường (Compound anomaly)")

        # Machine Learning Inference (Isolation Forest + Random Forest Classifier)
        numeric_dict = {k: float(r.value) for k, r in readings.items() if k != "electrical_leak"}
        ml_result = self.ml_engine.predict(numeric_dict)
        if ml_result.get("ml_available"):
            ml_score = float(ml_result.get("ml_anomaly_score", 0.0))
            pred_class = ml_result.get("predicted_class", "NORMAL")

            # Blend ML Anomaly Score into composite score
            if pred_class != "NORMAL" and ml_score >= 40.0:
                base_anomaly_score = max(base_anomaly_score, ml_score * 0.95)
                critical_factors.append(
                    f"AI/ML Chẩn đoán: {ml_result['predicted_label_vi']} (Độ tin cậy: {ml_result['confidence_pct']}%)"
                )

        # Determine System Status
        if is_electrical_hazard:
            status = SystemStatusEnum.ELECTRICAL_HAZARD
            anomaly_score = 100.0
            recommended_actions.extend([
                "NGẮT ĐIỆN KHẨN CẤP: Ngắt atomat / RCBO tại nguồn cấp nước.",
                "CẢNH BÁO NGUY HIỂM: Tuyệt đối không chạm tay vào nước hoặc thiết bị.",
                "Tự động đóng van nước để cách ly dòng chảy.",
                "Kiểm tra hệ thống tiếp địa và bơm tăng áp / máy lọc."
            ])
            auto_actions.append("CLOSE_VALVE")
            auto_actions.append("SOUND_ALARM_EMERGENCY")

        elif base_anomaly_score >= config.ANOMALY_CONTAMINATION_THRESHOLD:
            status = SystemStatusEnum.SUSPECTED_CONTAMINATION
            anomaly_score = round(base_anomaly_score, 1)
            recommended_actions.extend([
                "NGHI NGỜ Ô NHIỄM NGUỒN NƯỚC: Tự động khóa van nước lập tức.",
                "KÍCH HOẠT LƯU MẪU: Đã cô lập mẫu nước nghi vấn vào bình bảo quản.",
                "Không sử dụng nước cho mục đích sinh hoạt hoặc ăn uống.",
                "Liên hệ đơn vị cấp nước hoặc gửi mẫu xét nghiệm chuyên sâu."
            ])
            auto_actions.append("CLOSE_VALVE")
            auto_actions.append("PRESERVE_SAMPLE")
            auto_actions.append("SOUND_ALARM")

        elif base_anomaly_score >= config.ANOMALY_ABNORMAL_THRESHOLD:
            status = SystemStatusEnum.ABNORMAL
            anomaly_score = round(base_anomaly_score, 1)
            recommended_actions.extend([
                "Nước có dấu hiệu biến đổi đáng kể so với ngưỡng tiêu chuẩn.",
                "Theo dõi liên tục biểu đồ xu hướng.",
                "Khuyến nghị súc rửa đường ống hoặc kiểm tra lõi lọc sơ cấp."
            ])
            auto_actions.append("SOUND_ALARM_SOFT")

        elif base_anomaly_score >= config.ANOMALY_WARNING_THRESHOLD:
            status = SystemStatusEnum.WARNING
            anomaly_score = round(base_anomaly_score, 1)
            recommended_actions.extend([
                "Chỉ số nước bắt đầu có độ lệch nhẹ so with baseline cơ sở.",
                "Hệ thống tiếp tục giám sát độ trôi (drift)."
            ])

        else:
            status = SystemStatusEnum.NORMAL
            anomaly_score = round(base_anomaly_score, 1)
            recommended_actions.append("Nguồn nước duy trì trạng thái ổn định trong dải bình thường.")

        # Self-adaptation: update baseline softly if NORMAL and stable for a long time
        if status == SystemStatusEnum.NORMAL and self.baseline_learn_enabled:
            self.normal_readings_counter += 1
            if self.normal_readings_counter >= 120:  # e.g., every 120 stable samples
                self.normal_readings_counter = 0
                self._adapt_baseline(readings)

        evaluation = AnomalyEvaluation(
            timestamp=packet.timestamp,
            status=status,
            anomaly_score=anomaly_score,
            is_electrical_hazard=is_electrical_hazard,
            critical_factors=critical_factors,
            sensor_diagnostics=diagnostics,
            recommended_actions=recommended_actions,
            auto_actions_taken=auto_actions,
            ml_prediction=ml_result
        )

        return evaluation, packet

    def _adapt_baseline(self, readings: Dict[str, SensorReading]):
        """Slow exponential smoothing adaptation for minor seasonal drifts"""
        alpha = 0.02
        for k, reading in readings.items():
            if k in self.baseline and k != "electrical_leak" and reading.status == SensorStatusEnum.LIVE:
                curr_nom = self.baseline[k]["nominal"]
                new_nom = curr_nom * (1 - alpha) + reading.value * alpha
                self.baseline[k]["nominal"] = round(new_nom, 3)
