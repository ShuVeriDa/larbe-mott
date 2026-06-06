import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Notification } from '@prisma/client';
import type { IncomingMessage } from 'http';
import { Server, WebSocket } from 'ws';
import { JwtWsHelper } from './jwt-ws.helper';

const MAX_CONNECTIONS_PER_USER = 5;

@Injectable()
@WebSocketGateway({
  path: '/ws/notifications',
  transports: ['websocket'],
})
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  // userId → Set of sockets (multiple tabs supported)
  private readonly clients = new Map<string, Set<WebSocket>>();

  // socket → userId (for fast disconnect lookup)
  private readonly socketToUser = new Map<WebSocket, string>();

  constructor(private readonly jwtWsHelper: JwtWsHelper) {}

  handleConnection(client: WebSocket, req: IncomingMessage): void {
    // Auth is async (Redis blacklist check) — verify then register or close.
    // We must not await here because NestJS WsAdapter does not await handleConnection,
    // so we kick off the async work immediately and register the socket after it resolves.
    void this.authenticate(client, req);
  }

  private async authenticate(client: WebSocket, req: IncomingMessage): Promise<void> {
    const auth = await this.jwtWsHelper.verifyHandshake(req);

    if (!auth) {
      client.close(4001, 'Unauthorized');
      return;
    }

    // Client may have disconnected while we were verifying
    if (client.readyState !== WebSocket.OPEN) return;

    const { userId } = auth;

    const userSockets = this.clients.get(userId) ?? new Set<WebSocket>();

    if (userSockets.size >= MAX_CONNECTIONS_PER_USER) {
      client.close(4002, 'Too many connections');
      return;
    }

    userSockets.add(client);
    this.clients.set(userId, userSockets);
    this.socketToUser.set(client, userId);

    this.logger.log(`User ${userId} connected (${userSockets.size} sockets)`);

    client.on('pong', () => {
      // Connection is alive — no action needed
    });
  }

  handleDisconnect(client: WebSocket): void {
    const userId = this.socketToUser.get(client);
    if (!userId) return;

    this.socketToUser.delete(client);

    const userSockets = this.clients.get(userId);
    if (userSockets) {
      userSockets.delete(client);
      if (userSockets.size === 0) {
        this.clients.delete(userId);
        this.logger.debug(`User ${userId} fully disconnected`);
      }
    }
  }

  sendToUser(userId: string, notification: Notification): void {
    const userSockets = this.clients.get(userId);
    if (!userSockets || userSockets.size === 0) {
      this.logger.debug(`sendToUser: no active sockets for user ${userId}`);
      return;
    }

    const payload = JSON.stringify(notification);
    let sent = 0;

    for (const socket of userSockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
        sent++;
      }
    }

    this.logger.log(`sendToUser: sent to ${sent}/${userSockets.size} sockets for user ${userId}`);
  }
}
