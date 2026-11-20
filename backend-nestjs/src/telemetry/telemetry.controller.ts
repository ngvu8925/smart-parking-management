import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { ScenarioService } from '../simulator/scenario.service';
import { SimulatorService } from '../simulator/simulator.service';

@Controller('api')
export class TelemetryController {
  constructor(
    private readonly telemetryService: TelemetryService,
    private readonly scenarioService: ScenarioService,
    private readonly simulatorService: SimulatorService
  ) {}

  @Get('status')
  getStatus() {
    return this.telemetryService.getCurrentStatus();
  }

  @Get('telemetry/latest')
  getLatestTelemetry(@Query('limit') limit: string) {
    const lim = parseInt(limit, 10) || 60;
    return this.telemetryService.getLatestTelemetry(lim);
  }

  @Get('history/telemetry')
  getTelemetryHistory(
    @Query('device_id') deviceId?: string,
    @Query('limit') limit?: string
  ) {
    const lim = parseInt(limit || '60', 10) || 60;
    const node = deviceId || 'water-guardian-node-01';
    return this.telemetryService.getTelemetryHistory(node, lim);
  }

  @Get('scenarios')
  getScenarios() {
    return {
      active: this.scenarioService.getActiveScenario(),
      scenarios: this.scenarioService.listScenarios()
    };
  }

  @Post('scenarios/activate')
  activateScenario(@Body() body: { scenario_id: string }) {
    const success = this.scenarioService.activateScenario(body.scenario_id);
    return {
      success,
      active_scenario: this.scenarioService.getActiveScenario()
    };
  }

  @Post('baseline/reset')
  resetBaseline() {
    return this.telemetryService.resetBaseline();
  }

  @Post('sensors/config')
  updateSensorConfig(@Body() body: { sensor: string; source: string; status: string }) {
    this.simulatorService.updateSensorConfig(body.sensor, body.source, body.status);
    return {
      success: true,
      sensor: body.sensor,
      source: body.source,
      status: body.status
    };
  }
}
