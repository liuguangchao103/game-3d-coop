import "./styles.css";

import type { C2SMessage, S2CMessage } from "@game/shared";

import { GameScene } from "./game/scene";
import { StoryModeEngine, type StoryFrame, type StoryTone } from "./game/storyMode";
import { SocketClient } from "./net/socketClient";

type GameMode = "coop" | "story";

function elementById<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: ${id}`);
  }
  return element as T;
}

const ui = {
  modeCoopBtn: elementById<HTMLButtonElement>("modeCoopBtn"),
  modeStoryBtn: elementById<HTMLButtonElement>("modeStoryBtn"),
  coopControls: elementById<HTMLElement>("coopControls"),
  storyControls: elementById<HTMLElement>("storyControls"),
  startStoryBtn: elementById<HTMLButtonElement>("startStoryBtn"),
  storyChapterTitle: elementById<HTMLElement>("storyChapterTitle"),
  storyMissionTitle: elementById<HTMLElement>("storyMissionTitle"),
  storyBrief: elementById<HTMLElement>("storyBrief"),
  storyClue: elementById<HTMLElement>("storyClue"),
  storyProgress: elementById<HTMLElement>("storyProgress"),
  hintText: elementById<HTMLElement>("hintText"),
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
const story = new StoryModeEngine();

const defaultWsUrl = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:8787/ws`;
const wsUrl = import.meta.env.VITE_SERVER_URL ?? defaultWsUrl;

const state = {
  mode: "coop" as GameMode,
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
  storyChapterTitle: "章节：未开始",
  storyMissionTitle: "任务：-",
  storyBrief: "切换到单机后可直接开始主线闯关。",
  storyClue: "提示：顺序线索会在这里展示。",
  storyProgress: "进度：-",
  storyThreat: 0,
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
let shouldAutoReconnect = true;
let interactQueued = false;

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
  state.logLines = state.logLines.slice(0, 20);
  ui.eventLog.textContent = state.logLines.join("\n");
}

