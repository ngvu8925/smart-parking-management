import { Injectable } from '@nestjs/common';
import { ActuatorsService } from '../actuators/actuators.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AlertsService {
  constructor(
    private readonly actuatorsService: ActuatorsService,
    private readonly db: DatabaseService
  ) {}

  getAlerts(limit: number = 50, deviceId?: string) {
    const dbAlerts = this.db.getAlerts(deviceId, limit);
    if (dbAlerts && dbAlerts.length > 0) {
      return dbAlerts;
    }
    return this.actuatorsService.alerts.slice(0, limit);
  }

  getPreservedSamples(limit: number = 20, deviceId?: string) {
    const dbSamples = this.db.getPreservedSamples(deviceId, limit);
    if (dbSamples && dbSamples.length > 0) {
      return dbSamples.map(s => {
        try {
          return {
            ...s,
            readings_snapshot: typeof s.readings_snapshot === 'string' ? JSON.parse(s.readings_snapshot) : s.readings_snapshot
          };
        } catch {
          return s;
        }
      });
    }
    return this.actuatorsService.preservedSamples.slice(0, limit);
  }

  acknowledgeAlert(alertId: number, username?: string) {
    return this.actuatorsService.acknowledgeAlert(alertId, username);
  }

  clearAlerts() {
    return this.actuatorsService.clearAlerts();
  }
}
