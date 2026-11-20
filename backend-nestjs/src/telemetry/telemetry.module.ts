import { Module, forwardRef } from '@nestjs/common';
import { TelemetryService } from './telemetry.service';
import { TelemetryController } from './telemetry.controller';
import { TelemetryGateway } from './telemetry.gateway';
import { ActuatorsModule } from '../actuators/actuators.module';
import { SimulatorModule } from '../simulator/simulator.module';

@Module({
  imports: [ActuatorsModule, forwardRef(() => SimulatorModule)],
  controllers: [TelemetryController],
  providers: [TelemetryService, TelemetryGateway],
  exports: [TelemetryService, TelemetryGateway]
})
export class TelemetryModule {}
