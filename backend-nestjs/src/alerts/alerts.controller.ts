import { Controller, Get, Post, Query, Param, Body } from '@nestjs/common';
import { AlertsService } from './alerts.service';

@Controller('api')
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get('alerts')
  getAlerts(@Query('limit') limit?: string, @Query('device_id') deviceId?: string) {
    const lim = parseInt(limit || '50', 10) || 50;
    return this.alertsService.getAlerts(lim, deviceId);
  }

  @Post('alerts/:id/ack')
  ackAlert(@Param('id') id: string, @Body() body?: { username?: string }) {
    const alertId = parseInt(id, 10);
    return this.alertsService.acknowledgeAlert(alertId, body?.username);
  }

  @Get('samples')
  getSamples(@Query('limit') limit?: string, @Query('device_id') deviceId?: string) {
    const lim = parseInt(limit || '20', 10) || 20;
    return this.alertsService.getPreservedSamples(lim, deviceId);
  }

  @Post('alerts/clear')
  clearAlerts() {
    return this.alertsService.clearAlerts();
  }
}
