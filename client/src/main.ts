import "./styles.css";

import type { C2SMessage, S2CMessage } from "@game/shared";

import { GameScene } from "./game/scene";
import { SocketClient } from "./net/socketClient";

function elementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}

const ui = {
  playerName: elementById<HTMLInputElement>("playerName"),
  roomCodeInput: elementById<HTMLInputElement>("roomCodeInput"),
  createRoomBtn: elementById<HTMLButtonElement>("createRoomBtn"),
  joinRoomBtn: elementById<HTMLButtonElement>("joinRoomBtn"),
  readyBtn: elementById<HTMLButtonElement>("readyBtn"),
  connStatus: elementById<HTMLElement>("connStatus"),
  roomCodeStatus: elementById<HTMLElement>("roomCodeStatus"),
  phaseStatus: elementById<HTMLElement>("phaseStatus"),
  timerStatus: elementById<HTMLElement>("timerStatus"),
  playerList: elementById<HTMLUListElement>("playerList"),
  eventLog: elementById<HTMLElement>("eventLog"),
  touchPad: elementById<HTMLElement>("touchPad"),
  gameCanvas: elementById<HTMLCanvasElement>("gameCanvas")
};

const scene = new GameScene(ui.gameCanvas);
const socket = new SocketClient();

const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787/ws`;
const wsUrl = import.meta.env.VITE_SERVER_URL ?? defaultWsUrl;

const state = {
  connected: false,
  playerId: "",
  roomCode: "-",
  phase: "lobby" as "lobby" | "running" | "ended",
  stage: 1,
  timeLeft: 18 * 60,
  players: [] as Array<{ id: string; name: string; ready: boolean }>,
  logLines: [] as string[]
};

const movement = {
  up: false,
  down: false,
  left: false,
  right: false
};

let inputSeq = 0;
let lastInputAt = performance.now();
let reconnectTimer: number | null = null;

function normalizeName(value: string): string {
  const sanitized = value.trim().slice(0, 20);
  if (sanitized.length < 2) {
    return "Operator";
  }
  return sanitized;
}

function roomCode(value: string): string {
  return value.trim().toUpperCase();
}

function axis(): { moveX: number; moveY: number } {
  const moveX = (movement.right ? 1 : 0) + (movement.left ? -1 : 0);
  const moveY = (movement.down ? 1 : 0) + (movement.up ? -1 : 0);

  const len = Math.hypot(moveX, moveY);
  if (len <= 0.001) {
    return { moveX: 0, moveY: 0 };
  }

  return {
    moveX: moveX / len,
    moveY: moveY / len
  };
}

function formatTimer(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function addLog(line: string): void {
  const timestamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  state.logLines.unshift(`[${timestamp}] ${line}`);
  state.logLines = state.logLines.slice(0, 14);
  ui.eventLog.textContent = state.logLines.join("\n");
}

function refreshHud(): void {
  ui.connStatus.textContent = state.connected ? "Connected" : "Disconnected";
  ui.roomCodeStatus.textContent = state.roomCode;
  ui.phaseStatus.textContent = `${state.phase} · S${state.stage}`;
  ui.timerStatus.textContent = formatTimer(state.timeLeft);

  const me = state.players.find((player) => player.id === state.playerId);
  const canToggleReady = state.connected && state.playerId.length > 0 && state.phase === "lobby";
  ui.readyBtn.disabled = !canToggleReady;
  ui.readyBtn.textContent = me?.ready ? "取消准备" : "准备";

  ui.playerList.innerHTML = "";
  for (const player of state.players) {
    const item = document.createElement("li");
    item.textContent = `${player.name}${player.id === state.playerId ? " (你)" : ""}`;

    const badge = document.createElement("strong");
    badge.textContent = player.ready ? "READY" : "WAIT";
    badge.style.color = player.ready ? "#7be49f" : "#ffbf73";

    item.appendChild(badge);
    ui.playerList.appendChild(item);
  }
}

function send(message: C2SMessage): void {
  socket.send(message);
}

function sendCreateRoom(): void {
  const name = normalizeName(ui.playerName.value);
  send({ t: "room.create", name });
}

function sendJoinRoom(): void {
  const name = normalizeName(ui.playerName.value);
  const code = roomCode(ui.roomCodeInput.value);
  if (!code) {
    addLog("请输入房间码再加入。");
    return;
  }
  send({ t: "room.join", code, name });
}

function toggleReady(): void {
  const me = state.players.find((player) => player.id === state.playerId);
  const nextReady = !me?.ready;
  send({ t: "room.ready", ready: nextReady });
}

function handleMessage(message: S2CMessage): void {
  switch (message.t) {
    case "room.created": {
      state.playerId = message.playerId;
      state.roomCode = message.code;
      ui.roomCodeInput.value = message.code;
      scene.setLocalPlayer(message.playerId);
      addLog(`房间已创建：${message.code}`);
      break;
    }

    case "room.joined": {
      state.playerId = message.playerId;
      state.roomCode = message.code;
      state.players = message.players;
      scene.setLocalPlayer(message.playerId);
      addLog(`房间 ${message.code} 当前人数：${message.players.length}/2`);
      break;
    }

    case "room.state": {
      state.phase = message.phase;
      state.timeLeft = message.timeLeft;
      state.stage = message.stage;
      break;
    }

    case "snapshot": {
      scene.syncPlayers(message.players);
      break;
    }

    case "event": {
      addLog(`事件: ${message.kind}`);
      break;
    }

    case "error": {
      addLog(`错误 ${message.code}: ${message.message}`);
      break;
    }

    case "pong": {
      break;
    }
  }

  refreshHud();
}

socket.onOpen(() => {
  state.connected = true;
  addLog(`已连接服务器 ${wsUrl}`);
  refreshHud();
});

socket.onClose(() => {
  state.connected = false;
  addLog("连接已断开，1.5 秒后自动重连。");
  refreshHud();

  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
  }
  reconnectTimer = window.setTimeout(() => {
    socket.connect(wsUrl);
  }, 1500);
});

socket.onError((text) => {
  addLog(`网络错误: ${text}`);
});

socket.onMessage((message) => {
  handleMessage(message);
});

ui.createRoomBtn.addEventListener("click", () => sendCreateRoom());
ui.joinRoomBtn.addEventListener("click", () => sendJoinRoom());
ui.readyBtn.addEventListener("click", () => toggleReady());

const keyToDirection: Record<string, keyof typeof movement> = {
  w: "up",
  arrowup: "up",
  s: "down",
  arrowdown: "down",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right"
};

window.addEventListener("keydown", (event) => {
  const dir = keyToDirection[event.key.toLowerCase()];
  if (!dir) {
    return;
  }
  movement[dir] = true;
});

window.addEventListener("keyup", (event) => {
  const dir = keyToDirection[event.key.toLowerCase()];
  if (!dir) {
    return;
  }
  movement[dir] = false;
});

for (const button of ui.touchPad.querySelectorAll<HTMLButtonElement>("button[data-dir]")) {
  const dir = button.dataset.dir as keyof typeof movement;

  const onDown = (event: Event) => {
    event.preventDefault();
    movement[dir] = true;
  };

  const onUp = (event: Event) => {
    event.preventDefault();
    movement[dir] = false;
  };

  button.addEventListener("pointerdown", onDown);
  button.addEventListener("pointerup", onUp);
  button.addEventListener("pointercancel", onUp);
  button.addEventListener("pointerleave", onUp);
}

setInterval(() => {
  if (!socket.isOpen() || !state.playerId || state.phase !== "running") {
    return;
  }

  const move = axis();
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastInputAt) / 1000);
  lastInputAt = now;

  const lookYaw = Math.abs(move.moveX) + Math.abs(move.moveY) > 0 ? Math.atan2(move.moveX, move.moveY) : 0;

  send({
    t: "input.state",
    seq: inputSeq,
    dt,
    moveX: move.moveX,
    moveY: move.moveY,
    lookYaw,
    lookPitch: 0,
    fire: false,
    dash: false,
    interact: false
  });
  inputSeq += 1;
}, 50);

setInterval(() => {
  if (!socket.isOpen()) {
    return;
  }
  send({ t: "ping", ts: Date.now() });
}, 5000);

let prev = performance.now();
function animate(now: number): void {
  const dt = Math.min(0.033, (now - prev) / 1000);
  prev = now;

  if (state.phase === "running") {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
  }

  scene.update(dt);
  scene.render();

  ui.timerStatus.textContent = formatTimer(state.timeLeft);
  requestAnimationFrame(animate);
}

socket.connect(wsUrl);
refreshHud();
addLog("按 W/A/S/D 移动，双人都点击准备后开局。\n若连接失败请先启动 server。");
requestAnimationFrame(animate);
