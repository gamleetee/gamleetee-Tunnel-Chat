import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

const PORT = 43_000 + (process.pid % 1_000);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ANDROID_DOWNLOAD_URL = 'https://github.com/gamleetee/gamleetee-Tunnel-Chat/releases/download/mobile-v0.1.0/gamleetee-chat.apk';
const ANDROID_CERTIFICATE = '57:58:6C:A8:AB:1A:79:57:DE:01:20:6C:21:42:A5:E6:84:B1:D9:76:0C:17:45:7B:89:92:04:C4:7A:65:B7:CD';

test('purple navigation shell and static application routes are available', { timeout: 15_000 }, async (context) => {
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

  const homeResponse = await fetch(`${BASE_URL}/`);
  assert.equal(homeResponse.status, 200);
  const homeHtml = await homeResponse.text();
  for (const tab of ['home', 'chat', 'settings']) {
    assert.match(homeHtml, new RegExp(`data-tab="${tab}"`));
  }
  assert.match(homeHtml, /Приватные уведомления/);
  assert.match(homeHtml, /Вам пришло сообщение/);
  assert.match(homeHtml, /\/icons\/gamchat\.svg/);

  const iconResponse = await fetch(`${BASE_URL}/icons/gamchat.svg`);
  assert.equal(iconResponse.status, 200);
  assert.match(iconResponse.headers.get('content-type') ?? '', /^image\/svg\+xml/);
  assert.ok((await iconResponse.text()).includes('data:image/webp;base64,'));

  const response = await fetch(`${BASE_URL}/apps/`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);

  const appsHtml = await response.text();
  assert.match(appsHtml, /<h1>Приложения<\/h1>/);
  assert.ok(appsHtml.includes(ANDROID_DOWNLOAD_URL));
  assert.match(appsHtml, />Скачать APK<\/a>/);
  assert.match(appsHtml, /Вам пришло сообщение/);

  const headResponse = await fetch(`${BASE_URL}/apps/`, { method: 'HEAD' });
  assert.equal(headResponse.status, 200);
  assert.match(headResponse.headers.get('content-type') ?? '', /^text\/html/);
  assert.ok(Number(headResponse.headers.get('content-length')) > 0);
  assert.equal(await headResponse.text(), '');

  const assetLinksResponse = await fetch(`${BASE_URL}/.well-known/assetlinks.json`);
  assert.equal(assetLinksResponse.status, 200);
  assert.match(assetLinksResponse.headers.get('content-type') ?? '', /^application\/json/);

  const assetLinks = await assetLinksResponse.json();
  assert.equal(assetLinks.length, 1);
  assert.equal(assetLinks[0].target.namespace, 'android_app');
  assert.equal(assetLinks[0].target.package_name, 'ru.gamleetee.gamchat');
  assert.deepEqual(assetLinks[0].target.sha256_cert_fingerprints, [ANDROID_CERTIFICATE]);
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
