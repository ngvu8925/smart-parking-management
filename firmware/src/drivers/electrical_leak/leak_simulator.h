#pragma once
#include "../../include/sensor_interface.h"

class LeakSimulatorDriver : public ISensorDriver {
private:
  bool simulatedLeak = false;

public:
  void init() override {
    simulatedLeak = false;
  }

  void triggerLeak(bool leak) {
    simulatedLeak = leak;
  }

  float readRaw() override {
    return simulatedLeak ? 1.0f : 0.0f;
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
    r.sensor = "electrical_leak";
    r.value = raw;
    r.raw_value = raw;
    r.unit = "state";
    r.source = "simulator";
    r.status = STATUS_SIMULATED;
    r.error_code = 0;
    r.timestamp = millis();
    return r;
  }

  const char* getDriverName() const override { return "leak_simulator"; }
  const char* getSensorType() const override { return "electrical_leak"; }
  const char* getUnit() const override { return "state"; }
};
