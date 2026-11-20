#pragma once
#include "../../include/sensor_interface.h"
#include "../../include/signal_filter.h"
#include "../../include/calibration_storage.h"

class ECAnalogDriver : public ISensorDriver {
private:
  int adcPin;
  CalibrationStorage& calib;
  MovingAverageFilter<8> maFilter;

public:
  ECAnalogDriver(int pin, CalibrationStorage& calibStorage)
    : adcPin(pin), calib(calibStorage) {}

  void init() override {
    pinMode(adcPin, INPUT);
    maFilter.reset();
  }

  float readRaw() override {
    long sum = 0;
    for (int i = 0; i < 10; i++) {
      sum += analogRead(adcPin);
      delayMicroseconds(500);
    }
    float avgAdc = (float)sum / 10.0f;
    return avgAdc * (3.300f / 4095.0f);
  }

  float calibrateAndCompensate(float rawVoltage, float waterTempC) override {
    SensorCalibrationData& c = calib.get();

    if (rawVoltage < 0.01f) {
      return 0.0f; // Nước siêu tinh khiết hoặc chưa cắm điện cực
    }

    // 1. Hệ số bù trừ nhiệt độ chuẩn hoá về 25°C:
    // EC_25 = EC_T / (1 + alpha * (T - 25))
    // alpha ~ 0.0191 (1.91%/°C)
    float tempCoeff = 1.0f + c.ec_temp_coeff * (waterTempC - 25.0f);
    if (tempCoeff < 0.5f) tempCoeff = 0.5f;

    float compVoltage = rawVoltage / tempCoeff;

    // 2. Chuyển đổi điện thế sang EC (uS/cm) dựa trên đặc tuyến DFRobot Gravity TDS/EC
    // TDS (ppm) = (133.42*V^3 - 255.86*V^2 + 857.39*V) * 0.5
    // EC (uS/cm) ~ TDS * 2.0 (tương đương hệ số chuyển đổi NaCl/KCL)
    float tds = (133.42f * compVoltage * compVoltage * compVoltage
               - 255.86f * compVoltage * compVoltage
               + 857.39f * compVoltage) * 0.5f;

    float uncalibratedEC = tds * 2.0f;

    // 3. Nhân hệ số hiệu chuẩn Cell Constant K
    float calibratedEC = uncalibratedEC * c.ec_k_value;

    return max(0.0f, calibratedEC);
  }

  float applyFilter(float calibratedValue) override {
    return maFilter.filter(calibratedValue);
  }

  SensorReading read(float waterTempC) override {
    float rawVoltage = readRaw();
    float calibrated = calibrateAndCompensate(rawVoltage, waterTempC);

    SensorReading r;
    r.sensor = "ec";
    r.raw_value = rawVoltage;
    r.unit = "µS/cm";
    r.source = "hardware";
    r.timestamp = millis();

    if (rawVoltage > 3.25f) {
      r.value = 5000.0f;
      r.status = STATUS_FAULT; // Bị đoản mạch điện cực
      r.error_code = 1;
    } else {
      r.value = applyFilter(calibrated);
      r.status = STATUS_LIVE;
      r.error_code = 0;
    }

    return r;
  }

  const char* getDriverName() const override { return "ec_analog_generic"; }
  const char* getSensorType() const override { return "ec"; }
  const char* getUnit() const override { return "µS/cm"; }
};
