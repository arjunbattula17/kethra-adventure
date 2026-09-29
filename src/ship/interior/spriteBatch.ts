import * as THREE from 'three';

/**
 * Replaces every Sprite using `material` with one mesh of quads expanded in view space by the
 * vertex shader, so they draw in a single call instead of one per Sprite. Sprites must be static
 * (position and scale are baked) and unrotated. Returns how many were batched (0 if fewer than
 * two).
 */
export function batchSprites(scene: THREE.Scene, material: THREE.SpriteMaterial): number {
  const sprites: THREE.Sprite[] = [];
  scene.traverse((o) => {
    if ((o as THREE.Sprite).isSprite && (o as THREE.Sprite).material === material) sprites.push(o as THREE.Sprite);
  });
  if (sprites.length < 2) return 0;

  const n = sprites.length;
  const centre = new Float32Array(n * 4 * 3);
  const corner = new Float32Array(n * 4 * 2);
  const size = new Float32Array(n * 4 * 2);
  const uv = new Float32Array(n * 4 * 2);
  const index: number[] = [];
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  sprites.forEach((sprite, i) => {
    sprite.updateWorldMatrix(true, false);
    sprite.getWorldPosition(p);
    s.setFromMatrixScale(sprite.matrixWorld);
    for (let k = 0; k < 4; k++) {
      const v = i * 4 + k;
      centre.set([p.x, p.y, p.z], v * 3);
      corner.set([corners[k][0] + (0.5 - sprite.center.x), corners[k][1] + (0.5 - sprite.center.y)], v * 2);
      size.set([s.x, s.y], v * 2);
      uv.set([corners[k][0] + 0.5, corners[k][1] + 0.5], v * 2);
    }
    const b = i * 4;
    index.push(b, b + 1, b + 2, b, b + 2, b + 3);
    sprite.removeFromParent();
  });
  const geo = new THREE.BufferGeometry();
  // `position` carries the centres so the bounding sphere (for culling) covers every sprite.
  geo.setAttribute('position', new THREE.BufferAttribute(centre, 3));
  geo.setAttribute('corner', new THREE.BufferAttribute(corner, 2));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 2));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += Math.max(...sprites.map((sp) => Math.max(sp.scale.x, sp.scale.y)));

  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      { map: { value: material.map }, diffuse: { value: material.color.clone() }, opacity: { value: material.opacity } },
    ]),
    vertexShader: /* glsl */ `
      attribute vec2 corner;
      attribute vec2 size;
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        mvPosition.xy += corner * size;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform vec3 diffuse;
      uniform float opacity;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      void main() {
        vec4 tex = texture2D(map, vUv);
        gl_FragColor = vec4(diffuse * tex.rgb, tex.a * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: material.blending,
    fog: material.fog,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sprite-batch';
  mesh.renderOrder = sprites[0].renderOrder;
  scene.add(mesh);
  return n;
}
