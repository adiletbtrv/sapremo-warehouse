import type { Server as HttpServer, IncomingMessage } from 'http';
import type { Express, Request, Response } from 'express';
import { WebSocketServer, WebSocket } from 'ws';

interface StompSubscription {
  id: string;
  destination: string;
}

interface ClientSession {
  id: string;
  ws: WebSocket;
  isSockJs: boolean;
  subscriptions: Map<string, StompSubscription>;
  heartbeatTimer?: ReturnType<typeof setInterval>;
}

interface ParsedStompFrame {
  command: string;
  headers: Record<string, string>;
  body: string;
}

function parseStompFrame(raw: string): ParsedStompFrame | null {
  const cleaned = raw.replace(/\0+$/, '');
  if (!cleaned.trim()) return null;

  const dividerIndex = cleaned.indexOf('\n\n');
  const headerPart = dividerIndex >= 0 ? cleaned.slice(0, dividerIndex) : cleaned;
  const bodyPart = dividerIndex >= 0 ? cleaned.slice(dividerIndex + 2) : '';

  const lines = headerPart.split(/\r?\n/);
  const command = (lines[0] ?? '').trim().toUpperCase();
  if (!command) return null;

  const headers: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      headers[key] = value;
    }
  }

  return { command, headers, body: bodyPart };
}

function serializeStompFrame(
  command: string,
  headers: Record<string, string>,
  body = ''
): string {
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .join('\n');
  return `${command}\n${headerLines}\n\n${body}\0`;
}

export class StompBroker {
  private wss: WebSocketServer;
  private sessions: Map<string, ClientSession> = new Map();
  private messageCounter = 1;

  constructor(server: HttpServer, app: Express) {
    // Register SockJS /info endpoints for both /api/warehouse/ws and /ws
    const sockJsInfoHandler = (_req: Request, res: Response) => {
      res.setHeader('Access-Control-Allow-Origin', _req.headers.origin || '*');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Cache-Control', 'no-store, no-cache, no-transform, must-revalidate, max-age=0');
      res.status(200).json({
        websocket: true,
        origins: ['*:*'],
        cookie_needed: false,
        entropy: Math.floor(Math.random() * 2_000_000_000),
      });
    };

    app.get('/api/warehouse/ws/info', sockJsInfoHandler);
    app.get('/ws/info', sockJsInfoHandler);

    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request: IncomingMessage, socket, head) => {
      const url = request.url ?? '';
      if (url.startsWith('/api/warehouse/ws') || url.startsWith('/ws')) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      } else {
        socket.destroy();
      }
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      const url = req.url ?? '';
      const isSockJs = /\/[^/]+\/[^/]+\/websocket(?:\?.*)?$/.test(url);
      const sessionId = `stomp-sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      const session: ClientSession = {
        id: sessionId,
        ws,
        isSockJs,
        subscriptions: new Map(),
      };
      this.sessions.set(sessionId, session);

      if (isSockJs) {
        // SockJS open frame
        this.sendRaw(session, 'o');
        session.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            this.sendRaw(session, 'h');
          }
        }, 15_000);
      } else {
        session.heartbeatTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            this.sendRaw(session, '\n');
          }
        }, 15_000);
      }

      ws.on('message', (data) => {
        const rawStr = typeof data === 'string' ? data : data.toString('utf8');
        this.handleIncomingPayload(session, rawStr);
      });

      ws.on('close', () => {
        if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
        this.sessions.delete(sessionId);
      });

      ws.on('error', () => {
        if (session.heartbeatTimer) clearInterval(session.heartbeatTimer);
        this.sessions.delete(sessionId);
      });
    });
  }

  private sendRaw(session: ClientSession, data: string): void {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(data);
    }
  }

  private sendStompFrame(
    session: ClientSession,
    command: string,
    headers: Record<string, string>,
    body = ''
  ): void {
    const frame = serializeStompFrame(command, headers, body);
    if (session.isSockJs) {
      this.sendRaw(session, `a${JSON.stringify([frame])}`);
    } else {
      this.sendRaw(session, frame);
    }
  }

  private handleIncomingPayload(session: ClientSession, rawStr: string): void {
    if (!rawStr || rawStr === '\n' || rawStr === '\r\n') return;

    let payloads: string[] = [rawStr];
    if (session.isSockJs) {
      try {
        const parsed = JSON.parse(rawStr) as unknown;
        if (Array.isArray(parsed)) {
          payloads = parsed.map(String);
        } else if (typeof parsed === 'string') {
          payloads = [parsed];
        }
      } catch {
        return;
      }
    }

    for (const item of payloads) {
      const frame = parseStompFrame(item);
      if (!frame) continue;

      switch (frame.command) {
        case 'CONNECT':
        case 'STOMP': {
          this.sendStompFrame(session, 'CONNECTED', {
            version: '1.2',
            'heart-beat': '4000,4000',
            server: 'Sapremo-Mock-STOMP/1.2',
            session: session.id,
          });
          break;
        }
        case 'SUBSCRIBE': {
          const subId = frame.headers['id'] ?? `sub-${session.subscriptions.size + 1}`;
          const destination = frame.headers['destination'] ?? '';
          if (destination) {
            session.subscriptions.set(subId, { id: subId, destination });
          }
          if (frame.headers['receipt']) {
            this.sendStompFrame(session, 'RECEIPT', {
              'receipt-id': frame.headers['receipt'],
            });
          }
          break;
        }
        case 'UNSUBSCRIBE': {
          const subId = frame.headers['id'];
          if (subId) {
            session.subscriptions.delete(subId);
          }
          break;
        }
        case 'SEND': {
          const destination = frame.headers['destination'];
          if (destination) {
            let parsedBody: unknown = frame.body;
            try {
              parsedBody = JSON.parse(frame.body);
            } catch {
              // preserve string body
            }
            this.publish(destination, parsedBody);
          }
          break;
        }
        case 'DISCONNECT': {
          if (frame.headers['receipt']) {
            this.sendStompFrame(session, 'RECEIPT', {
              'receipt-id': frame.headers['receipt'],
            });
          }
          session.ws.close();
          break;
        }
      }
    }
  }

  /**
   * Publishes an event payload to all STOMP subscribers listening on `destination`.
   */
  public publish(destination: string, payload: unknown): void {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const msgId = `msg-${this.messageCounter++}`;

    for (const session of this.sessions.values()) {
      for (const sub of session.subscriptions.values()) {
        if (sub.destination === destination) {
          this.sendStompFrame(
            session,
            'MESSAGE',
            {
              subscription: sub.id,
              'message-id': msgId,
              destination,
              'content-type': 'application/json',
            },
            body
          );
        }
      }
    }
  }

  public getConnectedClientsCount(): number {
    return this.sessions.size;
  }
}

