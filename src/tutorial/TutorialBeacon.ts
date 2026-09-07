import * as THREE from 'three';

/**
 * The tutorial's in-world markers: a light column standing on the deck where the player should walk
 * to, and a targeting bracket that closes around the console's monitor bank once they get there.
 *
 * Both are unlit, so they read as something the ship is projecting rather than as another physical
 * prop in a room that already has plenty. It is built after batchStaticGeometry() has run (the
 * tutorial is constructed once the scene is live), so none of it can be swept into a static batch,
 * and dispose() takes it all back out again.
 */

const ACCENT = 0xd9a441;
const BEAM_HEIGHT = 2.6;
const BEAM_RADIUS = 0.5;

/** Vertical alpha ramp for the light column: solid where it meets the deck, gone by head height. */
function buildBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 128);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  grad.addColorStop(1, 'rgba(255,255,255,0.95)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 128);
  // CylinderGeometry's side UVs run v=0 at the base, and the default flipY maps the canvas's
  // bottom row there — which is the opaque end, so the column is brightest at the deck.
  return new THREE.CanvasTexture(canvas);
}

function glowMaterial(opacity: number, map?: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: ACCENT,
    map,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

/**
 * The bracket is drawn flat and on top of everything rather than added into it. It hangs just in
 * front of the monitor bank, where the desk's own coaming occludes it from the walk-up angle, and
 * additive amber over six lit screens washes out to nothing exactly where it most needs to read.
 */
function bracketMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color: ACCENT,
    transparent: true,
    opacity: 0.9,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
}

export class TutorialBeacon {
  private scene: THREE.Scene;
  private pillar = new THREE.Group();
  private bracket = new THREE.Group();
  private ring: THREE.Mesh;
  private disc: THREE.Mesh;
  private beam: THREE.Mesh;
  private beamTexture = buildBeamTexture();
  private ringMat = glowMaterial(0.85);
  private discMat = glowMaterial(0.16);
  private beamMat: THREE.MeshBasicMaterial;
  private bracketMat = bracketMaterial();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    // Named so a harness (and a scene-graph dump) can assert they are gone once the tutorial ends.
    this.pillar.name = 'tutorial-beacon-pillar';
    this.bracket.name = 'tutorial-beacon-bracket';
    this.beamMat = glowMaterial(0.34, this.beamTexture);

    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.64, 56), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.03;

    this.disc = new THREE.Mesh(new THREE.RingGeometry(0, 0.48, 40), this.discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.position.y = 0.025;

    // Tapered, so the column reads as light thrown up off the deck rather than as a standing box.
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(BEAM_RADIUS * 0.68, BEAM_RADIUS, BEAM_HEIGHT, 28, 1, true),
      this.beamMat,
    );
    this.beam.position.y = BEAM_HEIGHT / 2;

    for (const part of [this.ring, this.disc, this.beam]) {
      part.renderOrder = 20;
      this.pillar.add(part);
    }
    this.pillar.visible = false;
    this.scene.add(this.pillar);

    // Sized to the screen grid rather than the whole housing: a wider bracket has its corners
    // outside the frame by the time the player is close enough to press E, which is exactly when it
    // is meant to be pointing at something.
    this.buildBracket(2.7, 1.15);
    this.bracket.visible = false;
    this.scene.add(this.bracket);
  }

  /** Four corner brackets rather than a closed box — it frames the screens without covering them. */
  private buildBracket(width: number, height: number): void {
    const arm = 0.38;
    const thickness = 0.035;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(arm, thickness), this.bracketMat);
        horizontal.position.set(sx * (width / 2 - arm / 2), (sy * height) / 2, 0);
        const vertical = new THREE.Mesh(new THREE.PlaneGeometry(thickness, arm), this.bracketMat);
        vertical.position.set((sx * width) / 2, sy * (height / 2 - arm / 2), 0);
        for (const part of [horizontal, vertical]) {
          part.renderOrder = 999;
          this.bracket.add(part);
        }
      }
    }
  }

  /** Stands the light column on the deck at (x, z). Hides the bracket. */
  showPillarAt(x: number, z: number): void {
    this.pillar.position.set(x, 0, z);
    this.pillar.visible = true;
    this.bracket.visible = false;
  }

  /** Closes the bracket around a wall-mounted target facing +Z. Hides the pillar. */
  showBracketAt(x: number, y: number, z: number): void {
    this.bracket.position.set(x, y, z);
    this.bracket.visible = true;
    this.pillar.visible = false;
  }

  update(elapsed: number): void {
    if (this.pillar.visible) {
      const pulse = Math.sin(elapsed * 2.4);
      this.ringMat.opacity = 0.7 + pulse * 0.25;
      this.discMat.opacity = 0.13 + pulse * 0.06;
      this.beamMat.opacity = 0.3 + pulse * 0.1;
      const scale = 1 + pulse * 0.05;
      this.ring.scale.set(scale, scale, 1);
      this.beam.rotation.y = elapsed * 0.5;
    }
    if (this.bracket.visible) {
      const pulse = Math.sin(elapsed * 3.4);
      this.bracketMat.opacity = 0.75 + pulse * 0.25;
      const scale = 1 + pulse * 0.012;
      this.bracket.scale.set(scale, scale, 1);
    }
  }

  dispose(): void {
    for (const group of [this.pillar, this.bracket]) {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry.dispose();
      });
      this.scene.remove(group);
    }
    this.ringMat.dispose();
    this.discMat.dispose();
    this.beamMat.dispose();
    this.bracketMat.dispose();
    this.beamTexture.dispose();
  }
}
