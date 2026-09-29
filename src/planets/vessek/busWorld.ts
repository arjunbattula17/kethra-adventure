import * as THREE from 'three';
import type { InteractionSystem } from '../../player/InteractionSystem';
import { gameState } from '../../core/GameState';
import { AudioSystem } from '../../audio/AudioSystem';
import { UIManager } from '../../ui/UIManager';
import { CIRCUITS, CAPACITY } from './bus';
import type { RingBus, CircuitId, BusEvent } from './bus';
import * as L from './layout';
import { LEVER_NOTES } from './vessekLore';

/**
 * The ring bus's in-world objects: levers, load gauges, ceiling conduits and duct lockout boxes.
 * The rules live in bus.ts. Engineering 2 shows each lever's load; perception 2 marks auto-reset
 * circuits and warns before they reset.
 */

export interface BusWorldHost {
  scene: THREE.Scene;
  interaction: InteractionSystem;
  bus: RingBus;
  noMerge: Set<THREE.Object3D>;
  animated: Set<THREE.Material>;
  /** Whether levers can be thrown now; they are held while the pulse plays. */
  leversLive(): boolean;
  /** A lever was thrown, a box locked out, or the bus did something by itself. */
  onEvent(e: BusEvent | { kind: 'lockout'; id: CircuitId }): void;
}

interface Lever {
  id: CircuitId;
  handle: THREE.Object3D;
  lamp: THREE.MeshBasicMaterial;
  angle: number;
}

interface Gauge {
  needle: THREE.Object3D;
  angle: number;
}

const ON = new THREE.Color(0x7cbf7c).multiplyScalar(1.6);
const OFF = new THREE.Color(0x5a2a22);
/** The gauge's needle sweeps 240 degrees from 0 to 8 units; the red band starts past CAPACITY. */
const GAUGE_MAX = 8;
const SWEEP = (Math.PI * 4) / 3;

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** A lever's tag texture: the circuit name, its load with engineering, and a reset mark with
 * perception. */
function tagTexture(id: CircuitId, engineering: boolean, perception: boolean): THREE.CanvasTexture {
  const c = CIRCUITS[id];
  return canvasTex(256, 128, (ctx) => {
    ctx.fillStyle = '#23282d';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#e8dcc4';
    ctx.font = 'bold 30px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    const words = c.name.toUpperCase().split(' ');
    const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    ctx.fillText(line1, 128, 42);
    ctx.fillText(line2, 128, 76);
    ctx.font = '600 24px Rajdhani, sans-serif';
    if (engineering) {
      ctx.fillStyle = '#d9a441';
      ctx.fillText(`${c.load} U`, 64, 112);
    }
    if (perception && c.autoReset) {
      ctx.fillStyle = '#e0624a';
      ctx.fillText('RESETS', 184, 112);
    }
  });
}

