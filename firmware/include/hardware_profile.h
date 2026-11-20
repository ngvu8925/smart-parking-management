#pragma once

/**
 * ============================================================================
 * Smart Water Guardian - Hardware Profiles Configuration
 * ============================================================================
 * 
 * Cho phép chuyển đổi linh hoạt giữa các cấu hình phần cứng chỉ bằng 1 macro:
 * 
 * 1. PROFILE_SIMULATOR_TESTBED:
 *    - Toàn bộ 11 cảm biến chạy bằng thuật toán mô phỏng nội bộ.
 *    - Thích hợp để test firmware trên bàn làm việc khi chưa có cảm biến thật.
 * 
 * 2. PROFILE_DEMO_ANALOG_I2C:
 *    - Cảm biến cốt lõi dùng Analog ADC (pH, EC/TDS, Turbidity) + 1-Wire DS18B20 + GPIO rò điện.
 *    - Các cảm biến đắt tiền (NH4, NO3, UV254, Clo) chạy ở chế độ Simulated / Beta.
 *    - Thích hợp làm đồ án tốt nghiệp, proof-of-concept, chi phí thấp (< 1.5 triệu VND).
 * 
 * 3. PROFILE_PRODUCTION_RS485_MODBUS:
 *    - Cảm biến công nghiệp chuẩn RS485 Modbus RTU (đo pH, EC, Turbidity, ORP, Temp...).
 *    - Chống nhiễu công nghiệp, độ chính xác cao, truyền xa hàng trăm mét.
 *    - Hỗ trợ chẩn đoán mã lỗi CRC, timeout, probe aging.
 */

// --- CHỌN PROFILE HOẠT ĐỘNG TẠI ĐÂY ---
#define ACTIVE_HARDWARE_PROFILE PROFILE_DEMO_ANALOG_I2C
// #define ACTIVE_HARDWARE_PROFILE PROFILE_PRODUCTION_RS485_MODBUS
// #define ACTIVE_HARDWARE_PROFILE PROFILE_SIMULATOR_TESTBED

// Định nghĩa mã Profile
#define PROFILE_SIMULATOR_TESTBED        0
#define PROFILE_DEMO_ANALOG_I2C          1
#define PROFILE_PRODUCTION_RS485_MODBUS  2

// ============================================================================
// GPIO PIN MAPPING CHO ESP32
// ============================================================================

#if (ACTIVE_HARDWARE_PROFILE == PROFILE_DEMO_ANALOG_I2C)
  // Analog ADC Pins (ESP32 ADC1: GPIO 32 - 39 không bị xung đột với Wi-Fi)
  #define PIN_ADC_PH               34
  #define PIN_ADC_EC               35
  #define PIN_ADC_TURBIDITY        32
  
  // Digital / Bus Pins
  #define PIN_ONEWIRE_TEMP         4     // DS18B20 1-Wire Bus (cần trở kéo 4.7kΩ lên 3.3V)
  #define PIN_LEAK_SENSOR          14    // Optocoupler / Transistor phát hiện rò điện
  
  // Actuators
  #define PIN_RELAY_VALVE          26    // Relay van điện từ (Solenoid)
  #define PIN_RELAY_SAMPLE         27    // Relay cơ cấu kích hoạt lưu mẫu nước
  #define PIN_BUZZER               25    // Còi báo động (Active Buzzer)

#elif (ACTIVE_HARDWARE_PROFILE == PROFILE_PRODUCTION_RS485_MODBUS)
  // RS485 Transceiver (MAX485 / SP3485)
  #define PIN_RS485_RX             16    // UART2 RX
  #define PIN_RS485_TX             17    // UART2 TX
  #define PIN_RS485_DE_RE          5     // Driver Enable / Receiver Enable pin
  #define RS485_BAUD_RATE          9600

  // Digital Leakage
  #define PIN_LEAK_SENSOR          14
  
  // Actuators
  #define PIN_RELAY_VALVE          26
  #define PIN_RELAY_SAMPLE         27
  #define PIN_BUZZER               25

  // Modbus Slave Addresses & Registers (Công nghiệp chuẩn)
  #define MODBUS_SLAVE_PH          0x01
  #define MODBUS_SLAVE_EC          0x02
  #define MODBUS_SLAVE_TURBIDITY   0x03
  #define MODBUS_SLAVE_TEMP        0x04

#else // PROFILE_SIMULATOR_TESTBED
  #define PIN_LEAK_SENSOR          14
  #define PIN_RELAY_VALVE          26
  #define PIN_RELAY_SAMPLE         27
  #define PIN_BUZZER               25
#endif
