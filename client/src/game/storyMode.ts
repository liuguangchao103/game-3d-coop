import { MAP_HALF_EXTENT, PLAYER_MOVE_SPEED, clamp, normalize2D, type ObjectiveView, type PlayerView, type RoomPhase } from "@game/shared";

export type StoryTone = "neutral" | "success" | "danger";

export interface StoryMessage {
  text: string;
  tone: StoryTone;
}

export interface StorySnapshot {
  phase: RoomPhase;
  stage: number;
  timeLeft: number;
  players: PlayerView[];
  objectives: ObjectiveView[];
  objectiveDone: number;
  objectiveTotal: number;
  chapterTitle: string;
  missionTitle: string;
  brief: string;
  clue: string;
  progressText: string;
  threatLevel: number;
}

export interface StoryFrame {
  snapshot: StorySnapshot;
  messages: StoryMessage[];
}

interface StoryStepInput {
  dt: number;
  moveX: number;
  moveY: number;
  lookYaw: number;
  lookPitch: number;
  dash: boolean;
  interact: boolean;
}

type Sector = "north" | "south" | "east" | "west" | "center";

interface StoryMission {
  id: string;
  title: string;
  brief: string;
  clue: string;
  sequence: Sector[];
  timeLimit: number;
  wrongPenalty: number;
  needsExtraction?: boolean;
}

interface StoryChapter {
  id: string;
  title: string;
  prologue: string;
  epilogue: string;
  missions: StoryMission[];
}

interface StoryNode extends ObjectiveView {
  sector: Sector;
  orderIndex: number | null;
  isExtraction: boolean;
}

const SECTOR_POSITIONS: Record<Sector, { x: number; z: number }> = {
  north: { x: 0, z: -12.5 },
  south: { x: 0, z: 12.5 },
  east: { x: 12.5, z: 0 },
  west: { x: -12.5, z: 0 },
  center: { x: 0, z: 0 }
};

const CHAPTERS: StoryChapter[] = [
  {
    id: "chapter-1",
    title: "第一章 · 灰烬信标",
    prologue: "你潜入了被遗弃的暗域站，第一条主线是复原信标链路。",
    epilogue: "信标短暂亮起，地下数据井传来了第二层密钥。",
    missions: [
      {
        id: "c1-m1",
        title: "任务 1：冷风入口",
        brief: "按正确顺序激活三座节点，重启入口供电。",
        clue: "顺序提示：先西，再北，最后东。",
        sequence: ["west", "north", "east"],
        timeLimit: 210,
        wrongPenalty: 16
      },
      {
        id: "c1-m2",
        title: "任务 2：回路净化",
        brief: "改写回路后会出现伪装节点，继续遵循正确链路。",
        clue: "顺序提示：先南，再中，再北。",
        sequence: ["south", "center", "north"],
        timeLimit: 230,
        wrongPenalty: 18
      }
    ]
  },
  {
    id: "chapter-2",
    title: "第二章 · 回声迷宫",
    prologue: "暗域开始模拟你的行动，错误操作会触发噪声风暴。",
    epilogue: "你破解了迷宫底层，终端开始回传“悖论门”坐标。",
    missions: [
      {
        id: "c2-m1",
        title: "任务 1：谎言协议",
        brief: "诱饵节点会反噬时间，必须精确选择正确路径。",
        clue: "顺序提示：先东，再西，再中，再南。",
        sequence: ["east", "west", "center", "south"],
        timeLimit: 240,
        wrongPenalty: 20
      },
      {
        id: "c2-m2",
        title: "任务 2：幽蓝通道",
        brief: "通道会周期性扰动，保持节奏激活节点。",
        clue: "顺序提示：先北，再东，再南。",
        sequence: ["north", "east", "south"],
        timeLimit: 200,
        wrongPenalty: 22
      }
    ]
  },
  {
    id: "chapter-3",
    title: "第三章 · 悖论门",
    prologue: "终章启动：你要在倒计时内完成最终校准并撤离。",
    epilogue: "悖论门关闭前，你把主线数据带离了暗域。",
    missions: [
      {
        id: "c3-m1",
        title: "任务 1：终端校准",
        brief: "先完成四段校准链路，再激活中心撤离门。",
        clue: "顺序提示：先西，再南，再东，最后北。",
        sequence: ["west", "south", "east", "north"],
        timeLimit: 270,
        wrongPenalty: 24,
        needsExtraction: true
      }
    ]
  }
];

const DEFAULT_CHAPTER: StoryChapter = CHAPTERS[0]!;
const DEFAULT_MISSION: StoryMission = DEFAULT_CHAPTER.missions[0]!;

function sectorLabel(sector: Sector): string {
  switch (sector) {
    case "north":
      return "北";
    case "south":
      return "南";
    case "east":
      return "东";
    case "west":
      return "西";
    case "center":
      return "中";
  }
}

export class StoryModeEngine {
  private readonly playerId = "solo-operator";

