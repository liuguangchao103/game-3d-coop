import { SERVER_TICK_RATE, serializeS2CMessage } from "@game/shared";

import { buildSnapshot, stepRoom } from "./systems";
import type { RoomManager } from "./roomManager";

function broadcast(roomManager: RoomManager, roomCode: string, payload: string): void {
  const room = roomManager.listRooms().find((candidate) => candidate.code === roomCode);
  if (!room) {
    return;
  }
  for (const player of room.players.values()) {
    if (player.ws.readyState === 1) {
      player.ws.send(payload);
    }
  }
}

export function startGameLoop(roomManager: RoomManager): NodeJS.Timeout {
  const dt = 1 / SERVER_TICK_RATE;

  return setInterval(() => {
    for (const room of roomManager.listRooms()) {
      if (room.phase !== "running") {
        continue;
      }

      const events = stepRoom(room, dt);
      const snapshot = serializeS2CMessage(buildSnapshot(room));
      broadcast(roomManager, room.code, snapshot);

      for (const event of events) {
        const eventPayload = serializeS2CMessage({
          t: "event",
          kind: event.kind,
          payload: event.payload
        });
        broadcast(roomManager, room.code, eventPayload);
      }

      const roomEndedByEvents = events.some((event) => event.kind === "victory");
      if (roomEndedByEvents) {
        const statePayload = serializeS2CMessage({
          t: "room.state",
          phase: "ended",
          timeLeft: room.timeLeft,
          stage: room.stage,
          seed: room.seed
        });
        broadcast(roomManager, room.code, statePayload);
        continue;
      }

      if (room.timeLeft <= 0) {
        room.phase = "ended";
        const statePayload = serializeS2CMessage({
          t: "room.state",
          phase: room.phase,
          timeLeft: room.timeLeft,
          stage: room.stage,
          seed: room.seed
        });

        const eventPayload = serializeS2CMessage({
          t: "event",
          kind: "gameOver",
          payload: { reason: "timeExpired" }
        });

        broadcast(roomManager, room.code, statePayload);
        broadcast(roomManager, room.code, eventPayload);
      }
    }
  }, Math.round(1000 / SERVER_TICK_RATE));
}
