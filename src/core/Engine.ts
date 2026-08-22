import * as THREE from 'three';
import { InputManager } from './InputManager';
import { initSharedEnvironment } from './Environment';
import { PostProcessing } from './PostProcessing';

export interface GameScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  init(): void | Promise<void>;
  update(dt: number, elapsed: number): void;
  dispose(): void;
  onResize?(width: number, height: number): void;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  clock = new THREE.Clock();
  private current: GameScene | null = null;
  private rafId = 0;
  private paused = false;
  private postFx: PostProcessing;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    initSharedEnvironment(this.renderer);
    InputManager.init(this.renderer.domElement);

    this.postFx = new PostProcessing(this.renderer, new THREE.Scene(), new THREE.PerspectiveCamera());

    window.addEventListener('resize', () => this.handleResize());
  }

  async setScene(factory: () => Promise<GameScene> | GameScene): Promise<void> {
    if (this.current) {
      this.current.dispose();
      this.current = null;
    }
    const scene = await factory();
    await scene.init();
    this.current = scene;
    this.postFx.setActive(scene.scene, scene.camera);
    this.handleResize();
  }

  private handleResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.postFx.setSize(w, h);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
      this.current.onResize?.(w, h);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  getCurrentScene(): GameScene | null {
    return this.current;
  }

  start(): void {
    const loop = () => {
      this.rafId = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1);
      const elapsed = this.clock.getElapsedTime();
      if (!this.paused && this.current) {
        this.current.update(dt, elapsed);
        this.postFx.render();
      }
      InputManager.endFrame();
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
  }
}
