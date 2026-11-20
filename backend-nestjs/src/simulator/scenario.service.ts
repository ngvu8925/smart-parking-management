import { Injectable, Logger } from '@nestjs/common';
import { Scenario } from '../types/models';
import { PhysicsService } from './physics.service';

@Injectable()
export class ScenarioService {
  private readonly logger = new Logger(ScenarioService.name);
  private scenarios: Map<string, Scenario> = new Map();
  private activeScenarioId: string = 'normal';
  private scenarioStartTime: number = Date.now();
  private scenarioDuration: number = 0;

  constructor(private readonly physics: PhysicsService) {
    this.loadScenarios();
  }

  private loadScenarios() {
    const list: Scenario[] = [
      {
        id: 'normal',
        name: 'Nước sạch đô thị (Normal Clean Water)',
        description: 'Nguồn nước máy đạt chuẩn, các chỉ số dao động tự nhiên quanh baseline.',
        duration_seconds: 0,
        transition_seconds: 5,
        targets: {
          ph: 7.20, ec: 350.0, tds: 175.0, turbidity: 0.40, orp: 620.0,
          chlorine: 0.50, temperature: 27.5, nh4: 0.03, no3: 4.0, uv254: 0.020, electrical_leak: 0.0
        }
      },
      {
        id: 'muddy_water',
        name: 'Nước vẩn đục / Sụt lở cặn (Muddy Water Influx)',
        description: 'Độ đục tăng vọt do vỡ đường ống hoặc súc rửa bùn đất.',
        duration_seconds: 60,
        transition_seconds: 8,
        targets: {
          ph: 7.10, ec: 420.0, tds: 210.0, turbidity: 12.80, orp: 540.0,
          chlorine: 0.35, temperature: 27.8, nh4: 0.08, no3: 5.2, uv254: 0.045, electrical_leak: 0.0
        }
      },
      {
        id: 'salt_spike',
        name: 'Nhiễm khoáng / Xâm nhập mặn (Saline & Ion Surge)',
        description: 'EC và TDS tăng đột biến do nước mặn hoặc rò rỉ hóa chất vô cơ.',
        duration_seconds: 60,
        transition_seconds: 10,
        targets: {
          ph: 7.35, ec: 1850.0, tds: 925.0, turbidity: 0.65, orp: 590.0,
          chlorine: 0.42, temperature: 28.0, nh4: 0.05, no3: 6.5, uv254: 0.025, electrical_leak: 0.0
        }
      },
      {
        id: 'acid_contamination',
        name: 'Nhiễm axit công nghiệp (Acid Contamination)',
        description: 'Nguồn nước bị axit hóa, pH giảm sâu dưới 5.0, nguy hiểm ăn mòn và ngộ độc.',
        duration_seconds: 60,
        transition_seconds: 8,
        targets: {
          ph: 4.60, ec: 890.0, tds: 445.0, turbidity: 1.20, orp: 780.0,
          chlorine: 0.15, temperature: 29.2, nh4: 0.04, no3: 4.8, uv254: 0.035, electrical_leak: 0.0
        }
      },
      {
        id: 'chlorine_failure',
        name: 'Mất clo khử trùng (Chlorine Depletion)',
        description: 'Clo dư tụt về gần 0, nguy cơ mầm bệnh phát triển.',
        duration_seconds: 60,
        transition_seconds: 6,
        targets: {
          ph: 7.25, ec: 340.0, tds: 170.0, turbidity: 0.50, orp: 420.0,
          chlorine: 0.02, temperature: 27.5, nh4: 0.09, no3: 4.1, uv254: 0.038, electrical_leak: 0.0
        }
      },
      {
        id: 'ammonia_spike',
        name: 'Nhiễm Amoni / Nước thải (Ammonia Contamination)',
        description: 'Nồng độ NH4 tăng vọt, báo hiệu nước thải sinh hoạt hoặc phân bón hữu cơ.',
        duration_seconds: 60,
        transition_seconds: 8,
        targets: {
          ph: 7.65, ec: 580.0, tds: 290.0, turbidity: 2.10, orp: 460.0,
          chlorine: 0.08, temperature: 28.1, nh4: 0.72, no3: 6.8, uv254: 0.062, electrical_leak: 0.0
        }
      },
      {
        id: 'nitrate_spike',
        name: 'Nhiễm Nitrat nông nghiệp (Nitrate Runoff)',
        description: 'Nồng độ NO3 tăng cao vượt chuẩn an toàn do phân bón nông nghiệp.',
        duration_seconds: 60,
        transition_seconds: 8,
        targets: {
          ph: 7.30, ec: 620.0, tds: 310.0, turbidity: 1.10, orp: 580.0,
          chlorine: 0.38, temperature: 27.6, nh4: 0.08, no3: 28.5, uv254: 0.030, electrical_leak: 0.0
        }
      },
      {
        id: 'organic_contamination',
        name: 'Nhiễm chất hữu cơ / UV254 tăng (Organic Pollution)',
        description: 'Chỉ số UV254 tăng vọt và ORP sụt giảm, báo hiệu sự hiện diện của hợp chất hữu cơ hòa tan.',
        duration_seconds: 60,
        transition_seconds: 8,
        targets: {
          ph: 6.85, ec: 490.0, tds: 245.0, turbidity: 2.40, orp: 280.0,
          chlorine: 0.05, temperature: 28.5, nh4: 0.22, no3: 7.4, uv254: 0.145, electrical_leak: 0.0
        }
      },
      {
        id: 'electrical_leak',
        name: 'Nguy cơ rò điện khẩn cấp (Electrical Leakage Hazard)',
        description: 'Cảm biến an toàn phát hiện dòng điện rò rỉ vào buồng nước. Nguy cơ điện giật!',
        duration_seconds: 60,
        transition_seconds: 1,
        targets: {
          ph: 7.20, ec: 360.0, tds: 180.0, turbidity: 0.40, orp: 620.0,
          chlorine: 0.50, temperature: 27.5, nh4: 0.03, no3: 4.0, uv254: 0.020, electrical_leak: 1.0
        }
      },
      {
        id: 'sensor_stuck',
        name: 'Lỗi kẹt cảm biến (Stuck Sensor Hardware Fault)',
        description: 'Cảm biến pH bị đông cứng số liệu, chẩn đoán lỗi phần cứng.',
        duration_seconds: 60,
        transition_seconds: 2,
        targets: {
          ph: 7.21, ec: 350.0, tds: 175.0, turbidity: 0.40, orp: 620.0,
          chlorine: 0.50, temperature: 27.5, nh4: 0.03, no3: 4.0, uv254: 0.020, electrical_leak: 0.0
        },
        faults: { stuck_sensors: ['ph'] }
      },
      {
        id: 'mixed_contamination',
        name: 'Thảm họa ô nhiễm phức hợp (Severe Mixed Contamination)',
        description: 'Nhiễm độc tổng hợp nghiêm trọng: pH axit, EC vọt, độ đục cao, mất clo và nhiễm Amoni.',
        duration_seconds: 60,
        transition_seconds: 6,
        targets: {
          ph: 5.10, ec: 1800.0, tds: 900.0, turbidity: 8.50, orp: 250.0,
          chlorine: 0.05, temperature: 29.5, nh4: 0.85, no3: 16.0, uv254: 0.095, electrical_leak: 0.0
        }
      }
    ];

    for (const sc of list) {
      this.scenarios.set(sc.id, sc);
    }
  }

