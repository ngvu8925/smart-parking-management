import React from "react";
import { View, Text, StyleSheet, DimensionValue } from "react-native";
import { SENSOR_DEFINITIONS } from "../constants/sensors";
import { SensorReading } from "../types";

interface SensorCardProps {
  sensorKey: string;
  reading?: Partial<SensorReading>;
  cardWidth?: DimensionValue;
}

export default function SensorCard({ sensorKey, reading = {}, cardWidth }: SensorCardProps) {
  const meta = SENSOR_DEFINITIONS[sensorKey] || {
    label: sensorKey,
    icon: "💧",
    unit: "",
    nominal: 0
  };

  const isLeak = sensorKey === "electrical_leak";
  const rawVal = reading.value !== undefined ? reading.value : meta.nominal;
  const displayVal = isLeak ? (rawVal > 0.5 ? "RÒ ĐIỆN!" : "AN TOÀN") : rawVal;

  const status = reading.status || "SIMULATED";
  const isStuck = reading.is_stuck;

  // Status badge style
  let badgeColor = "#60a5fa"; // blue
  if (status === "LIVE") badgeColor = "#34d399"; // green
  else if (status === "BETA") badgeColor = "#fbbf24"; // yellow
  else if (status === "FAULT" || isStuck) badgeColor = "#f87171"; // red
  else if (status === "CALIBRATION REQUIRED") badgeColor = "#f59e0b";

  // Raw ADC voltage calculation (0-3.3V)
  let rawAdcVoltage = "0.00 V";
  if (isLeak) {
    rawAdcVoltage = rawVal > 0.5 ? "3.28 V" : "0.02 V";
  } else {
    const maxVals: Record<string, number> = {
      ph: 14, ec: 2000, tds: 1000, turbidity: 100, orp: 1000,
      chlorine: 5.0, temperature: 50, nh4: 10.0, no3: 100.0, uv254: 0.5
    };
    const maxVal = maxVals[sensorKey] || 100;
    const ratio = Math.max(0, Math.min(1, Number(rawVal) / maxVal));
    rawAdcVoltage = `${(ratio * 3.3).toFixed(2)} V`;
  }

  // Deviation formatting
  let devText = "";
  let devColor = "#9ca3af";
  if (!isLeak && reading.deviation_pct !== undefined && reading.deviation_pct !== null) {
    const dev = reading.deviation_pct;
    const sign = dev > 0 ? "+" : "";
    devText = `${sign}${dev}%`;
    devColor = dev > 15 ? "#f87171" : dev < -15 ? "#60a5fa" : "#34d399";
  }

  return (
    <View style={[styles.card, cardWidth ? { width: cardWidth } : {}, isLeak && rawVal > 0.5 && styles.hazardBorder]}>
      {/* Top Header */}
      <View style={styles.topRow}>
        <Text style={styles.sensorName} numberOfLines={1}>
          {meta.icon} {meta.label}
        </Text>
        <View style={[styles.badge, { borderColor: badgeColor }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>
            {isStuck ? "FAULT" : status}
          </Text>
        </View>
      </View>

      {/* Main Value */}
      <View style={styles.valRow}>
        <Text style={[styles.valText, isLeak && rawVal > 0.5 && { color: "#f87171" }]}>
          {displayVal}
        </Text>
        {!isLeak && <Text style={styles.unitText}>{meta.unit}</Text>}
      </View>

      {/* ADC & Baseline Strip */}
      <View style={styles.adcStrip}>
        <Text style={styles.adcText}>ADC: {rawAdcVoltage}</Text>
        <Text style={styles.nominalText}>Chuẩn: {meta.nominal}</Text>
      </View>

      {/* Bottom Diagnostics */}
      <View style={styles.bottomRow}>
        <Text style={[styles.devText, { color: devColor }]}>
          {devText || "Ổn định"}
        </Text>
        <Text style={styles.zText}>
          {isStuck ? "KẸT PROBE" : (reading.z_score !== undefined ? `z=${reading.z_score}` : `z=0.0`)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(17, 24, 39, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    width: "48%"
  },
  hazardBorder: {
    borderColor: "#ef4444",
    backgroundColor: "rgba(239, 68, 68, 0.15)"
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  sensorName: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af",
    flex: 1,
    marginRight: 4
  },
  badge: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4,
    borderWidth: 1
  },
  badgeText: {
    fontSize: 8.5,
    fontWeight: "800"
  },
  valRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginVertical: 2
  },
  valText: {
    fontSize: 19,
    fontWeight: "800",
    color: "#f9fafb"
  },
  unitText: {
    fontSize: 10,
    color: "#6b7280",
    marginLeft: 4,
    fontWeight: "600"
  },
  adcStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 4,
    marginVertical: 4
  },
  adcText: {
    fontSize: 9,
    color: "#9ca3af",
    fontFamily: "monospace"
  },
  nominalText: {
    fontSize: 9,
    color: "#6b7280"
  },
  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.05)",
    paddingTop: 4
  },
  devText: {
    fontSize: 10,
    fontWeight: "700"
  },
  zText: {
    fontSize: 9,
    color: "#6b7280"
  }
});
