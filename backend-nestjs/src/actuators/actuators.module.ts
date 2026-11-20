import { Module } from '@nestjs/common';
import { ActuatorsService } from './actuators.service';
import { ActuatorsController } from './actuators.controller';

@Module({
  controllers: [ActuatorsController],
  providers: [ActuatorsService],
  exports: [ActuatorsService]
})
export class ActuatorsModule {}
