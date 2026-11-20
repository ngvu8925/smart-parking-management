#pragma once
#include <Arduino.h>
#include <Preferences.h>

/**
 * ============================================================================
 * Smart Water Guardian - Calibration Storage (NVS Non-Volatile Flash)
 * ============================================================================
 * 
 * Lưu trữ tham số hiệu chuẩn cảm biến vĩnh viễn trên bộ nhớ Flash ESP32:
 * - Khi mất điện hoặc khởi động lại, các hệ số Slope & Offset không bị mất.
 * - Hỗ trợ hiệu chuẩn 2 điểm dung dịch đệm pH 4.01 và pH 7.00/6.86.
 * - Hỗ trợ hiệu chuẩn hằng số K của điện cực dẫn điện EC với dung dịch chuẩn 1413 µS/cm.
 */

struct SensorCalibrationData {
  // pH 2-point calibration
  float ph_v7 = 2.500f;          // Điện thế khi ngâm trong dung dịch đệm pH 7.00 (V)
  float ph_v4 = 3.050f;          // Điện thế khi ngâm trong dung dịch đệm pH 4.01 (V)
  float ph_slope = -3.500f;      // Slope tính được: (7.0 - 4.01) / (v7 - v4)

  // EC / TDS Calibration
  float ec_k_value = 1.000f;     // Hằng số cell K (mặc định 1.0)
  float ec_temp_coeff = 0.0191f; // Hệ số bù nhiệt tiêu chuẩn nước ngọt: 1.91%/°C

  // Turbidity Calibration
  float turb_clear_voltage = 2.80f; // Điện thế nước cất sạch (NTU ~ 0)
  float turb_slope = -1120.0f;      // Hệ số góc đường cong điện thế -> NTU

  // Temperature Offset
  float temp_offset = 0.0f;         // Độ lệch cảm biến nhiệt (°C)
};

class CalibrationStorage {
private:
  Preferences prefs;
  SensorCalibrationData currentData;
  const char* PREF_NAMESPACE = "swg_calib";

public:
  void begin() {
    prefs.begin(PREF_NAMESPACE, false);
    load();
  }

  void load() {
    currentData.ph_v7 = prefs.getFloat("ph_v7", 2.500f);
    currentData.ph_v4 = prefs.getFloat("ph_v4", 3.050f);
    
    // Tự động tính lại slope từ 2 điểm đệm
    float dv = currentData.ph_v7 - currentData.ph_v4;
    if (abs(dv) > 0.05f) {
      currentData.ph_slope = (7.00f - 4.01f) / dv;
    } else {
      currentData.ph_slope = -3.500f;
    }

    currentData.ec_k_value = prefs.getFloat("ec_k", 1.000f);
    currentData.ec_temp_coeff = prefs.getFloat("ec_tc", 0.0191f);
    currentData.turb_clear_voltage = prefs.getFloat("turb_v0", 2.80f);
    currentData.temp_offset = prefs.getFloat("t_off", 0.0f);
  }

  SensorCalibrationData& get() {
    return currentData;
  }

  // Hiệu chuẩn pH 7.00
  void calibratePHNeutral(float voltageV7) {
    currentData.ph_v7 = voltageV7;
    prefs.putFloat("ph_v7", voltageV7);
    recalcPHSlope();
  }

  // Hiệu chuẩn pH 4.01
  void calibratePHAcid(float voltageV4) {
    currentData.ph_v4 = voltageV4;
    prefs.putFloat("ph_v4", voltageV4);
    recalcPHSlope();
  }

  // Hiệu chuẩn hằng số K của EC với dung dịch chuẩn 1413 µS/cm tại 25°C
  void calibrateEC(float rawMeasuredEC) {
    if (rawMeasuredEC > 10.0f) {
      currentData.ec_k_value = 1413.0f / rawMeasuredEC;
      prefs.putFloat("ec_k", currentData.ec_k_value);
    }
  }

  // Reset về cấu hình xuất xưởng mặc định
  void factoryReset() {
    prefs.clear();
    currentData = SensorCalibrationData();
    load();
  }

private:
  void recalcPHSlope() {
    float dv = currentData.ph_v7 - currentData.ph_v4;
    if (abs(dv) > 0.05f) {
      currentData.ph_slope = (7.00f - 4.01f) / dv;
    } else {
      currentData.ph_slope = -3.500f;
    }
    prefs.putFloat("ph_slope", currentData.ph_slope);
  }
};
