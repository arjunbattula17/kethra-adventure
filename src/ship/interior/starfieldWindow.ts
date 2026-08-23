import * as THREE from 'three';
import type { InteriorCtx } from './ctx';
import { ROOM_D } from './ctx';

/** Forward viewport behind the console: frame, glass, starfield and distant nebula. */
export function buildStarfieldWindow(ctx: InteriorCtx): void {

  const windowFrame = new THREE.Mesh(
    new THREE.BoxGeometry(6.4, 2.6, 0.15),
    new THREE.MeshStandardMaterial({ color: 0x0c0e13, metalness: 0.3, roughness: 0.8 }),
  );
  windowFrame.position.set(0, 2.2, -ROOM_D / 2 + 0.3);
  ctx.scene.add(windowFrame);

  const glassGeo = new THREE.PlaneGeometry(6, 2.2);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.0 });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 2.2, -ROOM_D / 2 + 0.38);
  ctx.scene.add(glass);

  const starCount = 2200;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 400;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200 + 40;
    positions[i * 3 + 2] = -ROOM_D / 2 - 20 - Math.random() * 300;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true });
  const starfield = new THREE.Points(geo, mat);
  ctx.setStarfield(starfield);
  ctx.scene.add(starfield);

  const nebula = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 150),
    new THREE.MeshBasicMaterial({ color: 0x2a3a6b, transparent: true, opacity: 0.15 }),
  );
  nebula.position.set(-40, 30, -200);
  nebula.rotation.z = 0.3;
  ctx.scene.add(nebula);
}
