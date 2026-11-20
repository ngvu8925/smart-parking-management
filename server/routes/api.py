"""
REST API Routes for Smart Water Guardian
"""
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

import config
from core.models import (
    ActuatorState,
    AnomalyEvaluation,
    SystemStatusEnum,
    CommandPayload
)

router = APIRouter(prefix="/api")

# References will be injected from server/app.py
services: Dict[str, Any] = {}


def init_services(app_services: Dict[str, Any]):
    global services
    services = app_services


class ScenarioActivateRequest(BaseModel):
    scenario_id: str


class InjectRequest(BaseModel):
    sensor: str
    value: float


class ValveRequest(BaseModel):
    action: str  # "OPEN" or "CLOSE"
    mode: Optional[str] = None  # "AUTO" or "MANUAL"


class AlarmRequest(BaseModel):
    muted: bool


class SensorConfigRequest(BaseModel):
    sensor: str
    source: Optional[str] = None
    status: Optional[str] = None


@router.get("/status")
async def get_system_status():
    rule_engine = services["rule_engine"]
    simulator = services["simulator"]
    last_eval: Optional[AnomalyEvaluation] = services.get("last_evaluation")

    return {
        "status": last_eval.status.value if last_eval else SystemStatusEnum.NORMAL.value,
        "anomaly_score": last_eval.anomaly_score if last_eval else 0.0,
        "is_electrical_hazard": last_eval.is_electrical_hazard if last_eval else False,
        "critical_factors": last_eval.critical_factors if last_eval else [],
        "sensor_diagnostics": last_eval.sensor_diagnostics if last_eval else {},
        "recommended_actions": last_eval.recommended_actions if last_eval else [],
        "ml_prediction": last_eval.ml_prediction if last_eval else None,
        "actuators": rule_engine.state.model_dump(),
        "active_scenario": simulator.scenario_mgr.get_active_scenario(),
        "device_id": "water-guardian-node-01"
    }


@router.get("/ml/status")
async def get_ml_status():
    detector = services["detector"]
    ml_engine = getattr(detector, "ml_engine", None)
    if not ml_engine or not ml_engine.is_loaded:
        return {"loaded": False, "message": "ML Engine not initialized or models not found"}
    return {
        "loaded": True,
        "metadata": ml_engine.metadata
    }


@router.get("/telemetry/latest")
async def get_latest_telemetry(limit: int = Query(60, ge=10, le=300)):
    db = services["db"]
    return db.get_latest_telemetry(limit=limit)


@router.get("/alerts")
async def get_alerts(limit: int = Query(50, ge=5, le=200)):
    db = services["db"]
    return db.get_recent_alerts(limit=limit)


@router.get("/samples")
async def get_samples(limit: int = Query(20, ge=1, le=100)):
    db = services["db"]
    return db.get_preserved_samples(limit=limit)


@router.get("/scenarios")
async def list_scenarios():
    simulator = services["simulator"]
    return {
        "active": simulator.scenario_mgr.get_active_scenario(),
        "scenarios": simulator.scenario_mgr.list_scenarios()
    }


@router.post("/scenarios/activate")
async def activate_scenario(req: ScenarioActivateRequest):
    simulator = services["simulator"]
    success = simulator.scenario_mgr.activate_scenario(req.scenario_id)
    if not success:
        raise HTTPException(status_code=404, detail=f"Scenario '{req.scenario_id}' not found.")
    return {
        "success": True,
        "active_scenario": simulator.scenario_mgr.get_active_scenario()
    }


@router.post("/scenarios/inject")
async def inject_parameter(req: InjectRequest):
    simulator = services["simulator"]
    if req.sensor not in config.BASELINE_PROFILE:
        raise HTTPException(status_code=400, detail=f"Invalid sensor key: {req.sensor}")
    simulator.scenario_mgr.inject_custom_target(req.sensor, req.value)
    return {"success": True, "injected": {req.sensor: req.value}}


@router.post("/actuators/valve")
async def control_valve(req: ValveRequest):
    rule_engine = services["rule_engine"]
    rule_engine.set_valve(req.action, mode=req.mode, source="API_DASHBOARD")
    return {"success": True, "actuators": rule_engine.state.model_dump()}


@router.post("/actuators/sample/trigger")
async def trigger_sample_vial():
    rule_engine = services["rule_engine"]
    last_eval = services.get("last_evaluation")
    last_packet = services.get("last_packet")
    readings = {k: r.model_dump() for k, r in last_packet.readings.items()} if last_packet else {}
    score = last_eval.anomaly_score if last_eval else 0.0

    rule_engine.trigger_sample_manually(readings, anomaly_score=score, status="MANUAL_COMMAND")
    return {"success": True, "actuators": rule_engine.state.model_dump()}


@router.post("/actuators/sample/reset")
async def reset_sample_vial():
    rule_engine = services["rule_engine"]
    rule_engine.reset_sample_vial()
    return {"success": True, "actuators": rule_engine.state.model_dump()}


@router.post("/actuators/alarm")
async def control_alarm(req: AlarmRequest):
    rule_engine = services["rule_engine"]
    rule_engine.set_alarm_mute(req.muted)
    return {"success": True, "actuators": rule_engine.state.model_dump()}


@router.post("/sensors/config")
async def configure_sensor(req: SensorConfigRequest):
    simulator = services["simulator"]
    if req.sensor not in config.BASELINE_PROFILE:
        raise HTTPException(status_code=400, detail=f"Invalid sensor key: {req.sensor}")
    simulator.set_sensor_mode(req.sensor, source=req.source, status=req.status)
    return {"success": True, "metadata": simulator.sensor_metadata.get(req.sensor)}


@router.get("/baseline")
async def get_baseline():
    detector = services["detector"]
    return detector.baseline


@router.post("/baseline/reset")
async def reset_baseline():
    detector = services["detector"]
    detector.update_baseline(config.BASELINE_PROFILE)
    detector.reset_history()
    return {"success": True, "baseline": detector.baseline}
