import * as THREE from 'three';
import * as H from './sim';
import { buildChamber } from './chamber';
import type { Chamber } from './chamber';
import { GazeView } from './gaze';
import { Lantern } from './lantern';
import { buildWickmoth, RITE } from '../grove';
import type { Wickmoth, CisternHeart, RiteColour } from '../grove';
import { KETHRA_TRUE_SEQUENCE, KETHRA_RITUAL_SEQUENCE } from '../kethraLore';
import type { PlayerController } from '../../../player/PlayerController';
import { InputManager } from '../../../core/InputManager';
import { BINDINGS } from '../../../content/controls';
import { gameState } from '../../../core/GameState';
import { UIManager } from '../../../ui/UIManager';
import { AudioSystem } from '../../../audio/AudioSystem';
import { registerMiniGame } from '../../../debug/hooks';
import { t } from '../../../content/strings';
import type { StringKey } from '../../../content/strings';
import { MotionScope, ease, motion } from '../../../motion';
import { getPointSprite } from '../../../galaxy/spaceDressing';

/** The stone's glyphs, left to right: keys 1, 2 and 3. */
const COLOURS: RiteColour[] = ['azure', 'amber', 'verdant'];
const TRUE_ORDER = KETHRA_TRUE_SEQUENCE as RiteColour[];
const GAZE_CALM = new THREE.Color(0x5fd9c8);
const GAZE_ALERT = new THREE.Color(0xffb45a);
/** Hooded, you move at this (m/s); traversal 2 lets you go quicker. */
const HOODED_SPEED = 1.7;
const HOODED_SPEED_TRAINED = 2.4;
/** South of this, the high perch watches even if you skipped the tunnels. */
const HIGH_PERCH_Z = -24.5;
const BREATH_COOLDOWN = 1.2;

type Phase = 'outside' | 'cross' | 'rite' | 'won' | 'done';

export interface HushHost {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  player: PlayerController;
  heart: CisternHeart;
  /** Only Medium and High light the floor with a shadowed spot; every tier draws the gaze. */
  shadows: boolean;
  /** The Heart has woken: the scene stages the wake, then calls finish(). */
  onWin(): void;
}

/**
 * MG3 Hush (docs/DESIGN.md §4, slot 3): cross the Wickmoth's chamber unseen, then sing the Rite
 * under its gaze. KethraScene hosts it; this owns the chamber, the moth, the gaze, the player's
 * lantern, the Rite and the plate. The rules live in sim.ts, which the tests drive directly.
 */
export class HushGame {
  readonly chamber: Chamber;
  readonly moth: Wickmoth;
  readonly lantern = new Lantern();
  phase: Phase = 'outside';
  private readonly host: HushHost;
  private readonly blocks = H.chamberBlocks();
  private readonly brain: H.Moth;
  private readonly gaze: GazeView;
  private readonly ghost: GazeView;
  private readonly spot: THREE.SpotLight | null = null;
  private readonly shadowBlob: THREE.Mesh;
  private readonly mark: THREE.Sprite;
  private readonly fx = new MotionScope('game');
  private readonly reached = H.POSTS.map((p) => p.id === 'door');
  private lastPost = 0;
  private highPerch = false;
  private gusting = false;
  private gusts = 0;
  private step = 0;
  private breathCooldown = 0;
  private pending: RiteColour | null = null;
  private flares: H.Sense['flares'] = [];
  private capCooldown = H.GLOWCAPS.map(() => 0);
  private said = new Set<StringKey>();
  private panel: HTMLDivElement | null = null;
  private panelHtml = '';
  private alertBar: HTMLElement | null = null;
  private unregister: (() => void) | null = null;
  private lastYaw = 0;
  private seenFlare = -1;
  private readonly colour = new THREE.Color();

