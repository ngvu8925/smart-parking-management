import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { STATUS_COLORS } from "../constants/sensors";
import { SystemStatus, MLPrediction } from "../types";

interface StatusBannerProps {
  status?: SystemStatus;
  anomalyScore?: number;
  isLeak?: boolean;
  factors?: string[];
  mlPrediction?: MLPrediction | null;
}

export default function StatusBanner({
  status = "NORMAL",
  anomalyScore = 0,
  isLeak = false,
  factors = [],
  mlPrediction = null
}: StatusBannerProps) {
  const currentStatus: SystemStatus = isLeak ? "ELECTRICAL HAZARD" : (status || "NORMAL");
  const colorTheme = STATUS_COLORS[currentStatus] || STATUS_COLORS.NORMAL;

  return (
    <View style={[styles.container, { backgroundColor: colorTheme.bg, borderColor: colorTheme.border }]}>
      <View style={styles.headerRow}>
        <View style={styles.badgeWrapper}>
          <Text style={[styles.statusText, { color: colorTheme.text }]}>
            {colorTheme.label}
          </Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreText}>
            {Math.round(isLeak ? 100 : anomalyScore)}% Dị Thường
          </Text>
        </View>
      </View>

      {/* ML Prediction Pill */}
      {mlPrediction && mlPrediction.ml_available && (
        <View style={styles.mlPill}>
          <Text style={styles.mlPillText}>
            🤖 AI Chẩn đoán: {mlPrediction.predicted_label_vi} ({mlPrediction.confidence_pct}%)
          </Text>
        </View>
      )}

      {/* Critical Factors */}
      {factors && factors.length > 0 ? (
        <View style={styles.factorsList}>
          {factors.slice(0, 3).map((f, i) => (
            <Text key={i} style={styles.factorItem} numberOfLines={1}>
              • {f}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={styles.normalSubtext}>
          Tất cả chỉ số sinh hóa và an toàn điện nằm trong dải bình thường cơ sở.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 14
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  badgeWrapper: {
    flex: 1,
    marginRight: 8
  },
  statusText: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.3
  },
  scoreBadge: {
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6
  },
  scoreText: {
    color: "#f3f4f6",
    fontSize: 11,
    fontWeight: "700"
  },
  mlPill: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginVertical: 4
  },
  mlPillText: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "600"
  },
  factorsList: {
    marginTop: 4
  },
  factorItem: {
    color: "#e5e7eb",
    fontSize: 11,
    marginTop: 2
  },
  normalSubtext: {
    color: "#9ca3af",
    fontSize: 11,
    marginTop: 2
  }
});
