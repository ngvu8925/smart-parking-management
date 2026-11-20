import { Module, forwardRef } from '@nestjs/common';
import { PhysicsService } from './physics.service';
import { ScenarioService } from './scenario.service';
import { SimulatorService } from './simulator.service';
import { TelemetryModule } from '../telemetry/telemetry.module';

@Module({
  imports: [forwardRef(() => TelemetryModule)],
  providers: [PhysicsService, ScenarioService, SimulatorService],
  exports: [PhysicsService, ScenarioService, SimulatorService]
})
export class SimulatorModule {}
