import { Controller, Get, Post, Body, Headers } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getCurrentUser(@Headers('authorization') authHeader?: string) {
    const user = this.authService.getCurrentUser(authHeader);
    const devices = this.authService.getUserDevices(user.id);
    return {
      user,
      devices,
      dev_environment: {
        is_dev: true,
        ribbon_text: '[DEV] MÔI TRƯỜNG PHÁT TRIỂN • auth-dev.asao.vn • Dữ liệu thử nghiệm nội bộ • Không dùng mật khẩu thực tế',
        keycloak_endpoint: this.authService.keycloakConfig.externalBaseUrl,
        realm: this.authService.keycloakConfig.realm,
        adr_standard: 'ADR-0042 (Single-Domain & OSS Unified Auth)'
      }
    };
  }

  @Get('login-url')
  getLoginUrl() {
    return {
      login_url: this.authService.getKeycloakLoginUrl()
    };
  }

  @Get('personas')
  listPersonas() {
    return {
      personas: this.authService.listPersonas()
    };
  }

  @Post('switch-persona')
  switchPersona(@Body() body: { user_id: string }) {
    const user = this.authService.switchDevPersona(body.user_id);
    return {
      success: !!user,
      user
    };
  }
}
