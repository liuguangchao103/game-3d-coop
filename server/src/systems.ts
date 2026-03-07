import { MAP_HALF_EXTENT, PLAYER_MOVE_SPEED, clamp, normalize2D } from "@game/shared";

import type { PlayerView, S2CMessage } from "@game/shared";

import type { RoomRuntime } from "./roomManager";

interface StepEvent {
  kind: Extract<S2CMessage, { t: "event" }>["kind"];
  payload: Record<string, unknown>;
}

function activateObjective(room: RoomRuntime): StepEvent[] {
  const active = room.objectives.find((objective) => objective.state === "active");
  if (!active) {
    return [];
  }

  for (const player of room.players.values()) {
    if (!player.input.interact) {
      continue;
    }

    const dx = player.x - active.x;
    const dz = player.z - active.z;
    const isInRange = dx * dx + dz * dz <= 2.7 * 2.7;
    if (!isInRange) {
      continue;
    }

    active.state = "done";

    const events: StepEvent[] = [
      {
        kind: "nodeActivated",
        payload: {
          objectiveId: active.id,
          by: player.name
        }
      }
    ];

    const next = room.objectives.find((objective) => objective.state === "idle");
    if (next) {
      next.state = "active";
      return events;
    }

    room.phase = "ended";
    events.push({
      kind: "victory",
      payload: {
        stage: room.stage,
        objectives: room.objectives.length
      }
    });

    return events;
  }

  return [];
}

export function stepRoom(room: RoomRuntime, dt: number): StepEvent[] {
  const events: StepEvent[] = [];

  for (const player of room.players.values()) {
    const direction = normalize2D(player.input.moveX, player.input.moveY);
    player.x = clamp(player.x + direction.x * PLAYER_MOVE_SPEED * dt, -MAP_HALF_EXTENT, MAP_HALF_EXTENT);
    player.z = clamp(player.z + direction.y * PLAYER_MOVE_SPEED * dt, -MAP_HALF_EXTENT, MAP_HALF_EXTENT);
    if (Math.abs(player.input.moveX) + Math.abs(player.input.moveY) > 0.1) {
      player.yaw = player.input.lookYaw;
    }
    player.pitch = player.input.lookPitch;
  }

  room.timeLeft = Math.max(0, room.timeLeft - dt);
  room.tick += 1;

  events.push(...activateObjective(room));
  return events;
}

export function buildSnapshot(room: RoomRuntime): S2CMessage {
  const players: PlayerView[] = Array.from(room.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    ready: player.ready,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    hp: player.hp,
    isDown: player.isDown,
    color: player.color
  }));

  return {
    t: "snapshot",
    tick: room.tick,
    players,
    enemies: [],
    projectiles: [],
    objectives: room.objectives.map((objective) => ({
      id: objective.id,
      state: objective.state,
      x: objective.x,
      y: objective.y,
      z: objective.z
    }))
  };
}
