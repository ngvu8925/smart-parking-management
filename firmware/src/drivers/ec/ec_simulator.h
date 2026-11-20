#pragma once
#include "../../include/sensor_interface.h"

class ECSimulatorDriver : public ISensorDriver {
private:
  float baselineEC;
  float currentEC;

public:
  explicit ECSimulatorDriver(float baseline = 350.0f)
    : baselineEC(baseline), currentEC(baseline) {}

  void init() override {
    currentEC = baselineEC;
  }

  float readRaw() override {
    return currentEC / 500.0f; // Giả lập điện áp tương ứng ~ 0.7V
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    float noise = ((float)(random(-15, 16)) / 10.0f);
    currentEC = max(0.0f, currentEC + noise);
    return currentEC;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float raw = readRaw();
    float val = calibrateAndCompensate(raw, waterTempC);

    SensorReading r;
    r.sensor = "ec";
    r.value = val;
    r.raw_value = raw;
    r.unit = "µS/cm";
    r.source = "simulator";
    r.status = STATUS_SIMULATED;
    r.error_code = 0;
    r.timestamp = millis();
    return r;
  }

  void setSimulatedValue(float targetEC) {
    currentEC = targetEC;
  }

  const char* getDriverName() const override { return "ec_simulator"; }
  const char* getSensorType() const override { return "ec"; }
  const char* getUnit() const override { return "µS/cm"; }
};
