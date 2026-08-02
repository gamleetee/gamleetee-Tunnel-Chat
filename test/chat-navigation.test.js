import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const navigation = await readFile(new URL('../public/chat-navigation.js', import.meta.url), 'utf8');
const install = await readFile(new URL('../public/install.js', import.meta.url), 'utf8');
const nativeBridge = await readFile(new URL('../mobile/src/native.js', import.meta.url), 'utf8');
const prepareMobile = await readFile(new URL('../mobile/scripts/prepare-web.mjs', import.meta.url), 'utf8');
const serviceWorker = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');

test('active room uses immersive chat navigation', () => {
  assert.match(navigation, /chat-room-immersive/);
  assert.match(navigation, /bottom-nav/);
  assert.match(navigation, /display: none !important/);
  assert.match(navigation, /Вернуться в меню чата/);
  assert.match(navigation, /Вернуться в чат/);
});

test('leave room control is rendered as a red home action', () => {
  assert.match(navigation, /exit-home-button/);
  assert.match(navigation, /Выйти из комнаты и вернуться домой/);
  assert.match(navigation, /M3 10\.5 12 3l9 7\.5/);
});

test('web and native shells initialize the shared navigation module', () => {
  assert.match(install, /initializeImmersiveChatNavigation/);
  assert.match(nativeBridge, /initializeImmersiveChatNavigation/);
  assert.match(prepareMobile, /chat-navigation\.js/);
  assert.match(serviceWorker, /chat-navigation\.js/);
});
