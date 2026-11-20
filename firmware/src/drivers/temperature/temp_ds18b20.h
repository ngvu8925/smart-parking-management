#pragma once
#include "../../include/sensor_interface.h"
#include "../../include/calibration_storage.h"
#include <OneWire.h>
#include <DallasTemperature.h>

class TempDS18B20Driver : public ISensorDriver {
private:
  int oneWirePin;
  OneWire oneWire;
  DallasTemperature sensor;
  CalibrationStorage& calib;
  float lastKnownGoodTemp = 27.5f;

public:
  TempDS18B20Driver(int pin, CalibrationStorage& calibStorage)
    : oneWirePin(pin), oneWire(pin), sensor(&oneWire), calib(calibStorage) {}

  void init() override {
    sensor.begin();
    sensor.setWaitForConversion(false); // Chế độ bất đồng bộ không gây nghẽn CPU
  }

  float readRaw() override {
    sensor.requestTemperatures();
    float t = sensor.getTempCByIndex(0);
    return t;
  }

  float calibrateAndCompensate(float raw, float waterTempC) override {
    if (raw < -50.0f || raw > 125.0f || raw == 85.0f) {
      // 85.0°C là giá trị power-on reset đặc trưng của DS18B20 khi chưa convert xong
      return -999.0f;
    }
    return raw + calib.get().temp_offset;
  }

  float applyFilter(float calibratedValue) override {
    return calibratedValue;
  }

  SensorReading read(float waterTempC) override {
    float raw = readRaw();
    float cal = calibrateAndCompensate(raw, waterTempC);

    SensorReading r;
    r.sensor = "temperature";
    r.raw_value = raw;
    r.unit = "°C";
    r.source = "hardware";
    r.timestamp = millis();

    if (cal == -999.0f) {
      r.value = lastKnownGoodTemp;
      r.status = STATUS_OFFLINE;
      r.error_code = 1; // 1-Wire bus disconnect
    } else {
      lastKnownGoodTemp = cal;
      r.value = cal;
      r.status = STATUS_LIVE;
      r.error_code = 0;
    }

    return r;
  }

  const char* getDriverName() const override { return "temperature_ds18b20"; }
  const char* getSensorType() const override { return "temperature"; }
  const char* getUnit() const override { return "°C"; }
};