/** A gauge face: 0 to GAUGE_MAX units, with a red band past CAPACITY. */
function gaugeFace(): THREE.CanvasTexture {
  return canvasTex(512, 512, (ctx) => {
    ctx.fillStyle = '#e8dcc4';
    ctx.beginPath();
    ctx.arc(256, 256, 250, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1d2126';
    ctx.beginPath();
    ctx.arc(256, 256, 236, 0, Math.PI * 2);
    ctx.fill();
    const a0 = Math.PI / 2 + (Math.PI * 2 - SWEEP) / 2;
    ctx.lineWidth = 26;
    ctx.strokeStyle = '#8a2d21';
    ctx.beginPath();
    ctx.arc(256, 256, 190, a0 + (SWEEP * CAPACITY) / GAUGE_MAX, a0 + SWEEP);
    ctx.stroke();
    ctx.strokeStyle = '#e8dcc4';
    ctx.fillStyle = '#e8dcc4';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 44px Rajdhani, sans-serif';
    for (let u = 0; u <= GAUGE_MAX; u++) {
      const a = a0 + (SWEEP * u) / GAUGE_MAX;
      ctx.lineWidth = u === CAPACITY ? 8 : 5;
      ctx.beginPath();
      ctx.moveTo(256 + Math.cos(a) * 205, 256 + Math.sin(a) * 205);
      ctx.lineTo(256 + Math.cos(a) * 170, 256 + Math.sin(a) * 170);
      ctx.stroke();
      ctx.fillText(String(u), 256 + Math.cos(a) * 128, 256 + Math.sin(a) * 128);
    }
    ctx.font = '600 30px Rajdhani, sans-serif';
    ctx.fillText('RING BUS · UNITS', 256, 360);
  });
}

export class BusWorld {
  private readonly host: BusWorldHost;
  private readonly levers: Lever[] = [];
  private readonly gauges: Gauge[] = [];
  private readonly conduitUniforms = { uTime: { value: 0 }, uFlow: { value: 0 }, uColor: { value: new THREE.Color(0xd9a441) } };
  private readonly boxes = new Map<'dock' | 'lamps', THREE.Object3D>();
  private warned = new Set<CircuitId>();
  /** Levers whose crew note has been read (it shows the first time each is thrown). */
  private noted = new Set<CircuitId>();

  constructor(host: BusWorldHost) {
    this.host = host;
    const a = gameState.data.attributes;
    for (const [id, lv] of Object.entries(L.LEVERS) as [CircuitId, (typeof L.LEVERS)[CircuitId]][]) {
      this.levers.push(this.buildLever(id, lv.at, lv.yaw, a.engineering >= 2, a.perception >= 2));
    }
    // A gauge face looks along +z; the yaw turns it to face into its room.
    this.gauges.push(this.buildGauge(L.GAUGE, 0, 1.1));
    this.gauges.push(this.buildGauge({ x: -12.4, y: 2.2, z: 3.8 }, -Math.PI / 2, 0.55));
    this.gauges.push(this.buildGauge({ x: 23.5, y: 2.2, z: -25.8 }, -Math.PI / 2, 0.55));
    this.buildConduits();
    for (const lo of L.LOCKOUTS) this.buildLockout(lo.id, lo.at);
  }

  private buildLever(id: CircuitId, at: L.Vec, yaw: number, engineering: boolean, perception: boolean): Lever {
    const g = new THREE.Group();
    // `at` is at the wall's foot; the lever faces the player standing a step back from it.
    g.position.set(at.x, 0, at.z);
    g.rotation.y = yaw;
    const plateMat = new THREE.MeshStandardMaterial({ color: 0x3a4148, roughness: 0.55, metalness: 0.65 });
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.08), plateMat);
    plate.position.set(0, 1.3, -0.32);
    g.add(plate);
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.3, -0.26);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xb08a3a, roughness: 0.4, metalness: 0.8 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.34, 8), handleMat);
    handle.position.y = 0.17;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1d2126, roughness: 0.5 }));
    knob.position.y = 0.34;
    pivot.add(handle, knob);
    g.add(pivot);
    const lampMat = new THREE.MeshBasicMaterial({ color: OFF.clone() });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), lampMat);
    lamp.position.set(0.12, 1.52, -0.27);
    g.add(lamp);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: tagTexture(id, engineering, perception), roughness: 0.8 }));
    tag.position.set(0, 0.86, -0.275);
    g.add(tag);
    this.host.scene.add(g);
    g.traverse((o) => this.host.noMerge.add(o));
    this.host.animated.add(lampMat);
    const lever: Lever = { id, handle: pivot, lamp: lampMat, angle: 0 };
    this.host.interaction.register({
      object: g,
      label: () => `${this.host.bus.isOn(id) ? 'Switch off' : 'Switch on'} the ${CIRCUITS[id].name.toLowerCase()}`,
      range: 2.2,
      enabled: () => this.host.leversLive(),
      onInteract: () => {
        if (!this.noted.has(id)) {
          this.noted.add(id);
          UIManager.toast(`On the tag, in a crew’s hand: “${LEVER_NOTES[id]}”`);
        }
        const e = this.host.bus.throwLever(id, !this.host.bus.isOn(id));
        AudioSystem.playTone(e.kind === 'on' ? 180 : e.kind === 'off' ? 120 : 70, 0.18, 'square', 0.05);
        this.host.onEvent(e);
      },
    });
    return lever;
  }

  private buildGauge(at: L.Vec, yaw: number, size: number): Gauge {
    const g = new THREE.Group();
    g.position.set(at.x, at.y, at.z);
    g.rotation.y = yaw;
    const face = new THREE.Mesh(new THREE.CircleGeometry(size / 2, 48), new THREE.MeshStandardMaterial({ map: gaugeFace(), emissive: 0xffffff, emissiveMap: gaugeFace(), emissiveIntensity: 0.25, roughness: 0.6 }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(size / 2, size * 0.035, 8, 48), new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.35, metalness: 0.85 }));
    const needle = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(size * 0.035, size * 0.4, 0.01), new THREE.MeshBasicMaterial({ color: 0xe0624a }));
    bar.position.y = size * 0.18;
    needle.add(bar);
    needle.position.z = 0.01;
    g.add(face, rim, needle);
    this.host.scene.add(g);
    this.host.noMerge.add(needle);
    needle.traverse((o) => this.host.noMerge.add(o));
    return { needle, angle: this.needleAngle(this.host.bus.load()) };
  }

  private needleAngle(load: number): number {
    // Zero at the lower left, rising clockwise to the lower right.
    return SWEEP / 2 - (SWEEP * Math.min(load, GAUGE_MAX)) / GAUGE_MAX;
  }

  /** Ceiling conduits whose dash speed and brightness follow the bus load. */
  private buildConduits(): void {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.conduitUniforms,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uFlow; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float dash = smoothstep(0.35, 0.5, fract(vUv.x * 6.0 - uTime * (0.4 + uFlow * 1.6))) * smoothstep(0.85, 0.7, fract(vUv.x * 6.0 - uTime * (0.4 + uFlow * 1.6)));
          vec3 c = uColor * (0.08 + uFlow * (0.35 + dash * 1.4));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    const runs: [number, number, number, number, number, number][] = [
      // Hall, down both cable trays and across to the tubes; school; tanker; junction; the tubes.
      [2.6, 4.55, 11, 2.6, 4.55, -11],
      [-2.6, 4.55, 11, -2.6, 4.55, -11],
      [-2.6, 4.55, 6, -7.4, 4.55, 6],
      [-7.4, 2.85, 6, -12.6, 2.85, 6],
      [-12.6, 4.55, 6, -23, 4.55, 6],
      [-2, 4.55, -11, -2, 2.85, -12.2],
      [-2, 2.85, -12.2, -2, 2.85, -16.4],
      [-2, 4.55, -16.6, -2, 4.55, -35],
      [-2, 4.55, -30, 7.4, 4.55, -30],
      [7.6, 2.85, -30, 12.4, 2.85, -30],
      [12.6, 4.55, -30, 23, 4.55, -30],
    ];
    for (const [x0, y0, z0, x1, y1, z1] of runs) {
      const curve = new THREE.LineCurve3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 0.05, 6, false), mat);
      this.host.scene.add(tube);
    }
  }

  private buildLockout(id: 'dock' | 'lamps', at: L.Vec): void {
    const g = new THREE.Group();
    g.position.set(at.x, at.y, at.z);
    // Against the duct's side wall, whichever way the duct runs there.
    const duct = L.DUCTS.find((d) => d.runs.some((r) => r.from.y === at.y && Math.min(r.from.z, r.to.z) - 0.7 <= at.z && at.z <= Math.max(r.from.z, r.to.z) + 0.7 && Math.min(r.from.x, r.to.x) - 0.7 <= at.x && at.x <= Math.max(r.from.x, r.to.x) + 0.7))!;
    const run = duct.runs.find((r) => r.from.y === at.y && Math.min(r.from.z, r.to.z) - 0.7 <= at.z && at.z <= Math.max(r.from.z, r.to.z) + 0.7 && Math.min(r.from.x, r.to.x) - 0.7 <= at.x && at.x <= Math.max(r.from.x, r.to.x) + 0.7)!;
    const alongZ = Math.abs(run.to.z - run.from.z) > Math.abs(run.to.x - run.from.x);
    const side = L.DUCT_WIDTH / 2 - 0.08;
    const body = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.14 : 0.4, 0.46, alongZ ? 0.4 : 0.14), new THREE.MeshStandardMaterial({ color: 0x8a2d21, roughness: 0.6, metalness: 0.4 }));
    body.position.set(alongZ ? side : 0, 0.7, alongZ ? 0 : -side);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(alongZ ? 0.06 : 0.28, 0.06, alongZ ? 0.28 : 0.06), new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.5 }));
    handle.position.set(alongZ ? side - 0.1 : 0, 0.7, alongZ ? 0 : -side + 0.1);
    g.add(body, handle);
    this.host.scene.add(g);
    g.traverse((o) => this.host.noMerge.add(o));
    this.boxes.set(id, handle);
    if (this.host.bus.locked.has(id)) handle.rotation.set(alongZ ? Math.PI / 2 : 0, 0, alongZ ? 0 : Math.PI / 2);
    this.host.interaction.register({
      object: g,
      label: () => (this.host.bus.locked.has(id) ? `The ${CIRCUITS[id].name.toLowerCase()} are locked out` : `Lock out the ${CIRCUITS[id].name.toLowerCase()}' auto-reset`),
      range: 1.8,
      onInteract: () => {
        if (this.host.bus.locked.has(id)) return;
        this.host.bus.lockOut(id);
        handle.rotation.set(alongZ ? Math.PI / 2 : 0, 0, alongZ ? 0 : Math.PI / 2);
        AudioSystem.playTone(90, 0.25, 'square', 0.06);
        this.host.onEvent({ kind: 'lockout', id });
      },
    });
  }

  /** With perception 2, warns once when an auto-reset is under four seconds away. */
  private warn(): void {
    if (gameState.data.attributes.perception < 2) return;
    for (const [id, t] of this.host.bus.timers) {
      if (t < 4 && !this.warned.has(id)) {
        this.warned.add(id);
        UIManager.toast(`A relay is ticking: the ${CIRCUITS[id].name.toLowerCase()} are about to switch themselves back on.`, 'act');
        AudioSystem.playTone(1400, 0.05, 'square', 0.03);
      }
    }
    for (const id of this.warned) if (!this.host.bus.timers.has(id)) this.warned.delete(id);
  }

  update(dt: number, elapsed: number): void {
    const bus = this.host.bus;
    for (const l of this.levers) {
      const on = bus.isOn(l.id);
      l.angle += (((on ? -0.9 : 0.9) - l.angle) * Math.min(1, dt * 14));
      l.handle.rotation.x = l.angle;
      l.lamp.color.copy(on ? ON : OFF);
    }
    const load = bus.load();
    for (const g of this.gauges) {
      g.angle += (this.needleAngle(load) - g.angle) * Math.min(1, dt * 4);
      g.needle.rotation.z = g.angle + (load > 0 ? Math.sin(elapsed * 23) * 0.006 : 0);
    }
    this.conduitUniforms.uTime.value = elapsed;
    this.conduitUniforms.uFlow.value += (Math.min(1, load / CAPACITY) - this.conduitUniforms.uFlow.value) * Math.min(1, dt * 3);
    this.warn();
  }
}
