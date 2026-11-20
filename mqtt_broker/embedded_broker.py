"""
Lightweight Pure-Python AsyncIO MQTT 3.1.1 Broker
Allows real ESP32 microcontrollers, MQTT Explorer, and simulation clients
to connect directly to port 1883 without requiring Mosquitto installation.
"""
import asyncio
import logging
from typing import Dict, Set, Optional

logger = logging.getLogger("EmbeddedMQTTBroker")


class MQTTClientSession:
    def __init__(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        self.reader = reader
        self.writer = writer
        self.client_id = ""
        self.subscriptions: Set[str] = set()

    def send_packet(self, data: bytes):
        try:
            self.writer.write(data)
        except Exception as e:
            logger.debug("Failed to write to client %s: %s", self.client_id, e)


class EmbeddedMQTTBroker:
    def __init__(self, host: str = "0.0.0.0", port: int = 1883):
        self.host = host
        self.port = port
        self.sessions: Set[MQTTClientSession] = set()
        self.server: Optional[asyncio.Server] = None
        self.is_running = False

    async def start(self):
        try:
            self.server = await asyncio.start_server(self._handle_client, self.host, self.port)
            self.is_running = True
            logger.info("Embedded MQTT 3.1.1 Broker started on %s:%d", self.host, self.port)
        except OSError as e:
            logger.warning("Could not bind port %d for Embedded MQTT Broker (%s). Using existing external broker.", self.port, e)

    async def stop(self):
        self.is_running = False
        if self.server:
            self.server.close()
            await self.server.wait_closed()
            logger.info("Embedded MQTT Broker stopped.")

    def _matches_topic(self, sub_topic: str, pub_topic: str) -> bool:
        if sub_topic == "#" or sub_topic == pub_topic:
            return True
        sub_parts = sub_topic.split("/")
        pub_parts = pub_topic.split("/")
        for i, s in enumerate(sub_parts):
            if s == "#":
                return True
            if i >= len(pub_parts):
                return False
            if s != "+" and s != pub_parts[i]:
                return False
        return len(sub_parts) == len(pub_parts)

    def broadcast(self, topic: str, payload: bytes, qos: int = 0):
        # Construct MQTT PUBLISH packet
        topic_bytes = topic.encode("utf-8")
        rem_len = 2 + len(topic_bytes) + len(payload)
        header = bytearray([0x30])  # PUBLISH, QoS 0
        # encode remaining length
        while True:
            encoded_byte = rem_len % 128
            rem_len = rem_len // 128
            if rem_len > 0:
                encoded_byte |= 0x80
            header.append(encoded_byte)
            if rem_len == 0:
                break

        packet = header + len(topic_bytes).to_bytes(2, "big") + topic_bytes + payload

        for session in list(self.sessions):
            for sub in session.subscriptions:
                if self._matches_topic(sub, topic):
                    session.send_packet(packet)
                    break

    async def _handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        session = MQTTClientSession(reader, writer)
        self.sessions.add(session)
        addr = writer.get_extra_info("peername")
        logger.debug("New MQTT connection from %s", addr)

        try:
            while self.is_running:
                # Read fixed header first byte
                byte1 = await reader.read(1)
                if not byte1:
                    break
                packet_type = byte1[0] >> 4

                # Decode remaining length
                multiplier = 1
                rem_len = 0
                while True:
                    b = await reader.read(1)
                    if not b:
                        break
                    digit = b[0]
                    rem_len += (digit & 127) * multiplier
                    if (digit & 128) == 0:
                        break
                    multiplier *= 128

                payload = await reader.readexactly(rem_len) if rem_len > 0 else b""

                # CONNECT (0x01)
                if packet_type == 1:
                    # Parse client id (skip protocol name, flags, keepalive)
                    try:
                        proto_len = int.from_bytes(payload[0:2], "big")
                        idx = 2 + proto_len + 1 + 1 + 2  # skip to payload
                        client_id_len = int.from_bytes(payload[idx:idx+2], "big")
                        session.client_id = payload[idx+2:idx+2+client_id_len].decode("utf-8", "ignore")
                    except Exception:
                        session.client_id = f"client-{id(session)}"

                    logger.info("MQTT Client connected: %s from %s", session.client_id, addr)
                    # Send CONNACK (0x20, 0x02, 0x00, 0x00: Accepted)
                    session.send_packet(bytes([0x20, 0x02, 0x00, 0x00]))

                # PUBLISH (0x03)
                elif packet_type == 3:
                    try:
                        topic_len = int.from_bytes(payload[0:2], "big")
                        topic = payload[2:2+topic_len].decode("utf-8", "ignore")
                        msg_data = payload[2+topic_len:]
                        # Broadcast to all matching subscribers
                        self.broadcast(topic, msg_data)
                    except Exception as e:
                        logger.error("Error processing PUBLISH packet: %s", e)

                # SUBSCRIBE (0x08)
                elif packet_type == 8:
                    try:
                        msg_id = payload[0:2]
                        idx = 2
                        granted_qos = []
                        while idx < len(payload):
                            t_len = int.from_bytes(payload[idx:idx+2], "big")
                            topic = payload[idx+2:idx+2+t_len].decode("utf-8", "ignore")
                            qos = payload[idx+2+t_len]
                            session.subscriptions.add(topic)
                            granted_qos.append(qos)
                            idx += 2 + t_len + 1
                            logger.info("Client %s subscribed to '%s'", session.client_id, topic)

                        # SUBACK (0x90, len, msg_id, qos list)
                        suback = bytes([0x90, 2 + len(granted_qos)]) + msg_id + bytes(granted_qos)
                        session.send_packet(suback)
                    except Exception as e:
                        logger.error("Error processing SUBSCRIBE packet: %s", e)

                # PINGREQ (0x0C)
                elif packet_type == 12:
                    # PINGRESP (0xD0, 0x00)
                    session.send_packet(bytes([0xD0, 0x00]))

                # DISCONNECT (0x0E)
                elif packet_type == 14:
                    break

        except (asyncio.IncompleteReadError, ConnectionResetError):
            pass
        except Exception as e:
            logger.debug("MQTT client session error: %s", e)
        finally:
            self.sessions.discard(session)
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass
            logger.debug("MQTT client disconnected: %s", session.client_id)
