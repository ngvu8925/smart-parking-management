import React, { useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

interface ServerConfigModalProps {
  visible: boolean;
  currentHost: string;
  currentPort: string;
  onClose: () => void;
  onSave: (host: string, port: string) => void;
}

export default function ServerConfigModal({
  visible,
  currentHost,
  currentPort,
  onClose,
  onSave
}: ServerConfigModalProps) {
  const [host, setHost] = useState(currentHost || "172.20.10.2");
  const [port, setPort] = useState(currentPort || "8000");

  const handleSave = () => {
    onSave(host.trim(), port.trim());
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>⚙️ Cấu Hình Địa Chỉ Server</Text>
          <Text style={styles.subtitle}>
            Nhập địa chỉ IP máy tính đang chạy Backend Smart Water Guardian:
          </Text>

          <Text style={styles.label}>IP Máy Chủ (Host):</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="Ví dụ: 192.168.1.100 hoặc 172.20.10.2"
            placeholderTextColor="#6b7280"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Cổng (Port):</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder="8000"
            placeholderTextColor="#6b7280"
            keyboardType="numeric"
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnCancel} onPress={onClose}>
              <Text style={styles.btnCancelText}>Hủy</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnSave} onPress={handleSave}>
              <Text style={styles.btnSaveText}>Lưu & Kết Nối</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20
  },
  modalCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)",
    padding: 20,
    width: "100%",
    maxWidth: 380
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#f9fafb",
    marginBottom: 4
  },
  subtitle: {
    fontSize: 12,
    color: "#9ca3af",
    marginBottom: 16
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: "#d1d5db",
    marginBottom: 6
  },
  input: {
    backgroundColor: "#0b0f19",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderRadius: 8,
    color: "#f9fafb",
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    marginBottom: 14
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6
  },
  btnCancel: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.15)"
  },
  btnCancelText: {
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: "600"
  },
  btnSave: {
    backgroundColor: "#2563eb",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  btnSaveText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700"
  }
});
