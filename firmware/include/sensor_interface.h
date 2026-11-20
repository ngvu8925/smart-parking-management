#pragma once
#include <Arduino.h>

/**
 * ============================================================================
 * Smart Water Guardian - Hardware Abstraction Layer (HAL)
 * Sensor Interface & Data Models
 * ============================================================================
 */

enum SensorStatus {
  STATUS_LIVE = 0,               // Cảm biến vật lý đang hoạt động tốt, dữ liệu thật
  STATUS_SIMULATED = 1,          // Cảm biến giả lập phần mềm
  STATUS_BETA = 2,               // Đang thử nghiệm độ ổn định
  STATUS_CALIBRATION_REQUIRED = 3,// Trôi dạt tín hiệu, cần hiệu chuẩn lại
  STATUS_FAULT = 4,              // Hỏng hóc vật lý, đứt dây, CRC lỗi
  STATUS_OFFLINE = 5             // Mất kết nối (RS485 timeout, rút probe)
};

inline const char* sensorStatusToString(SensorStatus status) {
  switch (status) {
    case STATUS_LIVE:                 return "LIVE";
    case STATUS_SIMULATED:            return "SIMULATED";
    case STATUS_BETA:                 return "BETA";
    case STATUS_CALIBRATION_REQUIRED: return "CALIBRATION_REQUIRED";
    case STATUS_FAULT:                return "FAULT";
    case STATUS_OFFLINE:              return "OFFLINE";
    default:                          return "UNKNOWN";
  }
}

struct SensorReading {
  const char* sensor;       // Tên định danh (vd: "ph", "ec", "turbidity")
  float value;              // Giá trị đã qua hiệu chuẩn, bù nhiệt và lọc nhiễu
  float raw_value;          // Giá trị thô (ADC voltage, Modbus raw register)
  const char* unit;         // Đơn vị ("pH", "µS/cm", "NTU", "°C", v.v.)
  const char* source;       // "hardware" hoặc "simulator"
  SensorStatus status;      // LIVE, SIMULATED, CALIBRATION_REQUIRED, FAULT, OFFLINE
  int error_code;           // 0: Không lỗi, >0: Mã lỗi phần cứng
  unsigned long timestamp;  // Thời điểm đọc millis()

  // Chuyển đổi sang format JSON chuẩn hóa cho Backend & MQTT
  void toJson(char* buffer, size_t maxLen) const {
    snprintf(buffer, maxLen,
      "{\"sensor\":\"%s\",\"value\":%.3f,\"raw_value\":%.3f,\"unit\":\"%s\",\"source\":\"%s\",\"status\":\"%s\",\"error\":%d}",
      sensor, value, raw_value, unit, source, sensorStatusToString(status), error_code
    );
  }
};

/**
 * Interface cơ sở mà MỌI Driver cảm biến đều phải tuân thủ.
 * Dù là Analog, I2C, UART, hay Modbus RS485, đều trả về cùng một giao diện chuẩn hóa.
 */
class ISensorDriver {
public:
  virtual ~ISensorDriver() {}

  // Khởi tạo phần cứng (GPIO, UART, thanh ghi)
  virtual void init() = 0;

  // Đọc giá trị thô từ phần cứng (ADC voltage, bit Modbus)
  virtual float readRaw() = 0;

  // Áp dụng thuật toán hiệu chuẩn (slope, offset) và bù trừ nhiệt độ (Temperature Compensation)
  virtual float calibrateAndCompensate(float raw, float waterTempC) = 0;

  // Lọc số (Moving Average, Median Filter để loại bỏ bọt khí và nhiễu điện từ)
  virtual float applyFilter(float calibratedValue) = 0;

  // Chu trình hoàn chỉnh: RAW -> Calibration -> Temp Comp -> Filter -> Normalized Reading
  virtual SensorReading read(float waterTempC) = 0;

  // Metadata nhận diện
  virtual const char* getDriverName() const = 0;
  virtual const char* getSensorType() const = 0;
  virtual const char* getUnit() const = 0;
};
