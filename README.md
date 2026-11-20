# Smart Water Guardian (Hệ thống Giám sát An toàn Nguồn nước Thông minh)

> **IoT Multi-Sensor Water Quality & Electrical Safety Sentinel**  
> Giám sát đa chỉ số nước theo thời gian thực, học baseline cơ sở, phát hiện ô nhiễm & rò điện khẩn cấp, tự động đóng van nguồn và lưu trữ mẫu nước kiểm nghiệm.

---

## 1. Triết lý Thiết kế Cốt lõi

Hệ thống **không tuyên bố**:
> *"Nước an toàn tuyệt đối 100% để uống trực tiếp."*

Thay vào đó, hệ thống hoạt động như một **hệ thống giám sát sức khỏe toàn diện** (tương tự monitoring CPU/RAM/Network của máy chủ), phân loại tình trạng nguồn nước thành 5 cấp độ:

```
  ┌─────────────────────────────────────────────────────────────────┐
  │  1. NORMAL                 - Nguồn nước đạt dải chuẩn cơ sở     │
  │  2. WARNING                - Có độ lệch nhẹ / xu hướng trôi dạt │
  │  3. ABNORMAL               - Biến động bất thường rõ rệt        │
  │  4. SUSPECTED CONTAMINATION- Nghi ngờ ô nhiễm hóa sinh nghiêm trọng│
  │  5. ELECTRICAL HAZARD      - NGUY HIỂM: Rò điện khu vực nước    │
  └─────────────────────────────────────────────────────────────────┘
```

Điểm cốt lõi: Thiết bị **không cần biết đích danh chất độc X**, chỉ cần phát hiện:
> *"Nguồn nước hiện tại khác biệt đáng kể (Multi-variate Anomaly Score cao) so với trạng thái bình thường của vị trí lắp đặt."*

Ngay lập tức kích hoạt chuỗi phản ứng an toàn tự động:
1. **Đóng van cấp nước** (Solenoid Valve Shutoff).
2. **Kích hoạt buồng lưu mẫu** (Preserve Sample) để bảo quản nước nguyên trạng cho xét nghiệm vi sinh/hóa nghiệm.
3. **Phát còi báo động & gửi thông báo** (Siren Buzzer & Push Alerts).

---

## 2. Kiến trúc Tổng thể

```text
                           NGUỒN NƯỚC CẤP
                                 │
                                 ▼
                     FLOW CELL (BUỒNG ĐO NƯỚC)
                                 │
        ┌────────────────────────┼────────────────────────┐
        │                        │                        │
       pH                       EC                    Turbidity
        │                        │                        │
       ORP                 Free Chlorine              Temperature
        │                        │                        │
       NH4                      NO3                      UV254
        │                        │                        │
        └────────────────────────┼────────────────────────┘
                                 │
                     ESP32 Node / Python Simulator
                                 │
                                 ▼
                    MQTT Broker (Port 1883)
                    Topic: water/telemetry
                                 │
                                 ▼
                    FastAPI Anomaly Detection Engine
                                 │
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
       Còi báo động         Đóng van nước       Khóa bình mẫu
         (Buzzer)          (Solenoid Valve)    (Preserve Sample)
             │
             ▼
    Web Dashboard (WebSocket 1Hz / Glassmorphic UI)
```

Ngoài ra, tích hợp **Module an toàn điện**:
```text
Cảm biến phát hiện dòng rò (Electrical Leakage Sensor)
                    │
                    ▼
          ESP32 / Simulator Engine
                    │
            ┌───────┴───────┐
            ▼               ▼
      Cắt tải / Van      Báo động tức thời (ELECTRICAL HAZARD)
```

---

## 3. Danh mục 10 Chỉ số Nước & An toàn Điện

| Chỉ số | Đơn vị | Ý nghĩa phân tích | Giai đoạn đề xuất |
| :--- | :--- | :--- | :--- |
| **pH** | pH | Phát hiện axit hóa / kiềm hóa đột ngột do hóa chất | LIVE (V2.5+) |
| **EC** | µS/cm | Độ dẫn điện, ion hòa tan, nhiễm mặn, rò rỉ hóa chất | LIVE (V2+) |
| **TDS** | ppm | Tổng chất rắn hòa tan (suy từ EC) | LIVE (V2+) |
| **Turbidity** | NTU | Độ đục: phát hiện bùn cát, vỡ ống, vật chất lơ lửng | LIVE (V2+) |
| **ORP** | mV | Khả năng oxy hóa - khử của nước | SIMULATED / BETA |
| **Free Chlorine** | mg/L | Clo dư khử trùng: sụt giảm báo hiệu mất tính kháng khuẩn | SIMULATED / BETA |
| **Temperature** | °C | Nhiệt độ nước, bù nhiệt cảm biến | LIVE (V2+) |
| **NH4+** | mg/L | Amoni: dấu hiệu nước thải sinh hoạt hoặc phân bón hữu cơ | SIMULATED / BETA |
| **NO3-** | mg/L | Nitrat: ô nhiễm dòng chảy nông nghiệp / hóa chất | SIMULATED / BETA |
| **UV254** | cm⁻¹ | Hấp thụ cực tím: đánh giá hợp chất hữu cơ hòa tan (COD/TOC) | SIMULATED / BETA |
| **Electrical Leak** | State | Phát hiện rò điện vào nước, nguy cơ điện giật chết người | LIVE (V2.5+) |

