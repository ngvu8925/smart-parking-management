import { SystemStatus } from "../types";

export interface SensorMeta {
  label: string;
  icon: string;
  unit: string;
  nominal: number;
}

export const SENSOR_DEFINITIONS: Record<string, SensorMeta> = {
  ph: { label: "Độ pH", icon: "⚗️", unit: "pH", nominal: 7.2 },
  ec: { label: "Độ dẫn điện (EC)", icon: "⚡", unit: "µS/cm", nominal: 350.0 },
  tds: { label: "Tổng rắn tan (TDS)", icon: "🧂", unit: "ppm", nominal: 175.0 },
  turbidity: { label: "Độ đục (Turbidity)", icon: "🌫️", unit: "NTU", nominal: 0.4 },
  orp: { label: "Thế Oxy hóa (ORP)", icon: "🔋", unit: "mV", nominal: 620.0 },
  chlorine: { label: "Clo dư khử trùng", icon: "💧", unit: "mg/L", nominal: 0.5 },
  temperature: { label: "Nhiệt độ nước", icon: "🌡️", unit: "°C", nominal: 27.5 },
  nh4: { label: "Amoni (NH4+)", icon: "☣️", unit: "mg/L", nominal: 0.03 },
  no3: { label: "Nitrat (NO3-)", icon: "🌾", unit: "mg/L", nominal: 4.0 },
  uv254: { label: "Hấp thụ UV254", icon: "🔬", unit: "cm⁻¹", nominal: 0.02 },
  electrical_leak: { label: "Cảm biến rò điện", icon: "⚡", unit: "state", nominal: 0.0 }
};

export const STATUS_COLORS: Record<
  SystemStatus,
  { bg: string; border: string; text: string; label: string }
> = {
  NORMAL: { bg: "#064e3b", border: "#059669", text: "#34d399", label: "NORMAL — NƯỚC AN TOÀN" },
  WARNING: { bg: "#78350f", border: "#d97706", text: "#fbbf24", label: "WARNING — CẢNH BÁO TRÔI DẠT" },
  ABNORMAL: { bg: "#7c2d12", border: "#ea580c", text: "#fb923c", label: "ABNORMAL — BIẾN ĐỘNG BẤT THƯỜNG" },
  "SUSPECTED CONTAMINATION": {
    bg: "#7f1d1d",
    border: "#dc2626",
    text: "#f87171",
    label: "SUSPECTED CONTAMINATION — NGHI NGỜ Ô NHIỄM"
  },
  "ELECTRICAL HAZARD": {
    bg: "#581c87",
    border: "#9333ea",
    text: "#c084fc",
    label: "ELECTRICAL HAZARD — NGUY CƠ RÒ ĐIỆN!"
  }
};
