import { safeParseC2SMessage, serializeS2CMessage, type S2CMessage } from "@game/shared";

import type { RoomRuntime, RoomManager, SocketLike } from "./roomManager";

export interface ClientContext {
  clientId: string;
  ws: SocketLike;
  playerId?: string;
  roomCode?: string;
}

function send(ws: SocketLike, message: S2CMessage): void {
  if (ws.readyState !== 1) {
    return;
  }
  ws.send(serializeS2CMessage(message));
}

function sendError(ws: SocketLike, code: string, message: string): void {
  send(ws, { t: "error", code, message });
}

function emitRoomJoined(room: RoomRuntime, roomManager: RoomManager): void {
  const players = roomManager.playersForRoom(room);

  for (const player of room.players.values()) {
    send(player.ws, {
      t: "room.joined",
      code: room.code,
      playerId: player.id,
      players
    });
  }
}

function emitRoomState(room: RoomRuntime): void {
  const payload: S2CMessage = {
    t: "room.state",
    phase: room.phase,
    timeLeft: room.timeLeft,
    stage: room.stage,
    seed: room.seed
  };

  for (const player of room.players.values()) {
    send(player.ws, payload);
  }
}

function emitRoomEvent(room: RoomRuntime, kind: Extract<S2CMessage, { t: "event" }>['kind'], payload: Record<string, unknown>): void {
  for (const player of room.players.values()) {
    send(player.ws, {
      t: "event",
      kind,
      payload
    });
  }
}

function parseIncoming(raw: Buffer | string): unknown {
  const text = typeof raw === "string" ? raw : raw.toString("utf8");
  return JSON.parse(text);
}

export function handleClientMessage(context: ClientContext, raw: Buffer | string, roomManager: RoomManager): void {
  let parsedPayload: unknown;
  try {
    parsedPayload = parseIncoming(raw);
  } catch {
    sendError(context.ws, "invalid_json", "Message must be valid JSON.");
    return;
  }

  const parsed = safeParseC2SMessage(parsedPayload);
  if (!parsed.success) {
    sendError(context.ws, "invalid_message", parsed.error);
    return;
  }

  const message = parsed.data;

  try {
    switch (message.t) {
      case "room.create": {
        const room = roomManager.createRoom(context.clientId, message.name, context.ws);
        context.playerId = context.clientId;
        context.roomCode = room.code;

        send(context.ws, {
          t: "room.created",
          code: room.code,
          playerId: context.clientId
        });
        emitRoomJoined(room, roomManager);
        emitRoomState(room);
        break;
      }

      case "room.join": {
        const room = roomManager.joinRoom(message.code, context.clientId, message.name, context.ws);
        context.playerId = context.clientId;
        context.roomCode = room.code;

        emitRoomJoined(room, roomManager);
        emitRoomState(room);
        break;
      }

      case "room.ready": {
        if (!context.playerId) {
          sendError(context.ws, "not_in_room", "Join a room before toggling ready state.");
          return;
        }

        const room = roomManager.setPlayerReady(context.playerId, message.ready);
        const started = roomManager.maybeStartRoom(room);

        emitRoomJoined(room, roomManager);
        emitRoomState(room);

        if (started) {
          emitRoomEvent(room, "stageClear", { stage: 0, note: "co-op run started" });
        }
        break;
      }

      case "input.state": {
        if (!context.playerId) {
          return;
        }
        roomManager.setPlayerInput(context.playerId, message);
        break;
      }

      case "ping": {
        send(context.ws, { t: "pong", ts: message.ts });
        break;
      }

      case "ability.linkBurst":
      case "player.revive": {
        sendError(context.ws, "not_implemented", `${message.t} will be available in a later milestone.`);
        break;
      }

      default: {
        sendError(context.ws, "unsupported", "Message type is not supported.");
      }
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : "Unknown server error";
    sendError(context.ws, "server_error", text);
  }
}

export function handleDisconnect(context: ClientContext, roomManager: RoomManager): void {
  if (!context.playerId) {
    return;
  }

  const room = roomManager.removePlayer(context.playerId);
  context.playerId = undefined;
  context.roomCode = undefined;

  if (!room) {
    return;
  }

  emitRoomJoined(room, roomManager);
  emitRoomState(room);

  if (room.phase === "ended") {
    emitRoomEvent(room, "gameOver", { reason: "teammateDisconnected" });
  }
}
