/**
 * Smart Water Guardian - Web Dashboard Controller (Pure Automatic Responsive)
 */

let ws = null;
let chart = null;
let currentActuators = {};
let currentActiveScenario = "normal";
let selectedSensorForConfig = null;
let activeAuditFilter = "ALL";
let cachedAlerts = [];
let lastSeenStatus = "NORMAL";

function getThemePalette() {
  const style = getComputedStyle(document.documentElement);
  const read = name => style.getPropertyValue(name).trim();
  return { blue: read('--accent-blue'), cyan: read('--accent-cyan'), red: read('--accent-red'),
    green: read('--accent-green'), yellow: read('--accent-yellow'),
    text: read('--text-primary'), muted: read('--text-muted'), border: read('--border-color'), surface: read('--bg-card') };
}

function applyChartTheme() {
  if (!chart) return;
  const p = getThemePalette();
  chart.data.datasets.forEach((dataset, i) => {
    dataset.borderColor = [p.red, p.blue, p.yellow, p.cyan][i];
    dataset.backgroundColor = 'transparent';
  });
  chart.options.plugins.legend.labels.color = p.muted;
  Object.assign(chart.options.plugins.tooltip, { backgroundColor: p.surface,
    titleColor: p.text, bodyColor: p.text, borderColor: p.border, borderWidth: 1 });
  Object.entries(chart.options.scales).forEach(([name, scale]) => {
    scale.ticks.color = name === 'yAnomaly' ? p.red : p.muted;
    scale.grid.color = p.border;
  });
  chart.update('none');
}

function setupTheme() {
  const button = document.getElementById('themeToggle');
  const label = document.getElementById('themeLabel');
  if (!button || !label) return;
  function sync() {
    const dark = document.documentElement.dataset.theme === 'dark';
    label.textContent = dark ? 'Tối' : 'Sáng';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối');
  }
  sync();
  button.addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('swg-theme', theme); } catch { /* The switch also works without storage. */ }
    sync();
    applyChartTheme();
  });
}

// Sensor Historical Data Buffers for SVG Sparklines (last 12 points)
const sensorSparklines = {};

// Metadata and Standards
const SENSOR_META = {
  ph: { label: "Độ pH", icon: "", unit: "pH", nominal: 7.20, limits: "6.5 - 8.5", maxVal: 14 },
  ec: { label: "Độ dẫn điện", icon: "", unit: "µS/cm", nominal: 420, limits: "< 1000", maxVal: 2000 },
  tds: { label: "Chất rắn hòa tan", icon: "", unit: "ppm", nominal: 210, limits: "< 500", maxVal: 1000 },
  turbidity: { label: "Độ đục", icon: "", unit: "NTU", nominal: 1.2, limits: "< 2.0", maxVal: 100 },
  orp: { label: "Thế oxy hóa", icon: "", unit: "mV", nominal: 450, limits: "> 300", maxVal: 1000 },
  chlorine: { label: "Clo dư", icon: "", unit: "mg/L", nominal: 0.65, limits: "0.2 - 1.0", maxVal: 5.0 },
  temperature: { label: "Nhiệt độ", icon: "", unit: "°C", nominal: 26.5, limits: "15 - 35", maxVal: 50 },
  nh4: { label: "Amoni (NH4+)", icon: "", unit: "mg/L", nominal: 0.05, limits: "< 0.3", maxVal: 10.0 },
  no3: { label: "Nitrat (NO3-)", icon: "", unit: "mg/L", nominal: 8.0, limits: "< 50.0", maxVal: 100.0 },
  electrical_leak: { label: "Rò điện", icon: "", unit: "mA", nominal: 0.0, limits: "0.0 mA", maxVal: 5.0 }
};

let currentAsaoUser = null;
let currentDeviceId = "water-guardian-node-01";
let chartMaxPoints = 35;
let isViewingDbHistory = false;

// Initialize sparkline buffers
Object.keys(SENSOR_META).forEach(k => {
  sensorSparklines[k] = [SENSOR_META[k].nominal, SENSOR_META[k].nominal];
});

// Initialize on DOM load
document.addEventListener("DOMContentLoaded", () => {
  setupTheme();
  loadUserProfile();
  initChart();
  connectWebSocket();
  loadScenarios();
  loadRecentAlerts();
  loadPreservedSamples();
  setupKeyboardShortcuts();
});

// =========================================================
// 0. ASAO MULTI-TENANT IAM & USER PROFILE
// =========================================================
async function loadUserProfile() {
  try {
    const res = await fetch("/api/auth/me");
    if (!res.ok) return;
    const data = await res.json();
    currentAsaoUser = data.user;

    const userNameElem = document.getElementById("userName");
    const userRoleElem = document.getElementById("userRole");
    const userAvatarElem = document.getElementById("userAvatar");
    const personaSelector = document.getElementById("personaSelector");
    const nodeSelector = document.getElementById("nodeSelector");
    const ribbonText = document.getElementById("ribbonText");

    if (userNameElem && currentAsaoUser) {
      userNameElem.innerText = currentAsaoUser.full_name || currentAsaoUser.username;
    }
    if (userRoleElem && currentAsaoUser && currentAsaoUser.roles) {
      const topRole = currentAsaoUser.roles[0] || "OPERATOR";
      userRoleElem.innerText = topRole.replace("asao-", "").replace("water-", "").toUpperCase();
    }
    if (personaSelector && currentAsaoUser) {
      personaSelector.value = currentAsaoUser.id;
    }
    if (ribbonText && data.dev_environment && data.dev_environment.ribbon_text) {
      ribbonText.innerHTML = `<strong>Mô phỏng</strong> &nbsp;·&nbsp; Dữ liệu thử nghiệm nội bộ`;
    }

    // Populate node selector with user devices
    if (nodeSelector && data.devices && data.devices.length > 0) {
      nodeSelector.innerHTML = "";
      data.devices.forEach(dev => {
        const opt = document.createElement("option");
        opt.value = dev.device_id;
        opt.innerText = `${dev.device_name}`;
        if (dev.device_id === currentDeviceId) opt.selected = true;
        nodeSelector.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn("Failed to load ASAO user profile:", e);
  }
}

async function switchPersona(userId) {
  try {
    const res = await fetch("/api/auth/switch-persona", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId })
    });
    if (res.ok) {
      await loadUserProfile();
      loadRecentAlerts();
      loadPreservedSamples();
    }
  } catch (e) {
    console.error("Failed to switch persona:", e);
  }
}

function switchDeviceNode(deviceId) {
  currentDeviceId = deviceId;
  console.log(`Switched active node to: ${deviceId}`);
  loadRecentAlerts();
  loadPreservedSamples();
  if (isViewingDbHistory) {
    fetchDbHistory(100);
  }
}

