/**
 * ============================================================================
 * Smart Water Guardian - ESP32 Firmware Main
 * Hardware Abstraction Layer & Pluggable Driver Architecture
 * ============================================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

#include "sensor_manager.h"

// Wi-Fi & MQTT Settings
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASS     = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER   = "172.20.10.2"; // IP của máy tính / NestJS server
const int   MQTT_PORT     = 1883;
const char* DEVICE_ID     = "water-guardian-node-01";

// MQTT Topics
const char* TOPIC_TELEMETRY = "water/telemetry";
const char* TOPIC_CMD_VALVE = "water/cmd/valve";
const char* TOPIC_CMD_SAMPLE = "water/cmd/sample";
const char* TOPIC_CMD_ALARM = "water/cmd/alarm";
const char* TOPIC_CMD_CALIB = "water/cmd/calibrate";

// Objects
WiFiClient espClient;
PubSubClient mqttClient(espClient);
SensorManager sensorManager;

// State Variables
bool valveStateOpen = true;
bool samplePreserved = false;
bool alarmActive = false;
unsigned long lastPublishMillis = 0;
const unsigned long PUBLISH_INTERVAL_MS = 1000;

// Forward Declarations
void setupWiFi();
void reconnectMQTT();
void handleMQTTMessage(char* topic, byte* payload, unsigned int length);
void handleEmergencyLeak();

void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n");
  Serial.println("====================================================================");
  Serial.println(" 🌊 SMART WATER GUARDIAN - ESP32 EDGE SENTINEL (HAL v2.1)");
  Serial.println("====================================================================");

  // Cấu hình chân Relay chấp hành
  pinMode(PIN_RELAY_VALVE, OUTPUT);
  pinMode(PIN_RELAY_SAMPLE, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Trạng thái ban đầu: Van Mở, Bình mẫu chờ, Còi tắt
  digitalWrite(PIN_RELAY_VALVE, HIGH);
  digitalWrite(PIN_RELAY_SAMPLE, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // Khởi tạo toàn bộ lớp trừu tượng phần cứng (HAL) và Driver
  sensorManager.init();

  // Khởi tạo mạng Wi-Fi và MQTT
  setupWiFi();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(handleMQTTMessage);
  mqttClient.setBufferSize(2048); // Đủ chứa JSON 11 cảm biến
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    mqttClient.loop();
  }

  // FAST SAFETY LOOP (Chạy ở tần số cao nhất có thể):
  // Phát hiện rò điện -> Ngắt van và hú còi ngay lập tức không cần chờ Server/MQTT
  if (sensorManager.isElectricalLeakDetected()) {
    handleEmergencyLeak();
  }

  // PERIODIC TELEMETRY LOOP (1Hz)
  unsigned long currentMillis = millis();
  if (currentMillis - lastPublishMillis >= PUBLISH_INTERVAL_MS) {
    lastPublishMillis = currentMillis;

    // Đọc tất cả cảm biến qua giao diện chuẩn hoá
    DynamicJsonDocument doc(2048);
    int rssi = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -99;
    sensorManager.readAllNormalized(doc, DEVICE_ID, rssi);

    // Bổ sung trạng thái chấp hành
    JsonObject actuatorsObj = doc.createNestedObject("actuators");
    actuatorsObj["valve_state"] = valveStateOpen ? "OPEN" : "CLOSED";
    actuatorsObj["sample_preserved"] = samplePreserved;
    actuatorsObj["alarm_active"] = alarmActive;

    // Xuất ra Serial và gửi qua MQTT
    char jsonBuffer[2048];
    serializeJson(doc, jsonBuffer, sizeof(jsonBuffer));

    if (mqttClient.connected()) {
      mqttClient.publish(TOPIC_TELEMETRY, jsonBuffer);
    }

    // In log gọn gàng ra cổng Serial
    Serial.printf("[TELEMETRY] pH=%.2f | EC=%.0f µS/cm | Turb=%.2f NTU | Temp=%.1f°C | Leak=%s\n",
      doc["readings"]["ph"]["value"].as<float>(),
      doc["readings"]["ec"]["value"].as<float>(),
      doc["readings"]["turbidity"]["value"].as<float>(),
      doc["readings"]["temperature"]["value"].as<float>(),
      sensorManager.isElectricalLeakDetected() ? "DANGER" : "SAFE"
    );
  }
}

void handleEmergencyLeak() {
  if (valveStateOpen) {
    valveStateOpen = false;
    digitalWrite(PIN_RELAY_VALVE, LOW); // Đóng van lập tức
    digitalWrite(PIN_BUZZER, HIGH);     // Kích hoạt còi hú
    alarmActive = true;
    Serial.println("\n🚨 [EMERGENCY HARDWARE INTERLOCK] ELECTRICAL LEAK DETECTED!");
    Serial.println("🚨 Valve CLOSED immediately by local edge controller.\n");

    if (mqttClient.connected()) {
      mqttClient.publish("water/alert/leak", "{\"alert\":\"ELECTRICAL_HAZARD_LOCAL_INTERLOCK\"}");
    }
  }
}

void setupWiFi() {
  Serial.printf("[WIFI] Connecting to SSID: %s...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 15) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! Local IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Could not connect. Running standalone safety loop.");
  }
}

void reconnectMQTT() {
  static unsigned long lastReconnectAttempt = 0;
  if (millis() - lastReconnectAttempt > 5000) {
    lastReconnectAttempt = millis();
    Serial.print("[MQTT] Connecting to broker...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println(" connected!");
      mqttClient.subscribe("water/cmd/#");
    } else {
      Serial.printf(" failed, rc=%d. Will retry in 5s\n", mqttClient.state());
    }
  }
}

void handleMQTTMessage(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String body = "";
  for (unsigned int i = 0; i < length; i++) body += (char)payload[i];
  body.trim();

  Serial.printf("[MQTT CMD] Topic: %s | Body: %s\n", topicStr.c_str(), body.c_str());

  if (topicStr == TOPIC_CMD_VALVE) {
    if (body.indexOf("CLOSE") >= 0) {
      valveStateOpen = false;
      digitalWrite(PIN_RELAY_VALVE, LOW);
      Serial.println("[ACTUATOR] Solenoid Valve CLOSED");
    } else if (body.indexOf("OPEN") >= 0) {
      valveStateOpen = true;
      digitalWrite(PIN_RELAY_VALVE, HIGH);
      Serial.println("[ACTUATOR] Solenoid Valve OPENED");
    }
  } else if (topicStr == TOPIC_CMD_SAMPLE) {
    if (body.indexOf("TRIGGER") >= 0) {
      digitalWrite(PIN_RELAY_SAMPLE, HIGH);
      delay(2000); // Mở van lấy mẫu trong 2 giây
      digitalWrite(PIN_RELAY_SAMPLE, LOW);
      samplePreserved = true;
      Serial.println("[ACTUATOR] Water sample collected and sealed into vial");
    } else if (body.indexOf("RESET") >= 0) {
      samplePreserved = false;
      Serial.println("[ACTUATOR] Sample vial slot reset for new event");
    }
  } else if (topicStr == TOPIC_CMD_ALARM) {
    if (body.indexOf("MUTE") >= 0 || body.indexOf("false") >= 0) {
      alarmActive = false;
      digitalWrite(PIN_BUZZER, LOW);
      Serial.println("[ACTUATOR] Buzzer alarm MUTED");
    } else {
      alarmActive = true;
      digitalWrite(PIN_BUZZER, HIGH);
      Serial.println("[ACTUATOR] Buzzer alarm ACTIVATED");
    }
  } else if (topicStr == TOPIC_CMD_CALIB) {
    // Hỗ trợ lệnh hiệu chuẩn từ xa qua MQTT:
    // "ph 7.00" hoặc "ph 4.01" hoặc "ec 1413"
    if (body.startsWith("ph 7")) {
      float v = analogRead(PIN_ADC_PH) * (3.3f / 4095.0f);
      sensorManager.getCalibration().calibratePHNeutral(v);
      Serial.printf("[CALIB] pH 7.00 calibrated! V7 = %.3f V\n", v);
    } else if (body.startsWith("ph 4")) {
      float v = analogRead(PIN_ADC_PH) * (3.3f / 4095.0f);
      sensorManager.getCalibration().calibratePHAcid(v);
      Serial.printf("[CALIB] pH 4.01 calibrated! V4 = %.3f V\n", v);
    } else if (body.startsWith("reset")) {
      sensorManager.getCalibration().factoryReset();
      Serial.println("[CALIB] Factory calibration reset completed!");
    }
  }
}
