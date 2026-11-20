#pragma once
#include "../../include/sensor_interface.h"

class LeakGPIODriver : public ISensorDriver {
private:
  int gpioPin;
  bool activeHigh;

public:
  LeakGPIODriver(int pin, bool highTrigger = true)
    : gpioPin(pin), activeHigh(highTrigger) {}

  void init() override {
    pinMode(gpioPin, activeHigh ? INPUT_PULLDOWN : INPUT_PULLUP);
  }

  float readRaw() override {
    // Đọc trạng thái chân và xác nhận chống nhiễu thoáng qua (Debounce 3ms)
    int state1 = digitalRead(gpioPin);
    if ((activeHigh && state1 == HIGH) || (!activeHigh && state1 == LOW)) {
      delayMicroseconds(3000);
      int state2 = digitalRead(gpioPin);
      if (state1 == state2) {
        return 1.0f; // Xác nhận rò điện
      }
    }
    return 0.0f; // An toàn
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
    r.source = "hardware";
    r.status = STATUS_LIVE;
    r.error_code = (raw > 0.5f) ? 999 : 0; // 999 = ELECTRICAL HAZARD
    r.timestamp = millis();

    return r;
  }

  const char* getDriverName() const override { return "leak_gpio_optocoupler"; }
  const char* getSensorType() const override { return "electrical_leak"; }
  const char* getUnit() const override { return "state"; }
};