// =========================================================
// 1. TAB SWITCHING SYSTEM (5 Synchronized Tabs)
// =========================================================
function switchTab(tabId) {
  // Hide all tab panes
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.remove("active");
  });

  // Deactivate all top navigation buttons
  document.querySelectorAll(".nav-tab").forEach(tab => {
    tab.classList.remove("active");
    if (tab.getAttribute("data-tab") === tabId) {
      tab.classList.add("active");
    }
  });

  // Deactivate all mobile dock buttons
  document.querySelectorAll(".dock-nav-item").forEach(item => {
    item.classList.remove("active");
    if (item.getAttribute("data-tab") === tabId) {
      item.classList.add("active");
    }
  });

  // Show target tab pane
  const targetPane = document.getElementById(tabId);
  if (targetPane) {
    targetPane.classList.add("active");
  }

  // If switched to overview, resize Chart.js so it fits container
  if (tabId === "tab-overview" && chart) {
    setTimeout(() => chart.resize(), 150);
  }

  // Scroll to top of container smoothly
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// =========================================================
// 2. CHART.JS REALTIME TREND
// =========================================================
function initChart() {
  const canvas = document.getElementById('liveChart');
  if (!canvas) return;
  chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: [], datasets: [
      { label: 'Bất thường (%)', data: [], yAxisID: 'yAnomaly' },
      { label: 'pH', data: [], yAxisID: 'yMetrics' },
      { label: 'Độ đục (NTU)', data: [], yAxisID: 'yMetrics' },
      { label: 'Clo dư (×10)', data: [], yAxisID: 'yMetrics' }
    ].map(dataset => ({ ...dataset, borderWidth: 1.6, tension: .25, pointRadius: 0,
      pointHitRadius: 10, fill: false })) },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', align: 'start', labels: {
          font: { size: 10, family: 'Segoe UI, Arial, sans-serif' },
          boxWidth: 14, boxHeight: 2, padding: 18
        } },
        tooltip: { padding: 10, cornerRadius: 4 }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 6, maxRotation: 0, font: { size: 10 } } },
        yAnomaly: { position: 'right', min: 0, max: 100,
          grid: { drawOnChartArea: false }, ticks: { callback: value => `${value}%`, font: { size: 10 } } },
        yMetrics: { position: 'left', beginAtZero: true, ticks: { maxTicksLimit: 6, font: { size: 10 } } }
      }
    }
  });
  applyChartTheme();
}

