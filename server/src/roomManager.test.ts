import assert from "node:assert/strict";
import { test } from "node:test";

import { RoomManager, type SocketLike } from "./roomManager";

class FakeSocket implements SocketLike {
  readyState = 1;

  public sent: string[] = [];

  send(payload: string): void {
    this.sent.push(payload);
  }
}

test("creates and joins room", () => {
  const manager = new RoomManager();

  const room = manager.createRoom("p1", "Alpha", new FakeSocket());
  assert.equal(room.players.size, 1);

  const joined = manager.joinRoom(room.code, "p2", "Bravo", new FakeSocket());
  assert.equal(joined.players.size, 2);
});

test("starts room and creates staged objectives", () => {
  const manager = new RoomManager();
  const room = manager.createRoom("p1", "Alpha", new FakeSocket());
  manager.joinRoom(room.code, "p2", "Bravo", new FakeSocket());

  manager.setPlayerReady("p1", true);
  manager.setPlayerReady("p2", true);

  const started = manager.maybeStartRoom(room);
  assert.equal(started, true);
  assert.equal(room.phase, "running");
  assert.equal(room.objectives.length, 3);
  assert.equal(room.objectives[0]?.state, "active");
});
