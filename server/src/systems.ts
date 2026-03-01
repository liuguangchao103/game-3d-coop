import { MAP_HALF_EXTENT, PLAYER_MOVE_SPEED, clamp, normalize2D } from "@game/shared";

import type { PlayerView, S2CMessage } from "@game/shared";

import type { RoomRuntime } from "./roomManager";

export function stepRoom(room: RoomRuntime, dt: number): void {
  for (const player of room.players.values()) {
    const direction = normalize2D(player.input.moveX, player.input.moveY);
    player.x = clamp(player.x + direction.x * PLAYER_MOVE_SPEED * dt, -MAP_HALF_EXTENT, MAP_HALF_EXTENT);
    player.z = clamp(player.z + direction.y * PLAYER_MOVE_SPEED * dt, -MAP_HALF_EXTENT, MAP_HALF_EXTENT);
    player.yaw = player.input.lookYaw;
    player.pitch = player.input.lookPitch;
  }

  room.timeLeft = Math.max(0, room.timeLeft - dt);
  room.tick += 1;
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
    objectives: []
  };
}