function connectWebSocket() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws/live`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    updateConnBadge(true);
  };

  ws.onclose = () => {
    updateConnBadge(false);
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    ws.close();
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleLiveUpdate(data);
    } catch (e) {
      console.error("Failed to parse live packet:", e);
    }
  };
}

function updateConnBadge(online) {
  const badge = document.getElementById("connBadge");
  const text = document.getElementById("connText");
  if (badge && text) {
    if (online) {
      badge.className = "badge badge-live";
      text.innerText = "Đã kết nối";
    } else {
      badge.className = "badge badge-fault";
      text.innerText = "Đang kết nối lại";
    }
  }
}

// =========================================================
// 4. PROCESS REALTIME TELEMETRY STREAM
// =========================================================
function handleLiveUpdate(data) {
  const readings = data.readings || {};
  const score = data.anomaly_score || 0;
  const status = data.status || "NORMAL";
  const factors = data.critical_factors || [];
  const actuators = data.actuators || {};
  currentActuators = actuators;

  if (data.active_scenario && data.active_scenario.id) {
    currentActiveScenario = data.active_scenario.id;
    highlightActiveScenario(currentActiveScenario);
  }

  // Refresh alerts if system transitioned to a new state
  if (status !== lastSeenStatus) {
    lastSeenStatus = status;
    loadRecentAlerts();
  }

  // Update SVG sparklines buffer
  Object.keys(SENSOR_META).forEach(key => {
    if (readings[key] && readings[key].value !== undefined) {
      if (!sensorSparklines[key]) sensorSparklines[key] = [];
      sensorSparklines[key].push(readings[key].value);
      if (sensorSparklines[key].length > 12) {
        sensorSparklines[key].shift();
      }
    }
  });

  // 1. Status Banner & Radial Anomaly Gauge
  updateStatusBanner(status, score, factors, data.is_electrical_hazard);
  updateRadialGauge(score, data.is_electrical_hazard);

  // 2. ML Prediction & 4-Layer Sentinel Analytics
  updateMLPrediction(data.ml_prediction);
  update4LayerAnalysis(data);

  // 3. Quick KPI Highlights (Overview)
  updateQuickKPIs(readings, data.is_electrical_hazard);

  // 4. Quick Actuators & Dedicated Actuators Tab
  updateActuators(actuators);

  // 5. 10 Sensor Cards with Sparklines & ADC Voltages
  updateSensorsGrid(readings, data.sensor_diagnostics || {});

  // 6. Analytics Table Comparison Matrix
  updateAnalyticsTable(readings, data.sensor_diagnostics || {});

  // 7. Realtime Multi-Parameter Trend Chart
  updateChart(data.timestamp, score, readings);
}

// Update Status Banner
function updateStatusBanner(status, score, factors, isLeak) {
  const banner = document.getElementById("statusBanner");
  const title = document.getElementById("statusTitle");
  const desc = document.getElementById("statusDesc");
  const icon = document.getElementById("statusIcon");
  const tag = document.getElementById("statusTag");
  const factorsList = document.getElementById("factorsList");
  const leakText = document.getElementById("leakStatusText");

  if (!banner) return;
  banner.className = "status-banner";

  if (isLeak || status === "ELECTRICAL HAZARD") {
    banner.classList.add("electrical-hazard");
    icon.innerText = "";
    tag.innerText = "NGUY CƠ AN TOÀN ĐIỆN KHẨN CẤP";
    tag.style.color = "var(--accent-red)";
    title.innerText = "Phát hiện rò điện";
    desc.innerText = "CẢNH BÁO NGUY HIỂM TÍNH MẠNG: Phát hiện điện áp rò rỉ vào buồng nước! Ngắt ngay RCBO nguồn cấp, không chạm vào bồn chứa!";
    if (leakText) {
      leakText.innerText = "Phát hiện rò điện";
      leakText.style.color = "var(--accent-red)";
    }
  } else if (status === "SUSPECTED CONTAMINATION") {
    banner.classList.add("suspected-contamination");
    icon.innerText = "";
    tag.innerText = "PHÁT HIỆN BIẾN ĐỘNG NGUY CƠ CAO";
    tag.style.color = "var(--accent-red)";
    title.innerText = "Nghi ngờ ô nhiễm nguồn nước";
    desc.innerText = "Nhiều thông số vượt ngưỡng cơ sở nghiêm trọng. Hệ thống đã tự động khóa van cấp và kích hoạt ống nghiệm lưu mẫu!";
    if (leakText) {
      leakText.innerText = "Không phát hiện";
      leakText.style.color = "var(--accent-green)";
    }
  } else if (status === "ABNORMAL") {
    banner.classList.add("abnormal");
    icon.innerText = "";
    tag.innerText = "CHẤT LƯỢNG NƯỚC BẤT THƯỜNG";
    tag.style.color = "var(--accent-yellow)";
    title.innerText = "Chỉ số biến động bất thường";
    desc.innerText = "Chất lượng nguồn nước lệch đáng kể khỏi ngưỡng baseline thông thường. Cần kiểm tra hệ thống lọc và tiền xử lý.";
    if (leakText) {
      leakText.innerText = "Không phát hiện";
      leakText.style.color = "var(--accent-green)";
    }
  } else if (status === "WARNING") {
    banner.classList.add("warning");
    icon.innerText = "";
    tag.innerText = "CẢNH BÁO TRÔI DẠT";
    tag.style.color = "var(--accent-yellow)";
    title.innerText = "Cần theo dõi thêm";
    desc.innerText = "Một số chỉ số lệch nhẹ so với giá trị tham chiếu.";
    if (leakText) {
      leakText.innerText = "Không phát hiện";
      leakText.style.color = "var(--accent-green)";
    }
  } else {
    banner.classList.add("normal");
    icon.innerText = "";
    tag.innerText = "TRẠNG THÁI HỆ THỐNG";
    tag.style.color = "var(--accent-green)";
    title.innerText = "Các chỉ số ổn định";
    desc.innerText = "Chưa ghi nhận chỉ số vượt giới hạn theo dõi.";
    if (leakText) {
      leakText.innerText = "Không phát hiện";
      leakText.style.color = "var(--accent-green)";
    }
  }

  // Update Factors Pills
  if (factorsList) {
    factorsList.innerHTML = "";
    if (factors.length === 0) {
      factorsList.innerHTML = `<span class="factor-pill">Tham chiếu: Nước máy đô thị</span>`;
    } else {
      factors.slice(0, 4).forEach(f => {
        const pill = document.createElement("span");
        pill.className = "factor-pill";
        pill.innerText = f;
        factorsList.appendChild(pill);
      });
    }
  }
}

// Update Radial Anomaly Gauge
function updateRadialGauge(score, isLeak) {
  const gaugeProgress = document.getElementById("gaugeProgress");
  const gaugeScore = document.getElementById("gaugeScore");
  if (!gaugeProgress || !gaugeScore) return;

  const radius = 45;
  const circumference = 2 * Math.PI * radius; // ~283

  const displayScore = isLeak ? 100 : Math.min(100, Math.max(0, score));
  const offset = circumference - (displayScore / 100) * circumference;

  gaugeProgress.style.strokeDashoffset = offset;
  gaugeScore.innerText = `${Math.round(displayScore)}%`;

  if (isLeak) {
    gaugeProgress.style.stroke = "var(--accent-red)";
  } else if (displayScore >= 80) {
    gaugeProgress.style.stroke = "var(--accent-red)";
  } else if (displayScore >= 65) {
    gaugeProgress.style.stroke = "var(--accent-yellow)";
  } else if (displayScore >= 35) {
    gaugeProgress.style.stroke = "var(--accent-yellow)";
  } else {
    gaugeProgress.style.stroke = "var(--accent-green)";
  }
}

// Update Quick 4 KPIs
function updateQuickKPIs(readings, isLeak) {
  const phR = readings.ph || { value: 7.20 };
  const ecR = readings.ec || { value: 420 };
  const turbR = readings.turbidity || { value: 1.2 };
  const leakR = readings.electrical_leak || { value: 0 };

  // pH
  const phVal = document.getElementById("kpiPhVal");
  const phBadge = document.getElementById("kpiPhBadge");
  if (phVal) phVal.innerText = phR.value.toFixed(2);
  if (phBadge) {
    if (phR.value < 6.5 || phR.value > 8.5) {
      phBadge.className = "badge badge-fault kpi-badge";
      phBadge.innerText = "Lệch ngưỡng";
    } else {
      phBadge.className = "badge badge-live kpi-badge";
      phBadge.innerText = "OK";
    }
  }

  // EC
  const ecVal = document.getElementById("kpiEcVal");
  const ecBadge = document.getElementById("kpiEcBadge");
  if (ecVal) ecVal.innerText = Math.round(ecR.value);
  if (ecBadge) {
    if (ecR.value > 1000) {
      ecBadge.className = "badge badge-warning kpi-badge";
      ecBadge.innerText = "CAO";
    } else {
      ecBadge.className = "badge badge-live kpi-badge";
      ecBadge.innerText = "OK";
    }
  }

  // Turbidity
  const turbVal = document.getElementById("kpiTurbidityVal");
  const turbBadge = document.getElementById("kpiTurbidityBadge");
  if (turbVal) turbVal.innerText = turbR.value.toFixed(1);
  if (turbBadge) {
    if (turbR.value > 2.0) {
      turbBadge.className = "badge badge-fault kpi-badge";
      turbBadge.innerText = "ĐỤC";
    } else {
      turbBadge.className = "badge badge-live kpi-badge";
      turbBadge.innerText = "OK";
    }
  }

  // Leak
  const leakVal = document.getElementById("kpiLeakVal");
  const leakBadge = document.getElementById("kpiLeakBadge");
  if (leakVal && leakBadge) {
    if (isLeak || leakR.value > 0.5) {
      leakVal.innerText = "RÒ ĐIỆN!";
      leakVal.style.color = "var(--accent-red)";
      leakBadge.className = "badge badge-emergency kpi-badge";
      leakBadge.innerText = "HAZARD";
    } else {
      leakVal.innerText = "SAFE";
      leakVal.style.color = "var(--accent-green)";
      leakBadge.className = "badge badge-live kpi-badge";
      leakBadge.innerText = "AN TOÀN";
    }
  }
}

// Update 4-Layer Water Safety Analysis Card
function update4LayerAnalysis(data) {
  const lb = data.layer_breakdown;
  const patternBadgeBig = document.getElementById("patternBadgeBig");
  const patternNavBadge = document.getElementById("patternNavBadge");
  const layer1Badge = document.getElementById("layer1Badge");
  const layer1Content = document.getElementById("layer1Content");
  const layer2Badge = document.getElementById("layer2Badge");
  const layer2Content = document.getElementById("layer2Content");
  const layer3Badge = document.getElementById("layer3Badge");
  const layer3Content = document.getElementById("layer3Content");
  const layer4Badge = document.getElementById("layer4Badge");
  const layer4Content = document.getElementById("layer4Content");
  const disclaimerNotice = document.getElementById("disclaimerNotice");

  if (data.safety_disclaimer && disclaimerNotice) {
    disclaimerNotice.innerText = data.safety_disclaimer;
  }

  // Diagnostic Pattern
  const patternLabel = data.pattern_label || lb?.layer4_classification?.pattern_label || "Bình thường";
  const pattern = data.diagnostic_pattern || lb?.layer4_classification?.pattern || "NORMAL";

  if (patternNavBadge) {
    patternNavBadge.innerText = pattern;
  }

  if (patternBadgeBig) {
    if (pattern === "NORMAL") {
      patternBadgeBig.style.background = "rgba(52, 211, 153, 0.15)";
      patternBadgeBig.style.color = "var(--accent-green)";
      patternBadgeBig.style.border = "1px solid rgba(52, 211, 153, 0.3)";
    } else if (pattern === "ELECTRICAL_HAZARD") {
      patternBadgeBig.style.background = "rgba(239, 68, 68, 0.25)";
      patternBadgeBig.style.color = "var(--accent-red)";
      patternBadgeBig.style.border = "1px solid rgba(239, 68, 68, 0.5)";
    } else {
      patternBadgeBig.style.background = "rgba(245, 158, 11, 0.18)";
      patternBadgeBig.style.color = "var(--accent-yellow)";
      patternBadgeBig.style.border = "1px solid rgba(245, 158, 11, 0.4)";
    }
    patternBadgeBig.innerHTML = `<strong>Nhận định:</strong> ${patternLabel}`;
  }

  if (!lb) return;

  // Layer 1: Rules
  if (layer1Badge && layer1Content) {
    const l1 = lb.layer1_rules;
    if (l1.is_hazard) {
      layer1Badge.className = "badge badge-emergency";
      layer1Badge.innerText = "NGUY HIỂM ĐIỆN";
      layer1Content.innerHTML = `<span style="color: var(--accent-red); font-weight: 700;"> Cảm biến an toàn điện kích hoạt dòng rò (>0.5mA). Tự động cắt van cấp nước tức thì.</span>`;
    } else if (l1.triggered) {
      layer1Badge.className = "badge badge-warning";
      layer1Badge.innerText = `${l1.violations.length} VI PHẠM`;
      layer1Content.innerHTML = `<span style="color: var(--accent-yellow);">${l1.violations.slice(0, 2).join("<br>")}</span>`;
    } else {
      layer1Badge.className = "badge badge-live";
      layer1Badge.innerText = "Trong giới hạn";
      layer1Content.innerText = "Chưa ghi nhận chỉ số vượt giới hạn theo dõi.";
    }
  }

  // Layer 2: Statistical
  if (layer2Badge && layer2Content) {
    const l2 = lb.layer2_statistical;
    const avgZ = l2.z_score_avg || 0;
    layer2Badge.innerText = `Z-Score: ${avgZ}`;
    if (avgZ > 3.0) {
      layer2Badge.style.background = "rgba(239, 68, 68, 0.15)";
      layer2Badge.style.color = "var(--accent-red)";
    } else if (avgZ > 1.5) {
      layer2Badge.style.background = "rgba(245, 158, 11, 0.15)";
      layer2Badge.style.color = "var(--accent-yellow)";
    } else {
      layer2Badge.style.background = "rgba(52, 211, 153, 0.15)";
      layer2Badge.style.color = "var(--accent-green)";
    }

    if (l2.rapid_shifts && l2.rapid_shifts.length > 0) {
      layer2Content.innerHTML = `<span style="color: var(--accent-red);"> ${l2.rapid_shifts.slice(0, 2).join("<br>")}</span>`;
    } else {
      layer2Content.innerText = `Dao động tự nhiên ổn định quanh baseline. Trung bình độ lệch Z = ${avgZ}.`;
    }
  }

  // Layer 3: ML Anomaly
  if (layer3Badge && layer3Content) {
    const l3 = lb.layer3_ml;
    layer3Badge.innerText = `Score: ${l3.anomaly_score}%`;
    if (l3.anomaly_score >= 80) {
      layer3Badge.style.background = "rgba(239, 68, 68, 0.15)";
      layer3Badge.style.color = "var(--accent-red)";
    } else if (l3.anomaly_score >= 35) {
      layer3Badge.style.background = "rgba(245, 158, 11, 0.15)";
      layer3Badge.style.color = "var(--accent-yellow)";
    } else {
      layer3Badge.style.background = "rgba(96, 165, 250, 0.15)";
      layer3Badge.style.color = "var(--accent-blue)";
    }
    layer3Content.innerText = `Mức bất thường ${l3.anomaly_score}%, tổng hợp từ độ lệch của các chỉ số đang theo dõi.`;
  }

  // Layer 4: Classification
  if (layer4Badge && layer4Content) {
    const l4 = lb.layer4_classification;
    layer4Badge.innerText = `Mức khớp: ${l4.confidence}%`;
    layer4Content.innerHTML = `<strong>Tương đồng:</strong> ${l4.similar_historical_profile}. Đối chiếu với kịch bản tham chiếu.`;
  }
}

// Update ML Prediction Text in Overview Gauge
function updateMLPrediction(ml) {
  const mlPredictionText = document.getElementById("mlPredictionText");
  if (!mlPredictionText) return;

  if (!ml || !ml.ml_available) {
    mlPredictionText.innerText = "Chưa có kết quả";
    mlPredictionText.style.color = "var(--accent-blue)";
    return;
  }

  if (ml.is_anomaly) {
    mlPredictionText.style.color = "var(--accent-red)";
    mlPredictionText.innerHTML = ` ${ml.predicted_label_vi} <span style="font-size: 0.7rem; color: var(--accent-red);">(${ml.confidence_pct}%)</span>`;
  } else {
    mlPredictionText.style.color = "var(--accent-green)";
    mlPredictionText.innerHTML = ` ${ml.predicted_label_vi} <span style="font-size: 0.7rem; color: var(--accent-green);">(${ml.confidence_pct}%)</span>`;
  }
}

// Update Actuators Status (Overview & Actuators Tab)
function updateActuators(actuators) {
  const isClosed = actuators.valve_state === "CLOSED";

  // Overview quick badges
  const quickValve = document.getElementById("quickValveState");
  const quickSample = document.getElementById("quickSampleState");
  const quickAlarm = document.getElementById("quickAlarmState");
  const actuatorNavBadge = document.getElementById("actuatorNavBadge");

  if (actuatorNavBadge) {
    actuatorNavBadge.innerText = actuators.valve_mode || "AUTO";
  }

  if (quickValve) {
    quickValve.innerText = isClosed ? "Đã đóng" : "Đang mở";
    quickValve.className = isClosed ? "text-danger" : "text-success";
  }

  if (quickSample) {
    if (actuators.sample_preserved) {
      quickSample.innerText = `Đã niêm phong (#${actuators.sample_count})`;
      quickSample.className = "text-danger";
    } else {
      quickSample.innerText = `Sẵn sàng (#${actuators.sample_count || 0})`;
      quickSample.className = "text-primary";
    }
  }

  if (quickAlarm) {
    if (actuators.alarm_active && !actuators.alarm_muted) {
      quickAlarm.innerText = "Đang báo động";
      quickAlarm.className = "text-danger";
    } else if (actuators.alarm_muted) {
      quickAlarm.innerText = "Đã tắt tiếng";
      quickAlarm.className = "text-warning";
    } else {
      quickAlarm.innerText = "Không báo động";
      quickAlarm.className = "text-secondary";
    }
  }

  // Actuator Tab Specific elements
  const valveBadge = document.getElementById("valveStateBadge");
  const valveReason = document.getElementById("valveReason");
  const valveModeBtn = document.getElementById("valveModeBtn");

  if (valveBadge) {
    valveBadge.className = isClosed ? "badge badge-fault" : "badge badge-live";
    valveBadge.innerText = isClosed ? "Đã đóng" : "Đang mở";
  }
  if (valveModeBtn) {
    valveModeBtn.innerText = `Chế độ: ${actuators.valve_mode || "AUTO"}`;
  }
  if (valveReason && actuators.last_actuation_reason) {
    valveReason.innerHTML = `Chế độ: <strong>${actuators.valve_mode || "AUTO"}</strong>. ${actuators.last_actuation_reason}`;
  }

  const sampleBadge = document.getElementById("sampleStateBadge");
  const sampleDetails = document.getElementById("sampleDetails");
  if (sampleBadge && sampleDetails) {
    if (actuators.sample_preserved) {
      sampleBadge.className = "badge badge-fault";
      sampleBadge.innerText = `Đã niêm phong (#${actuators.sample_count})`;
      sampleDetails.innerHTML = `<span style="color: var(--accent-red); font-weight: 600;">Mẫu nước nghi vấn đã được tự động khóa vào bình chứa lúc: ${new Date(actuators.sample_preserved_at).toLocaleTimeString()}. Sẵn sàng gửi kiểm nghiệm!</span>`;
    } else {
      sampleBadge.className = "badge badge-simulated";
      sampleBadge.innerText = "Sẵn sàng";
      sampleDetails.innerText = `Ống nghiệm sạch sẵn sàng. Đã lưu trữ ${actuators.sample_count || 0} mẫu trong lịch sử.`;
    }
  }

  const alarmBadge = document.getElementById("alarmStateBadge");
  const alarmMuteBtn = document.getElementById("alarmMuteBtn");
  if (alarmBadge && alarmMuteBtn) {
    if (actuators.alarm_active && !actuators.alarm_muted) {
      alarmBadge.className = "badge badge-fault";
      alarmBadge.innerText = "Đang báo động";
      alarmMuteBtn.innerText = " Tắt còi";
      alarmMuteBtn.className = "btn btn-danger";
    } else if (actuators.alarm_muted) {
      alarmBadge.className = "badge badge-beta";
      alarmBadge.innerText = "Đã tắt tiếng";
      alarmMuteBtn.innerText = " Bật lại còi";
      alarmMuteBtn.className = "btn btn-outline";
    } else {
      alarmBadge.className = "badge badge-live";
      alarmBadge.innerText = "Không báo động";
      alarmMuteBtn.innerText = " Tắt còi";
      alarmMuteBtn.className = "btn btn-outline";
    }
  }
}

