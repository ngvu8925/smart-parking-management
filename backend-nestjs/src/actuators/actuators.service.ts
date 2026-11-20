import { Injectable, Logger } from '@nestjs/common';
import { ActuatorState, AnomalyEvaluation, TelemetryPacket, PreservedSample, AlertEvent } from '../types/models';
import { DatabaseService } from '../database/database.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class ActuatorsService {
  private readonly logger = new Logger(ActuatorsService.name);

  public state: ActuatorState = {
    valve_state: 'OPEN',
    valve_mode: 'AUTO',
    sample_preserved: false,
    sample_preserved_at: null,
    sample_count: 0,
    alarm_active: false,
    alarm_muted: false,
    last_actuation_reason: 'Hệ thống khởi động bình thường'
  };

  public preservedSamples: PreservedSample[] = [];
  public alerts: AlertEvent[] = [];
  private alertIdCounter: number = 1;
  private sampleIdCounter: number = 1;
  private previousStatus: string = 'NORMAL';
  private lastAlertTime: number = 0;

  constructor(
    private readonly db: DatabaseService,
    private readonly authService: AuthService
  ) {}

  clearAlerts() {
    this.alerts = [];
    this.db.clearAlerts();
    return { success: true, count: 0 };
  }

  acknowledgeAlert(alertId: number, username?: string) {
    const user = username || this.authService.getCurrentUser().username;
    const now = new Date().toISOString();
    this.db.acknowledgeAlert(alertId, user);

    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged_by = user;
      alert.acknowledged_at = now;
    }
    return { success: true, alert_id: alertId, acknowledged_by: user, acknowledged_at: now };
  }

  setValve(action: 'OPEN' | 'CLOSE' | 'AUTO', mode?: 'AUTO' | 'MANUAL', reason?: string, username?: string) {
    const user = username || this.authService.getCurrentUser().username;

    if (action === 'AUTO') {
      this.state.valve_mode = 'AUTO';
      this.state.last_actuation_reason = reason || 'Chuyển van về chế độ Tự Động (AUTO)';
      this.logger.log(`ACTUATOR: Valve Mode switched to AUTO by ${user}.`);
      this.db.recordActuatorAction('water-guardian-node-01', 'VALVE', 'MODE_AUTO', 'AUTO', this.state.last_actuation_reason, user);
      return;
    }

    this.state.valve_mode = mode || 'MANUAL';
    this.state.valve_state = action === 'OPEN' ? 'OPEN' : 'CLOSED';
    this.state.last_actuation_reason = reason || `Lệnh ${action === 'OPEN' ? 'mở' : 'đóng'} van (${this.state.valve_mode})`;
    this.logger.log(`ACTUATOR: Valve ${action} (Mode: ${this.state.valve_mode}) by ${user}. Reason: ${this.state.last_actuation_reason}`);
    this.db.recordActuatorAction('water-guardian-node-01', 'VALVE', action, this.state.valve_mode, this.state.last_actuation_reason, user);
  }

  triggerSamplePreservation(
    anomalyScore: number,
    status: any,
    readings: any,
    reason: string,
    username?: string
  ) {
    const user = username || this.authService.getCurrentUser().username;
    const now = new Date().toISOString();
    const sampleId = `SMP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    this.state.sample_preserved = true;
    this.state.sample_preserved_at = now;
    this.state.sample_count += 1;

    const sample: PreservedSample = {
      id: this.sampleIdCounter++,
      sample_id: sampleId,
      timestamp: now,
      anomaly_score: anomalyScore,
      status: status,
      readings_snapshot: readings,
      reason: reason
    };

    this.preservedSamples.unshift(sample);
    if (this.preservedSamples.length > 50) this.preservedSamples.pop();

    this.db.recordPreservedSample(
      'water-guardian-node-01',
      sampleId,
      anomalyScore,
      status,
      reason,
      user,
      readings
    );

    this.logger.warn(`ACTUATOR: Water sample locked into vial: ${sampleId} by ${user}`);
  }

  resetSampleVial() {
    this.state.sample_preserved = false;
    this.state.sample_preserved_at = null;
    this.logger.log('ACTUATOR: Sample vial reset for next incident');
  }

  setAlarmMute(muted: boolean, username?: string) {
    const user = username || this.authService.getCurrentUser().username;
    this.state.alarm_muted = muted;
    if (muted) {
      this.state.alarm_active = false;
    }
    this.db.recordActuatorAction(
      'water-guardian-node-01',
      'ALARM',
      muted ? 'MUTE' : 'UNMUTE',
      'MANUAL',
      `Người dùng ${muted ? 'tắt tiếng' : 'bật tiếng'} còi báo động`,
      user
    );
  }

  recordAlert(
    severity: 'INFO' | 'WARNING' | 'CRITICAL' | 'EMERGENCY',
    status: any,
    title: string,
    message: string,
    action_taken?: string
  ) {
    let dbId: number;
    try {
      dbId = this.db.recordAlert('water-guardian-node-01', severity, status, title, message, action_taken);
    } catch {
      dbId = this.alertIdCounter++;
    }

    const alert: AlertEvent = {
      id: dbId,
      timestamp: new Date().toISOString(),
      severity,
      status,
      title,
      message,
      action_taken
    };
    this.alerts.unshift(alert);
    if (this.alerts.length > 100) this.alerts.pop();
  }

  processSafetyRules(evaluation: AnomalyEvaluation, packet: TelemetryPacket) {
    const currentStatus = evaluation.status;
    const now = Date.now();
    const isStatusChanged = currentStatus !== this.previousStatus;
    // Debounce to at most once per 60 seconds if condition persists, avoiding 1Hz alert flood
    const canRepeatAlert = now - this.lastAlertTime > 60000;

    // 1. Electrical Hazard: Emergency priority
    if (currentStatus === 'ELECTRICAL HAZARD') {
      if (this.state.valve_mode === 'AUTO' && this.state.valve_state !== 'CLOSED') {
        this.setValve('CLOSE', 'AUTO', 'Tự động ngắt khẩn cấp do phát hiện rò điện vào buồng nước!');
      }
      if (!this.state.alarm_muted) {
        this.state.alarm_active = true;
      }
      if (isStatusChanged || canRepeatAlert) {
        this.recordAlert(
          'EMERGENCY',
          currentStatus,
          'CẢNH BÁO NGUY HIỂM: RÒ ĐIỆN VÀO NƯỚC',
          'Phát hiện dòng điện rò rỉ trong buồng đo (> 0.5mA). Ngắt ngay RCBO nguồn cấp!',
          'Đã tự động ngắt van nước và kích hoạt còi báo động khẩn cấp'
        );
        this.lastAlertTime = now;
      }
    }
    // 2. Suspected Contamination: Valve shutoff & Sample locking
    else if (currentStatus === 'SUSPECTED CONTAMINATION') {
      if (this.state.valve_mode === 'AUTO' && this.state.valve_state !== 'CLOSED') {
        this.setValve('CLOSE', 'AUTO', 'Tự động khóa van do nghi ngờ ô nhiễm hóa sinh nghiêm trọng');
      }
      if (!this.state.sample_preserved) {
        this.triggerSamplePreservation(
          evaluation.anomaly_score,
          currentStatus,
          packet.readings,
          `Tự động khóa mẫu nước nghi vấn (Điểm bất thường: ${evaluation.anomaly_score}%)`
        );
      }
      if (!this.state.alarm_muted) {
        this.state.alarm_active = true;
      }
      if (isStatusChanged || canRepeatAlert) {
        this.recordAlert(
          'CRITICAL',
          currentStatus,
          'NGHI NGỜ Ô NHIỄM NGUỒN NƯỚC',
          `Điểm bất thường: ${evaluation.anomaly_score}%. ${evaluation.critical_factors.slice(0, 2).join(' | ')}`,
          'Đã đóng van nước và kích hoạt buồng lưu mẫu kiểm nghiệm'
        );
        this.lastAlertTime = now;
      }
    }
    // 3. Abnormal or Warning
    else if (currentStatus === 'ABNORMAL' || currentStatus === 'WARNING') {
      if (isStatusChanged || canRepeatAlert) {
        this.recordAlert(
          currentStatus === 'ABNORMAL' ? 'WARNING' : 'INFO',
          currentStatus,
          currentStatus === 'ABNORMAL' ? 'CHẤT LƯỢNG NƯỚC BẤT THƯỜNG' : 'CẢNH BÁO TRÔI DẠT THÔNG SỐ',
          `Điểm bất thường: ${evaluation.anomaly_score}%. ${evaluation.critical_factors.slice(0, 2).join(' | ') || 'Thông số lệch khỏi baseline'}`,
          'Hệ thống đang tăng cường giám sát 4-Layer Sentinel'
        );
        this.lastAlertTime = now;
      }
    }
    // 4. Normal status restore
    else if (currentStatus === 'NORMAL') {
      if (this.state.alarm_active && !this.state.alarm_muted) {
        this.state.alarm_active = false;
      }
      if (this.previousStatus !== 'NORMAL') {
        this.recordAlert(
          'INFO',
          'NORMAL',
          'NGUỒN NƯỚC ĐÃ PHỤC HỒI AN TOÀN',
          'Tất cả các thông số sinh hóa và an toàn điện đã trở lại dải kiểm soát an toàn.',
          'Hệ thống duy trì trạng thái giám sát tiêu chuẩn'
        );
        this.lastAlertTime = now;
      }
    }

    this.previousStatus = currentStatus;
  }
}