  listScenarios(): Scenario[] {
    return Array.from(this.scenarios.values());
  }

  getActiveScenario(): Scenario {
    return this.scenarios.get(this.activeScenarioId) ?? this.scenarios.get('normal')!;
  }

  activateScenario(scenarioId: string): boolean {
    const sc = this.scenarios.get(scenarioId);
    if (!sc) {
      this.logger.warn(`Scenario ${scenarioId} not found`);
      return false;
    }

    this.activeScenarioId = scenarioId;
    this.scenarioStartTime = Date.now();
    this.scenarioDuration = sc.duration_seconds;

    this.physics.resetAllFaults();
    this.physics.setTargets(sc.targets);

    if (sc.faults?.stuck_sensors) {
      for (const s of sc.faults.stuck_sensors) {
        this.physics.setStuck(s, true);
      }
    }

    this.logger.log(`Activated scenario: ${sc.name}`);
    return true;
  }

  stepTimer() {
    if (this.scenarioDuration > 0 && this.activeScenarioId !== 'normal') {
      const elapsed = (Date.now() - this.scenarioStartTime) / 1000;
      if (elapsed >= this.scenarioDuration) {
        this.logger.log(`Scenario ${this.activeScenarioId} finished. Reverting to normal.`);
        this.activateScenario('normal');
      }
    }
  }
}