// Generate SVG Sparkline Path
function generateSparklineSvg(dataPoints, width = 180, height = 34) {
  if (!dataPoints || dataPoints.length < 2) {
    return `<svg class="sensor-sparkline-svg" viewBox="0 0 ${width} ${height}"><line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="var(--border-color)" stroke-width="1.5"/></svg>`;
  }

  const min = Math.min(...dataPoints);
  const max = Math.max(...dataPoints);
  const range = max - min === 0 ? 1 : max - min;
  const padding = 4;

  const points = dataPoints.map((val, idx) => {
    const x = (idx / (dataPoints.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(" L ")}`;
  return `
    <svg class="sensor-sparkline-svg" viewBox="0 0 ${width} ${height}">
      <path d="${pathD}" fill="none" stroke="var(--accent-blue)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="3" fill="var(--accent-blue)" />
    </svg>
  `;
}

// Update 10 Sensor Cards with Sparklines & ADC Voltages
function updateSensorsGrid(readings, diagnostics) {
  const grid = document.getElementById("sensorsGrid");
  if (!grid) return;

  Object.keys(SENSOR_META).forEach(key => {
    let card = document.getElementById(`sensor-card-${key}`);
    const meta = SENSOR_META[key];
    const reading = readings[key] || { value: meta.nominal, status: "SIMULATED", source: "simulator" };

    if (!card) {
      card = document.createElement("div");
      card.id = `sensor-card-${key}`;
      card.className = "glass-card sensor-card";
      card.onclick = () => openSensorModal(key);
      grid.appendChild(card);
    }

    // Status badge style
    let badgeClass = "badge-simulated";
    if (reading.status === "LIVE") badgeClass = "badge-live";
    else if (reading.status === "BETA") badgeClass = "badge-beta";
    else if (reading.status === "FAULT" || reading.is_stuck) badgeClass = "badge-fault";
    else if (reading.status === "CALIBRATION REQUIRED") badgeClass = "badge-warning";

    // Value display
    let displayVal = reading.value;
    if (key === "electrical_leak") {
      displayVal = reading.value > 0.5 ? "LEAK!" : "SAFE";
    }

    // Raw ADC Voltage Calculation (0 - 3.3V)
    let rawAdcVoltage = "0.00 V";
    if (key === "electrical_leak") {
      rawAdcVoltage = reading.value > 0.5 ? "3.28 V" : "0.02 V";
    } else {
      const ratio = Math.max(0, Math.min(1, reading.value / meta.maxVal));
      rawAdcVoltage = `${(ratio * 3.3).toFixed(2)} V`;
    }

    // Deviation style
    let devHtml = "";
    if (key !== "electrical_leak" && reading.deviation_pct !== undefined && reading.deviation_pct !== null) {
      const dev = reading.deviation_pct;
      const devClass = dev > 15 ? "dev-positive" : (dev < -15 ? "dev-negative" : "dev-neutral");
      const sign = dev > 0 ? "+" : "";
      devHtml = `<span class="sensor-deviation ${devClass}">${sign}${dev}%</span>`;
    }

    // Sparkline SVG
    const sparklineSvg = generateSparklineSvg(sensorSparklines[key] || []);

    // Stuck diagnostic note
    let diagNote = "";
    if (reading.is_stuck) {
      diagNote = `<span style="color: var(--accent-red); font-size: 0.68rem; font-weight: 800;"> KẸT SỐ LIỆU</span>`;
    } else if (diagnostics[key]) {
      diagNote = `<span style="color: var(--accent-yellow); font-size: 0.68rem;">${diagnostics[key].slice(0, 16)}..</span>`;
    }

    card.innerHTML = `
      <div class="sensor-top">
        <span class="sensor-name">${meta.icon} ${meta.label}</span>
        <span class="badge ${badgeClass}" style="font-size: 0.65rem; padding: 0.2rem 0.45rem;">
          ${reading.status}
        </span>
      </div>
      <div class="sensor-value-box">
        <span class="sensor-value" style="${key === 'electrical_leak' && reading.value > 0.5 ? 'color: var(--accent-red);' : ''}">
          ${displayVal}
        </span>
        <span class="sensor-unit">${key === 'electrical_leak' ? '' : meta.unit}</span>
      </div>
      <div class="sensor-adc-strip">
        <span>Ước tính: <strong>${rawAdcVoltage}</strong></span>
        <span>Tham chiếu: ${meta.nominal}</span>
      </div>
      <div class="sensor-sparkline-box">
        ${sparklineSvg}
      </div>
      <div class="sensor-bottom">
        <div>${devHtml}</div>
        <div>${diagNote || `<span style="color: var(--text-muted); font-size: 0.68rem;">z = ${reading.z_score || 0}</span>`}</div>
      </div>
    `;
  });
}

// Update Telemetry Matrix Table in Tab 2
function updateAnalyticsTable(readings, diagnostics) {
  const tbody = document.getElementById("analyticsTableBody");
  if (!tbody) return;

  let html = "";
  Object.keys(SENSOR_META).forEach(key => {
    const meta = SENSOR_META[key];
    const r = readings[key] || { value: meta.nominal, z_score: 0, deviation_pct: 0, status: "OK" };

    let statusPill = `<span class="badge badge-live">Trong giới hạn</span>`;
    if (key === "electrical_leak" && r.value > 0.5) {
      statusPill = `<span class="badge badge-emergency">RÒ ĐIỆN</span>`;
    } else if (Math.abs(r.z_score || 0) > 3.0) {
      statusPill = `<span class="badge badge-fault">VI PHẠM</span>`;
    } else if (Math.abs(r.z_score || 0) > 1.5) {
      statusPill = `<span class="badge badge-warning">CẢNH BÁO</span>`;
    }

    const dev = r.deviation_pct !== undefined ? `${r.deviation_pct > 0 ? "+" : ""}${r.deviation_pct}%` : "0%";

    html += `
      <tr>
        <td style="font-weight: 700; color: var(--text-primary);">${meta.icon} ${meta.label}</td>
        <td style="font-weight: 800; color: var(--accent-blue);">${r.value} ${key === 'electrical_leak' ? '' : meta.unit}</td>
        <td>${meta.nominal} ${key === 'electrical_leak' ? '' : meta.unit}</td>
        <td>${meta.limits}</td>
        <td style="font-family: monospace;">${r.z_score !== undefined ? r.z_score : 0}</td>
        <td>${dev}</td>
        <td>${statusPill}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

// Update Realtime Trend Chart
function updateChart(timestamp, anomalyScore, readings) {
  if (!chart) return;
  if (isViewingDbHistory) return;

  const timeLabel = new Date(timestamp).toLocaleTimeString();

  chart.data.labels.push(timeLabel);
  chart.data.datasets[0].data.push(anomalyScore);
  chart.data.datasets[1].data.push(readings.ph ? readings.ph.value : null);
  chart.data.datasets[2].data.push(readings.turbidity ? readings.turbidity.value : null);
  chart.data.datasets[3].data.push(readings.chlorine ? readings.chlorine.value * 10 : null);

  if (chart.data.labels.length > chartMaxPoints) {
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }

  chart.update("none");
}

function setChartPoints(points) {
  isViewingDbHistory = false;
  chartMaxPoints = points;
  document.querySelectorAll(".history-range-btn").forEach(b => b.classList.remove("active"));
  const btn = document.getElementById(`rangeBtn${points}`);
  if (btn) btn.classList.add("active");

  if (chart && chart.data.labels.length > chartMaxPoints) {
    const diff = chart.data.labels.length - chartMaxPoints;
    chart.data.labels.splice(0, diff);
    chart.data.datasets.forEach(ds => ds.data.splice(0, diff));
    chart.update();
  }
}

async function fetchDbHistory(limit = 100) {
  try {
    isViewingDbHistory = true;
    document.querySelectorAll(".history-range-btn").forEach(b => b.classList.remove("active"));
    const btn = document.getElementById("rangeBtnDb");
    if (btn) btn.classList.add("active");

    const res = await fetch(`/api/history/telemetry?device_id=${currentDeviceId}&limit=${limit}`);
    const rows = await res.json();
    if (!chart || !Array.isArray(rows)) return;

    chart.data.labels = rows.map(r => new Date(r.timestamp).toLocaleTimeString());
    chart.data.datasets[0].data = rows.map(r => r.anomaly_score);
    chart.data.datasets[1].data = rows.map(r => r.ph);
    chart.data.datasets[2].data = rows.map(r => r.turbidity);
    chart.data.datasets[3].data = rows.map(r => (r.chlorine || 0) * 10);
    chart.update();
  } catch (e) {
    console.error("Failed to load DB telemetry history:", e);
  }
}

// =========================================================
// 5. SCENARIOS ENGINE (11 Scenarios)
// =========================================================
async function loadScenarios() {
  try {
    const res = await fetch("/api/scenarios");
    const data = await res.json();
    const grid = document.getElementById("scenariosGrid");
    if (!grid) return;
    grid.innerHTML = "";

    const scenarioMeta = {
      normal: { icon: "", severity: "NORMAL", color: "var(--accent-green)", targets: "pH: 7.2 | Turb: 1.2 | Clo: 0.65" },
      muddy_water: { icon: "", severity: "HIGH", color: "var(--accent-yellow)", targets: "Turb: 45 NTU | TDS: 480 ppm" },
      salt_spike: { icon: "", severity: "MEDIUM", color: "var(--accent-yellow)", targets: "EC: 1600 µS/cm | TDS: 800" },
      acid_contamination: { icon: "", severity: "CRITICAL", color: "var(--accent-red)", targets: "pH: 4.2 | ORP: 680 mV" },
      chlorine_failure: { icon: "", severity: "HIGH", color: "var(--accent-yellow)", targets: "Clo: 0.02 mg/L | ORP: 220" },
      ammonia_spike: { icon: "", severity: "CRITICAL", color: "var(--accent-red)", targets: "NH4+: 4.5 mg/L | Clo: 0.1" },
      nitrate_spike: { icon: "", severity: "HIGH", color: "var(--accent-yellow)", targets: "NO3-: 75 mg/L | EC: 950" },
      organic_contamination: { icon: "", severity: "CRITICAL", color: "var(--accent-red)", targets: "UV254: 0.35 | Clo: 0.05" },
      electrical_leak: { icon: "", severity: "CRITICAL", color: "var(--accent-red)", targets: "Dòng rò: LEAK (>0.5V)" },
      sensor_stuck: { icon: "", severity: "MEDIUM", color: "var(--accent-yellow)", targets: "pH kẹt cứng 7.25 ± 0.0" },
      mixed_contamination: { icon: "", severity: "EMERGENCY", color: "var(--accent-red)", targets: "Axit + Đục + Rò điện" }
    };

    data.scenarios.forEach((sc, index) => {
      const meta = scenarioMeta[sc.id] || { icon: "", severity: "TEST", color: "var(--accent-blue)", targets: "" };
      const btn = document.createElement("button");
      btn.id = `scenario-btn-${sc.id}`;
      btn.className = `scenario-card-btn ${sc.id === data.active.id ? "active" : ""}`;
      btn.onclick = () => activateScenario(sc.id);

      btn.innerHTML = `
        <div class="sc-top-row">
          <span class="sc-icon">${String(index + 1).padStart(2, "0")}</span>
          <span class="sc-severity-badge" style="background: var(--bg-primary); color: ${meta.color}; border: 1px solid var(--border-color);">
            ${meta.severity}
          </span>
        </div>
        <h4 class="sc-title">${sc.name.replace(/\s*\([^)]*\)/g, "")}</h4>
        <p class="sc-desc">${sc.description}</p>
        <div class="sc-targets">${Object.entries(sc.targets || {}).slice(0, 3).map(([key, value]) => `${key}: ${value}`).join(" · ")}</div>
      `;
      grid.appendChild(btn);
    });
  } catch (e) {
    console.error("Failed to load scenarios:", e);
  }
}

function highlightActiveScenario(activeId) {
  document.querySelectorAll(".scenario-card-btn").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.getElementById(`scenario-btn-${activeId}`);
  if (activeBtn) activeBtn.classList.add("active");
}

async function activateScenario(scenarioId) {
  try {
    const res = await fetch("/api/scenarios/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: scenarioId })
    });
    if (res.ok) {
      highlightActiveScenario(scenarioId);
    }
  } catch (e) {
    console.error("Failed to activate scenario:", e);
  }
}

// =========================================================
// 6. ACTUATOR COMMANDS & WEB AUDIO BEEP
// =========================================================
async function setValve(action) {
  try {
    await fetch("/api/actuators/valve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, mode: "MANUAL" })
    });
  } catch (e) {
    console.error("Failed to set valve:", e);
  }
}

async function toggleValveMode() {
  const newMode = currentActuators.valve_mode === "AUTO" ? "MANUAL" : "AUTO";
  try {
    await fetch("/api/actuators/valve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: currentActuators.valve_state || "OPEN", mode: newMode })
    });
  } catch (e) {
    console.error("Failed to toggle mode:", e);
  }
}

async function triggerSample() {
  try {
    await fetch("/api/actuators/sample/trigger", { method: "POST" });
    loadPreservedSamples();
  } catch (e) {
    console.error("Failed to trigger sample:", e);
  }
}

async function resetSampleVial() {
  try {
    await fetch("/api/actuators/sample/reset", { method: "POST" });
    loadPreservedSamples();
  } catch (e) {
    console.error("Failed to reset vial:", e);
  }
}

async function toggleAlarmMute() {
  const newMuted = !currentActuators.alarm_muted;
  try {
    await fetch("/api/actuators/alarm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ muted: newMuted })
    });
  } catch (e) {
    console.error("Failed to toggle alarm mute:", e);
  }
}

