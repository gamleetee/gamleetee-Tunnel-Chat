export class RoomFullError extends Error {
  constructor(roomId) {
    super(`Room ${roomId} is full`);
    this.name = 'RoomFullError';
  }
}

export class RoomRegistry {
  #rooms = new Map();

  constructor({ maxPeers = 2 } = {}) {
    if (!Number.isInteger(maxPeers) || maxPeers < 2) {
      throw new TypeError('maxPeers must be an integer greater than or equal to 2');
    }

    this.maxPeers = maxPeers;
  }

  join(roomId, peer) {
    const peers = this.#rooms.get(roomId) ?? new Set();

    if (peers.size >= this.maxPeers) {
      throw new RoomFullError(roomId);
    }

    peers.add(peer);
    this.#rooms.set(roomId, peers);
    return peers.size;
  }

  leave(roomId, peer) {
    const peers = this.#rooms.get(roomId);
    if (!peers) return 0;

    peers.delete(peer);
    if (peers.size === 0) {
      this.#rooms.delete(roomId);
      return 0;
    }

    return peers.size;
  }

  peers(roomId) {
    return this.#rooms.get(roomId) ?? new Set();
  }

  count(roomId) {
    return this.#rooms.get(roomId)?.size ?? 0;
  }

  roomCount() {
    return this.#rooms.size;
  }
}
