import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import test from 'node:test';

async function reservePort() {
  const probe = createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function waitForHealth(port, child) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`server exited with code ${child.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) return;
    } catch {
      // The process can need a few milliseconds to bind the port.
    }
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error('server did not become healthy');
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function waitForMessage(socket, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('message timeout')), 3_000);
    socket.addEventListener('message', (event) => {
      if (event.data !== expected) return;
      clearTimeout(timer);
      resolve(event.data);
    });
  });
}

test('two peers relay data and a third peer is rejected', async (context) => {
  const port = await reservePort();
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  context.after(() => {
    if (child.exitCode === null) child.kill('SIGTERM');
  });

  await waitForHealth(port, child);

  const room = 'abcdefghijklmnop';
  const url = `ws://127.0.0.1:${port}/ws?room=${room}`;
  const first = new WebSocket(url);
  const second = new WebSocket(url);

  context.after(() => {
    first.close();
    second.close();
  });

  await Promise.all([waitForOpen(first), waitForOpen(second)]);
  const relay = waitForMessage(second, 'encrypted-test-envelope');
  first.send('encrypted-test-envelope');
  assert.equal(await relay, 'encrypted-test-envelope');

  const third = new WebSocket(url);
  const closed = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('third peer was not rejected')), 3_000);
    third.addEventListener('close', (event) => {
      clearTimeout(timer);
      resolve(event);
    });
  });
  const closeEvent = await closed;
  assert.equal(closeEvent.code, 4003);
  assert.equal(closeEvent.reason, 'Room is full');
});
