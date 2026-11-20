"""
Water Telemetry Simulator Process
Generates realistic normalized telemetry packets matching the exact hardware interface
and publishes them to MQTT / EventBus.
"""
import asyncio
import copy
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import config
from core.models import (
    SensorReading,
    TelemetryPacket,
    SensorSourceEnum,
    SensorStatusEnum
)
from simulator.physics import WaterPhysicsEngine
from simulator.scenario_manager import ScenarioManager
from core.event_bus import bus

logger = logging.getLogger("WaterSimulator")


class WaterSimulator:
    def __init__(self, publish_interval: float = 1.0):
        self.interval = publish_interval
        self.physics = WaterPhysicsEngine(config.BASELINE_PROFILE)
        self.scenario_mgr = ScenarioManager(self.physics)
        self.sensor_metadata: Dict[str, Dict[str, str]] = copy.deepcopy(config.DEFAULT_SENSOR_METADATA)
        self.is_running = False
        self._task: Optional[asyncio.Task] = None
        self.mqtt_client = None  # Injected optionally if MQTT enabled

    def set_sensor_mode(self, sensor_key: str, source: Optional[str] = None, status: Optional[str] = None):
        if sensor_key not in self.sensor_metadata:
            self.sensor_metadata[sensor_key] = {}
        if source:
            self.sensor_metadata[sensor_key]["source"] = source
        if status:
            self.sensor_metadata[sensor_key]["status"] = status
        logger.info("Updated sensor %s metadata: %s", sensor_key, self.sensor_metadata[sensor_key])

    def generate_packet(self) -> TelemetryPacket:
        # Step scenario timer
        self.scenario_mgr.step()

        # Step physics channels
        physical_values = self.physics.step(dt=self.interval)

        readings_map: Dict[str, SensorReading] = {}
        now_iso = datetime.now(timezone.utc).isoformat()

        for key, conf in config.BASELINE_PROFILE.items():
            val = physical_values.get(key)
            if val is None:
                # Sensor offline/disconnected
                val = 0.0

            meta = self.sensor_metadata.get(key, {"source": "simulator", "status": "SIMULATED"})
            source_enum = SensorSourceEnum(meta.get("source", "simulator"))
            status_enum = SensorStatusEnum(meta.get("status", "SIMULATED"))

            ch = self.physics.channels.get(key)
            is_stuck = ch.is_stuck if ch else False

            reading = SensorReading(
                sensor=key,
                value=round(val, 3) if key != "electrical_leak" else float(val),
                unit=conf["unit"],
                source=source_enum,
                status=status_enum,
                timestamp=now_iso,
                is_stuck=is_stuck
            )
            readings_map[key] = reading

        packet = TelemetryPacket(
            device_id="water-guardian-node-01",
            timestamp=now_iso,
            readings=readings_map,
            wifi_rssi=-54,
            firmware_version="1.2.0-sentinel"
        )
        return packet

    async def start(self):
        if self.is_running:
            return
        self.is_running = True
        logger.info("Starting Water Simulator loop (interval: %0.1fs)...", self.interval)
        self._task = asyncio.create_task(self._run_loop())

    async def stop(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Water Simulator stopped.")

    async def _run_loop(self):
        while self.is_running:
            try:
                packet = self.generate_packet()
                # Publish to internal event bus
                await bus.emit("telemetry_raw", packet)

                # If MQTT client is connected, publish to standard MQTT topic
                if self.mqtt_client and self.mqtt_client.is_connected():
                    self.mqtt_client.publish(
                        config.TOPIC_TELEMETRY,
                        packet.model_dump_json()
                    )

            except Exception as e:
                logger.error("Error in simulation step: %s", e, exc_info=True)

            await asyncio.sleep(self.interval)
