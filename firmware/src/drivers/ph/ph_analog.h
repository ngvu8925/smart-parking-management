#pragma once
#include "../../include/sensor_interface.h"
#include "../../include/signal_filter.h"
#include "../../include/calibration_storage.h"

class PHAnalogDriver : public ISensorDriver {
private:
  int adcPin;
  CalibrationStorage& calib;
  MovingAverageFilter<8> maFilter;

public:
  PHAnalogDriver(int pin, CalibrationStorage& calibStorage)
    : adcPin(pin), calib(calibStorage) {}

  void init() override {
    pinMode(adcPin, INPUT);
    maFilter.reset();
  }

  float readRaw() override {
    // Oversampling 10 lần để khử nhiễu nhiệt và nhiễu lưới 50Hz của ESP32 ADC
    long sum = 0;
    for (int i = 0; i < 10; i++) {
      sum += analogRead(adcPin);
      delayMicroseconds(500);
    }
    float avgAdc = (float)sum / 10.0f;
    // Chuyển ADC 12-bit (0-4095) sang điện áp Volts (ESP32 3.3V reference)
    float voltage = avgAdc * (3.300f / 4095.0f);
    return voltage;
  }

  float calibrateAndCompensate(float rawVoltage, float waterTempC) override {
    SensorCalibrationData& c = calib.get();

    // 1. Kiểm tra giới hạn hợp lệ của điện áp đầu dò pH
    if (rawVoltage < 0.05f || rawVoltage > 3.25f) {
      return -1.0f; // Báo lỗi đứt dây hoặc tuột probe
    }

    // 2. Bù trừ nhiệt độ theo phương trình Nernst:
    // Độ dốc Nernst tỷ lệ thuận với nhiệt độ Kelvin: S(T) = S(25°C) * (T + 273.15) / 298.15
    float kelvinRatio = (waterTempC + 273.15f) / 298.15f;
    if (kelvinRatio < 0.8f || kelvinRatio > 1.3f) kelvinRatio = 1.0f; // Bảo vệ nếu sensor nhiệt lỗi

    float compensatedSlope = c.ph_slope / kelvinRatio;

    // 3. Quy đổi điện thế sang pH dựa trên điểm đệm chuẩn pH 7.00
    // pH = 7.00 + (Voltage - V7) * CompensatedSlope
    float ph = 7.00f + ((rawVoltage - c.ph_v7) * compensatedSlope);

    return constrain(ph, 0.0f, 14.0f);
  }

  float applyFilter(float calibratedValue) override {
    return maFilter.filter(calibratedValue);
  }

  SensorReading read(float waterTempC) override {
    float rawVoltage = readRaw();
    float calibrated = calibrateAndCompensate(rawVoltage, waterTempC);

    SensorReading r;
    r.sensor = "ph";
    r.raw_value = rawVoltage;
    r.unit = "pH";
    r.source = "hardware";
    r.timestamp = millis();

    if (calibrated < 0.0f) {
      r.value = 7.0f;
      r.status = STATUS_FAULT;
      r.error_code = 1; // Disconnected or probe faulty
    } else {
      r.value = applyFilter(calibrated);
      // Nếu pH đo được chệch xa chuẩn sau khi cắm mà điện áp bất thường -> cần hiệu chuẩn
      if (abs(rawVoltage - calib.get().ph_v7) > 1.8f) {
        r.status = STATUS_CALIBRATION_REQUIRED;
        r.error_code = 2;
      } else {
        r.status = STATUS_LIVE;
        r.error_code = 0;
      }
    }

    return r;
  }

  const char* getDriverName() const override { return "ph_analog_generic"; }
  const char* getSensorType() const override { return "ph"; }
  const char* getUnit() const override { return "pH"; }
};
