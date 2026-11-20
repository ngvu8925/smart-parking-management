import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, WebSocket } from 'ws';

@WebSocketGateway({ path: '/ws/live' })
export class TelemetryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(TelemetryGateway.name);

  @WebSocketServer()
  server!: Server;

  private connectedClients: Set<WebSocket> = new Set();
  private latestPayload: string | null = null;

  handleConnection(client: WebSocket) {
    this.connectedClients.add(client);
    this.logger.log(`WebSocket client connected. Total: ${this.connectedClients.size}`);

    // Send latest state immediately upon connection
    if (this.latestPayload && client.readyState === WebSocket.OPEN) {
      try {
        client.send(this.latestPayload);
      } catch (e) {
        // ignore
      }
    }
  }

  handleDisconnect(client: WebSocket) {
    this.connectedClients.delete(client);
    this.logger.log(`WebSocket client disconnected. Remaining: ${this.connectedClients.size}`);
  }

  broadcast(payload: any) {
    const jsonStr = JSON.stringify(payload);
    this.latestPayload = jsonStr;

    for (const client of this.connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(jsonStr);
        } catch (e) {
          this.connectedClients.delete(client);
        }
      }
    }
  }
}
