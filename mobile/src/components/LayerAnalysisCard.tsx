import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LayerBreakdown, DiagnosticPattern } from "../types";

interface Props {
  layerBreakdown?: LayerBreakdown | null;
  patternLabel?: string;
  diagnosticPattern?: DiagnosticPattern;
  disclaimer?: string;
}

export default function LayerAnalysisCard({
  layerBreakdown,
  patternLabel,
  diagnosticPattern,
  disclaimer
}: Props) {
  if (!layerBreakdown) return null;

  const l1 = layerBreakdown.layer1_rules;
  const l2 = layerBreakdown.layer2_statistical;
  const l3 = layerBreakdown.layer3_ml;
  const l4 = layerBreakdown.layer4_classification;

  const isNormal = diagnosticPattern === "NORMAL" || !diagnosticPattern;
  const isHazard = diagnosticPattern === "ELECTRICAL_HAZARD";

  const patternBadgeColor = isHazard ? "#ef4444" : isNormal ? "#34d399" : "#f59e0b";
  const patternBadgeBg = isHazard
    ? "rgba(239, 68, 68, 0.15)"
    : isNormal
    ? "rgba(52, 211, 153, 0.15)"
    : "rgba(245, 158, 11, 0.15)";

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.icon}>🔬</Text>
          <View>
            <Text style={styles.title}>Đánh Giá An Toàn Đa Tầng (4-Layer)</Text>
            <Text style={styles.subtitle}>ESP-WaterQuality + SWaT Testbed + WHO</Text>
          </View>
        </View>
        <View style={[styles.patternBadge, { backgroundColor: patternBadgeBg, borderColor: patternBadgeColor }]}>
          <Text style={[styles.patternBadgeText, { color: patternBadgeColor }]}>
            {patternLabel || l4.pattern_label || "Đang phân tích"}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {/* Layer 1: Rules */}
        <View style={styles.layerBox}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerTitle}>LỚP 1: QUY TẮC AN TOÀN</Text>
            <Text style={[styles.statusTag, { color: l1.triggered ? "#f87171" : "#34d399" }]}>
              {l1.is_hazard ? "NGUY HIỂM ĐIỆN" : l1.triggered ? `${l1.violations.length} VI PHẠM` : "ĐẠT CHUẨN"}
            </Text>
          </View>
          <Text style={styles.layerDesc}>
            {l1.triggered && l1.violations.length > 0
              ? l1.violations.slice(0, 2).join("\n")
              : "Tất cả chỉ số nằm trong giới hạn an toàn WHO & QCVN 01-1."}
          </Text>
        </View>

        {/* Layer 2: Statistical */}
        <View style={styles.layerBox}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerTitle}>LỚP 2: THỐNG KÊ BIẾN ĐỘNG</Text>
            <Text style={[styles.statusTag, { color: l2.z_score_avg > 3 ? "#f87171" : "#34d399" }]}>
              Z-Score: {l2.z_score_avg}
            </Text>
          </View>
          <Text style={styles.layerDesc}>
            {l2.rapid_shifts && l2.rapid_shifts.length > 0
              ? l2.rapid_shifts.slice(0, 2).join("\n")
              : `Dao động ổn định quanh baseline. Trung bình Z=${l2.z_score_avg}.`}
          </Text>
        </View>

        {/* Layer 3: ML Unsupervised */}
        <View style={styles.layerBox}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerTitle}>LỚP 3: HỌC MÁY KHÔNG GIÁM SÁT</Text>
            <Text style={[styles.statusTag, { color: l3.anomaly_score >= 80 ? "#f87171" : "#60a5fa" }]}>
              Score: {l3.anomaly_score}%
            </Text>
          </View>
          <Text style={styles.layerDesc}>
            Isolation Forest (AUC 0.999) + Autoencoder Reconstruction Error ({l3.reconstruction_error}).
          </Text>
        </View>

        {/* Layer 4: Classification */}
        <View style={styles.layerBox}>
          <View style={styles.layerHeader}>
            <Text style={styles.layerTitle}>LỚP 4: PHÂN LOẠI HÌNH THÁI</Text>
            <Text style={[styles.statusTag, { color: "#c084fc" }]}>
              Độ tin cậy: {l4.confidence}%
            </Text>
          </View>
          <Text style={styles.layerDesc}>
            Tương đồng: {l4.similar_historical_profile}
          </Text>
        </View>
      </View>

      {/* Safety Disclaimer */}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerIcon}>ℹ️</Text>
        <Text style={styles.disclaimerText}>
          {disclaimer || "Hệ thống giám sát chỉ dấu an toàn - Không tuyên bố an toàn tuyệt đối và không thay thế xét nghiệm vi sinh/kim loại nặng y tế."}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.6)",
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 16
  },
  header: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(51, 65, 85, 0.6)",
    paddingBottom: 10
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8
  },
  icon: {
    fontSize: 22,
    marginRight: 8
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#f8fafc"
  },
  subtitle: {
    fontSize: 11,
    color: "#94a3b8"
  },
  patternBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    alignSelf: "flex-start"
  },
  patternBadgeText: {
    fontSize: 12,
    fontWeight: "600"
  },
  grid: {
    gap: 8
  },
  layerBox: {
    backgroundColor: "rgba(30, 41, 59, 0.6)",
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(51, 65, 85, 0.4)"
  },
  layerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  layerTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#94a3b8"
  },
  statusTag: {
    fontSize: 11,
    fontWeight: "600"
  },
  layerDesc: {
    fontSize: 11.5,
    color: "#cbd5e1",
    lineHeight: 16
  },
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    padding: 8,
    borderRadius: 4,
    marginTop: 10
  },
  disclaimerIcon: {
    fontSize: 14,
    marginRight: 6
  },
  disclaimerText: {
    fontSize: 11,
    color: "#fbbf24",
    flex: 1,
    lineHeight: 15
  }
});
