import {
  AmbientLight,
  BoxGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Fog,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
  WebGLRenderer
} from "three";

import type { ObjectiveView, PlayerView } from "@game/shared";

interface PlayerEntity {
  mesh: Mesh;
  material: MeshStandardMaterial;
  target: Vector3;
  targetYaw: number;
}

interface ObjectiveEntity {
  mesh: Mesh;
  material: MeshStandardMaterial;
  state: ObjectiveView["state"];
  pulseSeed: number;
}

const CAMERA_OFFSET = new Vector3(0, 14, 16);

function normalizeAngle(value: number): number {
  let angle = value;
  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }
  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }
  return angle;
}

function objectivePalette(state: ObjectiveView["state"]): { color: string; emissive: string; emissiveIntensity: number } {
  if (state === "done") {
    return { color: "#66d18f", emissive: "#2f9d62", emissiveIntensity: 0.35 };
  }
  if (state === "active") {
    return { color: "#ffb357", emissive: "#d9892f", emissiveIntensity: 0.9 };
  }
  return { color: "#4a8fc8", emissive: "#2a5d87", emissiveIntensity: 0.25 };
}

export class GameScene {
  private readonly renderer: WebGLRenderer;

  private readonly scene: Scene;

  private readonly camera: PerspectiveCamera;

  private readonly entities = new Map<string, PlayerEntity>();

  private readonly objectiveEntities = new Map<string, ObjectiveEntity>();

  private localPlayerId: string | undefined;

  private elapsed = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance"
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    this.scene = new Scene();
    this.scene.background = new Color("#080b10");
    this.scene.fog = new Fog("#080b10", 24, 60);

    this.camera = new PerspectiveCamera(58, 16 / 9, 0.1, 120);
    this.camera.position.copy(CAMERA_OFFSET);

    this.setupEnvironment();
    this.resize();

