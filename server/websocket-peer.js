import { EventEmitter } from 'node:events';

const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const MAX_SAFE_PAYLOAD = BigInt(Number.MAX_SAFE_INTEGER);

export class WebSocketPeer extends EventEmitter {
  constructor(socket, { maxPayload = 262_144, initialData = Buffer.alloc(0) } = {}) {
    super();
    this.socket = socket;
    this.maxPayload = maxPayload;
    this.readyState = OPEN;
    this.buffer = initialData.length ? Buffer.from(initialData) : Buffer.alloc(0);
    this.fragmentOpcode = null;
    this.fragmentLength = 0;
    this.fragments = [];
    this.isAlive = true;
    this.on('error', () => {});

    socket.setNoDelay(true);
    socket.on('data', (chunk) => this.#handleData(chunk));
    socket.on('close', () => this.#markClosed());
    socket.on('end', () => this.#markClosed());
    socket.on('error', (error) => this.emit('error', error));

    if (this.buffer.length) this.#parseFrames();
  }

  send(data, { binary = false } = {}) {
    if (this.readyState !== OPEN) return false;
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
    this.socket.write(encodeFrame(binary ? 0x2 : 0x1, payload));
    return true;
  }

  sendJson(value) {
    return this.send(JSON.stringify(value));
  }

  ping(payload = Buffer.alloc(0)) {
    if (this.readyState !== OPEN) return;
    this.socket.write(encodeFrame(0x9, payload));
  }

  close(code = 1000, reason = '') {
    if (this.readyState >= CLOSING) return;
    this.readyState = CLOSING;

    const reasonBytes = Buffer.from(reason).subarray(0, 123);
    const payload = Buffer.allocUnsafe(2 + reasonBytes.length);
    payload.writeUInt16BE(code, 0);
    reasonBytes.copy(payload, 2);
    this.socket.end(encodeFrame(0x8, payload));
  }

  terminate() {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.socket.destroy();
  }

  #handleData(chunk) {
    if (this.readyState === CLOSED) return;
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    this.#parseFrames();
  }

  #parseFrames() {
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const rsv = first & 0x70;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      let payloadLength = second & 0x7f;
      let headerLength = 2;

      if (rsv !== 0 || !masked) {
        this.close(1002, 'Protocol error');
        return;
      }

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        headerLength = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        const bigLength = this.buffer.readBigUInt64BE(2);
        if (bigLength > MAX_SAFE_PAYLOAD) {
          this.close(1009, 'Message too large');
          return;
        }
        payloadLength = Number(bigLength);
        headerLength = 10;
      }

      const isControl = opcode >= 0x8;
      if ((isControl && (!fin || payloadLength > 125)) || payloadLength > this.maxPayload) {
        this.close(isControl ? 1002 : 1009, isControl ? 'Protocol error' : 'Message too large');
        return;
      }

      const frameLength = headerLength + 4 + payloadLength;
      if (this.buffer.length < frameLength) return;

      const mask = this.buffer.subarray(headerLength, headerLength + 4);
      const payload = Buffer.from(this.buffer.subarray(headerLength + 4, frameLength));
      this.buffer = this.buffer.subarray(frameLength);

      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }

      if (!this.#handleFrame(opcode, fin, payload)) return;
    }
  }

  #handleFrame(opcode, fin, payload) {
    if (opcode === 0x8) {
      if (payload.length === 1) {
        this.close(1002, 'Protocol error');
        return false;
      }

      if (this.readyState === OPEN) {
        this.readyState = CLOSING;
        this.socket.end(encodeFrame(0x8, payload));
      } else {
        this.socket.end();
      }
      return false;
    }

    if (opcode === 0x9) {
      this.socket.write(encodeFrame(0xA, payload));
      return true;
    }

    if (opcode === 0xA) {
      this.isAlive = true;
      this.emit('pong', payload);
      return true;
    }

    if (opcode === 0x0) {
      if (this.fragmentOpcode === null) {
        this.close(1002, 'Unexpected continuation');
        return false;
      }
      return this.#appendFragment(payload, fin);
    }

    if (opcode !== 0x1 && opcode !== 0x2) {
      this.close(1002, 'Unsupported opcode');
      return false;
    }

    if (this.fragmentOpcode !== null) {
      this.close(1002, 'Fragment sequence error');
      return false;
    }

    if (fin) {
      this.emit('message', payload, opcode === 0x2);
      return true;
    }

    this.fragmentOpcode = opcode;
    this.fragmentLength = 0;
    this.fragments = [];
    return this.#appendFragment(payload, false);
  }

  #appendFragment(payload, fin) {
    this.fragmentLength += payload.length;
    if (this.fragmentLength > this.maxPayload) {
      this.close(1009, 'Message too large');
      return false;
    }

    this.fragments.push(payload);
    if (!fin) return true;

    const completePayload = Buffer.concat(this.fragments, this.fragmentLength);
    const isBinary = this.fragmentOpcode === 0x2;
    this.fragmentOpcode = null;
    this.fragmentLength = 0;
    this.fragments = [];
    this.emit('message', completePayload, isBinary);
    return true;
  }

  #markClosed() {
    if (this.readyState === CLOSED) return;
    this.readyState = CLOSED;
    this.emit('close');
  }
}

export function encodeFrame(opcode, payload) {
  const length = payload.length;
  let header;

  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  return Buffer.concat([header, payload]);
}

export const WebSocketState = Object.freeze({ OPEN, CLOSING, CLOSED });
