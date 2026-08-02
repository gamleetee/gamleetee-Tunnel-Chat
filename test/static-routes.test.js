import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

const PORT = 43_000 + (process.pid % 1_000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

test('static directories serve their index.html file', { timeout: 15_000 }, async (context) => {
  const output = [];
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      ALLOWED_ORIGIN: ''
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  server.stdout.on('data', (chunk) => output.push(chunk.toString()));
  server.stderr.on('data', (chunk) => output.push(chunk.toString()));

  context.after(async () => {
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      await Promise.race([
        new Promise((resolve) => server.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000))
      ]);
    }
  });

  await waitForServer(server, output);

  const response = await fetch(`${BASE_URL}/apps/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(await response.text(), /<h1>Приложения<\/h1>/);

  const headResponse = await fetch(`${BASE_URL}/apps/`, { method: 'HEAD' });
  assert.equal(headResponse.status, 200);
  assert.match(headResponse.headers.get('content-type') ?? '', /^text\/html/);
  assert.ok(Number(headResponse.headers.get('content-length')) > 0);
  assert.equal(await headResponse.text(), '');
});

async function waitForServer(server, output) {
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      assert.fail(`Server exited before readiness.\n${output.join('')}`);
    }

    try {
      const response = await fetch(`${BASE_URL}/healthz`);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  assert.fail(`Server did not become ready.\n${output.join('')}`);
}
