export interface BaselineMetricConfig {
  nominal: number;
  std: number;
  min_safe: number;
  max_safe: number;
  weight: number;
  unit: string;
  description: string;
}

export const BASELINE_PROFILE: Record<string, BaselineMetricConfig> = {
  ph: {
    nominal: 7.20,
    std: 0.15,
    min_safe: 6.5,
    max_safe: 8.5,
    weight: 1.5,
    unit: 'pH',
    description: 'Độ pH (tính kiềm/axit)'
  },
  ec: {
    nominal: 350.0,
    std: 25.0,
    min_safe: 100.0,
    max_safe: 800.0,
    weight: 1.2,
    unit: 'µS/cm',
    description: 'Độ dẫn điện (EC)'
  },
  tds: {
    nominal: 175.0,
    std: 15.0,
    min_safe: 50.0,
    max_safe: 400.0,
    weight: 1.0,
    unit: 'ppm',
    description: 'Tổng chất rắn hòa tan (TDS)'
  },
  turbidity: {
    nominal: 0.40,
    std: 0.10,
    min_safe: 0.0,
    max_safe: 3.0,
    weight: 1.4,
    unit: 'NTU',
    description: 'Độ đục (Turbidity)'
  },
  orp: {
    nominal: 620.0,
    std: 25.0,
    min_safe: 500.0,
    max_safe: 850.0,
    weight: 1.1,
    unit: 'mV',
    description: 'Thế oxy hóa-khử (ORP)'
  },
  chlorine: {
    nominal: 0.50,
    std: 0.05,
    min_safe: 0.20,
    max_safe: 1.00,
    weight: 1.3,
    unit: 'mg/L',
    description: 'Clo dư khử trùng'
  },
  temperature: {
    nominal: 27.5,
    std: 1.2,
    min_safe: 15.0,
    max_safe: 35.0,
    weight: 0.6,
    unit: '°C',
    description: 'Nhiệt độ nước'
  },
  nh4: {
    nominal: 0.03,
    std: 0.01,
    min_safe: 0.0,
    max_safe: 0.15,
    weight: 1.5,
    unit: 'mg/L',
    description: 'Ammonium/Ammonia (NH4+)'
  },
  no3: {
    nominal: 4.0,
    std: 0.5,
    min_safe: 0.0,
    max_safe: 10.0,
    weight: 1.2,
    unit: 'mg/L',
    description: 'Nitrate (NO3-)'
  },
  uv254: {
    nominal: 0.020,
    std: 0.005,
    min_safe: 0.005,
    max_safe: 0.050,
    weight: 1.3,
    unit: 'cm⁻¹',
    description: 'Hấp thụ UV 254nm'
  },
  electrical_leak: {
    nominal: 0.0,
    std: 0.0,
    min_safe: 0.0,
    max_safe: 0.0,
    weight: 3.0,
    unit: 'state',
    description: 'Cảm biến an toàn rò điện'
  }
};
