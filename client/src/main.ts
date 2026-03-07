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
  pingStatus: elementById<HTMLElement>("pingStatus"),
  objectiveStatus: elementById<HTMLElement>("objectiveStatus"),
  playerList: elementById<HTMLUListElement>("playerList"),
  eventLog: elementById<HTMLElement>("eventLog"),
  touchPad: elementById<HTMLElement>("touchPad"),
  touchInteractBtn: elementById<HTMLButtonElement>("touchInteractBtn"),
  eventBanner: elementById<HTMLElement>("eventBanner"),
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
  pingMs: 0,
  objectiveDone: 0,
  objectiveTotal: 0,
  players: [] as Array<{ id: string; name: string; ready: boolean }>,
  logLines: [] as string[]
};

const movement = {
  up: false,
  down: false,
  left: false,
  right: false
};

const actions = {
  dash: false,
  interact: false
};

let inputSeq = 0;
let lastInputAt = performance.now();
let reconnectTimer: number | null = null;
let bannerTimer: number | null = null;
let lastAimYaw = 0;

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
  state.logLines = state.logLines.slice(0, 18);
  ui.eventLog.textContent = state.logLines.join("\n");
}

function showBanner(text: string, tone: "neutral" | "success" | "danger" = "neutral"): void {
  if (bannerTimer) {
    window.clearTimeout(bannerTimer);
  }

  ui.eventBanner.textContent = text;
  ui.eventBanner.classList.remove("tone-neutral", "tone-success", "tone-danger", "is-hidden");
  ui.eventBanner.classList.add(`tone-${tone}`);

  bannerTimer = window.setTimeout(() => {
    ui.eventBanner.classList.add("is-hidden");
  }, 2200);
}

function refreshHud(): void {
  ui.connStatus.textContent = state.connected ? "Connected" : "Disconnected";
  ui.connStatus.classList.toggle("status-ok", state.connected);
  ui.connStatus.classList.toggle("status-bad", !state.connected);

  ui.roomCodeStatus.textContent = state.roomCode;
  ui.phaseStatus.textContent = `${state.phase} · S${state.stage}`;
  ui.timerStatus.textContent = formatTimer(state.timeLeft);
  ui.pingStatus.textContent = state.connected ? `${Math.round(state.pingMs)} ms` : "-";
  ui.objectiveStatus.textContent = `${state.objectiveDone}/${state.objectiveTotal}`;

  ui.timerStatus.classList.toggle("timer-danger", state.timeLeft <= 30);
  ui.timerStatus.classList.toggle("timer-warning", state.timeLeft > 30 && state.timeLeft <= 90);

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

function eventText(message: Extract<S2CMessage, { t: "event" }>): { text: string; tone: "neutral" | "success" | "danger" } {
  switch (message.kind) {
    case "nodeActivated": {
      const who = typeof message.payload.by === "string" ? message.payload.by : "队友";
      return { text: `节点已激活 · ${who}`, tone: "success" };
    }
    case "victory":
      return { text: "任务完成，成功撤离", tone: "success" };
    case "gameOver":
      return { text: "任务失败，行动终止", tone: "danger" };
    case "stageClear":
      return { text: "行动开始，前往激活节点", tone: "neutral" };
    default:
      return { text: `事件: ${message.kind}`, tone: "neutral" };
  }
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
      if (message.phase === "running") {
        showBanner("双人行动开始", "neutral");
      }
      break;
    }

    case "snapshot": {
      scene.syncPlayers(message.players);
      scene.syncObjectives(message.objectives);
      state.objectiveTotal = message.objectives.length;
      state.objectiveDone = message.objectives.filter((objective) => objective.state === "done").length;
      break;
    }

    case "event": {
      const { text, tone } = eventText(message);
      addLog(text);
      showBanner(text, tone);
      break;
    }

    case "error": {
      addLog(`错误 ${message.code}: ${message.message}`);
      showBanner(`错误: ${message.message}`, "danger");
      break;
    }

    case "pong": {
      state.pingMs = Math.max(0, Date.now() - message.ts);
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
  state.pingMs = 0;
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
ui.roomCodeInput.addEventListener("input", () => {
  ui.roomCodeInput.value = roomCode(ui.roomCodeInput.value);
});

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
  const key = event.key.toLowerCase();
  const dir = keyToDirection[key];
  if (dir) {
    movement[dir] = true;
    return;
  }

  if (key === "shift") {
    actions.dash = true;
    return;
  }

  if (key === "e") {
    actions.interact = true;
  }
});

window.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  const dir = keyToDirection[key];
  if (dir) {
    movement[dir] = false;
    return;
  }

  if (key === "shift") {
    actions.dash = false;
    return;
  }

  if (key === "e") {
    actions.interact = false;
  }
});

window.addEventListener("blur", () => {
  movement.up = false;
  movement.down = false;
  movement.left = false;
  movement.right = false;
  actions.dash = false;
  actions.interact = false;
});

function bindHoldButton(button: HTMLButtonElement, onStart: () => void, onEnd: () => void): void {
  const start = (event: Event) => {
    event.preventDefault();
    button.classList.add("is-active");
    onStart();
  };

  const end = (event: Event) => {
    event.preventDefault();
    button.classList.remove("is-active");
    onEnd();
  };

  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", end);
  button.addEventListener("pointercancel", end);
  button.addEventListener("pointerleave", end);
}

for (const button of ui.touchPad.querySelectorAll<HTMLButtonElement>("button[data-dir]")) {
  const dir = button.dataset.dir as keyof typeof movement;
  bindHoldButton(
    button,
    () => {
      movement[dir] = true;
    },
    () => {
      movement[dir] = false;
    }
  );
}

bindHoldButton(
  ui.touchInteractBtn,
  () => {
    actions.interact = true;
  },
  () => {
    actions.interact = false;
  }
);

setInterval(() => {
  if (!socket.isOpen() || !state.playerId || state.phase !== "running") {
    return;
  }

  const move = axis();
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastInputAt) / 1000);
  lastInputAt = now;

  if (Math.abs(move.moveX) + Math.abs(move.moveY) > 0.001) {
    lastAimYaw = Math.atan2(move.moveX, move.moveY);
  }

  send({
    t: "input.state",
    seq: inputSeq,
    dt,
    moveX: move.moveX,
    moveY: move.moveY,
    lookYaw: lastAimYaw,
    lookPitch: 0,
    fire: false,
    dash: actions.dash,
    interact: actions.interact
  });
  inputSeq += 1;
}, 50);

setInterval(() => {
  if (!socket.isOpen()) {
    return;
  }
  send({ t: "ping", ts: Date.now() });
}, 3000);

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
addLog("W/A/S/D 移动，E 激活目标节点。若连接失败请先启动 server。");
requestAnimationFrame(animate);
