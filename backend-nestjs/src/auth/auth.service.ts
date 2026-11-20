import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService, AsaoUser } from '../database/database.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // Active persona for local dev mode (fallback when running outside Cloudflare Tunnel)
  private activeDevUserId: string = 'usr-asao-01-lead';

  // ASAO Tier 1 Baseline Keycloak Configuration
  public readonly keycloakConfig = {
    realm: 'asao',
    externalBaseUrl: 'https://auth-dev.asao.vn',
    internalBaseUrl: 'http://127.0.0.1:58181',
    clientId: 'water-guardian-sentinel'
  };

  constructor(private readonly db: DatabaseService) {}

  getKeycloakLoginUrl(redirectUri: string = 'http://localhost:8000/'): string {
    const authEndpoint = `${this.keycloakConfig.externalBaseUrl}/realms/${this.keycloakConfig.realm}/protocol/openid-connect/auth`;
    return `${authEndpoint}?client_id=${this.keycloakConfig.clientId}&response_type=code&scope=openid%20profile%20email&redirect_uri=${encodeURIComponent(redirectUri)}`;
  }

  getCurrentUser(authHeader?: string): AsaoUser {
    // 1. If real JWT bearer token is passed from Keycloak
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          const username = payload.preferred_username || payload.sub;
          let user = this.db.getUserByUsername(username);
          if (!user) {
            // Auto register authenticated Keycloak user into local cache
            const newUser: AsaoUser = {
              id: payload.sub,
              username: username,
              email: payload.email || `${username}@asao.vn`,
              full_name: payload.name || username,
              roles: payload.realm_access?.roles || ['water-operator'],
              department: 'ASAO Ecosystem',
              created_at: new Date().toISOString(),
              last_login_at: new Date().toISOString()
            };
            return newUser;
          }
          return user;
        }
      } catch (err) {
        this.logger.warn('Failed to parse bearer token, falling back to active dev persona:', err);
      }
    }

    // 2. Local Dev fallback to active persona
    const user = this.db.getUserById(this.activeDevUserId);
    if (user) return user;

    return {
      id: 'usr-asao-01-lead',
      username: 'techlead.asao',
      email: 'techlead@asao.vn',
      full_name: 'Nguyễn Văn Thắng (ASAO Tech Lead)',
      roles: ['asao-admin', 'water-supervisor'],
      department: 'ASAO R&D Core Lab',
      created_at: new Date().toISOString(),
      last_login_at: new Date().toISOString()
    };
  }

  switchDevPersona(userId: string): AsaoUser | null {
    const user = this.db.getUserById(userId);
    if (user) {
      this.activeDevUserId = user.id;
      this.logger.log(`Switched active ASAO dev persona to: ${user.username} (${user.email})`);
      return user;
    }
    return null;
  }

  listPersonas(): AsaoUser[] {
    return this.db.listAllUsers();
  }

  getUserDevices(userId: string) {
    return this.db.getUserDevices(userId);
  }
}
