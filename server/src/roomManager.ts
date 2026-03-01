import {
  GAME_TIME_LIMIT_SECONDS,
  ROOM_CAPACITY,
  ROOM_CODE_CHARS,
  ROOM_CODE_LENGTH,
  type InputState,
  type PlayerView,
  type RoomPhase
} from "@game/shared";

export interface SocketLike {
  readyState: number;
  send: (payload: string) => void;
}

export interface PlayerRuntime extends PlayerView {
  ws: SocketLike;
  input: InputState;
  connectedAt: number;
}

export interface RoomRuntime {
  code: string;
  phase: RoomPhase;
  stage: number;
  timeLeft: number;
  seed: number;
  tick: number;
  createdAt: number;
  players: Map<string, PlayerRuntime>;
}

const EMPTY_INPUT: InputState = {
  seq: 0,
  dt: 0,
  moveX: 0,
  moveY: 0,
  lookYaw: 0,
  lookPitch: 0,
  fire: false,
  dash: false,
  interact: false
};

function createRoomCode(): string {
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const idx = Math.floor(Math.random() * ROOM_CODE_CHARS.length);
    code += ROOM_CODE_CHARS[idx];
  }
  return code;
}

function cloneInputState(input: InputState): InputState {
  return {
    seq: input.seq,
    dt: input.dt,
    moveX: input.moveX,
    moveY: input.moveY,
    lookYaw: input.lookYaw,
    lookPitch: input.lookPitch,
    fire: input.fire,
    dash: input.dash,
    interact: input.interact
  };
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomRuntime>();

  private readonly playerToRoom = new Map<string, string>();

  createRoom(playerId: string, name: string, ws: SocketLike): RoomRuntime {
    if (this.playerToRoom.has(playerId)) {
      throw new Error("player already in room");
    }

    let code = createRoomCode();
    let attempts = 0;
    while (this.rooms.has(code) && attempts < 16) {
      code = createRoomCode();
      attempts += 1;
    }

    if (this.rooms.has(code)) {
      throw new Error("failed to allocate room code");
    }

    const room: RoomRuntime = {
      code,
      phase: "lobby",
      stage: 1,
      timeLeft: GAME_TIME_LIMIT_SECONDS,
      seed: Math.floor(Math.random() * 1_000_000_000),
      tick: 0,
      createdAt: Date.now(),
      players: new Map()
    };

    const player = this.createPlayer(playerId, name, ws, 0);
    room.players.set(playerId, player);

    this.rooms.set(code, room);
    this.playerToRoom.set(playerId, code);

    return room;
  }

  joinRoom(code: string, playerId: string, name: string, ws: SocketLike): RoomRuntime {
    const room = this.rooms.get(code);
    if (!room) {
      throw new Error("room not found");
    }

    if (room.phase !== "lobby") {
      throw new Error("room already started");
    }

    if (room.players.size >= ROOM_CAPACITY) {
      throw new Error("room is full");
    }

    if (this.playerToRoom.has(playerId)) {
      throw new Error("player already in room");
    }

    const player = this.createPlayer(playerId, name, ws, room.players.size);
    room.players.set(playerId, player);
    this.playerToRoom.set(playerId, code);

    return room;
  }

  removePlayer(playerId: string): RoomRuntime | undefined {
    const code = this.playerToRoom.get(playerId);
    if (!code) {
      return undefined;
    }

    const room = this.rooms.get(code);
    this.playerToRoom.delete(playerId);

    if (!room) {
      return undefined;
    }

    room.players.delete(playerId);

    if (room.players.size === 0) {
      this.rooms.delete(code);
      return undefined;
    }

    for (const player of room.players.values()) {
      player.ready = false;
    }

    if (room.phase === "running") {
      room.phase = "ended";
    }

    return room;
  }

  setPlayerReady(playerId: string, ready: boolean): RoomRuntime {
    const { room, player } = this.findPlayer(playerId);
    if (room.phase !== "lobby") {
      throw new Error("room not in lobby phase");
    }

    player.ready = ready;
    return room;
  }

  setPlayerInput(playerId: string, input: InputState): RoomRuntime {
    const { room, player } = this.findPlayer(playerId);
    player.input = cloneInputState(input);
    return room;
  }

  maybeStartRoom(room: RoomRuntime): boolean {
    if (room.phase !== "lobby") {
      return false;
    }

    if (room.players.size !== ROOM_CAPACITY) {
      return false;
    }

    for (const player of room.players.values()) {
      if (!player.ready) {
        return false;
      }
    }

    room.phase = "running";
    room.stage = 1;
    room.tick = 0;
    room.timeLeft = GAME_TIME_LIMIT_SECONDS;
    return true;
  }

  findRoomByPlayer(playerId: string): RoomRuntime | undefined {
    const code = this.playerToRoom.get(playerId);
    if (!code) {
      return undefined;
    }
    return this.rooms.get(code);
  }

  listRooms(): RoomRuntime[] {
    return Array.from(this.rooms.values());
  }

  playersForRoom(room: RoomRuntime): Array<{ id: string; name: string; ready: boolean }> {
    return Array.from(room.players.values()).map((player) => ({
      id: player.id,
      name: player.name,
      ready: player.ready
    }));
  }

  private findPlayer(playerId: string): { room: RoomRuntime; player: PlayerRuntime } {
    const room = this.findRoomByPlayer(playerId);
    if (!room) {
      throw new Error("player not in room");
    }

    const player = room.players.get(playerId);
    if (!player) {
      throw new Error("player missing from room");
    }

    return { room, player };
  }

  private createPlayer(playerId: string, name: string, ws: SocketLike, index: number): PlayerRuntime {
    const spawnX = index === 0 ? -4 : 4;
    const color = index === 0 ? "cyan" : "amber";

    return {
      id: playerId,
      name,
      ws,
      ready: false,
      x: spawnX,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      isDown: false,
      color,
      input: cloneInputState(EMPTY_INPUT),
      connectedAt: Date.now()
    };
  }
}
