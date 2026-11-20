import { Injectable } from '@nestjs/common';
import { BASELINE_PROFILE } from '../config/baseline.config';

class PhysicsChannel {
  name: string;
  currentValue: number;
  targetValue: number;
  nominalStd: number;
  timeConstant: number;
  driftRate: number;
  isStuck: boolean = false;
  stuckValue: number | null = null;
  spikeProbability: number = 0.02;

  constructor(
    name: string,
    initialValue: number,
    nominalStd: number,
    timeConstant: number = 2.5,
    driftRate: number = 0.0001
  ) {
    this.name = name;
    this.currentValue = initialValue;
    this.targetValue = initialValue;
    this.nominalStd = nominalStd;
    this.timeConstant = Math.max(0.2, timeConstant);
    this.driftRate = driftRate;
  }

  // Box-Muller Gaussian random generator
  private randomGaussian(mean: number, stdDev: number): number {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * stdDev;
  }

  step(dt: number): number {
    if (this.isStuck) {
      return this.stuckValue ?? this.currentValue;
    }

    // First-order inertia response
    const alpha = 1.0 - Math.exp(-dt / this.timeConstant);
    this.currentValue += alpha * (this.targetValue - this.currentValue);

    // Random walk thermal drift
    this.currentValue += this.randomGaussian(0, this.driftRate * Math.sqrt(dt));

    // Sensor measurement noise
    const noise = this.randomGaussian(0, this.nominalStd);

    // Transient bubble/particle spike
    let transient = 0;
    if (Math.random() < this.spikeProbability) {
      const sign = Math.random() > 0.5 ? 1 : -1;
      transient = sign * this.nominalStd * 3.5;
    }

    let measured = this.currentValue + noise + transient;

    // Physical bounds
    if (this.name === 'ph') {
      measured = Math.max(0, Math.min(14, measured));
    } else if (['ec', 'tds', 'turbidity', 'chlorine', 'nh4', 'no3', 'uv254'].includes(this.name)) {
      measured = Math.max(0, measured);
    } else if (this.name === 'electrical_leak') {
      measured = measured >= 0.5 ? 1.0 : 0.0;
    }

    return measured;
  }
}

@Injectable()
export class PhysicsService {
  private channels: Map<string, PhysicsChannel> = new Map();

  constructor() {
    this.initChannels();
  }

  private initChannels() {
    for (const [key, conf] of Object.entries(BASELINE_PROFILE)) {
      if (key === 'electrical_leak') {
        this.channels.set(key, new PhysicsChannel(key, 0.0, 0.0, 0.2, 0.0));
      } else {
        const timeConstant = key === 'turbidity' || key === 'ec' ? 2.0 : 4.0;
        this.channels.set(
          key,
          new PhysicsChannel(
            key,
            conf.nominal,
            conf.std * 0.4,
            timeConstant,
            conf.std * 0.005
          )
        );
      }
    }
  }

  setTargets(targets: Record<string, number>) {
    for (const [k, v] of Object.entries(targets)) {
      const ch = this.channels.get(k);
      if (ch) ch.targetValue = v;
    }
  }

  setStuck(sensorKey: string, stuck: boolean = true) {
    const ch = this.channels.get(sensorKey);
    if (ch) {
      ch.isStuck = stuck;
      ch.stuckValue = stuck ? ch.currentValue : null;
    }
  }

  resetAllFaults() {
    for (const ch of this.channels.values()) {
      ch.isStuck = false;
      ch.stuckValue = null;
    }
  }

  step(dt: number = 1.0): Record<string, number> {
    const results: Record<string, number> = {};
    for (const [k, ch] of this.channels.entries()) {
      results[k] = ch.step(dt);
    }
    return results;
  }

  getChannel(key: string): PhysicsChannel | undefined {
    return this.channels.get(key);
  }
}
