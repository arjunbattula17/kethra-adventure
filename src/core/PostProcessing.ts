import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const gradeShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // Filmic contrast lift.
      vec3 c = color.rgb;
      c = (c - 0.5) * 1.08 + 0.5;

      // Warm highlights, cool shadows split-tone.
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 warm = vec3(1.06, 1.0, 0.9);
      vec3 cool = vec3(0.92, 0.96, 1.05);
      c *= mix(cool, warm, smoothstep(0.15, 0.85, luma));

      // Vignette.
      vec2 centered = vUv - 0.5;
      float vig = 1.0 - smoothstep(0.35, 0.85, length(centered) * 1.15);
      c *= mix(0.72, 1.0, vig);

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
    }
  `,
};

export class PostProcessing {
  composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.95);
    this.composer.addPass(this.bloomPass);

    this.composer.addPass(new ShaderPass(gradeShader));
    this.composer.addPass(new OutputPass());
  }

  setActive(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloomPass.setSize(width, height);
  }

  render(): void {
    this.composer.render();
  }
}
