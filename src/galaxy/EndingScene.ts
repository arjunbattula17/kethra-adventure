import * as THREE from 'three';
import type { GameScene } from '../core/Engine';
import { UIManager, reducedMotion } from '../ui/UIManager';
import { AudioSystem } from '../audio/AudioSystem';
import { getSharedEnvironment } from '../core/Environment';
import { buildShipHull } from './shipHull';
import { buildStarfield, getPointSprite } from './spaceDressing';
import { t } from '../content/strings';
import type { StringKey } from '../content/strings';

/**
 * The ending of part one (LORE.md, "Level by level"): the Wren sends the Anchorage's ledger home.
 * The transmission is drawn as what it is, light: a ring of the Wren's own amber leaving the hull,
 * passing Kethra (whose Heart answers green) and heading out past the Drift. The lines restate the
 * through-line (a dead ship learned to read light, and used it to call for help) and point at
 * Isilthe, where the Choir still sings. Then the credits.
 *
 * Same text system as the opening (the .intro-line styles), so the game ends in the voice it began.
 */
const LINES: [StringKey, number][] = [
  ['ending.line.1', 2.0],
  ['ending.line.2', 8.2],
  ['ending.line.3', 14.6],
  ['ending.line.4', 21.0],
];
const CREDITS_AT = 28;

const CREDIT_KEYS: StringKey[] = [
  'credits.original',
  'credits.freighter',
  'credits.planets',
  'credits.kits',
  'credits.textures',
  'credits.font',
  'credits.three',
];

function glowSprite(color: number, size: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: getPointSprite(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size);
  return s;
}

