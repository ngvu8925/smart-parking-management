import { Module } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { AlertsController } from './alerts.controller';
import { ActuatorsModule } from '../actuators/actuators.module';

@Module({
  imports: [ActuatorsModule],
  controllers: [AlertsController],
  providers: [AlertsService]
})
export class AlertsModule {}
