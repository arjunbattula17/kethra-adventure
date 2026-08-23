import * as THREE from 'three';
import {
  buildStencilPlacardTexture,
  buildFirstAidTexture,
  buildWarningStripeTexture,
} from '../ShipTextures';
import type { InteriorCtx } from './ctx';
import { ROOM_W, ROOM_D, ROOM_H } from './ctx';

/** Set dressing: console buttons, cable runs, status clusters, placards, safety gear, pipes. */
export function buildDetailProps(ctx: InteriorCtx): void {

  const buttonColors = [0xd94f4f, 0xd9a441, 0x4fd98a, 0x4f8fd9];
  const buttonMat = (color: number) =>
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.2 });
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 10), buttonMat(buttonColors[(row * 5 + col) % buttonColors.length]));
      btn.rotation.x = Math.PI / 2 - 0.35;
      btn.position.set(-0.9 + col * 0.42, 0.82 + row * 0.14, -3.42 - row * 0.08);
      ctx.scene.add(btn);
    }
  }

  // Sagging ceiling cable bundles along both side walls (three tubes each, gentle droop).
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.4 });
  for (const x of [-ROOM_W / 2 + 0.3, ROOM_W / 2 - 0.3]) {
    for (let i = 0; i < 3; i++) {
      const yBase = ROOM_H - 0.25 - i * 0.07;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(x, yBase, -ROOM_D / 2 + 0.4),
        new THREE.Vector3(x, yBase - 0.08, -ROOM_D / 4),
        new THREE.Vector3(x, yBase, 0),
        new THREE.Vector3(x, yBase - 0.08, ROOM_D / 4),
        new THREE.Vector3(x, yBase, ROOM_D / 2 - 0.4),
      ]);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.03, 6, false), cableMat);
      ctx.scene.add(tube);
    }
  }

  // Wall-mounted status light clusters (blinking, animated in update()) — each cluster gets a
  // physical housing plate and a conduit run down to the floor so the lights read as a real
  // fixture bolted to the wall rather than three bare spheres floating in front of it.
  const dotColors = [0xd94f4f, 0x4fd98a, 0xd9a441];
  const housingMat = new THREE.MeshStandardMaterial({ color: 0x2c2f36, roughness: 0.5, metalness: 0.55, emissive: 0x1c2027, emissiveIntensity: 0.6 });
  for (const cz of [-1.0, 3.0]) {
    const housing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.16), housingMat);
    housing.position.set(-ROOM_W / 2 + 0.14, 1.74, cz);
    ctx.scene.add(housing);
    const conduit = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.45, 0.03), housingMat);
    conduit.position.set(-ROOM_W / 2 + 0.12, 0.775, cz);
    ctx.scene.add(conduit);
    for (let i = 0; i < 3; i++) {
      const color = dotColors[i % dotColors.length];
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.2, roughness: 0.4 });
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), mat);
      dot.position.set(-ROOM_W / 2 + 0.22, 1.6 + i * 0.14, cz);
      ctx.scene.add(dot);
      ctx.statusLights.push({ mesh: dot, material: mat, phase: Math.random() * Math.PI * 2, onIntensity: 1.3 });
    }
  }

  // Stencilled ID placards.
  const placards: [string, string | undefined, THREE.Vector3, number][] = [
    ['KB-215', 'MAINT BAY', new THREE.Vector3(-ROOM_W / 2 + 0.11, 1.9, -2.2), Math.PI / 2],
    ['RST-04', 'HULL SEC', new THREE.Vector3(ROOM_W / 2 - 0.11, 1.9, 4.4), -Math.PI / 2],
    ['OX-11', 'LIFE SUPPORT', new THREE.Vector3(-ROOM_W / 2 + 0.11, 1.9, 3.4), Math.PI / 2],
  ];
  for (const [id, sub, pos, rotY] of placards) {
    const tex = buildStencilPlacardTexture(id, sub);
    const placard = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.25),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.15 }),
    );
    placard.position.copy(pos);
    placard.rotation.y = rotY;
    ctx.scene.add(placard);
  }

  // Fire extinguisher against the left wall, near the airlock.
  const extinguisherBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.1, 0.5, 10),
    new THREE.MeshStandardMaterial({ color: 0xb32a1f, roughness: 0.45, metalness: 0.3 }),
  );
  extinguisherBody.position.set(-ROOM_W / 2 + 0.32, 0.35, 4.6);
  ctx.scene.add(extinguisherBody);
  const extinguisherCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.09, 0.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 }),
  );
  extinguisherCap.position.set(-ROOM_W / 2 + 0.32, 0.65, 4.6);
  ctx.scene.add(extinguisherCap);
  const stripeTex = buildWarningStripeTexture('red');
  stripeTex.repeat.set(3, 1);
  const extinguisherBand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.095, 0.06, 10),
    new THREE.MeshStandardMaterial({ map: stripeTex, roughness: 0.5 }),
  );
  extinguisherBand.position.set(-ROOM_W / 2 + 0.32, 0.5, 4.6);
  ctx.scene.add(extinguisherBand);
  const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.15), new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.5, metalness: 0.6 }));
  bracket.position.set(-ROOM_W / 2 + 0.19, 0.4, 4.6);
  ctx.scene.add(bracket);

  // First-aid box against the right wall, mounted face-out.
  const firstAidTex = buildFirstAidTexture();
  const firstAidMats = [
    new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ map: firstAidTex, roughness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0x5c1414, roughness: 0.6 }),
  ];
  const firstAidBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.12), firstAidMats);
  firstAidBox.position.set(ROOM_W / 2 - 0.14, 1.4, 5.0);
  firstAidBox.rotation.y = -Math.PI / 2;
  ctx.scene.add(firstAidBox);

  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x1c1f26, roughness: 0.5, metalness: 0.6 });
  for (const x of [-2.5, 2.5]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, ROOM_D - 1, 8), pipeMat);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(x, ROOM_H - 0.15, 0);
    ctx.scene.add(pipe);
  }
}
