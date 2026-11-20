import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ActuatorState } from "../types";

interface ActuatorsPanelProps {
  actuators?: Partial<ActuatorState>;
  onSetValve: (action: "OPEN" | "CLOSE") => void;
  onTriggerSample: () => void;
  onResetSample?: () => void;
  onToggleAlarm: () => void;
}

export default function ActuatorsPanel({
  actuators = {},
  onSetValve,
  onTriggerSample,
  onResetSample,
  onToggleAlarm
}: ActuatorsPanelProps) {
  const isValveOpen = actuators.valve_state !== "CLOSED";
  const isSamplePreserved = actuators.sample_preserved;
  const isAlarmActive = actuators.alarm_active;
  const isAlarmMuted = actuators.alarm_muted;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>⚙️ Điều Khiển Cơ Cấu Chấp Hành</Text>
        <View style={styles.modeBadge}>
          <Text style={styles.modeText}>Mode: {actuators.valve_mode || "AUTO"}</Text>
        </View>
      </View>

      {/* Primary 3 Actuators */}
      <View style={styles.row}>
        {/* Valve Control */}
        <TouchableOpacity
          style={[styles.btn, isValveOpen ? styles.btnSuccess : styles.btnDanger]}
          onPress={() => onSetValve(isValveOpen ? "CLOSE" : "OPEN")}
        >
          <Text style={styles.btnIcon}>🚰</Text>
          <View style={styles.btnTextCol}>
            <Text style={styles.btnTitle}>Van Cấp Nước</Text>
            <Text style={styles.btnStatus}>{isValveOpen ? "ĐANG MỞ" : "ĐÃ ĐÓNG"}</Text>
          </View>
        </TouchableOpacity>

        {/* Sample Trigger */}
        <TouchableOpacity
          style={[styles.btn, isSamplePreserved ? styles.btnDanger : styles.btnPrimary]}
          onPress={onTriggerSample}
        >
          <Text style={styles.btnIcon}>🧪</Text>
          <View style={styles.btnTextCol}>
            <Text style={styles.btnTitle}>Lưu Mẫu Sự Cố</Text>
            <Text style={styles.btnStatus}>
              {isSamplePreserved ? `ĐÃ KHÓA (#${actuators.sample_count || 1})` : "SẴN SÀNG"}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Alarm Mute Toggle */}
        <TouchableOpacity
          style={[styles.btn, isAlarmActive && !isAlarmMuted ? styles.btnWarning : styles.btnDefault]}
          onPress={onToggleAlarm}
        >
          <Text style={styles.btnIcon}>{isAlarmMuted ? "🔇" : "🔔"}</Text>
          <View style={styles.btnTextCol}>
            <Text style={styles.btnTitle}>Còi Báo Động</Text>
            <Text style={styles.btnStatus}>
              {isAlarmActive ? (isAlarmMuted ? "ĐÃ TẮT TIẾNG" : "ĐANG HÚ CÒI!") : "YÊN LẶNG"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Actuation Reason / Status description */}
      {actuators.last_actuation_reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>
            ℹ️ {actuators.last_actuation_reason}
          </Text>
        </View>
      )}

      {/* Sample Vault Reset Action */}
      {isSamplePreserved && onResetSample && (
        <TouchableOpacity style={styles.resetVialBtn} onPress={onResetSample}>
          <Text style={styles.resetVialText}>🔄 Thay Ống Nghiệm Sạch Mới</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "rgba(17, 24, 39, 0.75)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    padding: 14,
    marginBottom: 14
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9ca3af"
  },
  modeBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)"
  },
  modeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#93c5fd"
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8
  },
  btn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1
  },
  btnIcon: {
    fontSize: 18,
    marginRight: 6
  },
  btnTextCol: {
    flex: 1
  },
  btnTitle: {
    fontSize: 9.5,
    color: "#9ca3af",
    fontWeight: "600"
  },
  btnStatus: {
    fontSize: 10.5,
    fontWeight: "800",
    marginTop: 2
  },
  btnSuccess: {
    backgroundColor: "rgba(16, 185, 129, 0.15)",
    borderColor: "rgba(16, 185, 129, 0.4)"
  },
  btnDanger: {
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    borderColor: "rgba(239, 68, 68, 0.4)"
  },
  btnPrimary: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderColor: "rgba(59, 130, 246, 0.4)"
  },
  btnWarning: {
    backgroundColor: "rgba(245, 158, 11, 0.2)",
    borderColor: "rgba(245, 158, 11, 0.5)"
  },
  btnDefault: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderColor: "rgba(255, 255, 255, 0.1)"
  },
  reasonBox: {
    marginTop: 10,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6"
  },
  reasonText: {
    fontSize: 10.5,
    color: "#93c5fd",
    lineHeight: 14
  },
  resetVialBtn: {
    marginTop: 8,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.06)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center"
  },
  resetVialText: {
    fontSize: 11,
    color: "#e5e7eb",
    fontWeight: "700"
  }
});
