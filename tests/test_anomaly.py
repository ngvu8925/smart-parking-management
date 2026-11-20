"""
Unit tests for Water Anomaly Detection Engine
"""
import pytest
from core.models import TelemetryPacket, SensorReading, SystemStatusEnum, SensorSourceEnum, SensorStatusEnum
from core.anomaly_detector import WaterAnomalyDetector
import config


def build_packet(overrides=None):
    overrides = overrides or {}
    readings = {}
    for k, conf in config.BASELINE_PROFILE.items():
        val = overrides.get(k, conf["nominal"])
        readings[k] = SensorReading(
            sensor=k,
            value=float(val),
            unit=conf["unit"],
            source=SensorSourceEnum.SIMULATOR,
            status=SensorStatusEnum.SIMULATED
        )
    return TelemetryPacket(readings=readings)


def test_nominal_water_evaluates_normal():
    detector = WaterAnomalyDetector()
    packet = build_packet()
    evaluation, _ = detector.evaluate(packet)

    assert evaluation.status == SystemStatusEnum.NORMAL
    assert evaluation.anomaly_score < 30.0
    assert not evaluation.is_electrical_hazard


def test_electrical_hazard_immediate_critical():
    detector = WaterAnomalyDetector()
    packet = build_packet({"electrical_leak": 1.0})
    evaluation, _ = detector.evaluate(packet)

    assert evaluation.status == SystemStatusEnum.ELECTRICAL_HAZARD
    assert evaluation.anomaly_score == 100.0
    assert evaluation.is_electrical_hazard
    assert "CLOSE_VALVE" in evaluation.auto_actions_taken


def test_severe_acid_contamination():
    detector = WaterAnomalyDetector()
    packet = build_packet({"ph": 4.5, "orp": 750.0})
    evaluation, _ = detector.evaluate(packet)

    assert evaluation.status in (SystemStatusEnum.ABNORMAL, SystemStatusEnum.SUSPECTED_CONTAMINATION)
    assert evaluation.anomaly_score > 60.0


def test_stuck_sensor_diagnosis():
    detector = WaterAnomalyDetector()
    # Feed 12 identical values for pH
    for _ in range(12):
        packet = build_packet({"ph": 7.21000})
        evaluation, enriched = detector.evaluate(packet)

    assert enriched.readings["ph"].is_stuck
    assert "ph" in evaluation.sensor_diagnostics
