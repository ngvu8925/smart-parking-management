import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService]
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);
    service.onModuleInit();
  });

  afterAll(() => {
    service.onModuleDestroy();
  });

  it('should be defined and initialized', () => {
    expect(service).toBeDefined();
  });

  it('should seed default users and list them', () => {
    const users = service.listAllUsers();
    expect(users.length).toBeGreaterThanOrEqual(3);
    const lead = service.getUserByUsername('techlead.asao');
    expect(lead).toBeDefined();
    expect(lead?.email).toBe('techlead@asao.vn');
  });

  it('should retrieve assigned devices for users', () => {
    const devices = service.getUserDevices('usr-asao-01-lead');
    expect(devices.length).toBeGreaterThanOrEqual(2);
    expect(devices[0].device_id).toBe('water-guardian-node-01');
  });

  it('should record telemetry and retrieve history', () => {
    const ts = new Date().toISOString();
    service.recordTelemetry({
      device_id: 'water-guardian-node-01',
      timestamp: ts,
      ph: 7.25,
      ec: 350,
      tds: 175,
      turbidity: 0.45,
      orp: 620,
      chlorine: 0.52,
      temperature: 27.2,
      nh4: 0.03,
      no3: 4.1,
      uv254: 0.02,
      electrical_leak: 0,
      anomaly_score: 5.2,
      status: 'NORMAL',
      diagnostic_pattern: 'NORMAL'
    });

    const history = service.getTelemetryHistory('water-guardian-node-01', 5);
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[history.length - 1].ph).toBe(7.25);
  });

  it('should record alerts and support acknowledgment with user attribution', () => {
    const alertId = service.recordAlert(
      'water-guardian-node-01',
      'WARNING',
      'WARNING',
      'Test Alert Title',
      'Test Alert Description'
    );
    expect(alertId).toBeGreaterThan(0);

    const ack = service.acknowledgeAlert(alertId, 'techlead.asao');
    expect(ack.success).toBe(true);
    expect(ack.acknowledged_by).toBe('techlead.asao');

    const alerts = service.getAlerts('water-guardian-node-01', 10);
    const target = alerts.find(a => a.id === alertId);
    expect(target).toBeDefined();
    expect(target.acknowledged_by).toBe('techlead.asao');
  });
});
