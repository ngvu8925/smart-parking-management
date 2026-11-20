/**
 * Mobile API & WebSocket Service (TypeScript) for Smart Water Guardian
 */
import { SystemStatusResponse, TelemetryPacket } from "../types";

class WaterApiService {
  public serverHost: string = "172.20.10.2";
  public serverPort: string = "8000";
  private ws: WebSocket | null = null;
  public isConnected: boolean = false;
  private reconnectTimer: any = null;

  getBaseUrl(): string {
    return `http://${this.serverHost}:${this.serverPort}`;
  }

  getWsUrl(): string {
    return `ws://${this.serverHost}:${this.serverPort}/ws/live`;
  }

  setServerAddress(host: string, port: string = "8000"): void {
    this.serverHost = host.trim();
    this.serverPort = port.trim();
    if (this.ws) {
      this.disconnectWebSocket();
    }
  }

  async getStatus(): Promise<SystemStatusResponse | null> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/status`);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      return (await res.json()) as SystemStatusResponse;
    } catch (e) {
      console.warn("[Mobile API] getStatus error:", e);
      return null;
    }
  }

  async getUserProfile(): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/me`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("[Mobile API] getUserProfile error:", e);
      return null;
    }
  }

  async switchPersona(userId: string): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/auth/switch-persona`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async acknowledgeAlert(alertId: number, username?: string): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/alerts/${alertId}/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async getScenarios(): Promise<{ scenarios: any[]; active: any }> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/scenarios`);
      return await res.json();
    } catch (e) {
      return { scenarios: [], active: { id: "normal" } };
    }
  }

  async activateScenario(scenarioId: string): Promise<{ success: boolean; active_scenario?: any }> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/scenarios/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario_id: scenarioId })
      });
      return await res.json();
    } catch (e) {
      console.error("[Mobile API] activateScenario error:", e);
      return { success: false };
    }
  }

  async setValve(action: "OPEN" | "CLOSE", mode: "AUTO" | "MANUAL" = "MANUAL"): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/actuators/valve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async triggerSample(): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/actuators/sample/trigger`, {
        method: "POST"
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async resetSample(): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/actuators/sample/reset`, {
        method: "POST"
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async setAlarm(muted: boolean): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/actuators/alarm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muted })
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async resetBaseline(): Promise<any> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/baseline/reset`, {
        method: "POST"
      });
      return await res.json();
    } catch (e) {
      return { success: false };
    }
  }

  async getSamples(limit: number = 10): Promise<any[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/samples?limit=${limit}`);
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  async getAlerts(limit: number = 20): Promise<any[]> {
    try {
      const res = await fetch(`${this.getBaseUrl()}/api/alerts?limit=${limit}`);
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  connectWebSocket(
    onMessage: (packet: TelemetryPacket) => void,
    onConnChange?: (connected: boolean) => void
  ): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      const wsUrl = this.getWsUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        if (onConnChange) onConnChange(true);
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
      };

      this.ws.onmessage = (event) => {
        try {
          const data: TelemetryPacket = JSON.parse(event.data);
          if (onMessage) onMessage(data);
        } catch (err) {
          console.warn("[Mobile WS] Parse error:", err);
        }
      };

      this.ws.onerror = () => {
        this.isConnected = false;
        if (onConnChange) onConnChange(false);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (onConnChange) onConnChange(false);
        this.reconnectTimer = setTimeout(() => {
          this.connectWebSocket(onMessage, onConnChange);
        }, 2000);
      };
    } catch (e) {
      console.warn("[Mobile WS] Connection attempt failed:", e);
      if (onConnChange) onConnChange(false);
    }
  }

  disconnectWebSocket(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

export const apiService = new WaterApiService();
