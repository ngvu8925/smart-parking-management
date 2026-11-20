"""
MQTT Client Bridge using Paho-MQTT
Subscribes to telemetry from physical/simulated nodes, publishes actuator commands and alerts.
"""
import json
import logging
import asyncio
from typing import Optional, Callable
import paho.mqtt.client as mqtt

import config
from core.models import TelemetryPacket, CommandPayload
from core.event_bus import bus

logger = logging.getLogger("MQTTBridge")


class MQTTBridge:
    def __init__(
        self,
        broker_host: str = config.MQTT_HOST,
        broker_port: int = config.MQTT_PORT,
        client_id: str = config.MQTT_CLIENT_ID_BACKEND
    ):
        self.host = broker_host
        self.port = broker_port
        self.client_id = client_id
        self.client = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2,
            client_id=self.client_id
        )
        self.is_connected = False
        self._loop_task: Optional[asyncio.Task] = None

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.is_connected = True
            logger.info("Connected successfully to MQTT Broker at %s:%d", self.host, self.port)
            # Subscribe to telemetry and commands
            self.client.subscribe([
                (config.TOPIC_TELEMETRY, 0),
                (config.TOPIC_CMD_VALVE, 0),
                (config.TOPIC_CMD_SAMPLE, 0),
                (config.TOPIC_CMD_ALARM, 0)
            ])
            logger.info("Subscribed to MQTT topics: %s, %s", config.TOPIC_TELEMETRY, "water/cmd/#")
        else:
            logger.warning("Failed to connect to MQTT broker, return code: %d", rc)

    def _on_disconnect(self, client, userdata, flags, rc, properties=None):
        self.is_connected = False
        logger.warning("Disconnected from MQTT Broker (rc=%s)", rc)

    def _on_message(self, client, userdata, msg):
        try:
            topic = msg.topic
            payload_str = msg.payload.decode("utf-8")

            if topic == config.TOPIC_TELEMETRY:
                data = json.loads(payload_str)
                packet = TelemetryPacket.model_validate(data)
                # Dispatch to internal event bus (schedule in event loop)
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(bus.emit("telemetry_raw", packet))
                except RuntimeError:
                    pass

            elif topic.startswith("water/cmd/"):
                cmd_type = topic.split("/")[-1]
                data = json.loads(payload_str) if payload_str.startswith("{") else {"action": payload_str}
                try:
                    loop = asyncio.get_running_loop()
                    loop.create_task(bus.emit(f"command_{cmd_type}", data))
                except RuntimeError:
                    pass

        except Exception as e:
            logger.error("Error processing MQTT message on '%s': %s", msg.topic, e)

    def publish_actuator_status(self, actuator_state_json: str):
        if self.is_connected:
            self.client.publish(config.TOPIC_STATUS_ACTUATORS, actuator_state_json, qos=0, retain=True)

    def publish_alert(self, alert_json: str):
        if self.is_connected:
            self.client.publish(config.TOPIC_ALERTS, alert_json, qos=1)

    async def start(self):
        try:
            self.client.connect_async(self.host, self.port, keepalive=config.MQTT_KEEPALIVE)
            self.client.loop_start()
            logger.info("MQTT Client loop started asynchronously.")
        except Exception as e:
            logger.warning("MQTT Broker connection delayed: %s. Reconnection will happen automatically.", e)

    async def stop(self):
        self.client.loop_stop()
        self.client.disconnect()
        logger.info("MQTT Client disconnected.")