  private playerName = "Operator";

  private chapterIndex = 0;

  private missionIndex = 0;

  private progressIndex = 0;

  private stage = 1;

  private phase: RoomPhase = "lobby";

  private timeLeft = 0;

  private threatLevel = 0;

  private threatDecay = 22;

  private player: PlayerView = {
    id: this.playerId,
    name: this.playerName,
    ready: true,
    x: -4,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp: 100,
    isDown: false,
    color: "cyan"
  };

  private objectives: StoryNode[] = [];

  private extractionOpened = false;

  startRun(playerName: string): StoryFrame {
    this.playerName = playerName;
    this.phase = "running";
    this.chapterIndex = 0;
    this.missionIndex = 0;
    this.stage = 1;
    this.player = {
      ...this.player,
      name: playerName,
      x: -4,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      hp: 100,
      isDown: false
    };

    const messages: StoryMessage[] = [{ text: this.currentChapter().prologue, tone: "neutral" }, ...this.setupMission()];

    return {
      snapshot: this.buildSnapshot(),
      messages
    };
  }

  getSnapshot(): StorySnapshot {
    return this.buildSnapshot();
  }

  step(input: StoryStepInput): StoryFrame {
    const messages: StoryMessage[] = [];

    if (this.phase !== "running") {
      return {
        snapshot: this.buildSnapshot(),
        messages
      };
    }

    this.updatePlayer(input);
    this.updateThreat(input.dt);

    const drainMultiplier = 1 + this.threatLevel * 0.17;
    this.timeLeft = Math.max(0, this.timeLeft - input.dt * drainMultiplier);

    if (input.interact) {
      messages.push(...this.handleInteract());
    }

    if (this.timeLeft <= 0 && this.phase === "running") {
      this.phase = "ended";
      messages.push({ text: "主线中断：时间耗尽，暗域封锁。", tone: "danger" });
    }

    return {
      snapshot: this.buildSnapshot(),
      messages
    };
  }

  private updatePlayer(input: StoryStepInput): void {
    const dir = normalize2D(input.moveX, input.moveY);
    const speed = input.dash ? PLAYER_MOVE_SPEED * 1.75 : PLAYER_MOVE_SPEED * 1.1;

    this.player.x = clamp(this.player.x + dir.x * speed * input.dt, -MAP_HALF_EXTENT, MAP_HALF_EXTENT);
    this.player.z = clamp(this.player.z + dir.y * speed * input.dt, -MAP_HALF_EXTENT, MAP_HALF_EXTENT);

    if (Math.abs(input.moveX) + Math.abs(input.moveY) > 0.08) {
      this.player.yaw = input.lookYaw;
    }
    this.player.pitch = input.lookPitch;
  }

  private updateThreat(dt: number): void {
    if (this.threatLevel <= 0) {
      return;
    }

    this.threatDecay -= dt;
    if (this.threatDecay <= 0) {
      this.threatLevel = Math.max(0, this.threatLevel - 1);
      this.threatDecay = 22;
    }
  }

  private handleInteract(): StoryMessage[] {
    const mission = this.currentMission();

    const target = this.pickNearestObjective(this.extractionOpened ? (node) => node.isExtraction : (node) => !node.isExtraction && node.state !== "done");

    if (!target) {
      return [{ text: "交互失败：附近没有可接入节点。", tone: "neutral" }];
    }

    if (this.extractionOpened && target.isExtraction) {
      target.state = "done";
      return this.advanceMission("撤离门已激活，进入下一段主线。");
    }

    const expectedSector = mission.sequence[this.progressIndex];
    if (!expectedSector) {
      return [{ text: "链路异常：无法解析下一目标节点。", tone: "danger" }];
    }

    if (target.sector !== expectedSector) {
      this.timeLeft = Math.max(0, this.timeLeft - mission.wrongPenalty);
      this.threatLevel = Math.min(5, this.threatLevel + 1);
      this.threatDecay = 20;

      return [
        {
          text: `错误链路：触发反噬，扣除 ${mission.wrongPenalty} 秒，噪声等级 +1。`,
          tone: "danger"
        },
        {
          text: `提示复核：当前应先激活 ${sectorLabel(expectedSector)} 区节点。`,
          tone: "neutral"
        }
      ];
    }

    target.state = "done";
    this.progressIndex += 1;

    if (this.progressIndex < mission.sequence.length) {
      const nextSector = mission.sequence[this.progressIndex];
      if (!nextSector) {
        return [{ text: "链路异常：下一阶段目标缺失。", tone: "danger" }];
      }
      return [{ text: `链路稳定：下一段前往 ${sectorLabel(nextSector)} 区。`, tone: "success" }];
    }

    if (mission.needsExtraction && !this.extractionOpened) {
      this.extractionOpened = true;
      this.objectives.push({
        id: `${mission.id}-extract`,
        state: "active",
        x: SECTOR_POSITIONS.center.x,
        y: 0,
        z: SECTOR_POSITIONS.center.z,
        sector: "center",
        orderIndex: null,
        isExtraction: true
      });

      return [{ text: "终端校准完成：前往中心撤离门并激活。", tone: "success" }];
    }

    return this.advanceMission("当前任务完成，主线推进。");
  }

