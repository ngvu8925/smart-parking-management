import { Controller, Post, Body } from '@nestjs/common';
import { ActuatorsService } from './actuators.service';

@Controller('api/actuators')
export class ActuatorsController {
  constructor(private readonly actuatorsService: ActuatorsService) {}

  @Post('valve')
  setValve(@Body() body: { action: 'OPEN' | 'CLOSE' | 'AUTO'; mode?: 'AUTO' | 'MANUAL' }) {
    this.actuatorsService.setValve(
      body.action,
      body.mode,
      `Lệnh từ API Client (${body.mode || body.action})`
    );
    return {
      success: true,
      actuators: this.actuatorsService.state
    };
  }

  @Post('sample/trigger')
  triggerSample() {
    this.actuatorsService.triggerSamplePreservation(
      0.0,
      'MANUAL_TRIGGER',
      {},
      'Kích hoạt lưu mẫu thủ công từ Mobile/Dashboard'
    );
    return {
      success: true,
      actuators: this.actuatorsService.state
    };
  }

  @Post('sample/reset')
  resetSample() {
    this.actuatorsService.resetSampleVial();
    return {
      success: true,
      actuators: this.actuatorsService.state
    };
  }

  @Post('alarm')
  setAlarm(@Body() body: { muted: boolean }) {
    this.actuatorsService.setAlarmMute(body.muted);
    return {
      success: true,
      actuators: this.actuatorsService.state
    };
  }
}
