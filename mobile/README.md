# Ứng Dụng Di Động Smart Water Guardian (React Native / Expo)

Ứng dụng di động dành cho Android và iOS, cho phép người dùng kết nối trực tiếp với hệ thống IoT qua Wi-Fi để:
- **Theo dõi dữ liệu 10 cảm biến theo thời gian thực** (Real-time live telemetry 1Hz).
- **Xem trạng thái van nước & điều khiển từ xa** (Đóng / Mở van, kích hoạt lưu mẫu, ngắt còi báo).
- **Xem chẩn đoán AI / Machine Learning & Dị thường nguồn nước**.
- **Kích hoạt các kịch bản mô phỏng trực tiếp từ điện thoại** để kiểm thử phản ứng.

---

## 1. Yêu cầu & Chuẩn bị

1. **Điện thoại thật**:
   - Cài đặt ứng dụng **Expo Go** miễn phí từ:
     - [Google Play Store (Android)](https://play.google.com/store/apps/details?id=host.exp.exponent)
     - [Apple App Store (iOS)](https://apps.apple.com/app/expo-go/id982107779)
2. **Cùng mạng Wi-Fi**:
   - Điện thoại và máy tính chạy server cần kết nối chung một mạng Wi-Fi nội bộ.
   - Địa chỉ IP nội bộ của máy chủ hiện tại: `172.20.10.2` (Cổng: `8000`).

---

## 2. Cách Khởi Chạy Ứng Dụng Di Động

Mở terminal tại máy tính:

```bash
cd /home/dell/code/project/smart-water-guardian/mobile

# Cài đặt thư viện Expo (nếu chạy lần đầu)
npm install

# Khởi động Expo Server
npx expo start
```

Trên màn hình terminal sẽ xuất hiện một **Mã QR (QR Code)**:
- **Đối với Android**: Mở app **Expo Go** $\rightarrow$ chọn *"Scan QR code"* $\rightarrow$ quét mã QR trên terminal.
- **Đối với iPhone (iOS)**: Mở camera mặc định của máy $\rightarrow$ quét mã QR $\rightarrow$ nhấn mở trong Expo Go.

Ứng dụng sẽ tự động tải bundle và hiển thị giao diện Smart Water Guardian ngay lập tức!

---

## 3. Cấu Hình Địa Chỉ Server Trong App

Nếu bạn chuyển sang mạng Wi-Fi khác hoặc IP máy chủ thay đổi:
1. Nhấn vào biểu tượng bánh răng **⚙️** ở góc trên bên phải màn hình ứng dụng.
2. Nhập IP máy tính mới (ví dụ: `192.168.1.105` hoặc `172.20.10.2`) và cổng `8000`.
3. Nhấn **"Lưu & Kết Nối"**. App sẽ tự động kết nối lại WebSocket và nhận dữ liệu thời gian thực.

---

## 4. Kiến Trúc Mã Nguồn Mobile App

```text
mobile/
├── package.json                   # Cấu hình phụ thuộc React Native & Expo
├── app.json                       # Cấu hình ứng dụng Expo (Icon, Splash, Theme)
├── App.js                         # Màn hình chính tích hợp WebSocket & Quản lý State
└── src/
    ├── constants/
    │   └── sensors.js             # Định nghĩa danh mục cảm biến, đơn vị, màu sắc trạng thái
    ├── services/
    │   └── api.js                 # Service kết nối REST API và WebSocket Client tự reconnect
    └── components/
        ├── StatusBanner.js        # Thẻ trạng thái nguồn nước & AI chẩn đoán
        ├── SensorCard.js          # Thẻ hiển thị từng cảm biến, độ lệch %, nhãn LIVE/SIMULATED
        ├── ActuatorsPanel.js      # Nút bấm điều khiển Van nước, Lưu mẫu, Còi báo
        └── ServerConfigModal.js   # Hộp thoại đổi IP máy chủ linh hoạt
```