  private advanceMission(successLine: string): StoryMessage[] {
    const messages: StoryMessage[] = [{ text: successLine, tone: "success" }];

    const chapter = CHAPTERS[this.chapterIndex];
    if (!chapter) {
      this.phase = "ended";
      messages.push({ text: "剧情索引错误，已终止本次行动。", tone: "danger" });
      return messages;
    }

    if (this.missionIndex + 1 < chapter.missions.length) {
      this.missionIndex += 1;
      messages.push(...this.setupMission());
      return messages;
    }

    messages.push({ text: chapter.epilogue, tone: "success" });

    if (this.chapterIndex + 1 < CHAPTERS.length) {
      this.chapterIndex += 1;
      this.missionIndex = 0;
      this.stage = this.chapterIndex + 1;
      const nextChapter = CHAPTERS[this.chapterIndex];
      if (!nextChapter) {
        this.phase = "ended";
        messages.push({ text: "章节切换失败，主线已终止。", tone: "danger" });
        return messages;
      }
      messages.push({ text: nextChapter.prologue, tone: "neutral" });
      messages.push(...this.setupMission());
      return messages;
    }

    this.phase = "ended";
    messages.push({ text: "主线通关：暗域主控已脱离。", tone: "success" });
    return messages;
  }

  private setupMission(): StoryMessage[] {
    const mission = this.currentMission();
    this.progressIndex = 0;
    this.extractionOpened = false;
    this.threatLevel = 0;
    this.threatDecay = 22;
    this.timeLeft = mission.timeLimit;
    this.objectives = this.buildMissionObjectives(mission);

    return [
      { text: `${this.currentChapter().title} · ${mission.title}`, tone: "neutral" },
      { text: mission.brief, tone: "neutral" },
      { text: mission.clue, tone: "neutral" }
    ];
  }

  private buildMissionObjectives(mission: StoryMission): StoryNode[] {
    const sectors: Sector[] = ["north", "south", "east", "west", "center"];
    const objectives: StoryNode[] = [];

    for (const sector of sectors) {
      const orderIndex = mission.sequence.findIndex((item) => item === sector);
      const point = SECTOR_POSITIONS[sector];
      objectives.push({
        id: `${mission.id}-${sector}`,
        state: "active",
        x: point.x,
        y: 0,
        z: point.z,
        sector,
        orderIndex: orderIndex >= 0 ? orderIndex : null,
        isExtraction: false
      });
    }

    return objectives;
  }

  private pickNearestObjective(filter: (node: StoryNode) => boolean): StoryNode | undefined {
    let best: StoryNode | undefined;
    let bestDistSq = Number.POSITIVE_INFINITY;

    for (const node of this.objectives) {
      if (!filter(node)) {
        continue;
      }

      const dx = this.player.x - node.x;
      const dz = this.player.z - node.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        best = node;
      }
    }

    if (bestDistSq > 2.8 * 2.8) {
      return undefined;
    }

    return best;
  }

  private currentChapter(): StoryChapter {
    return CHAPTERS[this.chapterIndex] ?? DEFAULT_CHAPTER;
  }

  private currentMission(): StoryMission {
    const chapter = this.currentChapter();
    return chapter.missions[this.missionIndex] ?? chapter.missions[0] ?? DEFAULT_MISSION;
  }

  private buildSnapshot(): StorySnapshot {
    const chapter = this.currentChapter();
    const mission = this.currentMission();

    const objectiveTotal = mission.sequence.length + (this.extractionOpened ? 1 : 0);
    const objectiveDone = this.objectives.filter((node) => node.state === "done" && (node.orderIndex !== null || node.isExtraction)).length;

    const clueSuffix = this.extractionOpened ? "撤离提示：前往中区激活撤离门。" : mission.clue;

    const progressText =
      this.phase === "ended" && this.chapterIndex === CHAPTERS.length - 1 && this.missionIndex === chapter.missions.length - 1 && objectiveDone >= objectiveTotal
        ? "主线完成"
        : `进度 ${objectiveDone}/${objectiveTotal}`;

    return {
      phase: this.phase,
      stage: this.stage,
      timeLeft: this.timeLeft,
      players: [this.player],
      objectives: this.objectives.map((node) => ({
        id: node.id,
        state: node.state,
        x: node.x,
        y: node.y,
        z: node.z
      })),
      objectiveDone,
      objectiveTotal,
      chapterTitle: chapter.title,
      missionTitle: mission.title,
      brief: mission.brief,
      clue: clueSuffix,
      progressText,
      threatLevel: this.threatLevel
    };
  }
}
