/*
 * Smart Water Guardian - ESP32 Firmware
 * 
 * Hardware:
 *  - ESP32 DevKit V1 (Wi-Fi 2.4GHz)
 *  - Analog pH Sensor (GPIO 34)
 *  - Analog TDS / EC Sensor (GPIO 35)
 *  - Analog Turbidity Sensor (GPIO 32)
 *  - DS18B20 Digital Temperature Sensor (GPIO 4)
 *  - Optocoupled Electrical Leakage Sensor (GPIO 14)
 *  - Relay 1: Solenoid Water Valve (GPIO 26)
 *  - Relay 2: Solenoid Sample Preservation Vial (GPIO 27)
 *  - Buzzer Siren (GPIO 25)
 * 
 * MQTT Topics:
 *  - Publish Telemetry: "water/telemetry"
 *  - Subscribe Valve Cmd: "water/cmd/valve"
 *  - Subscribe Sample Cmd: "water/cmd/sample"
 *  - Subscribe Alarm Cmd: "water/cmd/alarm"
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>

// Wi-Fi & MQTT Configuration
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
const char* MQTT_SERVER = "192.168.1.100"; // IP address of Smart Water Guardian Server
const int   MQTT_PORT = 1883;
const char* DEVICE_ID = "esp32-water-guardian-01";

// Pin Definitions
#define PIN_PH               34
#define PIN_TDS              35
#define PIN_TURBIDITY        32
#define PIN_ONEWIRE_TEMP     4
#define PIN_LEAK_SENSOR      14
#define PIN_RELAY_VALVE      26
#define PIN_RELAY_SAMPLE     27
#define PIN_BUZZER           25

// Sensors & Communication Objects
OneWire oneWire(PIN_ONEWIRE_TEMP);
DallasTemperature tempSensor(&oneWire);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// Actuator States
bool valveOpen = true;
bool samplePreserved = false;
bool alarmActive = false;
unsigned long lastTelemetryTime = 0;
const unsigned long TELEMETRY_INTERVAL_MS = 1000;

// Forward Declarations
void setupWiFi();
void reconnectMQTT();
void mqttCallback(char* topic, byte* payload, unsigned int length);
float readPH();
float readTDS(float temperature);
float readTurbidity();
float readTemperature();
bool  readElectricalLeak();
void  publishTelemetry();

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n[SWG] Smart Water Guardian ESP32 Node Booting...");

  // Actuator Pin Modes
  pinMode(PIN_RELAY_VALVE, OUTPUT);
  pinMode(PIN_RELAY_SAMPLE, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);
  pinMode(PIN_LEAK_SENSOR, INPUT_PULLDOWN);

  // Initial State: Valve OPEN (Relay active LOW or HIGH depending on module)
  digitalWrite(PIN_RELAY_VALVE, HIGH);
  digitalWrite(PIN_RELAY_SAMPLE, LOW);
  digitalWrite(PIN_BUZZER, LOW);

  // Init Temperature Sensor
  tempSensor.begin();

  // Setup Wi-Fi & MQTT
  setupWiFi();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setupWiFi();
  }
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  // Fast check: Electrical Leakage Instant Shutoff
  if (readElectricalLeak()) {
    if (valveOpen) {
      digitalWrite(PIN_RELAY_VALVE, LOW); // Immediate Close
      digitalWrite(PIN_BUZZER, HIGH);     // Immediate Siren
      valveOpen = false;
      alarmActive = true;
      Serial.println("[EMERGENCY] LOCAL ELECTRICAL LEAK DETECTED! Closed valve immediately!");
    }
  }

  // Periodic Telemetry Publishing
  unsigned long now = millis();
  if (now - lastTelemetryTime >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTime = now;
    publishTelemetry();
  }
}

void setupWiFi() {
  Serial.printf("[WIFI] Connecting to %s...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Connection failed. Running in offline fallback mode.");
  }
}

void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Attempting connection to broker...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println("connected!");
      mqttClient.subscribe("water/cmd/#");
    } else {
      Serial.printf("failed, rc=%d. Retrying in 3 seconds...\n", mqttClient.state());
      delay(3000);
      break;
    }
  }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String topicStr = String(topic);
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  Serial.printf("[MQTT] Message arrived [%s]: %s\n", topicStr.c_str(), message.c_str());

  if (topicStr == "water/cmd/valve") {
    if (message.indexOf("CLOSE") >= 0) {
      digitalWrite(PIN_RELAY_VALVE, LOW);
      valveOpen = false;
      Serial.println("[ACTUATOR] Valve CLOSED by MQTT command");
    } else if (message.indexOf("OPEN") >= 0) {
      digitalWrite(PIN_RELAY_VALVE, HIGH);
      valveOpen = true;
      Serial.println("[ACTUATOR] Valve OPENED by MQTT command");
    }
  } else if (topicStr == "water/cmd/sample") {
    digitalWrite(PIN_RELAY_SAMPLE, HIGH);
    delay(2000); // Trigger solenoid vial filler for 2 seconds
    digitalWrite(PIN_RELAY_SAMPLE, LOW);
    samplePreserved = true;
    Serial.println("[ACTUATOR] Water sample locked into vial!");
  } else if (topicStr == "water/cmd/alarm") {
    if (message.indexOf("true") >= 0 || message.indexOf("MUTE") >= 0) {
      digitalWrite(PIN_BUZZER, LOW);
      alarmActive = false;
    } else {
      digitalWrite(PIN_BUZZER, HIGH);
      alarmActive = true;
    }
  }
}

// Sensor Readings with Analog ADC Calibration
float readPH() {
  int raw = analogRead(PIN_PH);
  float voltage = raw * (3.3 / 4095.0);
  // Standard pH-4502C calibration curve: pH = 7.0 + ((2.5 - voltage) * 3.5)
  float ph = 7.0 + ((2.5 - voltage) * 3.5);
  return constrain(ph, 0.0, 14.0);
}

float readTemperature() {
  tempSensor.requestTemperatures();
  float t = tempSensor.getTempCByIndex(0);
  if (t < -50.0 || t > 100.0) return 27.5; // Fallback to nominal if unplugged
  return t;
}

float readTDS(float temperature) {
  int raw = analogRead(PIN_TDS);
  float voltage = raw * (3.3 / 4095.0);
  // Temperature compensation formula
  float compensationCoeff = 1.0 + 0.02 * (temperature - 25.0);
  float compVoltage = voltage / compensationCoeff;
  float tds = (133.42 * compVoltage * compVoltage * compVoltage - 255.86 * compVoltage * compVoltage + 857.39 * compVoltage) * 0.5;
  return max(0.0f, tds);
}

float readTurbidity() {
  int raw = analogRead(PIN_TURBIDITY);
  float voltage = raw * (3.3 / 4095.0);
  // Standard turbidity sensor equation (e.g. DFRobot SEN0189)
  float ntu = -1120.4 * voltage * voltage + 5742.3 * voltage - 4352.9;
  return constrain(ntu, 0.0, 3000.0);
}

bool readElectricalLeak() {
  return digitalRead(PIN_LEAK_SENSOR) == HIGH;
}

void publishTelemetry() {
  float temp = readTemperature();
  float ph = readPH();
  float tds = readTDS(temp);
  float ec = tds * 2.0; // Approximation: EC (uS/cm) ~ 2 * TDS (ppm)
  float turbidity = readTurbidity();
  bool leak = readElectricalLeak();

  // Construct JSON payload matching the unified backend schema
  StaticJsonDocument<1536> doc;
  doc["device_id"] = DEVICE_ID;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["firmware_version"] = "1.2.0-esp32-live";

  JsonObject readings = doc.createNestedObject("readings");

  // Real Hardware Sensors (LIVE)
  JsonObject r_ph = readings.createNestedObject("ph");
  r_ph["sensor"] = "ph";
  r_ph["value"] = round(ph * 100.0) / 100.0;
  r_ph["unit"] = "pH";
  r_ph["source"] = "hardware";
  r_ph["status"] = "LIVE";

  JsonObject r_ec = readings.createNestedObject("ec");
  r_ec["sensor"] = "ec";
  r_ec["value"] = round(ec * 10.0) / 10.0;
  r_ec["unit"] = "uS/cm";
  r_ec["source"] = "hardware";
  r_ec["status"] = "LIVE";

  JsonObject r_tds = readings.createNestedObject("tds");
  r_tds["sensor"] = "tds";
  r_tds["value"] = round(tds * 10.0) / 10.0;
  r_tds["unit"] = "ppm";
  r_tds["source"] = "hardware";
  r_tds["status"] = "LIVE";

  JsonObject r_turb = readings.createNestedObject("turbidity");
  r_turb["sensor"] = "turbidity";
  r_turb["value"] = round(turbidity * 100.0) / 100.0;
  r_turb["unit"] = "NTU";
  r_turb["source"] = "hardware";
  r_turb["status"] = "LIVE";

  JsonObject r_temp = readings.createNestedObject("temperature");
  r_temp["sensor"] = "temperature";
  r_temp["value"] = round(temp * 10.0) / 10.0;
  r_temp["unit"] = "degC";
  r_temp["source"] = "hardware";
  r_temp["status"] = "LIVE";

  JsonObject r_leak = readings.createNestedObject("electrical_leak");
  r_leak["sensor"] = "electrical_leak";
  r_leak["value"] = leak ? 1.0 : 0.0;
  r_leak["unit"] = "state";
  r_leak["source"] = "hardware";
  r_leak["status"] = "LIVE";

  char jsonBuffer[1536];
  serializeJson(doc, jsonBuffer);
  mqttClient.publish("water/telemetry", jsonBuffer);
}
