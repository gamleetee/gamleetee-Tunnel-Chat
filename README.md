# gamleetee Tunnel Chat

A public, self-hosted, ephemeral chat and file tunnel for exactly two people.

The browser encrypts every application message with AES-256-GCM. The room key is stored after `#` in the invitation URL, so browsers do not include it in HTTP or WebSocket requests. The Node.js server only relays encrypted envelopes and keeps room membership in RAM.

## Current MVP

- one-time rooms with a cryptographically random invitation link;
- maximum two simultaneous participants per room;
- end-to-end encrypted text messages;
- end-to-end encrypted file transfer up to 100 MB;
- no accounts, database, analytics, message archive, or server-side file storage;
- installable Progressive Web App for phones and desktop browsers;
- Docker deployment and a Caddy reverse-proxy example;
- automated syntax checks and tests in GitHub Actions.

## Important limitations

- Both participants must be online at the same time.
- A message sent without the second participant online is not queued.
- Refreshing or closing the page removes the local message history.
- Incoming files are assembled in browser memory. The initial limit is 100 MB.
- Server operators can observe connection times and traffic volume, but not plaintext content.
- This project has not yet received an independent security audit.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm test
npm start
```

Open `http://localhost:3000` in two browser windows, create a room in the first one, and open the invitation link in the second.

## Deploy with Docker on a Russian VPS

```bash
git clone https://github.com/gamleetee/gamleetee-Tunnel-Chat.git
cd gamleetee-Tunnel-Chat
cp .env.example .env
docker compose up -d --build
```

The container listens on `127.0.0.1:3000`. Put Caddy or Nginx in front of it and enable HTTPS. Web Crypto and installable PWA features require a secure context in production.

Example Caddy configuration:

```caddy
chat.example.ru {
  encode zstd gzip
  reverse_proxy 127.0.0.1:3000
}
```

Set `ALLOWED_ORIGIN=https://chat.example.ru` in `.env`, restart the container, and point the domain to the VPS.

## Privacy model

The server stores only a temporary in-memory mapping:

```text
room id -> up to two WebSocket connections
```

It does not store message bodies or file chunks. When the last participant leaves, the room entry is deleted. Restarting the process clears every room.

Invitation example:

```text
https://chat.example.ru/?room=PUBLIC_ROOM_ID#SECRET_ENCRYPTION_KEY
```

The server receives the room ID. The browser fragment after `#` remains client-side and becomes the AES key.

## Roadmap

1. Add resumable streaming for large files without holding the whole file in receiver memory.
2. Add optional WebRTC DataChannel mode with a forced TURN relay on a Russian server.
3. Add signed desktop and Android wrappers around the PWA.
4. Add an external security review and a documented threat model.

## License

MIT
