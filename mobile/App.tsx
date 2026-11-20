import React, { useState, useEffect, useCallback } from "react";
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  RefreshControl,
  useWindowDimensions
} from "react-native";
import { apiService } from "./src/services/api";
import StatusBanner from "./src/components/StatusBanner";
import LayerAnalysisCard from "./src/components/LayerAnalysisCard";
import SensorCard from "./src/components/SensorCard";
import ActuatorsPanel from "./src/components/ActuatorsPanel";
import ServerConfigModal from "./src/components/ServerConfigModal";
import { SENSOR_DEFINITIONS } from "./src/constants/sensors";
import { TelemetryPacket, SystemStatusResponse, SensorReading, Scenario } from "./src/types";

type TabType = "overview" | "analytics" | "sensors" | "actuators" | "scenarios";

export default function App() {
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [statusData, setStatusData] = useState<SystemStatusResponse>({
    status: "NORMAL",
    anomaly_score: 0.0,
    is_electrical_hazard: false,
    critical_factors: [],
    recommended_actions: [],
    ml_prediction: null,
    actuators: {
      valve_state: "OPEN",
      valve_mode: "AUTO",
      sample_preserved: false,
      sample_count: 0,
      alarm_active: false,
      alarm_muted: false
    },
    active_scenario: {
      id: "normal",
      name: "Bình thường",
      description: ""
    },
    device_id: "water-guardian-node-01"
  });

  const [readings, setReadings] = useState<Record<string, SensorReading>>({});
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [activeScenarioId, setActiveScenarioId] = useState<string>("normal");
  const [preservedSamples, setPreservedSamples] = useState<any[]>([]);
  const [auditAlerts, setAuditAlerts] = useState<any[]>([]);
  const [asaoUser, setAsaoUser] = useState<any>(null);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [configModalVisible, setConfigModalVisible] = useState<boolean>(false);
  const [serverHost, setServerHost] = useState<string>(apiService.serverHost);
  const [serverPort, setServerPort] = useState<string>(apiService.serverPort);

  // Initial Load & WebSocket Setup
  useEffect(() => {
    loadInitialData();

    apiService.connectWebSocket(
      (packet: TelemetryPacket) => {
        if (packet.readings) {
          setReadings(packet.readings);
        }
        setStatusData((prev) => ({
          ...prev,
          status: packet.status || prev.status,
          anomaly_score: packet.anomaly_score !== undefined ? packet.anomaly_score : prev.anomaly_score,
          is_electrical_hazard: packet.is_electrical_hazard || false,
          critical_factors: packet.critical_factors || [],
          recommended_actions: packet.recommended_actions || [],
          diagnostic_pattern: packet.diagnostic_pattern || prev.diagnostic_pattern,
          pattern_label: packet.pattern_label || prev.pattern_label,
          layer_breakdown: packet.layer_breakdown || prev.layer_breakdown,
          safety_disclaimer: packet.safety_disclaimer || prev.safety_disclaimer,
          ml_prediction: packet.ml_prediction || prev.ml_prediction,
          actuators: packet.actuators || prev.actuators
        }));
        if (packet.active_scenario && packet.active_scenario.id) {
          setActiveScenarioId(packet.active_scenario.id);
        }
      },
      (connected: boolean) => {
        setIsConnected(connected);
      }
    );

    return () => {
      apiService.disconnectWebSocket();
    };
  }, []);

  const loadInitialData = async () => {
    const status = await apiService.getStatus();
    if (status) {
      setStatusData(status);
      if (status.active_scenario) {
        setActiveScenarioId(status.active_scenario.id);
      }
    }
    const profile = await apiService.getUserProfile();
    if (profile && profile.user) {
      setAsaoUser(profile.user);
    }
    const scData = await apiService.getScenarios();
    if (scData && scData.scenarios) {
      setScenarios(scData.scenarios);
    }
    const samples = await apiService.getSamples(10);
    setPreservedSamples(samples);
    const alerts = await apiService.getAlerts(15);
    setAuditAlerts(alerts);
  };

  const handleAcknowledgeAlert = async (alertId: number) => {
    await apiService.acknowledgeAlert(alertId, asaoUser?.username || "techlead.asao");
    const alerts = await apiService.getAlerts(15);
    setAuditAlerts(alerts);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadInitialData();
    setRefreshing(false);
  }, []);

  const handleSaveServerConfig = (host: string, port: string) => {
    setServerHost(host);
    setServerPort(port);
    apiService.setServerAddress(host, port);
    loadInitialData();
    apiService.connectWebSocket(
      (packet: TelemetryPacket) => {
        if (packet.readings) setReadings(packet.readings);
        setStatusData((prev) => ({
          ...prev,
          status: packet.status || prev.status,
          anomaly_score: packet.anomaly_score || prev.anomaly_score,
          is_electrical_hazard: packet.is_electrical_hazard || false,
          critical_factors: packet.critical_factors || [],
          ml_prediction: packet.ml_prediction || prev.ml_prediction,
          actuators: packet.actuators || prev.actuators
        }));
      },
      (connected: boolean) => setIsConnected(connected)
    );
  };

  const handleSetValve = async (action: "OPEN" | "CLOSE") => {
    const res = await apiService.setValve(action);
    if (res && res.actuators) {
      setStatusData((prev) => ({ ...prev, actuators: res.actuators }));
    }
  };

  const handleTriggerSample = async () => {
    const res = await apiService.triggerSample();
    if (res && res.actuators) {
      setStatusData((prev) => ({ ...prev, actuators: res.actuators }));
    }
    const samples = await apiService.getSamples(10);
    setPreservedSamples(samples);
  };

  const handleResetSample = async () => {
    const res = await apiService.resetSample();
    if (res && res.actuators) {
      setStatusData((prev) => ({ ...prev, actuators: res.actuators }));
    }
    const samples = await apiService.getSamples(10);
    setPreservedSamples(samples);
  };

  const handleToggleAlarm = async () => {
    const currentMuted = statusData.actuators?.alarm_muted || false;
    const res = await apiService.setAlarm(!currentMuted);
    if (res && res.actuators) {
      setStatusData((prev) => ({ ...prev, actuators: res.actuators }));
    }
  };

  const handleActivateScenario = async (id: string) => {
    setActiveScenarioId(id);
    await apiService.activateScenario(id);
  };

  const handleResetBaseline = async () => {
    await apiService.resetBaseline();
    setActiveScenarioId("normal");
    loadInitialData();
  };

  const sensorKeys = Object.keys(SENSOR_DEFINITIONS);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0b0f19" />

      {/* ASAO ADR-0042 Top Dev Environment Ribbon */}
      <View style={styles.asaoDevRibbon}>
        <Text style={styles.asaoDevRibbonText}>
          ⚠️ [DEV] MÔI TRƯỜNG PHÁT TRIỂN • auth-dev.asao.vn • ADR-0042
        </Text>
      </View>

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Text style={styles.logoIcon}>💧</Text>
          <View>
            <View style={styles.titleWithBadge}>
              <Text style={styles.brandTitle}>WATER GUARDIAN</Text>
              <View style={[styles.devicePill, isTablet ? styles.deviceTablet : styles.devicePhone]}>
                <Text style={styles.deviceText}>{isTablet ? "📟 TABLET" : "📱 MOBILE"}</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>
              {asaoUser?.full_name ? `${asaoUser.full_name.split(' (')[0]} • Trạm Cầu Giấy` : "ASAO Tech Lead • Trạm Cầu Giấy"}
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {/* Connection Dot */}
          <View style={[styles.connPill, isConnected ? styles.connOnline : styles.connOffline]}>
            <View style={[styles.connDot, { backgroundColor: isConnected ? "#34d399" : "#f87171" }]} />
            <Text style={[styles.connText, { color: isConnected ? "#34d399" : "#f87171" }]}>
              {isConnected ? "LIVE" : "OFFLINE"}
            </Text>
          </View>

          {/* Config Settings Button */}
          <TouchableOpacity style={styles.settingsBtn} onPress={() => setConfigModalVisible(true)}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tablet Segmented Top Navigation Bar (Visible only when isTablet) */}
      {isTablet && (
        <View style={styles.tabletNavBar}>
          {[
            { id: "overview", label: "📊 Tổng Quan" },
            { id: "analytics", label: "🔬 Phân Tích 4 Lớp" },
            { id: "sensors", label: "🌊 Cảm Biến" },
            { id: "actuators", label: "🚰 Chấp Hành" },
            { id: "scenarios", label: "🎮 Kịch Bản" }
          ].map((tab) => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabletNavBtn, activeTab === tab.id && styles.tabletNavBtnActive]}
              onPress={() => setActiveTab(tab.id as TabType)}
            >
              <Text style={[styles.tabletNavText, activeTab === tab.id && styles.tabletNavTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Main Content Area */}
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.scrollContent,
          !isTablet && { paddingBottom: 85 } // Extra padding for floating bottom dock on phone
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#60a5fa" />
        }
      >
        {/* ================================================= */}
        {/* TAB 1: TỔNG QUAN (OVERVIEW)                      */}
        {/* ================================================= */}
        {activeTab === "overview" && (
          <View>
            {/* Status & Anomaly Banner */}
            <StatusBanner
              status={statusData.status}
              anomalyScore={statusData.anomaly_score}
              isLeak={statusData.is_electrical_hazard}
              factors={statusData.critical_factors}
              mlPrediction={statusData.ml_prediction}
            />

            {/* Quick 4 KPI Highlight Tiles */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiIcon}>⚗️</Text>
                <Text style={styles.kpiLabel}>pH Nước</Text>
                <Text style={styles.kpiValue}>
                  {readings.ph?.value !== undefined ? readings.ph.value.toFixed(2) : "7.20"}
                </Text>
                <Text style={styles.kpiSub}>WHO: 6.5 - 8.5</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiIcon}>⚡</Text>
                <Text style={styles.kpiLabel}>Dẫn Điện (EC)</Text>
                <Text style={styles.kpiValue}>
                  {readings.ec?.value !== undefined ? Math.round(readings.ec.value) : "420"}
                </Text>
                <Text style={styles.kpiSub}>µS/cm (&lt; 1000)</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiIcon}>🌫️</Text>
                <Text style={styles.kpiLabel}>Độ Đục</Text>
                <Text style={styles.kpiValue}>
                  {readings.turbidity?.value !== undefined ? readings.turbidity.value.toFixed(1) : "1.2"}
                </Text>
                <Text style={styles.kpiSub}>NTU (&lt; 2.0)</Text>
              </View>

              <View style={styles.kpiCard}>
                <Text style={styles.kpiIcon}>⚡</Text>
                <Text style={styles.kpiLabel}>An Toàn Điện</Text>
                <Text style={[styles.kpiValue, statusData.is_electrical_hazard && { color: "#f87171" }]}>
                  {statusData.is_electrical_hazard ? "LEAK!" : "SAFE"}
                </Text>
                <Text style={styles.kpiSub}>RCBO ngắt dòng</Text>
              </View>
            </View>

            {/* Quick Actuator Controls */}
            <ActuatorsPanel
              actuators={statusData.actuators}
              onSetValve={handleSetValve}
              onTriggerSample={handleTriggerSample}
              onResetSample={handleResetSample}
              onToggleAlarm={handleToggleAlarm}
            />

            {/* Quick Scenario Selector Bar */}
            <View style={styles.scenarioBarSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>🧪 Kịch Bản Mô Phỏng Đang Chạy:</Text>
                <TouchableOpacity onPress={handleResetBaseline}>
                  <Text style={styles.resetBtnText}>🔄 Reset Baseline</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scenarioScroll}>
                {[
                  { id: "normal", name: "🟢 Bình thường" },
                  { id: "muddy_water", name: "🟤 Nước đục" },
                  { id: "acid_contamination", name: "🧪 Axit hóa" },
                  { id: "salt_spike", name: "🧂 Nhiễm mặn" },
                  { id: "ammonia_spike", name: "☣️ Amoni cao" },
                  { id: "electrical_leak", name: "⚡ Rò điện" },
                  { id: "mixed_contamination", name: "🚨 Phức hợp" }
                ].map((sc) => (
                  <TouchableOpacity
                    key={sc.id}
                    style={[styles.scenarioChip, activeScenarioId === sc.id && styles.scenarioChipActive]}
                    onPress={() => handleActivateScenario(sc.id)}
                  >
                    <Text style={[styles.scenarioChipText, activeScenarioId === sc.id && styles.scenarioChipTextActive]}>
                      {sc.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Recent Audit Alert Notice */}
            {auditAlerts.length > 0 && (
              <View style={styles.alertNoticeBox}>
                <Text style={styles.alertNoticeTitle}>🔔 Cảnh Báo Gần Nhất:</Text>
                <Text style={styles.alertNoticeText} numberOfLines={2}>
                  [{auditAlerts[0].severity}] {auditAlerts[0].title}: {auditAlerts[0].message}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ================================================= */}
        {/* TAB 2: PHÂN TÍCH 4 LỚP (ANALYTICS)               */}
        {/* ================================================= */}
        {activeTab === "analytics" && (
          <View>
            <LayerAnalysisCard
              layerBreakdown={statusData.layer_breakdown}
              patternLabel={statusData.pattern_label}
              diagnosticPattern={statusData.diagnostic_pattern}
              disclaimer={statusData.safety_disclaimer}
            />

            {/* Technical Architecture Info */}
            <View style={styles.cardBox}>
              <Text style={styles.cardBoxTitle}>📐 Nguyên Lý 4 Lớp Bảo Vệ Nguồn Nước</Text>
              <Text style={styles.cardBoxDesc}>
                1. <Text style={styles.boldText}>Lớp 1 (Quy tắc):</Text> Giới hạn WHO/QCVN & An toàn rò điện dòng ngắt tức thì.{"\n"}
                2. <Text style={styles.boldText}>Lớp 2 (Thống kê động):</Text> Theo dõi độ lệch Z-Score và tốc độ biến thiên dV/dt phát hiện trôi dạt.{"\n"}
                3. <Text style={styles.boldText}>Lớp 3 (Unsupervised ML):</Text> Isolation Forest AUC 0.999 + Autoencoder phát hiện tương quan ẩn.{"\n"}
                4. <Text style={styles.boldText}>Lớp 4 (Hình thái ô nhiễm):</Text> Định danh nguyên nhân: Nước đục, Axit hóa, Mất clo, Amoni, Nhiễm mặn, Rò điện.
              </Text>
            </View>
          </View>
        )}

        {/* ================================================= */}
        {/* TAB 3: CẢM BIẾN (SENSORS LAB)                     */}
        {/* ================================================= */}
        {activeTab === "sensors" && (
          <View>
            <View style={styles.metricsHeader}>
              <Text style={styles.metricsTitle}>📊 10 Cảm Biến Đo Trực Tiếp (Sensor Array)</Text>
              <Text style={styles.metricsSub}>ADC 0-3.3V &bull; Chuẩn hóa 1Hz</Text>
            </View>

            <View style={styles.sensorGrid}>
              {sensorKeys.map((key) => (
                <SensorCard
                  key={key}
                  sensorKey={key}
                  reading={readings[key]}
                  cardWidth={isTablet ? "31.5%" : "48%"}
                />
              ))}
            </View>
          </View>
        )}

        {/* ================================================= */}
        {/* TAB 4: CHẤP HÀNH & SỰ CỐ (ACTUATORS VAULT)        */}
        {/* ================================================= */}
        {activeTab === "actuators" && (
          <View>
            <ActuatorsPanel
              actuators={statusData.actuators}
              onSetValve={handleSetValve}
              onTriggerSample={handleTriggerSample}
              onResetSample={handleResetSample}
              onToggleAlarm={handleToggleAlarm}
            />

            {/* Preserved Samples Vault */}
            <View style={styles.cardBox}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.cardBoxTitle}>🧫 Kho Mẫu Nước Niêm Phong (Sample Vault)</Text>
                <TouchableOpacity onPress={async () => setPreservedSamples(await apiService.getSamples(10))}>
                  <Text style={styles.resetBtnText}>🔄 Làm mới</Text>
                </TouchableOpacity>
              </View>

              {preservedSamples.length === 0 ? (
                <Text style={styles.emptyText}>Chưa có mẫu nước nào được kích hoạt lưu trữ.</Text>
              ) : (
                preservedSamples.map((s, idx) => (
                  <View key={idx} style={styles.sampleItem}>
                    <View style={styles.sampleTopRow}>
                      <Text style={styles.sampleId}>{s.sample_id}</Text>
                      <Text style={styles.sampleScore}>{s.anomaly_score}% DỊ THƯỜNG</Text>
                    </View>
                    <Text style={styles.sampleReason}>{s.reason}</Text>
                    <View style={styles.sampleSealedRow}>
                      <Text style={styles.sampleSealedText}>👤 Niêm phong: {s.sealed_by_user || 'techlead.asao'}</Text>
                      <Text style={styles.sampleTime}>{new Date(s.timestamp).toLocaleTimeString()}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Incident Audit Logs */}
            <View style={styles.cardBox}>
              <Text style={styles.cardBoxTitle}>📜 Nhật Ký Sự Kiện Can Thiệp (Audit Log)</Text>
              {auditAlerts.map((a, idx) => (
                <View key={idx} style={styles.alertItem}>
                  <View style={styles.alertTopRow}>
                    <Text style={styles.alertTime}>{new Date(a.timestamp).toLocaleTimeString()} &bull; [{a.severity}]</Text>
                    {a.acknowledged_by ? (
                      <Text style={styles.ackBadge}>✓ Đã xác nhận: {a.acknowledged_by}</Text>
                    ) : (
                      <TouchableOpacity style={styles.ackBtn} onPress={() => handleAcknowledgeAlert(a.id)}>
                        <Text style={styles.ackBtnText}>✔ Xác nhận</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.alertTitle}>{a.title}</Text>
                  <Text style={styles.alertDesc}>{a.message}</Text>
                  {a.action_taken && <Text style={styles.alertAction}>⚡ {a.action_taken}</Text>}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ================================================= */}
        {/* TAB 5: KỊCH BẢN (SCENARIO LAB)                    */}
        {/* ================================================= */}
        {activeTab === "scenarios" && (
          <View>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.metricsTitle}>🎮 11 Kịch Bản Thử Nghiệm Mô Phỏng</Text>
              <TouchableOpacity onPress={handleResetBaseline}>
                <Text style={styles.resetBtnText}>🔄 Reset Baseline</Text>
              </TouchableOpacity>
            </View>

            {scenarios.map((sc) => (
              <TouchableOpacity
                key={sc.id}
                style={[styles.scenarioCard, activeScenarioId === sc.id && styles.scenarioCardActive]}
                onPress={() => handleActivateScenario(sc.id)}
              >
                <View style={styles.scenarioCardHeader}>
                  <Text style={styles.scenarioCardTitle}>{sc.name}</Text>
                  {activeScenarioId === sc.id && (
                    <View style={styles.activeBadge}>
                      <Text style={styles.activeBadgeText}>ACTIVE</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.scenarioCardDesc}>{sc.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Mobile Floating Bottom Dock Navigation (Only on phone width) */}
      {!isTablet && (
        <View style={styles.dockBar}>
          {[
            { id: "overview", icon: "📊", label: "Tổng Quan" },
            { id: "analytics", icon: "🔬", label: "Phân Tích" },
            { id: "sensors", icon: "🌊", label: "Cảm Biến" },
            { id: "actuators", icon: "🚰", label: "Chấp Hành" },
            { id: "scenarios", icon: "🎮", label: "Kịch Bản" }
          ].map((item) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.dockItem, activeTab === item.id && styles.dockItemActive]}
              onPress={() => setActiveTab(item.id as TabType)}
            >
              <Text style={styles.dockIcon}>{item.icon}</Text>
              <Text style={[styles.dockLabel, activeTab === item.id && styles.dockLabelActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Server IP Config Modal */}
      <ServerConfigModal
        visible={configModalVisible}
        currentHost={serverHost}
        currentPort={serverPort}
        onClose={() => setConfigModalVisible(false)}
        onSave={handleSaveServerConfig}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0b0f19"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)"
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center"
  },
  logoIcon: {
    fontSize: 24,
    marginRight: 8
  },
  titleWithBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#60a5fa",
    letterSpacing: 0.5
  },
  devicePill: {
    paddingVertical: 1,
    paddingHorizontal: 5,
    borderRadius: 4
  },
  devicePhone: {
    backgroundColor: "rgba(59, 130, 246, 0.15)"
  },
  deviceTablet: {
    backgroundColor: "rgba(168, 85, 247, 0.2)"
  },
  deviceText: {
    fontSize: 8.5,
    fontWeight: "800",
    color: "#93c5fd"
  },
  brandSubtitle: {
    fontSize: 10,
    color: "#6b7280"
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  connPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1
  },
  connOnline: {
    backgroundColor: "rgba(16, 185, 129, 0.12)",
    borderColor: "rgba(16, 185, 129, 0.3)"
  },
  connOffline: {
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "rgba(239, 68, 68, 0.3)"
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5
  },
  connText: {
    fontSize: 10,
    fontWeight: "700"
  },
  settingsBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.05)"
  },
  settingsIcon: {
    fontSize: 14
  },
  tabletNavBar: {
    flexDirection: "row",
    backgroundColor: "rgba(17, 24, 39, 0.9)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.08)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6
  },
  tabletNavBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.03)"
  },
  tabletNavBtnActive: {
    backgroundColor: "rgba(59, 130, 246, 0.25)",
    borderWidth: 1,
    borderColor: "#3b82f6"
  },
  tabletNavText: {
    fontSize: 12,
    color: "#9ca3af",
    fontWeight: "600"
  },
  tabletNavTextActive: {
    color: "#93c5fd",
    fontWeight: "800"
  },
  container: {
    flex: 1
  },
  scrollContent: {
    padding: 14
  },
  kpiRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 6
  },
  kpiCard: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 8,
    alignItems: "center"
  },
  kpiIcon: {
    fontSize: 14
  },
  kpiLabel: {
    fontSize: 9,
    color: "#9ca3af",
    fontWeight: "700",
    marginTop: 2
  },
  kpiValue: {
    fontSize: 14,
    fontWeight: "900",
    color: "#f9fafb",
    marginTop: 2
  },
  kpiSub: {
    fontSize: 8,
    color: "#6b7280",
    marginTop: 2
  },
  scenarioBarSection: {
    marginBottom: 14
  },
  sectionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9ca3af"
  },
  resetBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#60a5fa"
  },
  scenarioScroll: {
    flexDirection: "row"
  },
  scenarioChip: {
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginRight: 8
  },
  scenarioChipActive: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderColor: "#3b82f6"
  },
  scenarioChipText: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "600"
  },
  scenarioChipTextActive: {
    color: "#93c5fd",
    fontWeight: "700"
  },
  alertNoticeBox: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
    borderLeftWidth: 3,
    borderLeftColor: "#f59e0b",
    borderRadius: 8,
    padding: 10,
    marginBottom: 14
  },
  alertNoticeTitle: {
    fontSize: 11,
    fontWeight: "800",
    color: "#fbbf24"
  },
  alertNoticeText: {
    fontSize: 11,
    color: "#fef3c7",
    marginTop: 2
  },
  metricsHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 10
  },
  metricsTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#d1d5db"
  },
  metricsSub: {
    fontSize: 10,
    color: "#6b7280"
  },
  sensorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between"
  },
  cardBox: {
    backgroundColor: "rgba(17, 24, 39, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12
  },
  cardBoxTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#f3f4f6",
    marginBottom: 8
  },
  cardBoxDesc: {
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 18
  },
  boldText: {
    fontWeight: "700",
    color: "#d1d5db"
  },
  emptyText: {
    fontSize: 11,
    color: "#6b7280"
  },
  sampleItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)"
  },
  sampleTopRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  sampleId: {
    fontSize: 11,
    fontWeight: "800",
    color: "#60a5fa",
    fontFamily: "monospace"
  },
  sampleScore: {
    fontSize: 10,
    fontWeight: "800",
    color: "#f87171"
  },
  sampleReason: {
    fontSize: 11,
    color: "#e5e7eb",
    marginTop: 2
  },
  sampleTime: {
    fontSize: 9,
    color: "#6b7280",
    marginTop: 2
  },
  alertItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.05)"
  },
  alertTime: {
    fontSize: 9,
    color: "#6b7280"
  },
  alertTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#f9fafb",
    marginTop: 1
  },
  alertDesc: {
    fontSize: 10.5,
    color: "#9ca3af",
    marginTop: 1
  },
  alertAction: {
    fontSize: 10,
    color: "#60a5fa",
    marginTop: 2
  },
  scenarioCard: {
    backgroundColor: "rgba(17, 24, 39, 0.75)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: 12,
    marginBottom: 8
  },
  scenarioCardActive: {
    borderColor: "#3b82f6",
    backgroundColor: "rgba(59, 130, 246, 0.12)"
  },
  scenarioCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4
  },
  scenarioCardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#f9fafb"
  },
  activeBadge: {
    backgroundColor: "rgba(59, 130, 246, 0.25)",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: "#93c5fd"
  },
  scenarioCardDesc: {
    fontSize: 10.5,
    color: "#9ca3af",
    lineHeight: 14
  },
  dockBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    backgroundColor: "rgba(11, 15, 25, 0.95)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: "space-around",
    alignItems: "center"
  },
  dockItem: {
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8
  },
  dockItemActive: {},
  dockIcon: {
    fontSize: 18
  },
  dockLabel: {
    fontSize: 9,
    color: "#6b7280",
    fontWeight: "700",
    marginTop: 2
  },
  dockLabelActive: {
    color: "#60a5fa"
  },
  asaoDevRibbon: {
    backgroundColor: "#78350f",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#b45309",
    alignItems: "center",
    justifyContent: "center"
  },
  asaoDevRibbonText: {
    color: "#fef3c7",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.2
  },
  sampleSealedRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 4
  },
  sampleSealedText: {
    fontSize: 10,
    color: "#38bdf8",
    fontWeight: "700"
  },
  alertTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2
  },
  ackBadge: {
    fontSize: 9.5,
    color: "#34d399",
    fontWeight: "800",
    backgroundColor: "rgba(52, 211, 153, 0.15)",
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 4
  },
  ackBtn: {
    backgroundColor: "rgba(52, 211, 153, 0.2)",
    borderWidth: 1,
    borderColor: "#34d399",
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4
  },
  ackBtnText: {
    fontSize: 9.5,
    color: "#34d399",
    fontWeight: "800"
  }
});