function showBanner(text: string, tone: StoryTone = "neutral"): void {
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

function refreshModeUI(): void {
  const coop = state.mode === "coop";
  ui.modeCoopBtn.classList.toggle("is-active", coop);
  ui.modeStoryBtn.classList.toggle("is-active", !coop);
  ui.coopControls.classList.toggle("hidden", !coop);
  ui.storyControls.classList.toggle("hidden", coop);

  ui.hintText.textContent = coop
    ? "W/A/S/D 移动 · E 激活节点 · 双人 Ready 自动开局"
    : "单机主线：按线索顺序激活节点，错误会触发反噬。";
}

function refreshHud(): void {
  const coop = state.mode === "coop";

  if (coop) {
    ui.connStatus.textContent = state.connected ? "Connected" : "Disconnected";
    ui.connStatus.classList.toggle("status-ok", state.connected);
    ui.connStatus.classList.toggle("status-bad", !state.connected);
    ui.roomCodeStatus.textContent = state.roomCode;
    ui.pingStatus.textContent = state.connected ? `${Math.round(state.pingMs)} ms` : "-";
    ui.readyBtn.disabled = !(state.connected && state.playerId.length > 0 && state.phase === "lobby");

    const me = state.players.find((player) => player.id === state.playerId);
    ui.readyBtn.textContent = me?.ready ? "取消准备" : "准备";
  } else {
    ui.connStatus.textContent = "LOCAL SOLO";
    ui.connStatus.classList.add("status-ok");
    ui.connStatus.classList.remove("status-bad");
    ui.roomCodeStatus.textContent = "STORY";
    ui.pingStatus.textContent = "-";
  }

  ui.phaseStatus.textContent = `${state.phase} · S${state.stage}`;
  ui.timerStatus.textContent = formatTimer(state.timeLeft);
  ui.objectiveStatus.textContent = `${state.objectiveDone}/${state.objectiveTotal}`;

  ui.timerStatus.classList.toggle("timer-danger", state.timeLeft <= 30 && state.phase === "running");
  ui.timerStatus.classList.toggle("timer-warning", state.timeLeft > 30 && state.timeLeft <= 90 && state.phase === "running");

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

  ui.storyChapterTitle.textContent = state.storyChapterTitle;
  ui.storyMissionTitle.textContent = state.storyMissionTitle;
  ui.storyBrief.textContent = state.storyBrief;
  ui.storyClue.textContent = state.storyClue;
  ui.storyProgress.textContent = `${state.storyProgress} · 噪声等级 ${state.storyThreat}`;

  if (state.mode === "story") {
    ui.startStoryBtn.textContent = state.phase === "running" ? "重开当前主线" : "开始单机主线";
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

function eventText(message: Extract<S2CMessage, { t: "event" }>): { text: string; tone: StoryTone } {
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

function handleCoopMessage(message: S2CMessage): void {
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

function consumeInteractQueue(): boolean {
  if (!interactQueued) {
    return false;
  }
  interactQueued = false;
  return true;
}

function applyStoryFrame(frame: StoryFrame): void {
  const snapshot = frame.snapshot;

  state.playerId = snapshot.players[0]?.id ?? "solo-operator";
  state.players = snapshot.players.map((player) => ({
    id: player.id,
    name: player.name,
    ready: true
  }));

  state.phase = snapshot.phase;
  state.stage = snapshot.stage;
  state.timeLeft = snapshot.timeLeft;
  state.objectiveDone = snapshot.objectiveDone;
  state.objectiveTotal = snapshot.objectiveTotal;

  state.storyChapterTitle = snapshot.chapterTitle;
  state.storyMissionTitle = snapshot.missionTitle;
  state.storyBrief = snapshot.brief;
  state.storyClue = snapshot.clue;
  state.storyProgress = snapshot.progressText;
  state.storyThreat = snapshot.threatLevel;

  scene.setLocalPlayer(state.playerId);
  scene.syncPlayers(snapshot.players);
  scene.syncObjectives(snapshot.objectives);

  for (const message of frame.messages) {
    addLog(message.text);
    showBanner(message.text, message.tone);
  }

  refreshHud();
}

function startStoryRun(): void {
  const frame = story.startRun(normalizeName(ui.playerName.value));
  state.timeLeft = frame.snapshot.timeLeft;
  applyStoryFrame(frame);
}

function resetCoopState(): void {
  state.playerId = "";
  state.roomCode = "-";
  state.phase = "lobby";
  state.stage = 1;
  state.timeLeft = 18 * 60;
  state.pingMs = 0;
  state.objectiveDone = 0;
  state.objectiveTotal = 0;
  state.players = [];
  scene.syncPlayers([]);
  scene.syncObjectives([]);
}

function setMode(mode: GameMode): void {
  if (state.mode === mode) {
    return;
  }

  state.mode = mode;

  if (mode === "story") {
    shouldAutoReconnect = false;
    if (reconnectTimer) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    socket.disconnect();
    state.connected = false;

    resetCoopState();
    state.storyChapterTitle = "章节：待启动";
    state.storyMissionTitle = "任务：待启动";
    state.storyBrief = "单机主线已就绪，点击“开始单机主线”进入第一章。";
    state.storyClue = "核心机制：按线索顺序激活节点，错误会扣时间并抬升噪声等级。";
    state.storyProgress = "进度：未开始";
    state.storyThreat = 0;

    const snapshot = story.getSnapshot();
    applyStoryFrame({ snapshot, messages: [] });
    addLog("已切换到单机主线模式。");
  } else {
    shouldAutoReconnect = true;
    resetCoopState();
    socket.connect(wsUrl);
    addLog("已切换到在线协作模式。");
  }

  refreshModeUI();
  refreshHud();
}

socket.onOpen(() => {
  if (state.mode !== "coop") {
    return;
  }

  state.connected = true;
  addLog(`已连接服务器 ${wsUrl}`);
  refreshHud();
});

socket.onClose(() => {
  if (state.mode !== "coop") {
    return;
  }

  state.connected = false;
  state.pingMs = 0;
  addLog("连接已断开，1.5 秒后自动重连。");
  refreshHud();

  if (!shouldAutoReconnect) {
    return;
  }

  if (reconnectTimer) {
    window.clearTimeout(reconnectTimer);
  }
  reconnectTimer = window.setTimeout(() => {
    socket.connect(wsUrl);
  }, 1500);
});

socket.onError((text) => {
  if (state.mode === "coop") {
    addLog(`网络错误: ${text}`);
  }
});

socket.onMessage((message) => {
  if (state.mode !== "coop") {
    return;
  }
  handleCoopMessage(message);
});

ui.modeCoopBtn.addEventListener("click", () => setMode("coop"));
ui.modeStoryBtn.addEventListener("click", () => setMode("story"));
ui.startStoryBtn.addEventListener("click", () => startStoryRun());

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
    interactQueued = true;
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
  interactQueued = false;
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
    interactQueued = true;
  },
  () => {
    actions.interact = false;
  }
);

setInterval(() => {
  if (state.mode !== "coop") {
    return;
  }

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
  if (state.mode !== "coop") {
    return;
  }
  if (!socket.isOpen()) {
    return;
  }
  send({ t: "ping", ts: Date.now() });
}, 3000);

let prev = performance.now();
function animate(now: number): void {
  const dt = Math.min(0.033, (now - prev) / 1000);
  prev = now;

  if (state.mode === "story") {
    const move = axis();
    if (Math.abs(move.moveX) + Math.abs(move.moveY) > 0.001) {
      lastAimYaw = Math.atan2(move.moveX, move.moveY);
    }

    const frame = story.step({
      dt,
      moveX: move.moveX,
      moveY: move.moveY,
      lookYaw: lastAimYaw,
      lookPitch: 0,
      dash: actions.dash,
      interact: consumeInteractQueue()
    });
    applyStoryFrame(frame);
  } else if (state.phase === "running") {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    ui.timerStatus.textContent = formatTimer(state.timeLeft);
  }

  scene.update(dt);
  scene.render();

  requestAnimationFrame(animate);
}

socket.connect(wsUrl);
refreshModeUI();
refreshHud();
addLog("默认进入在线协作。可切换到“单机主线”体验剧情闯关。 ");
requestAnimationFrame(animate);
