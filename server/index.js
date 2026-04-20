import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT || 8080);
const publicClientUrl = 'https://gps-pseudotelemetry-lab.vercel.app';
const defaultAllowedOrigins = [
  publicClientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

function normalizeOrigin(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || defaultAllowedOrigins.join(','))
    .split(',')
    .map((value) => normalizeOrigin(value))
    .filter(Boolean)
);

const clients = new Map();

function nowEpochMs() {
  return Date.now();
}

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getSessionClients(sessionId, role) {
  const results = [];
  for (const [ws, client] of clients.entries()) {
    if (client.sessionId === sessionId && (!role || client.role === role)) {
      results.push([ws, client]);
    }
  }
  return results;
}

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return allowedOrigins.has(normalizeOrigin(origin));
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      service: 'gps-pseudotelemetry-lab-server',
      port,
      serverEpochMs: nowEpochMs(),
      allowedOrigins: Array.from(allowedOrigins),
    }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    message: 'GPS pseudo-telemetry WebSocket relay is running.',
    websocketUrl: 'Use this same host with wss:// from the frontend.',
    healthcheck: '/health',
    serverEpochMs: nowEpochMs(),
  }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const origin = normalizeOrigin(req.headers.origin);

  if (!isAllowedOrigin(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }

  const clientId = randomUUID();
  clients.set(ws, {
    clientId,
    role: 'unknown',
    sessionId: 'default-session',
    connectedAt: nowEpochMs(),
    origin: origin || 'unknown',
  });

  safeSend(ws, {
    type: 'server_hello',
    clientId,
    serverEpochMs: nowEpochMs(),
    allowedOriginMatched: origin ? true : false,
  });

  ws.on('message', (messageBuffer) => {
    let message;
    try {
      message = JSON.parse(messageBuffer.toString());
    } catch {
      safeSend(ws, {
        type: 'error',
        message: 'Invalid JSON payload.',
        serverEpochMs: nowEpochMs(),
      });
      return;
    }

    const client = clients.get(ws);
    if (!client) return;

    if (message.type === 'hello') {
      client.role = message.role || 'unknown';
      client.sessionId = message.sessionId || 'default-session';
      safeSend(ws, {
        type: 'hello_ack',
        clientId,
        role: client.role,
        sessionId: client.sessionId,
        origin: client.origin,
        serverEpochMs: nowEpochMs(),
      });
      return;
    }

    if (message.type === 'timesync_request') {
      const serverReceiveEpochMs = nowEpochMs();
      safeSend(ws, {
        type: 'timesync_response',
        reqId: message.reqId,
        sessionId: client.sessionId,
        serverReceiveEpochMs,
        serverSendEpochMs: nowEpochMs(),
        echoedT0LocalEpochMs: message.t0LocalEpochMs,
      });
      return;
    }

    if (message.type === 'gps_sample') {
      const serverReceivedEpochMs = nowEpochMs();

      safeSend(ws, {
        type: 'gps_ack',
        seq: message.seq,
        sessionId: client.sessionId,
        serverReceivedEpochMs,
      });

      const relayPayload = {
        type: 'gps_sample_relay',
        sessionId: client.sessionId,
        seq: message.seq,
        gps: message.gps,
        callbackIntervalMs: message.callbackIntervalMs,
        geolocationAgeAtSendMs: message.geolocationAgeAtSendMs,
        phoneSendLocalEpochMs: message.phoneSendLocalEpochMs,
        phoneSendEstimatedServerEpochMs: message.phoneSendEstimatedServerEpochMs,
        phoneCallbackLocalEpochMs: message.phoneCallbackLocalEpochMs,
        clockSyncBestRttMs: message.clockSyncBestRttMs,
        serverReceivedEpochMs,
        serverForwardEpochMs: nowEpochMs(),
      };

      for (const [otherWs] of getSessionClients(client.sessionId, 'monitor')) {
        safeSend(otherWs, relayPayload);
      }
      return;
    }

    safeSend(ws, {
      type: 'error',
      message: `Unsupported message type: ${message.type}`,
      serverEpochMs: nowEpochMs(),
    });
  });

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`GPS pseudo-telemetry relay listening on port ${port}`);
  console.log(`Public client URL: ${publicClientUrl}`);
  console.log(`Allowed browser origins: ${Array.from(allowedOrigins).join(', ')}`);
});
