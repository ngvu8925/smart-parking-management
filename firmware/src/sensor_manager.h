#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "../include/hardware_profile.h"
#include "../include/sensor_interface.h"
#include "../include/calibration_storage.h"

// Drivers
#include "drivers/ph/ph_simulator.h"
#include "drivers/ph/ph_analog.h"
#include "drivers/ph/ph_modbus.h"

#include "drivers/ec/ec_simulator.h"
#include "drivers/ec/ec_analog.h"
#include "drivers/ec/ec_modbus.h"

#include "drivers/turbidity/turbidity_simulator.h"
#include "drivers/turbidity/turbidity_analog.h"
#include "drivers/turbidity/turbidity_modbus.h"

#include "drivers/temperature/temp_simulator.h"
#include "drivers/temperature/temp_ds18b20.h"

#include "drivers/electrical_leak/leak_simulator.h"
#include "drivers/electrical_leak/leak_gpio.h"

#include "drivers/generic/generic_simulator.h"
#include "drivers/generic/generic_modbus.h"

#define MAX_SENSORS 12

class SensorManager {
private:
  ISensorDriver* drivers[MAX_SENSORS];
  size_t driverCount = 0;
  CalibrationStorage calibStorage;

public:
  CalibrationStorage& getCalibration() {
    return calibStorage;
  }

  void init() {
    calibStorage.begin();
    setupProfile();

    Serial.println("\n[HAL] ========================================================");
    Serial.printf("[HAL] Active Hardware Profile: %s\n", getProfileName());
    Serial.printf("[HAL] Initializing %d sensor drivers...\n", driverCount);

    for (size_t i = 0; i < driverCount; i++) {
      if (drivers[i]) {
        drivers[i]->init();
        Serial.printf("[HAL]  - Registered: [%-15s] -> Driver: %s\n",
          drivers[i]->getSensorType(), drivers[i]->getDriverName()
        );
      }
    }
    Serial.println("[HAL] ========================================================\n");
  }

  void addDriver(ISensorDriver* driver) {
    if (driverCount < MAX_SENSORS) {
      drivers[driverCount++] = driver;
    }
  }

  const char* getProfileName() const {
#if (ACTIVE_HARDWARE_PROFILE == PROFILE_DEMO_ANALOG_I2C)
    return "PROFILE_DEMO_ANALOG_I2C";
#elif (ACTIVE_HARDWARE_PROFILE == PROFILE_PRODUCTION_RS485_MODBUS)
    return "PROFILE_PRODUCTION_RS485_MODBUS";
#else
    return "PROFILE_SIMULATOR_TESTBED";
#endif
  }

