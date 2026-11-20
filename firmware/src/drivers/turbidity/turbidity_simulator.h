#pragma once
#include "../../include/sensor_interface.h"

class TurbiditySimulatorDriver : public ISensorDriver {
private:
  float baselineTurb;
  float currentTurb;

public:
  explicit TurbiditySimulatorDriver(float baseline = 0.40f)
    : baselineTurb(baseline), currentTurb(baseline) {}

  void init() override {
    currentTurb = baselineTurb;
  }

  float readRaw() override {
    return 2.80f - (currentTurb * 0.05f);
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    float noise = ((float)(random(-5, 6)) / 100.0f);
    currentTurb = max(0.0f, currentTurb + noise);
    return currentTurb;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float raw = readRaw();
    float val = calibrateAndCompensate(raw, waterTempC);

    SensorReading r;
    r.sensor = "turbidity";
    r.value = val;
    r.raw_value = raw;
    r.unit = "NTU";
    r.source = "simulator";
    r.status = STATUS_SIMULATED;
    r.error_code = 0;
    r.timestamp = millis();
    return r;
  }

  void setSimulatedValue(float targetTurb) {
    currentTurb = targetTurb;
  }

  const char* getDriverName() const override { return "turbidity_simulator"; }
  const char* getSensorType() const override { return "turbidity"; }
  const char* getUnit() const override { return "NTU"; }
};
