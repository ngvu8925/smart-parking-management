#pragma once
#include "../../include/sensor_interface.h"

/**
 * Generic Modbus RTU Driver cho các cảm biến công nghiệp mở rộng
 * (vd: Cảm biến Đo Clo dư Modbus, Cảm biến ORP Modbus, v.v.)
 */
class GenericModbusDriver : public ISensorDriver {
private:
  const char* sensorId;
  const char* unitStr;
  uint8_t slaveAddress;
  uint16_t registerAddress;
  HardwareSerial* modbusSerial;
  int deRePin;
  float multiplier;
  float lastKnownGoodValue;

public:
  GenericModbusDriver(
    const char* id,
    const char* unit,
    uint8_t slaveId,
    uint16_t regAddr,
    HardwareSerial* serialPort,
    int dirPin = -1,
    float mult = 1.0f,
    float fallback = 0.0f
  ) : sensorId(id), unitStr(unit), slaveAddress(slaveId), registerAddress(regAddr),
      modbusSerial(serialPort), deRePin(dirPin), multiplier(mult), lastKnownGoodValue(fallback) {}

  void init() override {
    if (deRePin >= 0) {
      pinMode(deRePin, OUTPUT);
      digitalWrite(deRePin, LOW);
    }
  }

  static uint16_t calculateCRC(const uint8_t* buffer, size_t length) {
    uint16_t crc = 0xFFFF;
    for (size_t pos = 0; pos < length; pos++) {
      crc ^= (uint16_t)buffer[pos];
      for (int i = 8; i != 0; i--) {
        if ((crc & 0x0001) != 0) {
          crc >>= 1;
          crc ^= 0xA001;
        } else {
          crc >>= 1;
        }
      }
    }
    return crc;
  }

  float readRaw() override {
    if (!modbusSerial) return -1.0f;

    uint8_t frame[8];
    frame[0] = slaveAddress;
    frame[1] = 0x03;
    frame[2] = (registerAddress >> 8) & 0xFF;
    frame[3] = registerAddress & 0xFF;
    frame[4] = 0x00;
    frame[5] = 0x02;

    uint16_t crc = calculateCRC(frame, 6);
    frame[6] = crc & 0xFF;
    frame[7] = (crc >> 8) & 0xFF;

    while (modbusSerial->available()) modbusSerial->read();

    if (deRePin >= 0) digitalWrite(deRePin, HIGH);
    delayMicroseconds(50);
    modbusSerial->write(frame, 8);
    modbusSerial->flush();
    if (deRePin >= 0) digitalWrite(deRePin, LOW);

    unsigned long startWait = millis();
    while (modbusSerial->available() < 9 && (millis() - startWait < 250)) {
      delay(5);
    }

    if (modbusSerial->available() < 9) return -999.0f;

    uint8_t response[9];
    modbusSerial->readBytes(response, 9);

    uint16_t rxCrc = response[7] | (response[8] << 8);
    if (calculateCRC(response, 7) != rxCrc) return -998.0f;

    union {
      uint32_t i;
      float f;
    } data;
    data.i = ((uint32_t)response[3] << 24) |
             ((uint32_t)response[4] << 16) |
             ((uint32_t)response[5] << 8)  |
             ((uint32_t)response[6]);

    lastKnownGoodValue = data.f * multiplier;
    return lastKnownGoodValue;
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    return raw;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float raw = readRaw();

    SensorReading r;
    r.sensor = sensorId;
    r.raw_value = raw;
    r.unit = unitStr;
    r.source = "hardware";
    r.timestamp = millis();

    if (raw == -999.0f) {
      r.value = lastKnownGoodValue;
      r.status = STATUS_OFFLINE;
      r.error_code = 101;
    } else if (raw == -998.0f) {
      r.value = lastKnownGoodValue;
      r.status = STATUS_FAULT;
      r.error_code = 102;
    } else {
      r.value = raw;
      r.status = STATUS_LIVE;
      r.error_code = 0;
    }

    return r;
  }

  const char* getDriverName() const override { return "generic_modbus_rtu"; }
  const char* getSensorType() const override { return sensorId; }
  const char* getUnit() const override { return unitStr; }
};
