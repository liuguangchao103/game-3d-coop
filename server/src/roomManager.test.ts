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
