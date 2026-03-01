import {
  AmbientLight,
  BoxGeometry,
  Color,
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

import type { PlayerView } from "@game/shared";

interface PlayerEntity {
  mesh: Mesh;
  target: Vector3;
}

const CAMERA_OFFSET = new Vector3(0, 14, 16);

export class GameScene {
  private readonly renderer: WebGLRenderer;

  private readonly scene: Scene;

  private readonly camera: PerspectiveCamera;

  private readonly entities = new Map<string, PlayerEntity>();

  private localPlayerId: string | undefined;

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
  }

  syncPlayers(players: PlayerView[]): void {
    const presentIds = new Set<string>();

    for (const player of players) {
      presentIds.add(player.id);

      const existing = this.entities.get(player.id);
      if (existing) {
        existing.target.set(player.x, player.y + 0.6, player.z);
        continue;
      }

      const body = new BoxGeometry(0.9, 1.2, 0.9);
      const material = new MeshStandardMaterial({
        color: player.color === "amber" ? "#ff9d3f" : "#3fb9ff",
        metalness: 0.2,
        roughness: 0.55
      });

      const mesh = new Mesh(body, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(player.x, player.y + 0.6, player.z);

      this.scene.add(mesh);
      this.entities.set(player.id, {
        mesh,
        target: new Vector3(player.x, player.y + 0.6, player.z)
      });
    }

    for (const [id, entity] of this.entities.entries()) {
      if (!presentIds.has(id)) {
        this.scene.remove(entity.mesh);
        entity.mesh.geometry.dispose();
        (entity.mesh.material as MeshStandardMaterial).dispose();
        this.entities.delete(id);
      }
    }
  }

  update(dt: number): void {
    const alpha = Math.min(1, dt * 12);

    for (const entity of this.entities.values()) {
      entity.mesh.position.lerp(entity.target, alpha);
    }

    if (this.localPlayerId) {
      const local = this.entities.get(this.localPlayerId);
      if (local) {
        const desiredCamera = local.mesh.position.clone().add(CAMERA_OFFSET);
        this.camera.position.lerp(desiredCamera, Math.min(1, dt * 6));
        this.camera.lookAt(local.mesh.position);
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
