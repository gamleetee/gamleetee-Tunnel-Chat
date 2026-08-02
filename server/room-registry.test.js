import assert from 'node:assert/strict';
import test from 'node:test';
import { RoomFullError, RoomRegistry } from './room-registry.js';

test('a room accepts two peers and rejects a third peer', () => {
  const rooms = new RoomRegistry({ maxPeers: 2 });
  const first = {};
  const second = {};

  assert.equal(rooms.join('room', first), 1);
  assert.equal(rooms.join('room', second), 2);
  assert.throws(() => rooms.join('room', {}), RoomFullError);
  assert.equal(rooms.count('room'), 2);
});

test('an empty room is removed immediately', () => {
  const rooms = new RoomRegistry();
  const peer = {};

  rooms.join('room', peer);
  assert.equal(rooms.roomCount(), 1);
  assert.equal(rooms.leave('room', peer), 0);
  assert.equal(rooms.roomCount(), 0);
});

test('leaving one peer keeps the remaining peer connected', () => {
  const rooms = new RoomRegistry();
  const first = {};
  const second = {};

  rooms.join('room', first);
  rooms.join('room', second);
  assert.equal(rooms.leave('room', first), 1);
  assert.deepEqual([...rooms.peers('room')], [second]);
});
