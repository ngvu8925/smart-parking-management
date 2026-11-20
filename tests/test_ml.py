"""
Unit tests for Machine Learning Pipeline & Inference Engine
"""
import pytest
from ml.inference import WaterMLInferenceEngine


@pytest.fixture
def ml_engine():
    engine = WaterMLInferenceEngine()
    assert engine.is_loaded is True
    return engine


def test_ml_normal_sample_prediction(ml_engine):
    sample = {
        "ph": 7.21,
        "ec": 350.0,
        "tds": 175.0,
        "turbidity": 0.38,
        "orp": 625.0,
        "chlorine": 0.51,
        "temperature": 27.4,
        "nh4": 0.03,
        "no3": 4.1,
        "uv254": 0.021
    }
    result = ml_engine.predict(sample)
    assert result["ml_available"] is True
    assert result["predicted_class"] == "NORMAL"
    assert result["is_anomaly"] is False
    assert result["confidence_pct"] > 80.0


def test_ml_acid_contamination_prediction(ml_engine):
    sample = {
        "ph": 4.20,
        "ec": 880.0,
        "tds": 440.0,
        "turbidity": 1.1,
        "orp": 790.0,
        "chlorine": 0.12,
        "temperature": 28.5,
        "nh4": 0.04,
        "no3": 4.5,
        "uv254": 0.033
    }
    result = ml_engine.predict(sample)
    assert result["predicted_class"] == "ACID_CONTAMINATION"
    assert result["is_anomaly"] is True
    assert result["confidence_pct"] > 70.0


def test_ml_turbidity_spike_prediction(ml_engine):
    sample = {
        "ph": 7.15,
        "ec": 410.0,
        "tds": 205.0,
        "turbidity": 16.5,
        "orp": 530.0,
        "chlorine": 0.32,
        "temperature": 27.8,
        "nh4": 0.07,
        "no3": 5.0,
        "uv254": 0.042
    }
    result = ml_engine.predict(sample)
    assert result["predicted_class"] == "MUDDY_SEDIMENT"
    assert result["is_anomaly"] is True


def test_ml_ammonia_spike_prediction(ml_engine):
    sample = {
        "ph": 7.70,
        "ec": 590.0,
        "tds": 295.0,
        "turbidity": 2.2,
        "orp": 450.0,
        "chlorine": 0.07,
        "temperature": 28.2,
        "nh4": 1.45,
        "no3": 6.9,
        "uv254": 0.065
    }
    result = ml_engine.predict(sample)
    assert result["predicted_class"] == "AMMONIA_POLLUTION"
    assert result["is_anomaly"] is True