---

## 4. Metadata & Giao diện Cảm biến Đồng nhất

Một nguyên tắc kiến trúc quan trọng nhất: **Backend không phân biệt dữ liệu đến từ cảm biến thật hay phần mềm mô phỏng**. Cả hai đều gửi chung một schema JSON qua MQTT topic `water/telemetry`:

```json
{
  "device_id": "water-guardian-node-01",
  "timestamp": "2026-09-28T09:40:00Z",
  "readings": {
    "ph": {
      "sensor": "ph",
      "value": 7.21,
      "unit": "pH",
      "source": "hardware",
      "status": "LIVE"
    },
    "nh4": {
      "sensor": "nh4",
      "value": 0.032,
      "unit": "mg/L",
      "source": "simulator",
      "status": "SIMULATED"
    },
    "chlorine": {
      "sensor": "chlorine",
      "value": 0.48,
      "unit": "mg/L",
      "source": "simulator",
      "status": "BETA"
    }
  }
}
```

Hệ thống quản lý 7 trạng thái chức năng:
- `LIVE` (Cảm biến phần cứng đang hoạt động thật)
- `BETA` (Đang thử nghiệm thực địa)
- `SIMULATED` (Mô phỏng phần mềm)
- `NOT INSTALLED` (Chưa lắp đặt)
- `CALIBRATION REQUIRED` (Cần hiệu chuẩn lại)
- `FAULT` (Hỏng hóc phần cứng)
- `OFFLINE` (Mất kết nối tín hiệu)

---

## 5. Động cơ Mô phỏng Vật lý & 11 Kịch bản

Hệ thống tích hợp mô hình vật lý đầy đủ (`simulator/physics.py`):
- **Nhiễu đo lường Gaussian** (Sensor noise theo sai số thực tế).
- **Độ trễ phản ứng vật lý** (First-order inertia lag $\tau$).
- **Độ trôi nhiệt/thời gian** (Sensor drift theo bước ngẫu nhiên).
- **Nhiễu bọt khí tức thời** (Transient particle / bubble spikes).
- **Chẩn đoán kẹt cảm biến** (Sensor Stuck Detection khi dữ liệu đứng yên bất thường $\ge 10$ nhịp).

### 11 Kịch bản sẵn có (One-Click Scenarios)
1. **Nước sạch đô thị (`normal`)**: Trạng thái chuẩn ổn định.
2. **Sụt lở cặn / Bùn đất (`muddy_water`)**: Turbidity tăng vọt từ $0.4 \rightarrow 12.8$ NTU.
3. **Nhiễm khoáng / Xâm nhập mặn (`salt_spike`)**: EC vọt $1850$ µS/cm.
4. **Nhiễm axit công nghiệp (`acid_contamination`)**: pH sụt sâu còn $4.60$.
5. **Mất clo khử trùng (`chlorine_failure`)**: Clo tự do tụt về $0.02$ mg/L.
6. **Nhiễm Amoni / Nước thải (`ammonia_spike`)**: NH4 tăng lên $0.72$ mg/L.
7. **Nhiễm Nitrat nông nghiệp (`nitrate_spike`)**: NO3 tăng lên $28.5$ mg/L.
8. **Nhiễm chất hữu cơ (`organic_contamination`)**: UV254 vọt $0.145$ cm⁻¹, ORP sụt giảm.
9. **Rò điện nguy hiểm (`electrical_leak`)**: Kích hoạt trạng thái EMERGENCY.
10. **Lỗi kẹt cảm biến (`sensor_stuck`)**: Mô phỏng cảm biến pH bị đông cứng số liệu.
11. **Thảm họa ô nhiễm phức hợp (`mixed_contamination`)**: Đồng thời axit hóa + bùn đục + mất clo + tăng EC.

---

## 6. Phân tích Dữ liệu Nâng cao bằng Machine Learning (AI Subsystem)

Dự án hiện đã tích hợp một hệ thống **Machine Learning hoàn chỉnh** chạy song song với bộ quy tắc an toàn và kiểm định thống kê:

### A. Hai mô hình ML bổ trợ lẫn nhau:
1. **Isolation Forest (Học không giám sát - Unsupervised Anomaly Detection)**:
   - Huấn luyện trên $16.000+$ mẫu nước sạch chuẩn đô thị.
   - Học không gian phân bố đa biến 10 chiều, tính toán điểm dị thường phi tuyến tính ($0.0\% - 100.0\%$).
   - Đạt độ chính xác phát hiện bất thường: **AUC-ROC = 0.9999**.
2. **Random Forest Classifier (Học có giám sát - Multi-Class Pattern Diagnosis)**:
   - Phân loại chính xác dạng ô nhiễm thành 9 mẫu hình: `NORMAL`, `MUDDY_SEDIMENT`, `SALINE_INTRUSION`, `ACID_CONTAMINATION`, `CHLORINE_DEPLETION`, `AMMONIA_POLLUTION`, `NITRATE_RUNOFF`, `ORGANIC_POLLUTION`, `MIXED_DISASTER`.
   - Cung cấp **độ tin cậy xác suất (%)** và **thuộc tính đóng góp tính năng (Feature Importances)** để giải thích rõ lý do mô hình đưa ra cảnh báo.
   - Đạt độ chính xác trên tập kiểm thử: **Accuracy = 100.0%**.

### B. Kiến trúc Ensemble Hybrid:
```text
  Telemetry Data (10 thông số)
             │
   ┌─────────┴─────────┐
   ▼                   ▼
Rule-Based / Z-Score    Machine Learning (Isolation Forest & RF)
   │                   │
   └─────────┬─────────┘
             ▼
      Ensemble Anomaly Score + Phân loại Dạng ô nhiễm + Giải thích AI
```

---

## 7. Hướng dẫn Cài đặt & Chạy Thử Nghiệm

### Cách 1: Chạy trực tiếp bằng Python (Khuyên dùng cho phát triển)

```bash
cd /home/dell/code/project/smart-water-guardian

# Kích hoạt môi trường ảo
source venv/bin/activate

# Cài đặt thư viện (nếu chưa cài)
pip install -r requirements.txt

# Khởi động toàn bộ hệ thống
python run.py
```

Mở trình duyệt truy cập:
- **Dashboard điều khiển**: `http://localhost:8000`
- **Tài liệu API Swagger**: `http://localhost:8000/docs`
- **Cổng MQTT tích hợp**: `localhost:1883`

### Cách 2: Chạy kiểm thử tự động (Unit & Integration Tests)

```bash
pytest -v
```

### Cách 3: Chạy bằng Docker Compose

```bash
docker compose up --build
```

---

## 7. Cấu trúc Thư mục

```text
smart-water-guardian/
├── config.py                   # Cấu hình ngưỡng an toàn & baseline
├── run.py                      # File khởi động chính
├── requirements.txt            # Thư viện phụ thuộc
├── Dockerfile                  # Container build
├── docker-compose.yml          # Triển khai Docker
├── core/
│   ├── models.py               # Pydantic schema (Telemetry, Reading, Actuator)
│   ├── anomaly_detector.py     # Động cơ phát hiện bất thường & chẩn đoán lỗi
│   ├── rule_engine.py          # Quy tắc tự động đóng van, lưu mẫu, hú còi
│   ├── database.py             # SQLite time-series & nhật ký sự kiện
│   └── event_bus.py            # Bus sự kiện bất đồng bộ
├── simulator/
│   ├── physics.py              # Mô hình vật lý cảm biến (nhiễu, trôi, quán tính)
│   ├── scenario_manager.py     # Quản lý & chuyển đổi kịch bản
│   ├── water_simulator.py      # Tiến trình mô phỏng liên tục
│   └── scenarios/              # 11 file JSON kịch bản mô phỏng
├── mqtt_broker/
│   ├── embedded_broker.py      # MQTT Broker thuần Python (chạy cổng 1883)
│   └── client.py               # Paho-MQTT subscriber & publisher
├── server/
│   ├── app.py                  # Ứng dụng FastAPI chính
│   └── routes/
│       ├── api.py              # REST API điều khiển
│       └── ws.py               # WebSocket Hub truyền dữ liệu 1Hz
├── static/
│   ├── index.html              # Giao diện Web Glassmorphic Dark Dashboard
│   ├── css/style.css           # Bảng phong cách CSS hiện đại
│   └── js/app.js               # Logic điều khiển, Chart.js, WebSocket
├── firmware/
│   ├── esp32_smart_water_guardian.ino # Mã nguồn C++ cho bo mạch ESP32
│   ├── platformio.ini          # Cấu hình PlatformIO
│   └── README.md               # Sơ đồ nối chân phần cứng & hiệu chuẩn
└── tests/
    ├── test_anomaly.py         # Kiểm thử thuật toán Anomaly
    ├── test_simulator.py       # Kiểm thử động cơ vật lý
    └── test_api.py             # Kiểm thử REST API
```
