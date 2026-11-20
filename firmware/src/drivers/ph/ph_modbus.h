#pragma once
#include "../../include/sensor_interface.h"

/**
 * Driver đọc cảm biến pH công nghiệp qua chuẩn RS485 Modbus RTU.
 * Hỗ trợ thanh ghi Holding Register đọc giá trị IEEE-754 32-bit Float hoặc 16-bit Int (x0.01).
 */
class PHModbusDriver : public ISensorDriver {
private:
  uint8_t slaveAddress;
  uint16_t registerAddress;
  HardwareSerial* modbusSerial;
  int deRePin;
  float lastKnownGoodValue = 7.0f;
  unsigned long lastSuccessTime = 0;

public:
  PHModbusDriver(uint8_t slaveId, uint16_t regAddr, HardwareSerial* serialPort, int dirPin = -1)
    : slaveAddress(slaveId), registerAddress(regAddr), modbusSerial(serialPort), deRePin(dirPin) {}

  void init() override {
    if (deRePin >= 0) {
      pinMode(deRePin, OUTPUT);
      digitalWrite(deRePin, LOW); // Mặc định ở chế độ Nhận (Receive Mode)
    }
    lastSuccessTime = millis();
  }

  // Tính CRC16 chuẩn Modbus (Polynomial 0xA001)
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

    // Chuẩn bị khung truyền Modbus RTU Read Holding Registers (Function Code 0x03)
    uint8_t frame[8];
    frame[0] = slaveAddress;
    frame[1] = 0x03; // Read Holding Registers
    frame[2] = (registerAddress >> 8) & 0xFF;
    frame[3] = registerAddress & 0xFF;
    frame[4] = 0x00; // Số lượng thanh ghi: 2 thanh ghi (32-bit Float)
    frame[5] = 0x02;

    uint16_t crc = calculateCRC(frame, 6);
    frame[6] = crc & 0xFF;
    frame[7] = (crc >> 8) & 0xFF;

    // Xóa buffer rác cũ
    while (modbusSerial->available()) modbusSerial->read();

    // Chuyển sang chế độ Phát (Transmit Mode)
    if (deRePin >= 0) digitalWrite(deRePin, HIGH);
    delayMicroseconds(50);
    modbusSerial->write(frame, 8);
    modbusSerial->flush();
    if (deRePin >= 0) digitalWrite(deRePin, LOW); // Trả lại chế độ Nhận

    // Chờ phản hồi trong 250ms
    unsigned long startWait = millis();
    while (modbusSerial->available() < 9 && (millis() - startWait < 250)) {
      delay(5);
    }

    if (modbusSerial->available() < 9) {
      return -999.0f; // Báo lỗi Timeout
    }

    uint8_t response[9];
    modbusSerial->readBytes(response, 9);

    // Kiểm tra CRC của gói tin nhận về
    uint16_t rxCrc = response[7] | (response[8] << 8);
    if (calculateCRC(response, 7) != rxCrc) {
      return -998.0f; // Báo lỗi sai CRC (Nhiễu đường truyền RS485)
    }

    // Parse giá trị 32-bit IEEE 754 Float từ 4 byte dữ liệu
    union {
      uint32_t i;
      float f;
    } data;
    // Thứ tự byte Big-Endian tiêu chuẩn Modbus
    data.i = ((uint32_t)response[3] << 24) |
             ((uint32_t)response[4] << 16) |
             ((uint32_t)response[5] << 8)  |
             ((uint32_t)response[6]);

    lastSuccessTime = millis();
    lastKnownGoodValue = data.f;
    return data.f;
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    // Sensor công nghiệp RS485 đã tự bù nhiệt độ bên trong probe thông qua RTD PT100/PT1000 tích hợp
    return raw;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue; // Cảm biến công nghiệp đã có bộ lọc số nội vi
  }

  SensorReading read(float waterTempC) override {
    float raw = readRaw();

    SensorReading r;
    r.sensor = "ph";
    r.raw_value = raw;
    r.unit = "pH";
    r.source = "hardware";
    r.timestamp = millis();

    if (raw == -999.0f) { // Timeout
      r.value = lastKnownGoodValue;
      r.status = STATUS_OFFLINE;
      r.error_code = 101; // Modbus Timeout
    } else if (raw == -998.0f) { // CRC Error
      r.value = lastKnownGoodValue;
      r.status = STATUS_FAULT;
      r.error_code = 102; // Modbus CRC Fail
    } else if (raw < 0.0f || raw > 14.0f) {
      r.value = raw;
      r.status = STATUS_CALIBRATION_REQUIRED;
      r.error_code = 103; // Out of measurement range
    } else {
      r.value = raw;
      r.status = STATUS_LIVE;
      r.error_code = 0;
    }

    return r;
  }

  const char* getDriverName() const override { return "ph_modbus_rtu"; }
  const char* getSensorType() const override { return "ph"; }
  const char* getUnit() const override { return "pH"; }
};
