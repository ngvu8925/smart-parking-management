#pragma once
#include "../../include/sensor_interface.h"

class GenericSimulatorDriver : public ISensorDriver {
private:
  const char* sensorId;
  const char* unitStr;
  float baseline;
  float currentValue;
  SensorStatus designatedStatus;

public:
  GenericSimulatorDriver(const char* id, const char* unit, float baseVal, SensorStatus st = STATUS_SIMULATED)
    : sensorId(id), unitStr(unit), baseline(baseVal), currentValue(baseVal), designatedStatus(st) {}

  void init() override {
    currentValue = baseline;
  }

  float readRaw() override {
    return currentValue;
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    float noise = ((float)(random(-10, 11)) / 1000.0f) * baseline;
    currentValue = max(0.0f, currentValue + noise);
    return currentValue;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float val = calibrateAndCompensate(currentValue, waterTempC);

    SensorReading r;
    r.sensor = sensorId;
    r.value = val;
    r.raw_value = val;
    r.unit = unitStr;
    r.source = "simulator";
    r.status = designatedStatus;
    r.error_code = 0;
    r.timestamp = millis();
    return r;
  }

  void setSimulatedValue(float targetVal) {
    currentValue = targetVal;
  }

  const char* getDriverName() const override { return "generic_simulator"; }
  const char* getSensorType() const override { return sensorId; }
  const char* getUnit() const override { return unitStr; }
};
