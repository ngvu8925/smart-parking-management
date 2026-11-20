#pragma once
#include "../../include/sensor_interface.h"
#include "../../include/signal_filter.h"
#include "../../include/calibration_storage.h"

class TurbidityAnalogDriver : public ISensorDriver {
private:
  int adcPin;
  CalibrationStorage& calib;
  MedianFilter<5> medianFilter; // Bộ lọc trung vị khử bọt khí
  MovingAverageFilter<4> maFilter;

public:
  TurbidityAnalogDriver(int pin, CalibrationStorage& calibStorage)
    : adcPin(pin), calib(calibStorage) {}

  void init() override {
    pinMode(adcPin, INPUT);
    medianFilter.reset();
    maFilter.reset();
  }

  float readRaw() override {
    // Đọc ADC và chuyển sang điện áp
    int raw = analogRead(adcPin);
    float voltage = (float)raw * (3.300f / 4095.0f);
    
    // Đưa qua bộ lọc trung vị để loại bỏ bọt khí trước khi tính toán
    float filteredVoltage = medianFilter.filter(voltage);
    return filteredVoltage;
  }

  float calibrateAndCompensate(float rawVoltage, float waterTempC) override {
    // Quy đổi điện thế sang NTU
    // Cảm biến quang: Nước càng đục -> ánh sáng qua càng ít -> điện áp càng thấp
    // Nước trong tuyệt đối: Điện thế xấp xỉ turb_clear_voltage (~2.8V trên ADC 3.3V)
    SensorCalibrationData& c = calib.get();

    if (rawVoltage >= c.turb_clear_voltage - 0.05f) {
      return 0.10f; // Nước siêu trong
    }

    // Đường cong chuẩn hóa chuyển đổi điện thế ra NTU:
    // deltaV = V_clear - V_measured
    float deltaV = max(0.0f, c.turb_clear_voltage - rawVoltage);
    
    // Mô hình phi tuyến thực nghiệm cho flow-cell quang học
    float ntu = (deltaV * deltaV * 450.0f) + (deltaV * 80.0f);

    return constrain(ntu, 0.0f, 3000.0f);
  }

  float applyFilter(float calibratedValue) override {
    return maFilter.filter(calibratedValue);
  }

  SensorReading read(float waterTempC) override {
    float rawVoltage = readRaw();
    float calibrated = calibrateAndCompensate(rawVoltage, waterTempC);

    SensorReading r;
    r.sensor = "turbidity";
    r.raw_value = rawVoltage;
    r.unit = "NTU";
    r.source = "hardware";
    r.timestamp = millis();

    if (rawVoltage < 0.1f) {
      r.value = 3000.0f;
      r.status = STATUS_FAULT; // Đứt nguồn LED phát quang hoặc tắc hoàn toàn
      r.error_code = 1;
    } else {
      r.value = applyFilter(calibrated);
      r.status = STATUS_LIVE;
      r.error_code = 0;
    }

    return r;
  }

  const char* getDriverName() const override { return "turbidity_analog_optical"; }
  const char* getSensorType() const override { return "turbidity"; }
  const char* getUnit() const override { return "NTU"; }
};