  constructor(host: HushHost) {
    this.host = host;
    this.chamber = buildChamber();
    host.scene.add(this.chamber.group);
    this.brain = new H.Moth(H.PERCHES.arch, this.blocks);

    this.moth = buildWickmoth();
    host.scene.add(this.moth.root);
    this.gaze = new GazeView(this.blocks);
    this.ghost = new GazeView(this.blocks);
    host.scene.add(this.gaze.group, this.ghost.group);
    if (host.shadows) {
      const spot = new THREE.SpotLight(GAZE_CALM, 0, H.PERCHES.arch.range, H.PERCHES.arch.halfAngle, 0.45, 1.6);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024);
      spot.shadow.bias = -0.0008;
      spot.shadow.camera.near = 0.5;
      host.scene.add(spot, spot.target);
      this.spot = spot;
    }
    // The moth's shadow on the floor, so its height reads.
    this.shadowBlob = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshBasicMaterial({ map: getPointSprite(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.shadowBlob.rotation.x = -Math.PI / 2;
    host.scene.add(this.shadowBlob);
    // Insight 3: a ring of light where it will perch next.
    this.mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: getPointSprite(), color: 0xffb45a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.mark.scale.setScalar(1.4);
    host.scene.add(this.mark);
    host.camera.add(this.lantern.group);

    if (gameState.hasFlag('kethra_mechanism_solved')) this.rest();
  }

  get colliders(): THREE.Box3[] {
    return this.chamber.colliders;
  }

  /** 0 outside the chamber, 1 well inside: how far the scene's lights should fall away. */
  get inside(): number {
    const p = this.host.player.rig.position;
    const d = Math.hypot(p.x - H.CENTER.x, p.z - H.CENTER.z);
    return THREE.MathUtils.smoothstep(H.RADIUS + 3, H.RADIUS - 2.5, d);
  }

  /** The moth at rest on the woken Heart: no gaze, no threat. */
  private rest(): void {
    this.phase = 'done';
    this.brain.reset(H.PERCHES.heart);
    this.brain.mode = 'settle';
    this.host.heart.setHeld(TRUE_ORDER);
  }

  update(dt: number, elapsed: number): void {
    const player = this.host.player;
    const feet = player.rig.position;
    const flatTo = (p: H.Vec) => Math.hypot(feet.x - p.x, feet.z - p.z);
    const dCentre = Math.hypot(feet.x - H.CENTER.x, feet.z - H.CENTER.z);
    const inChamber = dCentre < H.RADIUS + 0.3 && feet.y > H.FLOOR_Y - 0.6;
    this.fx.update(dt);
    this.chamber.update(dt);
    this.breathCooldown = Math.max(0, this.breathCooldown - dt);

    if (this.phase === 'outside' && inChamber) this.enter();
    else if ((this.phase === 'cross' || this.phase === 'rite') && dCentre > H.RADIUS + 1.5) this.leave();

    const playing = this.phase === 'cross' || this.phase === 'rite';
    const hooded = playing && BINDINGS.hood.codes.some((c) => InputManager.isDown(c));
    this.lantern.hooded = hooded;
    const traversal = gameState.data.attributes.traversal;
    player.speedLimit = hooded ? (traversal >= 2 ? HOODED_SPEED_TRAINED : HOODED_SPEED) : Infinity;

    if (playing && !this.gusting) {
      H.POSTS.forEach((post, i) => {
        if (flatTo(post.at) < H.POST_REACH) this.reach(i);
      });
      if (!this.highPerch && feet.z < HIGH_PERCH_Z) this.goHigh();
      if (this.phase === 'cross' && flatTo(H.SINGER) < 1.5) this.enterRite();
      else if (this.phase === 'rite' && flatTo(H.SINGER) > 3) this.leaveRite();
      H.GLOWCAPS.forEach((cap, i) => {
        this.capCooldown[i] = Math.max(0, this.capCooldown[i] - dt);
        if (this.capCooldown[i] > 0 || flatTo(cap) > H.BRUSH_RADIUS) return;
        this.capCooldown[i] = 4;
        this.chamber.flareCap(i);
        this.flares.push({ at: { x: cap.x, y: cap.y + 0.3, z: cap.z }, strength: H.LIGHT.flare });
        if (this.seenFlare < 0) this.seenFlare = 0;
      });
      if (this.phase === 'rite') {
        BINDINGS.rite.codes.forEach((c, i) => {
          if (InputManager.wasJustPressed(c)) this.breathe(COLOURS[i]);
        });
      }
    }

    // Where it should be watching from.
    if (playing) {
      const want = this.phase === 'rite' ? H.RITE_PERCHES[this.step] : this.highPerch ? 'ledge' : 'arch';
      this.brain.moveTo(H.PERCHES[want]);
    }

    const lanternAt = H.lanternAt({ x: feet.x, y: feet.y, z: feet.z }, player.crouching);
    const sense: H.Sense = {
      lantern: lanternAt,
      strength: !playing || this.gusting ? 0 : hooded ? H.LIGHT.hooded : H.LIGHT.open,
      feet: { x: feet.x, y: feet.y, z: feet.z },
      flares: this.flares,
    };
    // Won, it still flies (to the Heart); it only stops once at rest there.
    const event = this.phase === 'done' ? null : this.brain.update(dt, sense);
    this.flares = [];
    if (this.pending) {
      // The breath went into the moth this frame: did it see it?
      if (this.brain.mode === 'glide') this.say('mg3.orion.seen');
      else this.held();
      this.pending = null;
    }
    if (event === 'gust' && playing) this.gust();
    // The lesson: once a brushed glowcap has turned its gaze, say what that meant.
    if (this.seenFlare >= 0) {
      this.seenFlare += dt;
      if (this.brain.attention && this.seenFlare > 0.6) {
        this.say('mg3.orion.flare');
        this.seenFlare = -2;
      }
    }

    const turn = (player.yaw - this.lastYaw) / Math.max(dt, 1e-4);
    this.lastYaw = player.yaw;
    const moving = ['forward', 'back', 'left', 'right'].some((id) => BINDINGS[id as 'forward'].codes.some((c) => InputManager.isDown(c)));
    this.lantern.update(dt, moving && player.enabled, turn, (dCentre < H.RADIUS + 4 && this.phase !== 'won' && this.phase !== 'done') || playing);

    this.drawMoth(dt, elapsed);
    this.renderPanel();
  }

  // ------------------------------------------------------------------ the crossing

  private enter(): void {
    this.phase = 'cross';
    this.panel = document.createElement('div');
    this.panel.className = 'hush-panel';
    document.getElementById('ui-root')!.appendChild(this.panel);
    this.panelHtml = '';
    this.unregister = registerMiniGame({ name: 'hush', win: () => this.debugWin(), fail: () => this.gust() });
    UIManager.setObjective(t('mg3.objective'));
    this.say('mg3.orion.enter');
  }

  private leave(): void {
    this.leaveRite();
    this.phase = 'outside';
    this.panel?.remove();
    this.panel = null;
    this.unregister?.();
    this.unregister = null;
    this.host.player.speedLimit = Infinity;
  }

  private reach(i: number): void {
    const first = !this.reached[i];
    this.reached[i] = true;
    if (first) {
      this.chamber.lightPost(i);
      AudioSystem.playTone(523.25, 0.4, 'sine', 0.05);
    }
    this.lastPost = i;
    const id = H.POSTS[i].id;
    if ((id === 'west' || id === 'east') && !this.highPerch) this.goHigh();
  }

  /** Beat 3: it moves up to the gate arch. */
  private goHigh(): void {
    this.highPerch = true;
    this.say('mg3.orion.ledge');
  }

  /** Carried back to the last lamp you reached. No harm; the retry is instant. */
  gust(): void {
    if (this.gusting || (this.phase !== 'cross' && this.phase !== 'rite')) return;
    this.gusting = true;
    this.gusts++;
    const player = this.host.player;
    const from = player.rig.position.clone();
    const post = H.POSTS[this.lastPost].at;
    const to = new THREE.Vector3(post.x, post.y, post.z);
    const yaw0 = player.yaw;
    // Set down facing into the chamber, toward the Heart.
    const yaw1 = Math.atan2(-(H.CENTER.x - to.x), -(H.CENTER.z - to.z));
    const dYaw = Math.atan2(Math.sin(yaw1 - yaw0), Math.cos(yaw1 - yaw0));
    player.enabled = false;
    player.addShake(0.4);
    AudioSystem.playGust();
    this.wash();
    if (this.phase === 'rite') this.resetRite();
    this.fx.tween({
      duration: 1.05,
      ease: ease.standard,
      update: (e) => {
        player.rig.position.lerpVectors(from, to, e);
        player.rig.position.y += Math.sin(e * Math.PI) * 0.9;
        player.yaw = yaw0 + dYaw * e;
        player.rig.rotation.set(0, player.yaw, 0);
      },
      done: () => {
        player.teleport(to, yaw1);
        player.enabled = true;
        this.gusting = false;
        if (this.gusts === 1) this.say('mg3.orion.gust');
      },
    });
  }

  /** The gust's colour: the wings' stained glass washing over the view. */
  private wash(): void {
    const el = document.createElement('div');
    el.className = 'hush-wash';
    document.getElementById('ui-root')!.appendChild(el);
    const a = motion.ui.animate(el, [{ opacity: 0 }, { opacity: 0.85, offset: 0.25 }, { opacity: 0 }], { dur: 1.1, ease: 'standard' });
    a.finished.then(() => el.remove(), () => el.remove());
  }

  // ------------------------------------------------------------------ the Rite

  private get orderKnown(): boolean {
    return [1, 2, 3].some((i) => gameState.hasFlag(`kethra_fragment_${i}_read`));
  }

  private enterRite(): void {
    this.phase = 'rite';
    this.say('mg3.orion.stone');
  }

  private leaveRite(): void {
    if (this.phase !== 'rite') return;
    this.phase = 'cross';
    this.resetRite();
  }

  private resetRite(): void {
    this.step = 0;
    this.host.heart.setHeld([]);
  }

  private breathe(colour: RiteColour): void {
    if (!this.orderKnown || this.breathCooldown > 0 || this.brain.mode !== 'perched' || this.gusting) return;
    this.breathCooldown = BREATH_COOLDOWN;
    this.host.heart.breathe(colour);
    this.chamber.pulse(new THREE.Color(RITE[colour]));
    AudioSystem.playBreath(COLOURS.indexOf(colour));
    if (colour === TRUE_ORDER[this.step]) {
      this.flares.push({ at: H.BREATH_AT, strength: H.LIGHT.breath, breath: true });
      this.pending = colour;
      return;
    }
    // A wrong colour sours the water and startles it: back to the stone's lamp.
    this.host.heart.sour();
    AudioSystem.playFail();
    this.say(KETHRA_RITUAL_SEQUENCE[this.step] === colour ? 'mg3.orion.ritual' : 'mg3.orion.wrong');
    this.brain.fan();
    this.fx.after(0.55, () => this.gust());
  }

  /** A breath it did not see: held, and it comes a step closer. The third wakes the Heart. */
  private held(): void {
    this.step++;
    this.host.heart.setHeld(TRUE_ORDER.slice(0, this.step));
    if (this.step >= TRUE_ORDER.length) this.win();
    else this.say('mg3.orion.held');
  }

  // ------------------------------------------------------------------ the win

  private win(): void {
    if (this.phase === 'won' || this.phase === 'done') return;
    this.phase = 'won';
    gameState.setFlag('kethra_mechanism_solved');
    gameState.addResource('resonant_crystal', 3);
    gameState.addAttributeXp('archaeology', 2);
    AudioSystem.playSuccess();
    this.host.heart.setHeld(TRUE_ORDER);
    this.host.heart.setAwake(true);
    this.brain.settle();
    this.host.player.speedLimit = Infinity;
    this.panel?.remove();
    this.panel = null;
    UIManager.clearCaption();
    this.host.onWin();
  }

  /** The scene's wake has played: the chamber is at rest. */
  finish(): void {
    this.phase = 'done';
    this.unregister?.();
    this.unregister = null;
  }

  /** F2 in the harness, and the tests: sing the Rite through now. Safe to call again. */
  private debugWin(): void {
    if (this.phase === 'won' || this.phase === 'done') return;
    this.step = TRUE_ORDER.length - 1;
    this.held();
  }

  // ------------------------------------------------------------------ drawing

  private drawMoth(dt: number, elapsed: number): void {
    const b = this.brain;
    const m = this.moth;
    const bob = b.mode === 'perched' ? Math.sin(elapsed * 1.3) * 0.04 : b.mode === 'settle' && this.phase === 'done' ? Math.sin(elapsed * 0.8) * 0.03 : 0;
    m.root.position.set(b.pos.x, b.pos.y + bob, b.pos.z);
    m.root.rotation.y = Math.PI / 2 - b.yaw;
    m.body.rotation.x = THREE.MathUtils.clamp(-b.pitch * 0.5, -0.4, 0.5);
    const w = m.wings;
    const resting = this.phase === 'done';
    switch (b.mode) {
      case 'perched':
        w.beat = 0.15 + b.alert * 2.4;
        w.spread = 0.35 + b.alert * 0.65;
        w.glow = 0.55 + b.alert * 0.45;
        break;
      case 'notice':
      case 'fan':
        w.beat = 4.5;
        w.spread = 1;
        w.glow = 1;
        break;
      case 'settle':
        w.beat = resting ? 0.12 : 0.9;
        w.spread = 1;
        w.glow = 1;
        break;
      default:
        w.beat = b.mode === 'search' ? 1.4 : 0.9;
        w.spread = 1;
        w.glow = 0.9;
    }
    m.update(dt, elapsed);
    // Settled on the woken Heart, its stained glass lights the chamber.
    if (b.mode === 'settle') {
      m.light.intensity = resting || this.phase === 'won' ? 3.5 : m.light.intensity;
      m.light.distance = 16;
    }

    // The gaze: calm teal, warming to amber as it notices you.
    const watching = this.phase !== 'won' && this.phase !== 'done';
    const perception = gameState.data.attributes.perception >= 2;
    this.colour.copy(GAZE_CALM).lerp(GAZE_ALERT, b.alert);
    const moving = b.mode === 'relocate' || b.mode === 'settle';
    const strength = !watching ? 0 : (moving ? 0.3 : 1) * (perception ? 1.45 : 1);
    const g = b.gaze();
    this.gaze.update(g, this.colour, strength);
    // Perception 2: where its sweep is heading, a moment early.
    if (perception && watching && b.mode === 'perched' && !b.attention) {
      const ahead = H.sweepAt(b.perch, b.clock + 0.8);
      this.ghost.update({ ...g, dir: H.dirOf(ahead.yaw, ahead.pitch) }, GAZE_CALM, 0.3);
    } else this.ghost.update(g, GAZE_CALM, 0);
    if (this.spot) {
      this.spot.visible = true;
      this.spot.position.set(b.pos.x, b.pos.y, b.pos.z);
      this.spot.target.position.set(b.pos.x + g.dir.x * 10, b.pos.y + g.dir.y * 10, b.pos.z + g.dir.z * 10);
      this.spot.color.copy(this.colour);
      this.spot.angle = Math.max(0.05, g.halfAngle);
      this.spot.distance = Math.max(1, g.range);
      this.spot.intensity = strength * 90;
      // Its shadow only matters while you can see into the chamber.
      const p = this.host.player.rig.position;
      this.spot.shadow.autoUpdate = strength > 0 && Math.hypot(p.x - H.CENTER.x, p.z - H.CENTER.z) < H.RADIUS + 14;
    }

    const height = Math.max(0.1, b.pos.y - H.FLOOR_Y);
    this.shadowBlob.position.set(b.pos.x, H.FLOOR_Y + 0.03, b.pos.z);
    this.shadowBlob.scale.setScalar(1.1 + height * 0.12);
    (this.shadowBlob.material as THREE.MeshBasicMaterial).opacity = THREE.MathUtils.clamp(0.55 - height * 0.035, 0.1, 0.55);

    // Insight 3: its next perch, marked.
    const next = !watching ? null : this.phase === 'rite' ? (this.step + 1 < H.RITE_PERCHES.length ? H.PERCHES[H.RITE_PERCHES[this.step + 1]] : H.PERCHES.heart) : this.highPerch ? null : H.PERCHES.ledge;
    const mat = this.mark.material as THREE.SpriteMaterial;
    mat.opacity = next && gameState.data.attributes.insight >= 3 ? 0.55 + Math.sin(elapsed * 2.4) * 0.2 : 0;
    if (next) this.mark.position.set(next.at.x, next.at.y + 0.2, next.at.z);
  }

  private renderPanel(): void {
    if (!this.panel) return;
    const b = this.brain;
    const a = gameState.data.attributes;
    const notes = [
      a.perception >= 2 ? t('mg3.stat.perception') : '',
      a.traversal >= 2 ? t('mg3.stat.traversal') : '',
      a.insight >= 3 ? t('mg3.stat.insight') : '',
    ].filter(Boolean);
    let rite = '';
    if (this.phase === 'rite') {
      const pips = [0, 1, 2].map((i) => `<span class="canopy-pip ${i < this.step ? 'on' : ''}"></span>`).join('');
      const keys = COLOURS.map((c, i) => `<span class="hush-colour ${c}"><span class="keycap">${i + 1}</span>${t(`mg3.colour.${c}` as StringKey)}</span>`).join('');
      const rule = !this.orderKnown ? t('mg3.rite.locked') : b.mode === 'perched' ? t('mg3.rite.rule') : t('mg3.rite.wait');
      const hint = a.archaeology >= 3 && this.orderKnown && this.step === 0 ? `<div class="hush-hint">${t('mg3.rite.hint', { colour: t(`mg3.colour.${TRUE_ORDER[0]}` as StringKey) })}</div>` : '';
      rite = `<div class="hush-rite"><div class="eyebrow">${t('mg3.rite.eyebrow', { n: String(Math.min(3, this.step + 1)) })}</div>
        <div class="canopy-hull">${pips}</div><div class="hush-colours">${keys}</div><div class="hush-rule">${rule}</div>${hint}</div>`;
    }
    const html = `<div class="eyebrow">${t('mg3.eyebrow')}</div>
      <div class="hush-status">${t(`mg3.status.${b.mode === 'settle' ? 'relocate' : b.mode}` as StringKey)}</div>
      <div class="hush-alert"><span></span></div>${rite}
      ${notes.length ? `<ul class="intercept-stats">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      <div class="intercept-keys"><span><span class="keycap">F</span><span class="keycap">RMB</span>${t('mg3.key.hood')}</span><span><span class="keycap">C</span>${t('mg3.key.crouch')}</span></div>`;
    if (html !== this.panelHtml) {
      this.panelHtml = html;
      this.panel.innerHTML = html;
      this.alertBar = this.panel.querySelector('.hush-alert > span');
    }
    if (this.alertBar) this.alertBar.style.transform = `scaleX(${b.alert.toFixed(3)})`;
  }

  private say(key: StringKey): void {
    if (key === 'mg3.orion.enter' || key === 'mg3.orion.flare' || key === 'mg3.orion.ledge' || key === 'mg3.orion.stone') {
      if (this.said.has(key)) return;
      this.said.add(key);
    }
    UIManager.showCaption(t(key), 4200);
  }

  /**
   * For the tests: `stoneMargin` is how far (radians) the gaze's edge is from the stone, negative
   * while the stone is inside the cone; `attention` whether a flare has turned its gaze.
   */
  state(): { phase: Phase; mode: H.MothMode; perch: string; alert: number; hooded: boolean; post: string; gusts: number; step: number; seesStone: boolean; stoneMargin: number; attention: boolean; high: boolean } {
    const g = this.brain.gaze();
    const to = { x: H.BREATH_AT.x - g.origin.x, y: H.BREATH_AT.y - g.origin.y, z: H.BREATH_AT.z - g.origin.z };
    const angle = Math.acos(Math.min(1, (to.x * g.dir.x + to.y * g.dir.y + to.z * g.dir.z) / Math.hypot(to.x, to.y, to.z)));
    return {
      phase: this.phase,
      mode: this.brain.mode,
      perch: this.brain.perch.id,
      alert: this.brain.alert,
      hooded: this.lantern.hooded,
      post: H.POSTS[this.lastPost].id,
      gusts: this.gusts,
      step: this.step,
      seesStone: H.sees(g, H.BREATH_AT, H.LIGHT.breath, this.blocks),
      stoneMargin: angle - g.halfAngle,
      attention: this.brain.attention !== null,
      high: this.highPerch,
    };
  }

  dispose(): void {
    this.fx.dispose();
    this.unregister?.();
    this.panel?.remove();
    this.gaze.dispose();
    this.ghost.dispose();
    this.lantern.dispose();
    this.host.player.speedLimit = Infinity;
  }
}
