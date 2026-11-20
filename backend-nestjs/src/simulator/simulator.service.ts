import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import { PhysicsService } from './physics.service';
import { ScenarioService } from './scenario.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { TelemetryPacket, SensorReading } from '../types/models';
import { BASELINE_PROFILE } from '../config/baseline.config';

@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulatorService.name);
  private timer: NodeJS.Timeout | null = null;
  private sensorOverrides: Map<string, { source: string; status: string }> = new Map();

  constructor(
    private readonly physics: PhysicsService,
    private readonly scenarioService: ScenarioService,
    @Inject(forwardRef(() => TelemetryService))
    private readonly telemetryService: TelemetryService
  ) {}

  updateSensorConfig(sensor: string, source: string, status: string) {
    this.sensorOverrides.set(sensor, { source, status });
    this.logger.log(`Updated sensor config for [${sensor}]: source=${source}, status=${status}`);
  }

  onModuleInit() {
    this.logger.log('Starting NestJS Water Simulator Loop (1Hz interval)...');
    this.timer = setInterval(() => {
      this.tick();
    }, 1000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick() {
    try {
      this.scenarioService.stepTimer();
      const physicalVals = this.physics.step(1.0);
      const nowIso = new Date().toISOString();

      const readings: Record<string, SensorReading> = {};

      for (const [key, conf] of Object.entries(BASELINE_PROFILE)) {
        const val = physicalVals[key] ?? conf.nominal;
        const ch = this.physics.getChannel(key);
        const isStuck = ch ? ch.isStuck : false;

        const isLiveDefault = ['ph', 'ec', 'tds', 'turbidity', 'temperature', 'electrical_leak'].includes(key);
        const override = this.sensorOverrides.get(key);
        const source = override ? override.source : (isLiveDefault ? 'hardware' : 'simulator');
        const status = override ? override.status : (isLiveDefault ? 'LIVE' : (key === 'chlorine' ? 'BETA' : 'SIMULATED'));

        readings[key] = {
          sensor: key,
          value: key === 'electrical_leak' ? (val >= 0.5 ? 1.0 : 0.0) : parseFloat(val.toFixed(3)),
          unit: conf.unit,
          source: source as any,
          status: status as any,
          timestamp: nowIso,
          is_stuck: isStuck
        };
      }

      const packet: TelemetryPacket = {
        device_id: 'water-guardian-node-01',
        timestamp: nowIso,
        readings,
        wifi_rssi: -52,
        firmware_version: '2.0.0-nestjs-sentinel'
      };

      this.telemetryService.processIncomingPacket(packet);
    } catch (e) {
      this.logger.error('Error in simulator tick:', e);
    }
  }
}
