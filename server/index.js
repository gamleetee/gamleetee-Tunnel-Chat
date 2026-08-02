import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { RoomFullError, RoomRegistry } from './room-registry.js';
import { WebSocketPeer, WebSocketState } from './websocket-peer.js';

const ROOT = fileURLToPath(new URL('../public/', import.meta.url));
const PORT = parsePositiveInteger(process.env.PORT, 3000);
const MAX_PEERS = parsePositiveInteger(process.env.ROOM_MAX_PEERS, 2);
const MAX_MESSAGE_BYTES = parsePositiveInteger(process.env.MAX_MESSAGE_BYTES, 262_144);
const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGIN);
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{12,64}$/;
const rooms = new RoomRegistry({ maxPeers: MAX_PEERS });

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (url.pathname === '/healthz') {
      sendJson(response, 200, {
        status: 'ok',
        rooms: rooms.roomCount(),
        storage: 'memory-only'
      });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    await serveStatic(url.pathname, request.method === 'HEAD', response);
  } catch (error) {
    console.error('HTTP request failed', error);
    sendJson(response, 500, { error: 'internal_error' });
  }
});

const clients = new Set();

server.on('upgrade', (request, socket, head) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);

    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const requestOrigin = request.headers.origin ?? '';
    if (ALLOWED_ORIGINS.size > 0 && !ALLOWED_ORIGINS.has(requestOrigin)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }

    const roomId = url.searchParams.get('room') ?? '';
    if (!ROOM_ID_PATTERN.test(roomId)) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }

    const webSocketKey = request.headers['sec-websocket-key'];
    const version = request.headers['sec-websocket-version'];
    const upgrade = request.headers.upgrade?.toLowerCase();
    const connectionTokens = request.headers.connection?.toLowerCase().split(',').map((value) => value.trim()) ?? [];

    if (typeof webSocketKey !== 'string' || version !== '13' || upgrade !== 'websocket' || !connectionTokens.includes('upgrade')) {
      rejectUpgrade(socket, 400, 'Bad Request');
      return;
    }

    const accept = createHash('sha1')
      .update(`${webSocketKey}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64');

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '\r\n'
    ].join('\r\n'));

    const webSocket = new WebSocketPeer(socket, { maxPayload: MAX_MESSAGE_BYTES, initialData: head });
    webSocket.roomId = roomId;
    webSocket.peerId = randomUUID();
    clients.add(webSocket);
    handleConnection(webSocket);
  } catch (error) {
    console.warn('WebSocket upgrade failed', error.message);
    socket.destroy();
  }
});

function handleConnection(webSocket) {
  const { roomId, peerId } = webSocket;

  try {
    const peerCount = rooms.join(roomId, webSocket);
    sendSystem(webSocket, 'connected', { peerId, peerCount, maxPeers: MAX_PEERS });
    broadcastSystem(roomId, webSocket, 'peer-joined', { peerCount });
  } catch (error) {
    clients.delete(webSocket);
    if (error instanceof RoomFullError) {
      webSocket.close(4003, 'Room is full');
      return;
    }

    console.error('Unable to join room', error);
    webSocket.close(1011, 'Unable to join room');
    return;
  }

  webSocket.on('message', (data, isBinary) => {
    for (const peer of rooms.peers(roomId)) {
      if (peer !== webSocket && peer.readyState === WebSocketState.OPEN) {
        peer.send(data, { binary: isBinary });
      }
    }
  });

  const cleanup = () => {
    if (webSocket.cleanedUp) return;
    webSocket.cleanedUp = true;
    clients.delete(webSocket);

    const peerCount = rooms.leave(roomId, webSocket);
    broadcastSystem(roomId, webSocket, 'peer-left', { peerCount });
  };

  webSocket.on('close', cleanup);
  webSocket.on('error', (error) => {
    console.warn(`WebSocket error for peer ${peerId}`, error.message);
    cleanup();
  });
}

const heartbeat = setInterval(() => {
  for (const webSocket of clients) {
    if (webSocket.isAlive === false) {
      webSocket.terminate();
      continue;
    }

    webSocket.isAlive = false;
    webSocket.ping();
  }
}, 30_000);
heartbeat.unref();

const shutdown = () => {
  clearInterval(heartbeat);
  for (const webSocket of clients) {
    webSocket.close(1001, 'Server is restarting');
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`gamleetee Tunnel Chat listening on http://0.0.0.0:${PORT}`);
  console.log('Rooms and messages are held in memory only; no database is used.');
});

function parseAllowedOrigins(value) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sendSystem(webSocket, event, details = {}) {
  if (webSocket.readyState !== WebSocketState.OPEN) return;
  webSocket.send(JSON.stringify({ type: 'system', event, ...details }));
}

function broadcastSystem(roomId, excludedPeer, event, details = {}) {
  for (const peer of rooms.peers(roomId)) {
    if (peer !== excludedPeer) sendSystem(peer, event, details);
  }
}

function rejectUpgrade(socket, statusCode, statusText) {
  socket.end(`HTTP/1.1 ${statusCode} ${statusText}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
}

function securityHeaders(contentType) {
  return {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; manifest-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  };
}

async function serveStatic(pathname, headOnly, response) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, '');
  let filePath = join(ROOT, normalizedPath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(response, 403, { error: 'forbidden' });
    return;
  }

  let fileStats;
  try {
    fileStats = await stat(filePath);

    if (fileStats.isDirectory()) {
      filePath = join(filePath, 'index.html');
      fileStats = await stat(filePath);
    }
  } catch {
    if (!extname(normalizedPath) && !normalizedPath.endsWith('/')) {
      filePath = join(ROOT, 'index.html');
      fileStats = await stat(filePath);
    } else {
      sendJson(response, 404, { error: 'not_found' });
      return;
    }
  }

  if (!fileStats.isFile()) {
    sendJson(response, 404, { error: 'not_found' });
    return;
  }

  const contentType = MIME_TYPES.get(extname(filePath)) ?? 'application/octet-stream';
  response.writeHead(200, {
    ...securityHeaders(contentType),
    'Content-Length': fileStats.size
  });

  if (headOnly) {
    response.end();
    return;
  }

  createReadStream(filePath).pipe(response);
}

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    ...securityHeaders('application/json; charset=utf-8'),
    'Content-Length': Buffer.byteLength(payload)
  });
  response.end(payload);
}