    window.addEventListener("resize", () => this.resize());
  }

  setLocalPlayer(playerId: string | undefined): void {
    this.localPlayerId = playerId;

    for (const [id, entity] of this.entities.entries()) {
      entity.material.emissive.set(id === this.localPlayerId ? "#4a6784" : "#1d2936");
      entity.material.emissiveIntensity = id === this.localPlayerId ? 0.5 : 0.2;
      entity.mesh.scale.setScalar(id === this.localPlayerId ? 1.06 : 1);
    }
  }

  syncPlayers(players: PlayerView[]): void {
    const presentIds = new Set<string>();

    for (const player of players) {
      presentIds.add(player.id);

      const existing = this.entities.get(player.id);
      if (existing) {
        existing.target.set(player.x, player.y + 0.6, player.z);
        existing.targetYaw = player.yaw;
        continue;
      }

      const body = new BoxGeometry(0.9, 1.2, 0.9);
      const material = new MeshStandardMaterial({
        color: player.color === "amber" ? "#ff9d3f" : "#3fb9ff",
        metalness: 0.25,
        roughness: 0.52,
        emissive: player.id === this.localPlayerId ? "#4a6784" : "#1d2936",
        emissiveIntensity: player.id === this.localPlayerId ? 0.5 : 0.2
      });

      const mesh = new Mesh(body, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(player.x, player.y + 0.6, player.z);
      mesh.rotation.y = player.yaw;
      mesh.scale.setScalar(player.id === this.localPlayerId ? 1.06 : 1);

      this.scene.add(mesh);
      this.entities.set(player.id, {
        mesh,
        material,
        target: new Vector3(player.x, player.y + 0.6, player.z),
        targetYaw: player.yaw
      });
    }

    for (const [id, entity] of this.entities.entries()) {
      if (!presentIds.has(id)) {
        this.scene.remove(entity.mesh);
        entity.mesh.geometry.dispose();
        entity.material.dispose();
        this.entities.delete(id);
      }
    }
  }

  syncObjectives(objectives: ObjectiveView[]): void {
    const presentIds = new Set<string>();

    for (const objective of objectives) {
      presentIds.add(objective.id);

      const existing = this.objectiveEntities.get(objective.id);
      if (existing) {
        existing.mesh.position.set(objective.x, 1.2, objective.z);
        if (existing.state !== objective.state) {
          existing.state = objective.state;
          const style = objectivePalette(objective.state);
          existing.material.color.set(style.color);
          existing.material.emissive.set(style.emissive);
          existing.material.emissiveIntensity = style.emissiveIntensity;
        }
        continue;
      }

      const style = objectivePalette(objective.state);
      const material = new MeshStandardMaterial({
        color: style.color,
        emissive: style.emissive,
        emissiveIntensity: style.emissiveIntensity,
        roughness: 0.35,
        metalness: 0.45
      });

      const mesh = new Mesh(new CylinderGeometry(0.6, 0.85, 2.4, 14), material);
      mesh.position.set(objective.x, 1.2, objective.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      this.objectiveEntities.set(objective.id, {
        mesh,
        material,
        state: objective.state,
        pulseSeed: Math.random() * Math.PI * 2
      });
    }

    for (const [id, entity] of this.objectiveEntities.entries()) {
      if (!presentIds.has(id)) {
        this.scene.remove(entity.mesh);
        entity.mesh.geometry.dispose();
        entity.material.dispose();
        this.objectiveEntities.delete(id);
      }
    }
  }

  update(dt: number): void {
    this.elapsed += dt;
    const alpha = Math.min(1, dt * 12);

    for (const entity of this.entities.values()) {
      entity.mesh.position.lerp(entity.target, alpha);
      const deltaYaw = normalizeAngle(entity.targetYaw - entity.mesh.rotation.y);
      entity.mesh.rotation.y += deltaYaw * Math.min(1, dt * 9);
    }

    for (const objective of this.objectiveEntities.values()) {
      objective.mesh.rotation.y += dt * 0.28;

      if (objective.state === "active") {
        const pulse = 1 + Math.sin(this.elapsed * 5 + objective.pulseSeed) * 0.07;
        objective.mesh.scale.set(1, pulse, 1);
        objective.material.emissiveIntensity = 0.75 + Math.sin(this.elapsed * 8 + objective.pulseSeed) * 0.22;
      } else {
        objective.mesh.scale.set(1, 1, 1);
      }
    }

    if (this.localPlayerId) {
      const local = this.entities.get(this.localPlayerId);
      if (local) {
        const speedHint = local.mesh.position.distanceTo(local.target) / Math.max(dt, 0.001);
        const moveFactor = Math.min(1, speedHint / 4);
        const dynamicOffset = CAMERA_OFFSET.clone();
        dynamicOffset.y += moveFactor * 0.8;
        dynamicOffset.z -= moveFactor * 1.3;

        const desiredCamera = local.mesh.position.clone().add(dynamicOffset);
        this.camera.position.lerp(desiredCamera, Math.min(1, dt * 6));
        this.camera.lookAt(local.mesh.position.x, local.mesh.position.y + 0.3, local.mesh.position.z);
      }
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private setupEnvironment(): void {
    const ground = new Mesh(
      new PlaneGeometry(48, 48),
      new MeshStandardMaterial({
        color: "#0e141d",
        roughness: 0.95,
        metalness: 0.05
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const grid = new GridHelper(48, 24, 0x253447, 0x1a2432);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const rimLight = new DirectionalLight("#7ba4d1", 1.8);
    rimLight.position.set(7, 14, 5);
    this.scene.add(rimLight);

    const warmLight = new DirectionalLight("#ff9b54", 0.6);
    warmLight.position.set(-8, 10, -6);
    this.scene.add(warmLight);

    const ambient = new AmbientLight("#3a4558", 0.6);
    this.scene.add(ambient);

    const obstacleGeometry = new BoxGeometry(3, 2.5, 3);
    const obstaclePositions: Array<[number, number]> = [
      [-9, -6],
      [10, -4],
      [8, 9],
      [-7, 8]
    ];

    for (const [x, z] of obstaclePositions) {
      const obstacle = new Mesh(
        obstacleGeometry,
        new MeshStandardMaterial({
          color: "#16202e",
          roughness: 0.85,
          metalness: 0.12
        })
      );
      obstacle.position.set(x, 1.25, z);
      obstacle.castShadow = true;
      obstacle.receiveShadow = true;
      this.scene.add(obstacle);
    }
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) {
      return;
    }

    const width = Math.max(320, parent.clientWidth);
    const height = Math.max(320, parent.clientHeight);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}
