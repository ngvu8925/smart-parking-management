"""
Machine Learning Training Pipeline for Smart Water Guardian
Trains an Unsupervised Isolation Forest for anomaly detection
and a Supervised Random Forest Classifier for contamination pattern diagnosis.
"""
import os
import json
import logging
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import joblib

from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score, roc_auc_score

from ml.dataset_generator import build_and_save_dataset, FEATURE_COLUMNS, LABELS

logger = logging.getLogger("MLTraining")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")


def train_models(dataset_path: str = "ml/datasets/water_quality_ml_dataset.csv"):
    os.makedirs(MODELS_DIR, exist_ok=True)

    # 1. Load or generate dataset
    if not os.path.exists(dataset_path):
        logger.info("Dataset not found at %s. Generating synthetic dataset...", dataset_path)
        df = build_and_save_dataset(dataset_path)
    else:
        logger.info("Loading dataset from %s...", dataset_path)
        df = pd.read_csv(dataset_path)

    X = df[FEATURE_COLUMNS]
    y_class = df["label"]
    y_anomaly = df["is_anomaly"]

    # 2. Fit Scaler
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # 3. Train Isolation Forest (Unsupervised Anomaly Detection)
    # Train on normal samples + slight contamination for realistic boundary
    normal_indices = df[df["is_anomaly"] == 0].index
    X_normal_scaled = X_scaled[normal_indices]

    logger.info("Training Isolation Forest on %d normal samples...", len(X_normal_scaled))
    iso_forest = IsolationForest(
        n_estimators=150,
        max_samples="auto",
        contamination=0.03,
        random_state=42,
        n_jobs=-1
    )
    iso_forest.fit(X_normal_scaled)

    # Evaluate Isolation Forest on full dataset
    raw_scores = iso_forest.score_samples(X_scaled)
    # Map score: higher anomaly -> lower score. Let's compute AUC-ROC
    auc = roc_auc_score(y_anomaly, -raw_scores)
    logger.info("Isolation Forest Anomaly Detection AUC-ROC: %.4f", auc)

    # 4. Train Random Forest Classifier for Contamination Diagnosis
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_class, test_size=0.25, random_state=42, stratify=y_class
    )
    logger.info("Training Multi-Class Random Forest Classifier on %d training samples...", len(X_train))
    classifier = RandomForestClassifier(
        n_estimators=120,
        max_depth=12,
        random_state=42,
        n_jobs=-1
    )
    classifier.fit(X_train, y_train)

    y_pred = classifier.predict(X_test)
    accuracy = accuracy_score(y_test, y_pred)
    logger.info("Classifier Test Accuracy: %.4f (%.2f%%)", accuracy, accuracy * 100)

    # Feature Importances
    feature_importances = dict(zip(FEATURE_COLUMNS, [round(float(v), 4) for v in classifier.feature_importances_]))
    sorted_features = sorted(feature_importances.items(), key=lambda x: x[1], reverse=True)
    logger.info("Top Predictive Features: %s", sorted_features[:4])

    # 5. Save Artifacts
    iso_path = os.path.join(MODELS_DIR, "isolation_forest.joblib")
    clf_path = os.path.join(MODELS_DIR, "classifier.joblib")
    scaler_path = os.path.join(MODELS_DIR, "scaler.joblib")
    meta_path = os.path.join(MODELS_DIR, "model_metadata.json")

    joblib.dump(iso_forest, iso_path)
    joblib.dump(classifier, clf_path)
    joblib.dump(scaler, scaler_path)

    metadata = {
        "model_version": "1.0.0-rf-isolation",
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "n_samples": len(df),
        "features": FEATURE_COLUMNS,
        "classes": LABELS,
        "isolation_forest_auc": round(float(auc), 4),
        "classifier_accuracy": round(float(accuracy), 4),
        "feature_importances": feature_importances
    }

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    logger.info("All ML models successfully trained and persisted to %s", MODELS_DIR)
    return metadata


if __name__ == "__main__":
    train_models()