export class EndingScene implements GameScene {
  readonly kind = 'EndingScene';
  readonly usesAO = false;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 3000);
  onDone: (() => void) | null = null;

  private ship: THREE.Object3D | null = null;
  private pulses: { mesh: THREE.Mesh; born: number }[] = [];
  private kethra!: THREE.Sprite;
  private kethraAnswer = 0;
  private elapsed = 0;
  private cues: { at: number; run: () => void }[] = [];
  private textLayer!: HTMLDivElement;
  private lineEls: HTMLDivElement[] = [];
  private creditsEl: HTMLDivElement | null = null;
  private stopMusic: (() => void) | null = null;
  private finished = false;
  private keyHandler = (e: KeyboardEvent) => {
    if ((e.code === 'Space' || e.code === 'Enter') && !this.creditsEl) this.showCredits();
  };
  private clickHandler = () => {
    if (!this.creditsEl && this.elapsed > 1) this.showCredits();
  };

  async init(): Promise<void> {
    UIManager.setLookPromptEnabled(false);
    UIManager.setCrosshairVisible(false);
    UIManager.showLetterbox(true);
    document.body.classList.add('ending-open');
    this.scene.background = new THREE.Color(0x010208);
    this.scene.environment = getSharedEnvironment();
    this.scene.environmentIntensity = 0.6;
    this.scene.add(buildStarfield(2200, 900, 1.1));

    try {
      const hull = await buildShipHull();
      this.ship = hull.group;
      this.ship.rotation.set(0.12, -0.5, 0.05);
      this.scene.add(this.ship);
      // Lit and awake now: the crew glow in every port, where the opening had it dark.
      const glow = new THREE.PointLight(0xffc27a, 3, 16);
      glow.position.set(1, 1.2, 0);
      this.ship.add(glow);
    } catch {
      this.ship = null;
    }
    const key = new THREE.DirectionalLight(0xffe6c8, 1.4);
    key.position.set(-8, 6, 10);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9);
    rim.position.set(6, 3, -10);
    this.scene.add(rim);
    this.scene.add(new THREE.AmbientLight(0x6070a0, 0.25));

    // Kethra, far off: a green point that brightens when the transmission passes it.
    this.kethra = glowSprite(0x5cd1b0, 6);
    this.kethra.position.set(-60, 8, -140);
    this.scene.add(this.kethra);
    // Isilthe, farther still: a cold blue point, where the Choir is.
    const isilthe = glowSprite(0x8fc4ff, 4);
    isilthe.position.set(90, -14, -420);
    this.scene.add(isilthe);

    this.camera.position.set(4, 1.8, 13);
    this.camera.lookAt(0, 0.5, 0);
    this.buildText();
    this.cues = [
      { at: 0.6, run: () => this.emitPulse() },
      { at: 2.4, run: () => this.emitPulse() },
      { at: 4.2, run: () => this.emitPulse() },
      ...LINES.flatMap(([, at], i) => [
        { at, run: () => this.lineEls[i].classList.add('on') },
        { at: at + 5.2, run: () => { this.lineEls[i].classList.remove('on'); this.lineEls[i].classList.add('out'); } },
      ]),
      { at: 12, run: () => AudioSystem.playTone(146.83, 2.5, 'sine', 0.05) },
      { at: CREDITS_AT, run: () => this.showCredits() },
    ].sort((a, b) => a.at - b.at);
    this.stopMusic = AudioSystem.startMusic('ending');
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('click', this.clickHandler);
  }

  private buildText(): void {
    const layer = document.createElement('div');
    layer.className = 'intro-text active';
    const scrim = document.createElement('div');
    scrim.className = 'intro-scrim';
    layer.appendChild(scrim);
    LINES.forEach(([key], i) => {
      const line = document.createElement('div');
      line.className = i === LINES.length - 1 ? 'intro-line goal' : 'intro-line';
      const words = t(key).split(' ');
      words.forEach((word, w) => {
        const span = document.createElement('span');
        span.textContent = word;
        span.style.setProperty('--w', String(w));
        line.appendChild(span);
        if (w < words.length - 1) line.appendChild(document.createTextNode(' '));
      });
      layer.appendChild(line);
      this.lineEls.push(line);
    });
    document.getElementById('ui-root')!.appendChild(layer);
    this.textLayer = layer;
  }

  /** One transmission pulse: a thin ring of amber light leaving the hull and growing past the camera. */
  private emitPulse(): void {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb45a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 96), mat);
    mesh.position.set(0.5, 0.8, 0);
    mesh.lookAt(this.kethra.position);
    this.scene.add(mesh);
    this.pulses.push({ mesh, born: this.elapsed });
    AudioSystem.playTone(440, 1.2, 'sine', 0.04);
  }

  private showCredits(): void {
    if (this.creditsEl || this.finished) return;
    this.textLayer.classList.add('skipped');
    const el = document.createElement('div');
    el.className = 'credits-roll';
    el.innerHTML = `<div class="credits-inner">
      <div class="eyebrow">End of part one</div>
      <div class="chapter-title">The ledger goes home</div>
      <p class="credits-lede"></p>
      <div class="credits-list"></div>
      <div class="credits-actions"></div>
    </div>`;
    (el.querySelector('.credits-lede') as HTMLElement).textContent = t('ending.lede');
    const list = el.querySelector('.credits-list') as HTMLElement;
    for (const key of CREDIT_KEYS) {
      const p = document.createElement('p');
      p.textContent = t(key);
      list.appendChild(p);
    }
    const actions = el.querySelector('.credits-actions') as HTMLElement;
    const keep = document.createElement('button');
    keep.className = 'btn primary';
    keep.textContent = 'Keep exploring';
    keep.onclick = () => {
      AudioSystem.playConfirm();
      this.finish();
    };
    const title = document.createElement('button');
    title.className = 'btn secondary';
    title.textContent = 'Title screen';
    title.onclick = () => {
      AudioSystem.playConfirm();
      this.finish();
      window.setTimeout(() => location.assign(location.pathname), 400);
    };
    actions.append(keep, title);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));
    this.creditsEl = el;
    AudioSystem.playLevelEnd();
    keep.focus({ preventScroll: true });
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.creditsEl?.classList.remove('visible');
    UIManager.showLetterbox(false);
    this.onDone?.();
  }

  update(dt: number): void {
    this.elapsed += dt;
    while (this.cues.length && this.cues[0].at <= this.elapsed) this.cues.shift()!.run();
    if (this.ship) {
      this.ship.rotation.y += dt * 0.02;
      this.ship.position.y = Math.sin(this.elapsed * 0.4) * 0.08;
    }
    // A slow pull back and up over the whole sequence: the ship gets small against where the light
    // is going. Reduced motion holds the frame.
    if (!reducedMotion()) {
      const k = Math.min(1, this.elapsed / CREDITS_AT);
      const e = k * k * (3 - 2 * k);
      this.camera.position.set(4 + e * 10, 1.8 + e * 7, 13 + e * 26);
      this.camera.lookAt(-e * 18, 0.5 + e * 2, -e * 40);
    }
    for (const p of this.pulses) {
      const age = this.elapsed - p.born;
      p.mesh.scale.setScalar(1 + age * age * 14);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.9 - age * 0.09);
      // Kethra answers once the first ring reaches it.
      if (age > 3 && this.kethraAnswer === 0) this.kethraAnswer = this.elapsed;
    }
    if (this.kethraAnswer) {
      const a = Math.min(1, (this.elapsed - this.kethraAnswer) / 2);
      this.kethra.scale.setScalar(6 + a * 10 + Math.sin(this.elapsed * 2) * a);
    }
  }

  onResize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.keyHandler);
    window.removeEventListener('click', this.clickHandler);
    document.body.classList.remove('ending-open');
    this.stopMusic?.();
    this.textLayer?.remove();
    this.creditsEl?.remove();
    UIManager.setCrosshairVisible(true);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}
