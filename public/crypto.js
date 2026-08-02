const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBase64Url(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export async function importRoomKey(secret) {
  const keyBytes = base64UrlToBytes(secret);
  if (keyBytes.byteLength !== 32) {
    throw new Error('The invitation contains an invalid encryption key.');
  }

  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt'
  ]);
}

export async function encryptPayload(key, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  return JSON.stringify({
    type: 'encrypted',
    version: 1,
    iv: bytesToBase64Url(iv),
    data: bytesToBase64Url(new Uint8Array(ciphertext))
  });
}

export async function decryptEnvelope(key, envelopeText) {
  const envelope = JSON.parse(envelopeText);
  if (envelope?.type !== 'encrypted' || envelope.version !== 1) {
    throw new Error('Unsupported encrypted envelope.');
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv) },
    key,
    base64UrlToBytes(envelope.data)
  );

  return JSON.parse(decoder.decode(plaintext));
}

export function bytesToBase64Url(bytes) {
  let binary = '';
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function base64UrlToBytes(value) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
