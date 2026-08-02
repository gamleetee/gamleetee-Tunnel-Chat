import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decryptEnvelope,
  encryptPayload,
  importRoomKey,
  randomBase64Url
} from './crypto.js';

test('AES-GCM payloads decrypt only with the room key', async () => {
  const firstKey = await importRoomKey(randomBase64Url(32));
  const secondKey = await importRoomKey(randomBase64Url(32));
  const payload = { kind: 'chat', text: 'secret', sentAt: '2026-08-02T00:00:00.000Z' };
  const envelope = await encryptPayload(firstKey, payload);

  assert.deepEqual(await decryptEnvelope(firstKey, envelope), payload);
  await assert.rejects(() => decryptEnvelope(secondKey, envelope));
});
