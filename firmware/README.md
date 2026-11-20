# Hướng Dẫn Phần Cứng & Kết Nối ESP32 (Smart Water Guardian)

Tài liệu này cung cấp sơ đồ chân nối dây, hiệu chuẩn cảm biến và lộ trình chuyển đổi từ mô phỏng (Simulator) sang phần cứng thật.

---

## 1. Sơ đồ chân nối ESP32 DevKit V1

| Cảm biến / Cơ cấu chấp hành | Loại tín hiệu | Chân ESP32 (GPIO) | Ghi chú |
| :--- | :--- | :--- | :--- |
| **Cảm biến pH (pH-4502C)** | Analog ADC | **GPIO 34** (ADC1_CH6) | Cần cân chỉnh biến trở offset pH 7.0 |
| **Cảm biến TDS / EC** | Analog ADC | **GPIO 35** (ADC1_CH7) | Kèm bù nhiệt độ bằng phần mềm |
| **Cảm biến độ đục (Turbidity)** | Analog ADC | **GPIO 32** (ADC1_CH4) | Chuyển switch sang chế độ Analog (A) |
| **Nhiệt độ DS18B20** | Kỹ thuật số OneWire | **GPIO 4** | Kèm trở kéo 4.7kΩ giữa VCC (3.3V) & DATA |
| **Mô phỏng rò điện (Leak Sensor)** | Digital Input | **GPIO 14** | Nút gạt hoặc Optocoupler cách ly |
| **Relay 1: Van điện từ ngắt nước** | Digital Output | **GPIO 26** | Điều khiển cuộn van 12V/220V |
| **Relay 2: Cơ chế khóa mẫu nước** | Digital Output | **GPIO 27** | Kích hoạt bơm/solenoid dẫn mẫu |
| **Còi báo động (Buzzer)** | Digital Output | **GPIO 25** | Còi chủ động (Active Buzzer 5V) |

> [!WARNING]
> **CẢNH BÁO AN TOÀN ĐIỆN**: Tuyệt đối không đưa điện áp 220V trực tiếp vào nguồn nước khi thí nghiệm. Trong mô hình thực tế, thiết bị bảo vệ chính chống giật bắt buộc phải là **RCBO/RCCB chuẩn công nghiệp**. Cảm biến rò điện trên ESP32 chỉ đóng vai trò thu thập telemetry và kích hoạt van cô lập dòng chảy phụ trợ.

---

## 2. Lộ trình nâng cấp phần cứng (Progressive Roadmap)

### Giai đoạn V0 — 0đ phần cứng (Mô phỏng 100%)
- Chạy hệ thống bằng Python Simulator + Web Dashboard.
- Kiểm thử toàn bộ 11 kịch bản sự cố và thuật toán phát hiện bất thường.

### Giai đoạn V1 — Chi phí ~100k - 200k
- Mua 1 bo mạch ESP32.
- Nạp firmware `esp32_smart_water_guardian.ino`.
- ESP32 kết nối Wi-Fi thật, gửi gói tin heartbeat và telemetry qua MQTT Broker.

### Giai đoạn V2 — Chi phí ~700k - 1.2 triệu
- Lắp đặt: **TDS, Turbidity, DS18B20, Module Relay 2 kênh, Van nước 12V**.
- Chế độ đo:
  - TDS: **LIVE**
  - Turbidity: **LIVE**
  - Temperature: **LIVE**
  - pH, ORP, Chlorine, NH4, NO3, UV254: **SIMULATED**

### Giai đoạn V2.5 — Chi phí ~1.5 - 2 triệu
- Bổ sung: **Đầu dò pH công nghiệp + Mạch cách ly tín hiệu rò điện**.
- Chế độ đo:
  - pH: **LIVE**
  - TDS / EC: **LIVE**
  - Turbidity: **LIVE**
  - Temperature: **LIVE**
  - Leak detection: **LIVE**
  - ORP, Chlorine, NH4, NO3, UV254: **BETA / SIMULATED**
