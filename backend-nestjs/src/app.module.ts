import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { SimulatorModule } from './simulator/simulator.module';
import { TelemetryModule } from './telemetry/telemetry.module';
import { ActuatorsModule } from './actuators/actuators.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    SimulatorModule,
    TelemetryModule,
    ActuatorsModule,
    AlertsModule
  ]
})
export class AppModule {}

