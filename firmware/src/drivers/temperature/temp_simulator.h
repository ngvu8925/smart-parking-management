#pragma once
#include "../../include/sensor_interface.h"

class TempSimulatorDriver : public ISensorDriver {
private:
  float currentTemp;

public:
  explicit TempSimulatorDriver(float baseline = 27.5f) : currentTemp(baseline) {}

  void init() override {}

  float readRaw() override {
    return currentTemp;
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    float noise = ((float)(random(-10, 11)) / 100.0f);
    currentTemp = constrain(currentTemp + noise, 0.0f, 50.0f);
    return currentTemp;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float val = calibrateAndCompensate(currentTemp, waterTempC);

    SensorReading r;
    r.sensor = "temperature";
    r.value = val;
    r.raw_value = val;
    r.unit = "°C";
    r.source = "simulator";
    r.status = STATUS_SIMULATED;
    r.error_code = 0;
    r.timestamp = millis();
    return r;
  }

  const char* getDriverName() const override { return "temperature_simulator"; }
  const char* getSensorType() const override { return "temperature"; }
  const char* getUnit() const override { return "°C"; }
};
