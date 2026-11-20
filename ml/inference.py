"""
Real-time Machine Learning Inference Engine for Smart Water Guardian
Evaluates multi-variate water telemetry using Isolation Forest and Random Forest Classifier.
"""
import os
import json
import logging
from typing import Dict, Any, Optional
import numpy as np
import joblib

from ml.dataset_generator import FEATURE_COLUMNS

logger = logging.getLogger("MLInference")

LABEL_TRANSLATIONS = {
    "NORMAL": "Nguồn nước đạt chuẩn (Normal Clean Water)",
    "MUDDY_SEDIMENT": "Vẩn đục / Sụt lở bùn đất (Suspended Sediment)",
    "SALINE_INTRUSION": "Nhiễm khoáng / Xâm nhập mặn (Saline Intrusion)",
    "ACID_CONTAMINATION": "Nhiễm Axit công nghiệp (Acid Contamination)",
    "CHLORINE_DEPLETION": "Mất Clo khử trùng (Disinfection Failure)",
    "AMMONIA_POLLUTION": "Nhiễm Amoni / Nước thải (Ammonia Pollution)",
    "NITRATE_RUNOFF": "Nhiễm Nitrat nông nghiệp (Nitrate Runoff)",
    "ORGANIC_POLLUTION": "Nhiễm chất hữu cơ / UV254 tăng (Organic Pollution)",
    "MIXED_DISASTER": "Thảm họa ô nhiễm phức hợp (Severe Mixed Contamination)"
}


class WaterMLInferenceEngine:
    def __init__(self, models_dir: Optional[str] = None):
        if models_dir is None:
            models_dir = os.path.join(os.path.dirname(__file__), "models")
        self.models_dir = models_dir

        self.iso_forest = None
        self.classifier = None
        self.scaler = None
        self.metadata = {}
        self.is_loaded = False

        self._load_models()

    def _load_models(self):
        iso_path = os.path.join(self.models_dir, "isolation_forest.joblib")
        clf_path = os.path.join(self.models_dir, "classifier.joblib")
        scaler_path = os.path.join(self.models_dir, "scaler.joblib")
        meta_path = os.path.join(self.models_dir, "model_metadata.json")

        if not (os.path.exists(iso_path) and os.path.exists(clf_path) and os.path.exists(scaler_path)):
            logger.warning("ML models not found in %s. Running in fallback mode.", self.models_dir)
            return

        try:
            self.iso_forest = joblib.load(iso_path)
            self.classifier = joblib.load(clf_path)
            self.scaler = joblib.load(scaler_path)

            if os.path.exists(meta_path):
                with open(meta_path, "r", encoding="utf-8") as f:
                    self.metadata = json.load(f)

            self.is_loaded = True
            logger.info("ML Models successfully loaded! (Version: %s, AUC: %s, Acc: %s)",
                        self.metadata.get("model_version", "1.0.0"),
                        self.metadata.get("isolation_forest_auc"),
                        self.metadata.get("classifier_accuracy"))
        except Exception as e:
            logger.error("Failed to load ML models: %s", e)

    def predict(self, readings_dict: Dict[str, float]) -> Dict[str, Any]:
        """
        Runs ML inference on a single water telemetry snapshot.
        Returns:
            - ml_anomaly_score: float (0.0 to 100.0%)
            - is_anomaly: bool
            - predicted_class: str (Machine label)
            - predicted_label_vi: str (Human-friendly Vietnamese title)
            - confidence_pct: float (0.0 to 100.0%)
            - top_features: list of top features contributing to the anomaly
        """
        if not self.is_loaded:
            return {
                "ml_available": False,
                "ml_anomaly_score": 0.0,
                "is_anomaly": False,
                "predicted_label_vi": "ML Chưa Sẵn Sàng",
                "confidence_pct": 0.0,
                "top_features": []
            }

        # Vectorize in strict feature column order
        vector = []
        for col in FEATURE_COLUMNS:
            val = readings_dict.get(col, 0.0)
            vector.append(float(val))

        import pandas as pd
        X_df = pd.DataFrame([vector], columns=FEATURE_COLUMNS)
        X_scaled = self.scaler.transform(X_df)

        # 1. Isolation Forest Scoring
        score_raw = float(self.iso_forest.decision_function(X_scaled)[0])
        norm_score = max(0.0, min(100.0, (0.16 - score_raw) / 0.38 * 100.0))
        ml_anomaly_score = round(norm_score, 1)

        # 2. Classifier Prediction
        pred_class = str(self.classifier.predict(X_df)[0])
        pred_probs = self.classifier.predict_proba(X_df)[0]
        max_prob = float(np.max(pred_probs))
        confidence_pct = round(max_prob * 100.0, 1)

        # 3. Feature Importance Attribution
        # Compute how much each scaled feature deviates from zero, weighted by RF feature importance
        importances = self.metadata.get("feature_importances", {})
        deviations = np.abs(X_scaled[0])
        contributions = {}
        for idx, col in enumerate(FEATURE_COLUMNS):
            imp = importances.get(col, 0.1)
            contributions[col] = float(deviations[idx] * imp)

        tot_contrib = sum(contributions.values()) or 1.0
        sorted_contrib = sorted(
            [(k, round((v / tot_contrib) * 100.0, 1)) for k, v in contributions.items()],
            key=lambda x: x[1],
            reverse=True
        )

        return {
            "ml_available": True,
            "ml_anomaly_score": ml_anomaly_score,
            "is_anomaly": ml_anomaly_score >= 50.0 or pred_class != "NORMAL",
            "predicted_class": pred_class,
            "predicted_label_vi": LABEL_TRANSLATIONS.get(pred_class, pred_class),
            "confidence_pct": confidence_pct,
            "top_features": sorted_contrib[:3],
            "model_version": self.metadata.get("model_version", "1.0.0")
        }