// Web Audio API Beep Synthesizer
function testAudioBeep() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // 880Hz A5
    osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) {
    console.warn("Audio Context not supported:", e);
  }
}

// Reset Baseline
async function resetBaseline() {
  if (confirm("Bạn có chắc chắn muốn đặt lại Baseline cơ sở về giá trị an toàn ban đầu?")) {
    try {
      await fetch("/api/baseline/reset", { method: "POST" });
      activateScenario("normal");
      loadRecentAlerts();
    } catch (e) {
      console.error("Failed to reset baseline:", e);
    }
  }
}

// =========================================================
// 7. RECENT ALERTS, AUDIT TRAIL LOGS & DEDUPLICATION
// =========================================================
async function loadRecentAlerts() {
  try {
    const res = await fetch(`/api/alerts?limit=50&device_id=${currentDeviceId}`);
    cachedAlerts = await res.json();
    renderAlerts();
  } catch (e) {
    console.error("Failed to load alerts:", e);
  }
}

async function acknowledgeAlert(alertId) {
  const user = currentAsaoUser ? currentAsaoUser.username : "techlead.asao";
  try {
    const res = await fetch(`/api/alerts/${alertId}/ack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user })
    });
    if (res.ok) {
      await loadRecentAlerts();
    }
  } catch (e) {
    console.error("Failed to acknowledge alert:", e);
  }
}

async function clearAllAlerts() {
  try {
    await fetch("/api/alerts/clear", { method: "POST" });
    cachedAlerts = [];
    renderAlerts();
  } catch (e) {
    console.error("Failed to clear alerts:", e);
  }
}

function filterAuditLogs(filter) {
  activeAuditFilter = filter;
  renderAlerts();
}

// Fold consecutive duplicate alerts into single entry with repeat count
function deduplicateAlerts(alertsList) {
  const result = [];
  alertsList.forEach(item => {
    if (result.length > 0) {
      const prev = result[result.length - 1];
      if (prev.title === item.title && prev.severity === item.severity && prev.status === item.status && prev.acknowledged_by === item.acknowledged_by) {
        prev.count = (prev.count || 1) + 1;
        prev.latestTime = item.timestamp;
        return;
      }
    }
    result.push({ ...item, count: 1, latestTime: item.timestamp });
  });
  return result;
}

function renderAlerts() {
  const logsList = document.getElementById("logsList");
  const logsListExpanded = document.getElementById("logsListExpanded");
  const countBadge = document.getElementById("logCountBadge");

  // Filter alerts by severity
  const filtered = activeAuditFilter === "ALL"
    ? cachedAlerts
    : cachedAlerts.filter(a => a.severity === activeAuditFilter);

  // Deduplicate consecutive entries
  const deduplicated = deduplicateAlerts(filtered);

  if (countBadge) {
    countBadge.innerText = `${deduplicated.length} sự kiện`;
  }

  // Render Overview mini log (top 5 distinct events)
  if (logsList) {
    logsList.innerHTML = "";
    if (deduplicated.length === 0) {
      logsList.innerHTML = `<div class="log-item"><div class="log-desc">Chưa có cảnh báo nào được ghi nhận.</div></div>`;
    } else {
      deduplicated.slice(0, 5).forEach(a => {
        const item = document.createElement("div");
        item.className = `log-item ${a.severity}`;
        const timeStr = new Date(a.latestTime || a.timestamp).toLocaleTimeString();
        const repeatPill = a.count > 1 ? `<span style="background: var(--border-color); padding: 1px 6px; border-radius: 4px; font-size: 0.65rem; margin-left: 4px;">x${a.count} lần</span>` : "";

        let ackHtml = "";
        if (a.acknowledged_by) {
          ackHtml = `<div class="ack-badge"> Đã xác nhận: <strong>${a.acknowledged_by}</strong> (${new Date(a.acknowledged_at).toLocaleTimeString()})</div>`;
        } else if (a.severity === "CRITICAL" || a.severity === "EMERGENCY" || a.severity === "WARNING") {
          ackHtml = `<div><button class="ack-btn" onclick="acknowledgeAlert(${a.id})"> Xác nhận xử lý</button></div>`;
        }

        item.innerHTML = `
          <div class="log-time">${timeStr} &bull; [${a.severity}] ${repeatPill}</div>
          <div class="log-title">${a.title}</div>
          <div class="log-desc">${a.message}</div>
          ${a.action_taken ? `<div style="color: var(--accent-blue); font-size: 0.7rem; margin-top: 3px;"> ${a.action_taken}</div>` : ""}
          ${ackHtml}
        `;
        logsList.appendChild(item);
      });
    }
  }

  // Render Expanded Audit log in Tab 4
  if (logsListExpanded) {
    logsListExpanded.innerHTML = "";
    if (deduplicated.length === 0) {
      logsListExpanded.innerHTML = `<div class="log-item"><div class="log-desc">Không có bản ghi phù hợp bộ lọc '${activeAuditFilter}'.</div></div>`;
    } else {
      deduplicated.forEach(a => {
        const item = document.createElement("div");
        item.className = `log-item ${a.severity}`;
        const timeStr = new Date(a.latestTime || a.timestamp).toLocaleString();
        const repeatPill = a.count > 1 ? `<span style="background: var(--border-color); padding: 1px 6px; border-radius: 4px; font-size: 0.68rem; margin-left: 6px;">Lặp lại: ${a.count} lần</span>` : "";

        let ackHtml = "";
        if (a.acknowledged_by) {
          ackHtml = `<div class="ack-badge"> Đã xác nhận: <strong>${a.acknowledged_by}</strong> (${new Date(a.acknowledged_at).toLocaleTimeString()})</div>`;
        } else if (a.severity === "CRITICAL" || a.severity === "EMERGENCY" || a.severity === "WARNING") {
          ackHtml = `<div><button class="ack-btn" onclick="acknowledgeAlert(${a.id})"> Xác nhận xử lý</button></div>`;
        }

        item.innerHTML = `
          <div class="log-time">${timeStr} &bull; ${a.severity} &bull; Trạng thái: [${a.status}] ${repeatPill}</div>
          <div class="log-title">${a.title}</div>
          <div class="log-desc">${a.message}</div>
          ${a.action_taken ? `<div style="color: var(--accent-blue); font-size: 0.72rem; margin-top: 3px;"> Can thiệp chấp hành: ${a.action_taken}</div>` : ""}
          ${ackHtml}
        `;
        logsListExpanded.appendChild(item);
      });
    }
  }
}

// =========================================================
// 8. PRESERVED INCIDENT SAMPLES VAULT
// =========================================================
async function loadPreservedSamples() {
  try {
    const res = await fetch(`/api/samples?limit=15&device_id=${currentDeviceId}`);
    const samples = await res.json();
    const container = document.getElementById("samplesListContainer");
    if (!container) return;

    if (samples.length === 0) {
      container.innerHTML = "Chưa có mẫu nước nào được kích hoạt lưu trữ.";
      return;
    }

    let html = `
      <table style="width: 100%; text-align: left; border-collapse: collapse; font-size: 0.8rem;">
        <thead>
          <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
            <th style="padding: 0.5rem;">MÃ MẪU (VIAL ID)</th>
            <th style="padding: 0.5rem;">THỜI ĐIỂM NIÊM PHONG</th>
            <th style="padding: 0.5rem;">ĐIỂM DỊ THƯỜNG</th>
            <th style="padding: 0.5rem;">TRẠNG THÁI</th>
            <th style="padding: 0.5rem;">NIÊM PHONG BỞI</th>
            <th style="padding: 0.5rem;">LÝ DO LƯU MẪU</th>
          </tr>
        </thead>
        <tbody>
    `;

    samples.forEach(s => {
      html += `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 0.55rem; font-weight: 800; color: var(--accent-blue); font-family: monospace;">${s.sample_id}</td>
          <td style="padding: 0.55rem;">${new Date(s.timestamp).toLocaleString()}</td>
          <td style="padding: 0.55rem; font-weight: 800; color: var(--accent-red);">${s.anomaly_score}%</td>
          <td style="padding: 0.55rem;"><span class="badge badge-fault" style="font-size: 0.65rem;">${s.status}</span></td>
          <td style="padding: 0.55rem; color: var(--accent-blue); font-weight: 600;">${s.sealed_by_user || 'techlead.asao'}</td>
          <td style="padding: 0.55rem; color: var(--text-secondary);">${s.reason}</td>
        </tr>
      `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  } catch (e) {
    console.error("Failed to load samples:", e);
  }
}

// =========================================================
// 9. SENSOR MODAL & HARDWARE ABSTRACTION LAYER (HAL) CONFIG
// =========================================================
function openSensorModal(sensorKey) {
  selectedSensorForConfig = sensorKey;
  const meta = SENSOR_META[sensorKey];
  const title = document.getElementById("modalSensorTitle");
  const sub = document.getElementById("modalSensorSubtitle");
  const val = document.getElementById("modalSensorVal");
  const adc = document.getElementById("modalSensorAdc");
  const z = document.getElementById("modalSensorZ");

  if (title && meta) {
    title.innerText = `Cấu hình: ${meta.label}`;
  }
  if (sub && meta) {
    sub.innerText = `Khoảng đo: 0 - ${meta.maxVal} ${meta.unit} &bull; Chuẩn danh định: ${meta.nominal}`;
  }

  // Populate latest numbers
  const card = document.getElementById(`sensor-card-${sensorKey}`);
  if (card && val && adc && z) {
    const valElem = card.querySelector(".sensor-value");
    val.innerText = valElem ? `${valElem.innerText} ${meta.unit}` : "--";
    const adcElem = card.querySelector(".sensor-adc-strip strong");
    adc.innerText = adcElem ? adcElem.innerText : "-- V";
    z.innerText = `Lịch sử 12 điểm: [${(sensorSparklines[sensorKey] || []).slice(-4).join(", ")}]`;
  }

  const modal = document.getElementById("sensorModal");
  if (modal) {
    modal.style.display = "flex";
    modal.classList.add("active");
  }
}

function closeSensorModal() {
  const modal = document.getElementById("sensorModal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
  selectedSensorForConfig = null;
}

function setupKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeSensorModal();
    }
  });
}

async function saveSensorConfig() {
  if (!selectedSensorForConfig) return;
  const source = document.getElementById("modalSensorSource").value;
  const status = document.getElementById("modalSensorStatus").value;

  try {
    const res = await fetch("/api/sensors/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor: selectedSensorForConfig,
        source: source,
        status: status
      })
    });
    if (res.ok) {
      console.log(`Sensor config saved for ${selectedSensorForConfig}`);
    }
    closeSensorModal();
  } catch (e) {
    console.error("Failed to save sensor config:", e);
    closeSensorModal();
  }
}
