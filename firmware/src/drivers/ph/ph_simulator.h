#pragma once
#include "../../include/sensor_interface.h"

class PHSimulatorDriver : public ISensorDriver {
private:
  float baselinePH;
  float currentPH;

public:
  explicit PHSimulatorDriver(float baseline = 7.20f)
    : baselinePH(baseline), currentPH(baseline) {}

  void init() override {
    currentPH = baselinePH;
  }

  float readRaw() override {
    // Giả lập điện áp tương ứng: 2.5V ở pH 7.00
    return 2.50f - ((currentPH - 7.00f) / 3.50f);
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    // Simulator có thể thêm dao động vi mô tự nhiên
    float noise = ((float)(random(-10, 11)) / 1000.0f);
    currentPH = constrain(currentPH + noise, 0.0f, 14.0f);
    return currentPH;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float raw = readRaw();
    float val = calibrateAndCompensate(raw, waterTempC);
    val = applyFilter(val);

    SensorReading r;
    r.sensor = "ph";
    r.value = val;
    r.raw_value = raw;
    r.unit = "pH";
    r.source = "simulator";
    r.status = STATUS_SIMULATED;
    r.error_code = 0;
    r.timestamp = millis();
    return r;
  }

  void setSimulatedValue(float targetPH) {
    currentPH = targetPH;
  }

  const char* getDriverName() const override { return "ph_simulator"; }
  const char* getSensorType() const override { return "ph"; }
  const char* getUnit() const override { return "pH"; }
};
