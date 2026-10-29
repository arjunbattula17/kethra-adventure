import{$ as e,Dt as t,Ot as n,S as r,Ut as i,_t as a,et as o,qt as s,st as c,wt as l}from"./three-D-4sCFw3.js";var u=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;async function d(e,i,o,s={},l={}){let d=new n({vertexShader:u,fragmentShader:o,uniforms:s,depthTest:!1,depthWrite:!1}),f=new c(new a(2,2),d);f.frustumCulled=!1;let p=new t;p.add(f);let m=new r,h=l.strips??1,g=i.texture.generateMipmaps;try{let t=e.getRenderTarget();e.setRenderTarget(i);let n=e.compileAsync(p,m);e.setRenderTarget(t),await n;let r=i.height;for(let t=0;t<h;t++){t>0&&await l.pace?.();let n=Math.floor(t*r/h),a=Math.floor((t+1)*r/h);i.scissor.set(0,n,i.width,a-n),i.scissorTest=h>1,i.texture.generateMipmaps=g&&t===h-1;let o=e.getRenderTarget(),s=e.autoClear;e.autoClear=!1,e.setRenderTarget(i),e.render(p,m),e.setRenderTarget(o),e.autoClear=s}}finally{i.scissorTest=!1,i.texture.generateMipmaps=g,f.geometry.dispose(),d.dispose()}}var f=`
  precision highp float;
  varying vec2 vUv;
  
  // Loop bounds come from a uniform (always 8) so the shader compiler keeps real loops: unrolled, the
  // shader was large enough that Direct3D spent seconds compiling it.
  uniform int uLoop;
  // Sine-free (Hoskins): see titleSky.ts for why sin() hashes are avoided here.
  vec2 phash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return -1.0 + 2.0 * fract((p3.xx + p3.yz) * p3.zy);
  }
  float pnoise(vec2 p, float period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    float a = dot(phash(mod(i, period)), f);
    float b = dot(phash(mod(i + vec2(1.0, 0.0), period)), f - vec2(1.0, 0.0));
    float c = dot(phash(mod(i + vec2(0.0, 1.0), period)), f - vec2(0.0, 1.0));
    float d = dot(phash(mod(i + vec2(1.0, 1.0), period)), f - vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float pfbm(vec2 uv, float period, int octaves, float gain) {
    float sum = 0.0;
    float amp = 0.5;
    float norm = 0.0;
    float per = period;
    for (int i = 0; i < uLoop; i++) {
      if (i >= octaves) break;
      sum += amp * pnoise(uv * per, per);
      norm += amp;
      amp *= gain;
      per *= 2.0;
    }
    return sum / norm;
  }

  void main() {
    vec2 uv = vUv;
    // R: broad terrain height. G: ridges (sharp crests, the canopy's terrace lines from orbit).
    // B: domain-warped cloud structure. A: fine grain.
    float r = 0.5 + 0.75 * pfbm(uv, 4.0, 7, 0.52);
    float ridge = 1.0 - abs(pfbm(uv + 0.37, 6.0, 6, 0.55) * 1.6);
    float g = ridge * ridge;
    vec2 warp = vec2(pfbm(uv, 3.0, 4, 0.5), pfbm(uv + vec2(0.41, 0.73), 3.0, 4, 0.5));
    float b = 0.5 + 0.8 * pfbm(fract(uv + warp * 0.18), 5.0, 6, 0.56);
    float a = 0.5 + 0.9 * pfbm(uv + 0.11, 32.0, 3, 0.5);
    gl_FragColor = clamp(vec4(r, g, b, a), 0.0, 1.0);
  }
`;async function p(t,n,r=512){let a=new s(r,r,{type:i,wrapS:l,wrapT:l,minFilter:o,magFilter:e,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return a.texture.name=`title-detail-noise`,await d(t,a,f,{uLoop:{value:8}},{strips:2,pace:n}),a}export{d as n,p as t};