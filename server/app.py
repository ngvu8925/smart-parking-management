"""
Main FastAPI Application for Smart Water Guardian
"""
import os
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

import config
from core.database import WaterDatabase
from core.anomaly_detector import WaterAnomalyDetector
from core.rule_engine import WaterRuleEngine
from core.event_bus import bus
from core.models import TelemetryPacket, AnomalyEvaluation
from simulator.water_simulator import WaterSimulator
from mqtt_broker.embedded_broker import EmbeddedMQTTBroker
from mqtt_broker.client import MQTTBridge
from server.routes.api import router as api_router, init_services
from server.routes.ws import hub

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("App")

# Shared state container
app_state = {
    "db": None,
    "detector": None,
    "rule_engine": None,
    "simulator": None,
    "broker": None,
    "mqtt_bridge": None,
    "last_evaluation": None,
    "last_packet": None
}


async def on_telemetry_raw(packet: TelemetryPacket):
    detector: WaterAnomalyDetector = app_state["detector"]
    rule_engine: WaterRuleEngine = app_state["rule_engine"]
    db: WaterDatabase = app_state["db"]

    evaluation, enriched_packet = detector.evaluate(packet)
    app_state["last_evaluation"] = evaluation
    app_state["last_packet"] = enriched_packet

    # Save to SQLite time-series
    readings_dict = {k: r.model_dump() for k, r in enriched_packet.readings.items()}
    db.record_telemetry(
        timestamp=enriched_packet.timestamp,
        device_id=enriched_packet.device_id,
        readings_dict=readings_dict,
        anomaly_score=evaluation.anomaly_score,
        status=evaluation.status.value
    )

    # Process safety rules and actuators
    rule_engine.process_evaluation(evaluation, enriched_packet)

    # Broadcast live update to all WebSocket clients
    payload = {
        "type": "TELEMETRY_UPDATE",
        "timestamp": enriched_packet.timestamp,
        "device_id": enriched_packet.device_id,
        "readings": readings_dict,
        "anomaly_score": evaluation.anomaly_score,
        "status": evaluation.status.value,
        "is_electrical_hazard": evaluation.is_electrical_hazard,
        "critical_factors": evaluation.critical_factors,
        "sensor_diagnostics": evaluation.sensor_diagnostics,
        "recommended_actions": evaluation.recommended_actions,
        "ml_prediction": evaluation.ml_prediction,
        "actuators": rule_engine.state.model_dump(),
        "active_scenario": app_state["simulator"].scenario_mgr.get_active_scenario()
    }
    await hub.broadcast(payload)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing Smart Water Guardian Server...")

    # 1. Database
    db = WaterDatabase()
    app_state["db"] = db

    # 2. Anomaly Engine & Rule Engine
    detector = WaterAnomalyDetector()
    rule_engine = WaterRuleEngine(db)
    app_state["detector"] = detector
    app_state["rule_engine"] = rule_engine

    # 3. Embedded MQTT Broker (allows real ESP32 on port 1883)
    broker = EmbeddedMQTTBroker(host="0.0.0.0", port=config.MQTT_PORT)
    await broker.start()
    app_state["broker"] = broker

    # 4. MQTT Bridge client
    mqtt_bridge = MQTTBridge(broker_host=config.MQTT_HOST, broker_port=config.MQTT_PORT)
    await mqtt_bridge.start()
    app_state["mqtt_bridge"] = mqtt_bridge

    # 5. Physics Simulator
    simulator = WaterSimulator(publish_interval=1.0)
    simulator.mqtt_client = mqtt_bridge.client
    app_state["simulator"] = simulator

    # Inject dependencies into API routes
    init_services(app_state)

    # 6. Subscribe anomaly detection pipeline to telemetry events
    bus.subscribe("telemetry_raw", on_telemetry_raw)

    # Start simulation loop
    await simulator.start()
    logger.info("Smart Water Guardian Server is ready and streaming live telemetry!")

    yield

    logger.info("Shutting down Smart Water Guardian Server...")
    await simulator.stop()
    await mqtt_bridge.stop()
    if broker:
        await broker.stop()


app = FastAPI(
    title="Smart Water Guardian API",
    description="Hệ thống giám sát an toàn nguồn nước thông minh",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST API
app.include_router(api_router)


# WebSocket live stream
@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await hub.connect(websocket)
    # Immediately send current state if available
    last_eval = app_state.get("last_evaluation")
    last_packet = app_state.get("last_packet")
    rule_engine = app_state.get("rule_engine")
    simulator = app_state.get("simulator")

    if last_eval and last_packet and rule_engine and simulator:
        readings_dict = {k: r.model_dump() for k, r in last_packet.readings.items()}
        await websocket.send_json({
            "type": "INIT_STATE",
            "timestamp": last_packet.timestamp,
            "readings": readings_dict,
            "anomaly_score": last_eval.anomaly_score,
            "status": last_eval.status.value,
            "is_electrical_hazard": last_eval.is_electrical_hazard,
            "critical_factors": last_eval.critical_factors,
            "sensor_diagnostics": last_eval.sensor_diagnostics,
            "recommended_actions": last_eval.recommended_actions,
            "actuators": rule_engine.state.model_dump(),
            "active_scenario": simulator.scenario_mgr.get_active_scenario()
        })

    try:
        while True:
            # Keep receiving any client messages or pings
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
    except Exception:
        hub.disconnect(websocket)


# Static assets
static_dir = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root_index():
    index_file = os.path.join(static_dir, "index.html")
    return FileResponse(index_file)
