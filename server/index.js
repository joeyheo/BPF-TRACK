import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT || 8080);
const wss = new WebSocketServer({ port });
const clients = new Map();

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function nowEpochMs() {
  return Date.now();
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

wss.on('connection', (ws) => {
  const clientId = crypto.randomUUID();
  clients.set(ws, {
    clientId,
    role: 'unknown',
    sessionId: 'default-session',
    connectedAt: nowEpochMs(),
  });

  safeSend(ws, {
    type: 'server_hello',
    clientId,
    serverEpochMs: nowEpochMs(),
  });

  ws.on('message', (messageBuffer) => {
    let message;
    try {
      message = JSON.parse(messageBuffer.toString());
    } catch (error) {
      safeSend(ws, { type: 'error', message: 'Invalid JSON payload.' });
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

console.log(`GPS pseudo-telemetry relay listening on ws://localhost:${port}`);
