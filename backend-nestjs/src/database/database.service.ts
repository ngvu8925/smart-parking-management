import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import * as path from 'path';

export interface AsaoUser {
  id: string;
  username: string;
  email: string;
  full_name: string;
  roles: string[];
  department: string;
  created_at: string;
  last_login_at: string;
}

export interface UserDevice {
  id: number;
  user_id: string;
  device_id: string;
  device_name: string;
  location: string;
  role_on_device: string;
}

export interface TelemetryPoint {
  id?: number;
  device_id: string;
  timestamp: string;
  ph: number;
  ec: number;
  tds: number;
  turbidity: number;
  orp: number;
  chlorine: number;
  temperature: number;
  nh4: number;
  no3: number;
  uv254: number;
  electrical_leak: number;
  anomaly_score: number;
  status: string;
  diagnostic_pattern?: string;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private db: DatabaseSync;
  private readonly dbPath = path.resolve(__dirname, '../../../water_sentinel.db');

  onModuleInit() {
    this.logger.log(`Connecting to SQLite persistence at: ${this.dbPath}`);
    this.db = new DatabaseSync(this.dbPath);
    this.initSchema();
    this.seedDefaultUsersAndDevices();
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
      this.logger.log('Database connection closed.');
    }
  }

  private initSchema() {
    this.logger.log('Initializing multi-tenant user & time-series database schema...');

    this.db.exec(`
      -- 1. ASAO Keycloak Users cache
      CREATE TABLE IF NOT EXISTS asao_users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        full_name TEXT,
        roles TEXT NOT NULL,
        department TEXT,
        created_at TEXT NOT NULL,
        last_login_at TEXT NOT NULL
      );

      -- 2. User - Device Multi-tenant mapping
      CREATE TABLE IF NOT EXISTS user_devices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        device_name TEXT NOT NULL,
        location TEXT NOT NULL,
        role_on_device TEXT DEFAULT 'OPERATOR'
      );
      CREATE INDEX IF NOT EXISTS idx_user_devices_uid ON user_devices(user_id);

      -- 3. High-resolution Telemetry Time-Series
      CREATE TABLE IF NOT EXISTS telemetry_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        ph REAL,
        ec REAL,
        tds REAL,
        turbidity REAL,
        orp REAL,
        chlorine REAL,
        temperature REAL,
        nh4 REAL,
        no3 REAL,
        uv254 REAL,
        electrical_leak REAL,
        anomaly_score REAL,
        status TEXT,
        diagnostic_pattern TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_hist_ts ON telemetry_history(device_id, timestamp);

      -- 4. Incident Alerts with User Attribution
      CREATE TABLE IF NOT EXISTS incident_alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        severity TEXT NOT NULL,
        status TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        action_taken TEXT,
        acknowledged_by TEXT,
        acknowledged_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_incident_alerts_dev ON incident_alerts(device_id, timestamp);

      -- 5. Preserved Samples with User Attribution
      CREATE TABLE IF NOT EXISTS sample_preservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        sample_id TEXT NOT NULL UNIQUE,
        timestamp TEXT NOT NULL,
        anomaly_score REAL NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        sealed_by_user TEXT NOT NULL,
        readings_snapshot TEXT
      );

      -- 6. Actuator Actions Audit Trail with User Attribution
      CREATE TABLE IF NOT EXISTS actuator_audit_trail (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        actuator TEXT NOT NULL,
        action TEXT NOT NULL,
        mode TEXT NOT NULL,
        reason TEXT NOT NULL,
        triggered_by_user TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_actuator_audit_dev ON actuator_audit_trail(device_id, timestamp);
    `);
  }

  private seedDefaultUsersAndDevices() {
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM asao_users').get() as { count: number };
    if (existing && existing.count > 0) return;

    this.logger.log('Seeding default ASAO Keycloak local dev users & node assignments...');

    const insertUser = this.db.prepare(`
      INSERT OR IGNORE INTO asao_users (id, username, email, full_name, roles, department, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();

    // 1. Lead Engineer / Admin
    insertUser.run(
      'usr-asao-01-lead',
      'techlead.asao',
      'techlead@asao.vn',
      'Nguyễn Văn Thắng (ASAO Tech Lead)',
      JSON.stringify(['asao-admin', 'water-supervisor', 'qa-lead']),
      'ASAO R&D Core Lab',
      now,
      now
    );

    // 2. Field QA / Operator
    insertUser.run(
      'usr-asao-02-qa',
      'qa.engineer',
      'qa-water@asao.vn',
      'Trần Hải Đăng (QA / Testbed)',
      JSON.stringify(['water-operator', 'qa-tester']),
      'Trung tâm Kiểm định Chất lượng',
      now,
      now
    );

    // 3. Station Operator (Hà Nội)
    insertUser.run(
      'usr-asao-03-op',
      'operator.hanoi',
      'operator.hn@asao.vn',
      'Lê Hoàng Long (Vận hành Trạm)',
      JSON.stringify(['water-operator']),
      'Nhà máy Nước Sạch Cầu Giấy',
      now,
      now
    );

    // Device assignments
    const insertDev = this.db.prepare(`
      INSERT INTO user_devices (user_id, device_id, device_name, location, role_on_device)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Tech lead has access to all nodes
    insertDev.run('usr-asao-01-lead', 'water-guardian-node-01', 'Node 01 - Trạm Cầu Giấy (Hà Nội)', 'Trạm Bơm Tăng Áp #1, Cầu Giấy, HN', 'SUPERVISOR');
    insertDev.run('usr-asao-01-lead', 'water-guardian-node-02', 'Node 02 - Trạm Thủ Đức (TP.HCM)', 'Phân Khu CNC Thủ Đức, TP.HCM', 'SUPERVISOR');

    // QA Tester has access to Node 01
    insertDev.run('usr-asao-02-qa', 'water-guardian-node-01', 'Node 01 - Trạm Cầu Giấy (Hà Nội)', 'Trạm Bơm Tăng Áp #1, Cầu Giấy, HN', 'QA_INSPECTOR');

    // Operator has access to Node 01
    insertDev.run('usr-asao-03-op', 'water-guardian-node-01', 'Node 01 - Trạm Cầu Giấy (Hà Nội)', 'Trạm Bơm Tăng Áp #1, Cầu Giấy, HN', 'OPERATOR');
  }

  // ==========================================
  // USER & TENANT MANAGEMENT
  // ==========================================

  getUserById(userId: string): AsaoUser | null {
    const row = this.db.prepare('SELECT * FROM asao_users WHERE id = ?').get(userId) as any;
    if (!row) return null;
    return {
      ...row,
      roles: JSON.parse(row.roles || '[]')
    };
  }

  getUserByUsername(username: string): AsaoUser | null {
    const row = this.db.prepare('SELECT * FROM asao_users WHERE username = ?').get(username) as any;
    if (!row) return null;
    return {
      ...row,
      roles: JSON.parse(row.roles || '[]')
    };
  }

  listAllUsers(): AsaoUser[] {
    const rows = this.db.prepare('SELECT * FROM asao_users ORDER BY username ASC').all() as any[];
    return rows.map(r => ({ ...r, roles: JSON.parse(r.roles || '[]') }));
  }

  getUserDevices(userId: string): UserDevice[] {
    const rows = this.db.prepare('SELECT * FROM user_devices WHERE user_id = ?').all(userId) as any[];
    return rows;
  }

  // ==========================================
  // TIME-SERIES TELEMETRY PERSISTENCE
  // ==========================================

  recordTelemetry(point: TelemetryPoint) {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO telemetry_history (
          device_id, timestamp, ph, ec, tds, turbidity, orp, chlorine,
          temperature, nh4, no3, uv254, electrical_leak, anomaly_score, status, diagnostic_pattern
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        point.device_id,
        point.timestamp,
        point.ph,
        point.ec,
        point.tds,
        point.turbidity,
        point.orp,
        point.chlorine,
        point.temperature,
        point.nh4,
        point.no3,
        point.uv254,
        point.electrical_leak,
        point.anomaly_score,
        point.status,
        point.diagnostic_pattern || 'NORMAL'
      );
    } catch (e) {
      this.logger.error('Failed to insert telemetry point:', e);
    }
  }

  getTelemetryHistory(deviceId: string, limit: number = 60): TelemetryPoint[] {
    try {
      const rows = this.db.prepare(`
        SELECT * FROM telemetry_history
        WHERE device_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(deviceId, limit) as any[];

      return rows.reverse();
    } catch (e) {
      this.logger.error('Failed to get telemetry history:', e);
      return [];
    }
  }

  // ==========================================
  // AUDIT ALERTS & SAMPLES PERSISTENCE
  // ==========================================

  recordAlert(
    deviceId: string,
    severity: string,
    status: string,
    title: string,
    message: string,
    actionTaken?: string
  ): number {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO incident_alerts (device_id, timestamp, severity, status, title, message, action_taken)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(deviceId, now, severity, status, title, message, actionTaken || null);
    return Number(result.lastInsertRowid);
  }

  getAlerts(deviceId?: string, limit: number = 50): any[] {
    if (deviceId) {
      return this.db.prepare('SELECT * FROM incident_alerts WHERE device_id = ? ORDER BY id DESC LIMIT ?').all(deviceId, limit);
    }
    return this.db.prepare('SELECT * FROM incident_alerts ORDER BY id DESC LIMIT ?').all(limit);
  }

  acknowledgeAlert(alertId: number, username: string) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      UPDATE incident_alerts
      SET acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `);
    stmt.run(username, now, alertId);
    return { success: true, alert_id: alertId, acknowledged_by: username, acknowledged_at: now };
  }

  clearAlerts() {
    this.db.exec('DELETE FROM incident_alerts');
    return { success: true, count: 0 };
  }

  recordPreservedSample(
    deviceId: string,
    sampleId: string,
    anomalyScore: number,
    status: string,
    reason: string,
    sealedByUser: string,
    readingsSnapshot: any
  ) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO sample_preservations (device_id, sample_id, timestamp, anomaly_score, status, reason, sealed_by_user, readings_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(deviceId, sampleId, now, anomalyScore, status, reason, sealedByUser, JSON.stringify(readingsSnapshot));
  }

  getPreservedSamples(deviceId?: string, limit: number = 20): any[] {
    if (deviceId) {
      return this.db.prepare('SELECT * FROM sample_preservations WHERE device_id = ? ORDER BY id DESC LIMIT ?').all(deviceId, limit);
    }
    return this.db.prepare('SELECT * FROM sample_preservations ORDER BY id DESC LIMIT ?').all(limit);
  }

  recordActuatorAction(
    deviceId: string,
    actuator: string,
    action: string,
    mode: string,
    reason: string,
    triggeredByUser: string
  ) {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO actuator_audit_trail (device_id, timestamp, actuator, action, mode, reason, triggered_by_user)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(deviceId, now, actuator, action, mode, reason, triggeredByUser);
  }

  getActuatorAuditTrail(deviceId?: string, limit: number = 50): any[] {
    if (deviceId) {
      return this.db.prepare('SELECT * FROM actuator_audit_trail WHERE device_id = ? ORDER BY id DESC LIMIT ?').all(deviceId, limit);
    }
    return this.db.prepare('SELECT * FROM actuator_audit_trail ORDER BY id DESC LIMIT ?').all(limit);
  }
}
