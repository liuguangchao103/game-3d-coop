export type RoomPhase = "lobby" | "running" | "ended";

export interface PlayerView {
  id: string;
  name: string;
  ready: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  hp: number;
  isDown: boolean;
  color: "cyan" | "amber";
}

export interface ObjectiveView {
  id: string;
  state: "idle" | "active" | "done";
  x: number;
  y: number;
  z: number;
}

export interface EnemyView {
  id: string;
  kind: "chaser" | "shooter" | "boomer";
  x: number;
  y: number;
  z: number;
  hp: number;
}

export interface ProjectileView {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface InputState {
  seq: number;
  dt: number;
  moveX: number;
  moveY: number;
  lookYaw: number;
  lookPitch: number;
  fire: boolean;
  dash: boolean;
  interact: boolean;
}

export type C2SMessage =
  | { t: "room.create"; name: string }
  | { t: "room.join"; code: string; name: string }
  | { t: "room.ready"; ready: boolean }
  | ({ t: "input.state" } & InputState)
  | { t: "ability.linkBurst" }
  | { t: "player.revive"; targetId: string }
  | { t: "ping"; ts: number };

export type S2CMessage =
  | { t: "room.created"; code: string; playerId: string }
  | {
      t: "room.joined";
      code: string;
      playerId: string;
      players: Array<{ id: string; name: string; ready: boolean }>;
    }
  | {
      t: "room.state";
      phase: RoomPhase;
      timeLeft: number;
      stage: number;
      seed: number;
    }
  | {
      t: "snapshot";
      tick: number;
      players: PlayerView[];
      enemies: EnemyView[];
      projectiles: ProjectileView[];
      objectives: ObjectiveView[];
    }
  | {
      t: "event";
      kind:
        | "hit"
        | "down"
        | "revive"
        | "nodeActivated"
        | "linkBurst"
        | "stageClear"
        | "gameOver"
        | "victory";
      payload: Record<string, unknown>;
    }
  | { t: "error"; code: string; message: string }
  | { t: "pong"; ts: number };