  void setupProfile() {
    driverCount = 0;

#if (ACTIVE_HARDWARE_PROFILE == PROFILE_DEMO_ANALOG_I2C)
    // 1. Temperature (Dallas 1-Wire DS18B20)
    addDriver(new TempDS18B20Driver(PIN_ONEWIRE_TEMP, calibStorage));

    // 2. Core Analog Probes
    addDriver(new PHAnalogDriver(PIN_ADC_PH, calibStorage));
    addDriver(new ECAnalogDriver(PIN_ADC_EC, calibStorage));
    addDriver(new TurbidityAnalogDriver(PIN_ADC_TURBIDITY, calibStorage));

    // 3. Electrical Leak Detector (GPIO with Hardware Interlock)
    addDriver(new LeakGPIODriver(PIN_LEAK_SENSOR, true));

    // 4. Extended parameters (Simulated / Beta until hardware arrives)
    addDriver(new GenericSimulatorDriver("orp", "mV", 620.0f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("chlorine", "mg/L", 0.50f, STATUS_BETA));
    addDriver(new GenericSimulatorDriver("nh4", "mg/L", 0.03f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("no3", "mg/L", 4.00f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("uv254", "cm⁻¹", 0.02f, STATUS_SIMULATED));

#elif (ACTIVE_HARDWARE_PROFILE == PROFILE_PRODUCTION_RS485_MODBUS)
    // Cấu hình RS485 Hardware Serial 2
    Serial2.begin(RS485_BAUD_RATE, SERIAL_8N1, PIN_RS485_RX, PIN_RS485_TX);

    // 1. Temperature
    addDriver(new TempDS18B20Driver(PIN_ONEWIRE_TEMP, calibStorage));

    // 2. Modbus Probes
    addDriver(new PHModbusDriver(MODBUS_SLAVE_PH, 0x0001, &Serial2, PIN_RS485_DE_RE));
    addDriver(new ECModbusDriver(MODBUS_SLAVE_EC, 0x0001, &Serial2, PIN_RS485_DE_RE));
    addDriver(new TurbidityModbusDriver(MODBUS_SLAVE_TURBIDITY, 0x0001, &Serial2, PIN_RS485_DE_RE));

    // 3. Electrical Leak
    addDriver(new LeakGPIODriver(PIN_LEAK_SENSOR, true));

    // 4. Các probe công nghiệp mở rộng
    addDriver(new GenericModbusDriver("orp", "mV", 0x05, 0x0001, &Serial2, PIN_RS485_DE_RE, 1.0f, 620.0f));
    addDriver(new GenericModbusDriver("chlorine", "mg/L", 0x06, 0x0001, &Serial2, PIN_RS485_DE_RE, 0.01f, 0.50f));
    addDriver(new GenericSimulatorDriver("nh4", "mg/L", 0.03f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("no3", "mg/L", 4.00f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("uv254", "cm⁻¹", 0.02f, STATUS_SIMULATED));

#else // PROFILE_SIMULATOR_TESTBED
    addDriver(new TempSimulatorDriver(27.5f));
    addDriver(new PHSimulatorDriver(7.20f));
    addDriver(new ECSimulatorDriver(350.0f));
    addDriver(new TurbiditySimulatorDriver(0.40f));
    addDriver(new LeakSimulatorDriver());
    addDriver(new GenericSimulatorDriver("orp", "mV", 620.0f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("chlorine", "mg/L", 0.50f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("nh4", "mg/L", 0.03f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("no3", "mg/L", 4.00f, STATUS_SIMULATED));
    addDriver(new GenericSimulatorDriver("uv254", "cm⁻¹", 0.02f, STATUS_SIMULATED));
#endif
  }

  // Thu thập dữ liệu từ tất cả sensor và chuẩn hoá JSON
  void readAllNormalized(DynamicJsonDocument& doc, const char* deviceId, int rssi) {
    doc.clear();
    doc["device_id"] = deviceId;
    doc["wifi_rssi"] = rssi;
    doc["firmware_version"] = "2.1.0-hal-modular";
    doc["hardware_profile"] = getProfileName();

    JsonObject readingsObj = doc.createNestedObject("readings");

    // 1. Đọc nhiệt độ trước để các sensor khác dùng làm tham số bù nhiệt
    float currentWaterTemp = 27.5f;
    for (size_t i = 0; i < driverCount; i++) {
      if (drivers[i] && strcmp(drivers[i]->getSensorType(), "temperature") == 0) {
        SensorReading tRead = drivers[i]->read(25.0f);
        currentWaterTemp = tRead.value;
        JsonObject item = readingsObj.createNestedObject("temperature");
        item["sensor"] = tRead.sensor;
        item["value"] = round(tRead.value * 100.0f) / 100.0f;
        item["raw_value"] = round(tRead.raw_value * 100.0f) / 100.0f;
        item["unit"] = tRead.unit;
        item["source"] = tRead.source;
        item["status"] = sensorStatusToString(tRead.status);
        if (tRead.error_code > 0) item["error_code"] = tRead.error_code;
        break;
      }
    }

    // 2. Đọc các cảm biến còn lại với nhiệt độ nước vừa đo
    for (size_t i = 0; i < driverCount; i++) {
      if (!drivers[i] || strcmp(drivers[i]->getSensorType(), "temperature") == 0) continue;

      SensorReading r = drivers[i]->read(currentWaterTemp);
      JsonObject item = readingsObj.createNestedObject(r.sensor);
      item["sensor"] = r.sensor;
      item["value"] = round(r.value * 100.0f) / 100.0f;
      item["raw_value"] = round(r.raw_value * 1000.0f) / 1000.0f;
      item["unit"] = r.unit;
      item["source"] = r.source;
      item["status"] = sensorStatusToString(r.status);
      if (r.error_code > 0) item["error_code"] = r.error_code;

      // Tính kèm TDS từ EC nếu có
      if (strcmp(r.sensor, "ec") == 0) {
        JsonObject tdsItem = readingsObj.createNestedObject("tds");
        tdsItem["sensor"] = "tds";
        tdsItem["value"] = round((r.value * 0.5f) * 10.0f) / 10.0f;
        tdsItem["raw_value"] = r.raw_value;
        tdsItem["unit"] = "ppm";
        tdsItem["source"] = r.source;
        tdsItem["status"] = sensorStatusToString(r.status);
      }
    }
  }

  // Kiểm tra rò điện tức thì (Fast Safety Loop)
  bool isElectricalLeakDetected() {
    for (size_t i = 0; i < driverCount; i++) {
      if (drivers[i] && strcmp(drivers[i]->getSensorType(), "electrical_leak") == 0) {
        return drivers[i]->readRaw() > 0.5f;
      }
    }
    return false;
  }
};
