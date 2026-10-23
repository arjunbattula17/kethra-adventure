import{$ as e,At as t,D as n,Et as r,G as i,Gt as a,H as o,Ht as s,It as c,L as l,Q as u,S as d,St as f,Tt as p,Ut as m,Vt as h,W as g,Wt as _,_t as v,b as y,ht as b,n as x,ot as S,r as C,rt as w,wt as T,x as E,z as D}from"./three-BNTvIbIC.js";import{u as O}from"./boot-DRT8CN2B.js";import{t as k}from"./spaceSky-Cdu_0Jy1.js";var A=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;async function j(e,t,n,i={},a={}){let o=new r({vertexShader:A,fragmentShader:n,uniforms:i,depthTest:!1,depthWrite:!1}),s=new S(new b(2,2),o);s.frustumCulled=!1;let c=new p;c.add(s);let l=new d,u=a.strips??1,f=t.texture.generateMipmaps;try{let n=e.getRenderTarget();e.setRenderTarget(t);let r=e.compileAsync(c,l);e.setRenderTarget(n),await r;let i=t.height;for(let n=0;n<u;n++){n>0&&await a.pace?.();let r=Math.floor(n*i/u),o=Math.floor((n+1)*i/u);t.scissor.set(0,r,t.width,o-r),t.scissorTest=u>1,t.texture.generateMipmaps=f&&n===u-1;let s=e.getRenderTarget(),d=e.autoClear;e.autoClear=!1,e.setRenderTarget(t),e.render(c,l),e.setRenderTarget(s),e.autoClear=d}}finally{t.scissorTest=!1,t.texture.generateMipmaps=f,s.geometry.dispose(),o.dispose()}}var M=`
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
`;async function N(t,n,r=512){let i=new a(r,r,{type:h,wrapS:f,wrapT:f,minFilter:e,magFilter:u,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return i.texture.name=`title-detail-noise`,await j(t,i,M,{uLoop:{value:8}},{strips:2,pace:n}),i}var P=new s(1.35,.95),F=`
  precision highp float;
  varying vec2 vUv;
  uniform vec2 uHalf;
  uniform vec2 uFrom;
  uniform vec2 uTo;
  uniform vec2 uCore;
  
  // Sine-free hash (Hoskins): sin() of large arguments loses precision on some GPU compilers (Direct3D
  // through ANGLE here), and a sin hash then turns into visible blocks.
  float vhash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(vhash(i), vhash(i + vec2(1.0, 0.0)), f.x), mix(vhash(i + vec2(0.0, 1.0)), vhash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  // The loop bound is a uniform (6) so the compiler keeps a loop (see bake.ts, PERIODIC_NOISE).
  uniform int uLoop;
  float vfbm(vec2 p) {
    float s = 0.0;
    float a = 0.5;
    for (int i = 0; i < uLoop; i++) {
      s += a * vnoise(p);
      p = p * 2.03 + vec2(17.1, 9.3);
      a *= 0.5;
    }
    return s / 0.984;
  }

  void main() {
    vec2 p = (vUv * 2.0 - 1.0) * uHalf;
    vec2 ab = uTo - uFrom;
    float len = length(ab);
    vec2 dir = ab / len;
    vec2 nrm = vec2(-dir.y, dir.x);
    float along = dot(p - uFrom, dir) / len;
    float across = dot(p - uFrom, nrm);
    across += (vfbm(p * 2.2 + 3.1) - 0.5) * 0.24 + (vfbm(p * 5.0 - 1.7) - 0.5) * 0.07;
    float width = 0.15 + 0.11 * vfbm(p * 1.3 + 7.0);
    float band = exp(-across * across / (width * width));
    band *= smoothstep(-0.3, 0.2, along) * (1.0 - smoothstep(0.9, 1.4, along));

    vec2 q = vec2(vfbm(p * 1.8), vfbm(p * 1.8 + vec2(5.2, 1.3)));
    float neb = vfbm(p * 2.6 + q * 1.6);
    float neb2 = vfbm(p * 7.0 + q * 3.0);
    float lanes = smoothstep(0.5, 0.74, vfbm(p * 3.6 + q * 2.4 + 11.0));
    float knot = exp(-dot(p - uCore, p - uCore) / 0.06);

    float density = band * (0.35 + 0.85 * neb) * (0.65 + 0.55 * neb2);
    vec3 col = vec3(0.0015, 0.0027, 0.0060);
    col += vec3(0.0022, 0.0055, 0.0130) * smoothstep(0.0, 1.0, band * 0.8 + neb * 0.3);
    col += vec3(0.007, 0.018, 0.044) * density;
    col += vec3(0.040, 0.068, 0.100) * pow(density, 2.4) * 1.3;
    col += vec3(0.055, 0.042, 0.030) * knot * band * neb * 1.2;
    float dust = lanes * smoothstep(0.05, 0.5, band);
    col *= 1.0 - dust * 0.82;
    // The title sits over the upper left: keep that part of the sky quieter.
    col *= mix(0.5, 1.0, smoothstep(-1.0, -0.15, p.x - p.y * 0.4));

    float mask = clamp(density * (1.0 - dust * 0.85) * 1.3, 0.0, 1.0);
    float dither = (vhash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(sqrt(col / 0.25) + dither, mask);
  }
`,I=`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,L=`
  precision highp float;
  uniform sampler2D uCard;
  uniform sampler2D uDetail;
  uniform vec2 uHalf;
  uniform float uBright;
  varying vec3 vDir;
  float dhash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = vec3(0.0015, 0.0027, 0.0060);
    if (d.z < -0.05) {
      vec2 t = d.xy / -d.z;
      vec2 uv = t / uHalf * 0.5 + 0.5;
      vec4 s = texture2D(uCard, uv);
      float edge = smoothstep(0.0, 0.05, uv.x) * smoothstep(0.0, 0.05, uv.y) * smoothstep(1.0, 0.95, uv.x) * smoothstep(1.0, 0.95, uv.y);
      col = mix(col, s.rgb * s.rgb * 0.25, edge);
      float sp = texture2D(uDetail, t * 7.0).a * texture2D(uDetail, t * 19.0 + 0.3).a;
      float speck = pow(max(sp * 1.9 - 0.62, 0.0) * 3.0, 4.0);
      col += vec3(0.6, 0.7, 0.85) * speck * s.a * edge * 0.05;
    }
    col *= uBright;
    col += (dhash(gl_FragCoord.xy) - 0.5) * 0.0004;
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`,R=`
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uBright;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vColor = aColor * uBright;
    vSize = aSize * uPixelRatio;
    gl_PointSize = vSize + 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,z=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`,B=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * (vSize + 2.0);
    float r = length(p);
    float core = exp(-r * r / 1.6);
    float halo = exp(-r / (vSize * 0.09)) * 0.22;
    float fade = smoothstep(vSize * 0.5, vSize * 0.1, r);
    float spikes = (exp(-abs(p.y) * 1.6) * exp(-abs(p.x) / (vSize * 0.16)) + exp(-abs(p.x) * 1.6) * exp(-abs(p.y) / (vSize * 0.16))) * 0.55;
    gl_FragColor = vec4(vColor * (core + halo + spikes * fade), 1.0);
  }
`;function V(e,t){return t.set(e.x/-e.z,e.y/-e.z)}async function H(e,i,o,c){let l=new D;l.name=`title-sky`;let d=new a(1280,900,{type:h,depthBuffer:!1,generateMipmaps:!1,minFilter:u,magFilter:u});d.texture.name=`title-sky-card`,await j(e,d,F,{uHalf:{value:P},uFrom:{value:o.from},uTo:{value:o.to},uCore:{value:o.core},uLoop:{value:6}},{strips:6,pace:c.pace});let f={value:0},p=new S(new t(10,48,24),new r({uniforms:{uCard:{value:d.texture},uDetail:{value:await i},uHalf:{value:P},uBright:f},vertexShader:I,fragmentShader:L,side:1,depthWrite:!1,depthTest:!1}));p.renderOrder=-1e3,p.frustumCulled=!1,l.add(p);let g=O(c.seed??464670),_=Math.cos(w.degToRad(72)),b=o.to.clone().sub(o.from),x=b.length(),C=b.clone().divideScalar(x),T=new s,A=e=>(V(e,T).sub(o.from),Math.abs(T.x*-C.y+T.y*C.x)),M=e=>{let t=-(_+g()*(1-_)),n=g()*Math.PI*2,r=Math.sqrt(1-t*t);return e.set(Math.cos(n)*r,Math.sin(n)*r,t)},N={value:1},H={value:0},U=(e,t,i)=>{let a=new Float32Array(e*3),o=new Float32Array(e*3),s=new Float32Array(e),c=new m,l=new n;for(let n=0;n<e;n++)s[n]=t(n,c,l),a[n*3]=c.x*9,a[n*3+1]=c.y*9,a[n*3+2]=c.z*9,o[n*3]=l.r,o[n*3+1]=l.g,o[n*3+2]=l.b;let u=new E;u.setAttribute(`position`,new y(a,3)),u.setAttribute(`aColor`,new y(o,3)),u.setAttribute(`aSize`,new y(s,1));let d=new v(u,new r({uniforms:{uPixelRatio:N,uBright:H},vertexShader:R,fragmentShader:i,blending:2,depthWrite:!1,depthTest:!1}));return d.renderOrder=-999,d.frustumCulled=!1,d.onBeforeRender=e=>{N.value=e.getPixelRatio()},d},W=()=>{let e=g();return e<.12?3300+g()*1200:e>.86?9e3+g()*6e3:5400+g()*2600};l.add(U(c.stars,(e,t,n)=>{for(let e=0;e<10;e++){M(t);let e=A(t);if(g()<.22+.78*Math.exp(-(e*e)/.05))break}let r=g()**3;return k(W(),n).multiplyScalar(.05+r*.5),.7+r*.9},z));let G=Math.round(c.stars*.07);return l.add(U(G,(e,t,n)=>{M(t);let r=g()**4;return k(W(),n).multiplyScalar(.5+r*1.8),1.5+r*1.9},z)),l.add(U(18,(e,t,n)=>{for(let e=0;e<30&&(M(t),V(t,T),!(T.x>-.15||T.y<-.05));e++);return k(g()<.6?9e3+g()*7e3:5600+g()*1500,n).multiplyScalar(1.1+g()*1.2),16+g()*12},B)),{group:l,update(e){e.getWorldPosition(l.position)},setReveal(e,t){H.value=e,f.value=t},dispose(){d.dispose(),l.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var U=`
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`,W=`
  attribute float aCavity;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
`,G=e=>`
  attribute float aRock;
  attribute float aSeed;
  uniform vec3 uCenter[${e}];
  uniform vec4 uSpin[${e}];
  ${W}
  ${U}
  void main() {
    int i = int(aRock + 0.5);
    vec4 turn = uSpin[i];
    vec3 world = uCenter[i] + spin(position, turn.xyz, turn.w);
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = turn;
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`,K=`
  attribute vec4 aSlot;
  attribute vec2 aDrift;
  attribute vec4 aSpin;
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uTan;
  uniform vec4 uWrap;
  ${W}
  ${U}
  void main() {
    vec2 uv = uWrap.xy + mod(aSlot.xy + aDrift * uTime - uWrap.xy, uWrap.zw);
    vec3 centre = normalize(vec3((2.0 * uv.x - 1.0) * uTan.x, (1.0 - 2.0 * uv.y) * uTan.y, -1.0)) * aSlot.z;
    float a = aSpin.w * uTime + aSeed * 6.2832;
    vec3 world = centre + spin(position * aSlot.w, aSpin.xyz, a);
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(aSpin.xyz, a);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`,q=`
  attribute float aSeed;
  ${W}
  void main() {
    vPosW = position;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(0.0, 1.0, 0.0, 0.0);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`,J=`
  attribute vec4 aOrbit;
  attribute vec4 aSpin;
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uOrbitCenter;
  uniform mat3 uOrbitBasis;
  ${W}
  ${U}
  void main() {
    float a = aOrbit.y + aOrbit.z * uTime;
    vec3 centre = uOrbitCenter + uOrbitBasis * vec3(cos(a) * aOrbit.x, aOrbit.w, sin(a) * aOrbit.x);
    float turn = aSpin.w * uTime + aSeed * 6.2832;
    vec3 world = centre + spin(position * aSize, aSpin.xyz, turn);
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(aSpin.xyz, turn);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`,Y=`
  precision highp float;
  uniform sampler2D uRock;
  uniform sampler2D uRockNormal;
  uniform vec3 uSunDir;
  uniform vec3 uRimDir;
  uniform vec3 uSunColor;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform vec3 uFill;
  uniform vec3 uRimColor;
  uniform vec2 uAlbedo;
  uniform float uTexScale;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
  #ifdef OCCLUDERS
  // Spheres standing in for the astronaut: their occlusion and their soft shadow from the key. The
  // loop runs to a uniform (the count) so Direct3D keeps it a loop: unrolled, the driver was still
  // compiling it when the backdrop first drew, a 0.3-0.5 s frame in the dissolve.
  uniform vec4 uOcc[OCCLUDERS];
  uniform int uOccCount;
  // A sphere round all of them: rock further away than this from it is left alone (most of the screen).
  uniform vec4 uOccBound;
  float contact(vec3 p, vec3 n) {
    if (distance(p, uOccBound.xyz) > uOccBound.w) return 1.0;
    float ao = 1.0;
    float sh = 1.0;
    for (int i = 0; i < OCCLUDERS; i++) {
      if (i >= uOccCount) break;
      vec3 d = uOcc[i].xyz - p;
      float r = uOcc[i].w;
      float l = length(d);
      ao *= 1.0 - clamp(dot(n, d / l) * (r * r) / (l * l), 0.0, 1.0) * 0.85;
      float b = dot(d, uSunDir);
      if (b > 0.0) {
        float h = length(d - uSunDir * b);
        sh = min(sh, smoothstep(r * 0.55, r * 0.55 + b * 0.25 + 0.02, h));
      }
    }
    return ao * mix(0.35, 1.0, sh);
  }
  #endif
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vec3 ln = normalize(vLocalN);
    vec3 w = pow(abs(ln), vec3(4.0));
    w /= w.x + w.y + w.z;
    vec3 p = vLocal * uTexScale + vSeed * 7.0;
    // Colour: three projections, taken to grey and given a per-rock tint.
    float lumX = dot(texture2D(uRock, p.zy).rgb, vec3(0.3, 0.59, 0.11));
    float lumY = dot(texture2D(uRock, p.xz).rgb, vec3(0.3, 0.59, 0.11));
    float lumZ = dot(texture2D(uRock, p.xy).rgb, vec3(0.3, 0.59, 0.11));
    float lum = lumX * w.x + lumY * w.y + lumZ * w.z;
    vec3 tint = mix(vec3(0.95, 0.92, 0.88), vec3(0.86, 0.9, 0.98), vSeed);
    vec3 albedo = tint * (uAlbedo.x + lum * uAlbedo.y);
    // Grain: the normal map in each projection (whiteout-style blend), in the rock's space, then turned.
    vec2 nx = texture2D(uRockNormal, p.zy).xy * 2.0 - 1.0;
    vec2 ny = texture2D(uRockNormal, p.xz).xy * 2.0 - 1.0;
    vec2 nz = texture2D(uRockNormal, p.xy).xy * 2.0 - 1.0;
    vec3 bent = normalize(ln + (vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z) * 0.9);
    vec3 n = normalize(spin(bent, vSpin.xyz, vSpin.w));
    vec3 V = normalize(cameraPosition - vPosW);

    float cavity = 1.0 - vCavity * 0.75;
    #ifdef OCCLUDERS
    cavity *= contact(vPosW, n);
    #endif
    float ndl = dot(n, uSunDir);
    float key = max(ndl * 0.9 + 0.1, 0.0) * cavity;
    // The seen sun is behind most rocks: their edges toward it catch a hard, warm rim.
    float facing = max(dot(n, V), 0.0);
    float rim = pow(1.0 - facing, 2.4) * max(dot(n, uRimDir) + 0.35, 0.0);
    float bounce = max(dot(n, uBounceDir), 0.0) * cavity;
    // With the sun behind them their faces would be black; the glow of the sky and the limb in front
    // of them gives a faint cool fill, enough for the stone to read.
    vec3 fill = uFill * (0.25 + 0.75 * facing);
    vec3 col = albedo * (uSunColor * key + uBounceColor * bounce + fill);
    col += uRimColor * rim * (0.4 + 0.9 * lum) * cavity;
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;function ee(e){let t=O(e),n=new Uint8Array(512),r=Array.from({length:256},(e,t)=>t);for(let e=255;e>0;e--){let n=Math.floor(t()*(e+1));[r[e],r[n]]=[r[n],r[e]]}for(let e=0;e<512;e++)n[e]=r[e&255];let i=new Float32Array(256).map(()=>t()),a=(e,t,n)=>e+(t-e)*n,o=e=>e*e*(3-2*e),s=(e,t,r)=>i[n[n[n[e&255]+t&255]+r&255]],c=(e,t,n)=>{let r=Math.floor(e),i=Math.floor(t),c=Math.floor(n),l=o(e-r),u=o(t-i),d=o(n-c);return a(a(a(s(r,i,c),s(r+1,i,c),l),a(s(r,i+1,c),s(r+1,i+1,c),l),u),a(a(s(r,i,c+1),s(r+1,i,c+1),l),a(s(r,i+1,c+1),s(r+1,i+1,c+1),l),u),d)};return(e,t,n,r)=>{let i=0,a=.5,o=1,s=0;for(let l=0;l<r;l++)i+=a*c(e*o,t*o,n*o),s+=a,a*=.5,o*=2.1;return i/s}}function X(e,t,n=`chunky`,r={}){let i=ee(t),a=O(t*7+1),s=new o(1,e);s.deleteAttribute(`uv`),s.deleteAttribute(`normal`),s=C(s);let c=n===`pebble`,l=r.stretch??(n===`elongated`?new m(1.5+a()*.25,.6+a()*.15,.65+a()*.15):n===`angular`?new m(1.05,.75+a()*.2,.8+a()*.15):c?new m(1.12,.8+a()*.15,.85+a()*.15):new m(1.15,.6+a()*.25,.72+a()*.23)),u=n===`angular`?5+Math.floor(a()*3):c?1+Math.floor(a()*2):3+Math.floor(a()*4),d=n===`angular`?.56:c?.86:.62,f=c?.25:.7,p=c?0:.07,h=Array.from({length:(c?2:5)+Math.floor(a()*4)},()=>({dir:new m(a()-.5,a()-.5,a()-.5).normalize(),size:.16+a()*.32,depth:.05+a()*.08})),g=Array.from({length:u},()=>({n:new m(a()-.5,a()-.5,a()-.5).normalize(),d:d+a()*.22})).concat(r.cuts??[]),_=s.getAttribute(`position`),v=new Float32Array(_.count),b=new m;for(let e=0;e<_.count;e++){b.fromBufferAttribute(_,e).normalize();let t=.97-f*.5+f*i(b.x*1.3+5,b.y*1.3,b.z*1.3,4),n=1-Math.abs(i(b.x*3.2+17,b.y*3.2,b.z*3.2,4)*2-1),r=t+(c?.04:.1)*i(b.x*4+11,b.y*4,b.z*4,3)+p*n*n-.035;for(let e of h){let t=b.distanceTo(e.dir)/e.size;t<1?r-=e.depth*(1-t*t):t<1.45&&(r+=e.depth*.35*(1-Math.abs(t-1.2)/.25)*(t<1.2?(t-1)/.2:1))}v[e]=Math.min(1,Math.max(0,(t-r)*5));for(let e of g){let t=b.dot(e.n);t>.05&&(r=Math.min(r,(e.d+.025*i(b.x*6+3,b.y*6,b.z*6,2))/t))}b.multiplyScalar(r).multiply(l),_.setXYZ(e,b.x,b.y,b.z)}return s.setAttribute(`aCavity`,new y(v,1)),s.computeVertexNormals(),s}var Z=null;function te(){if(Z)return Z;let e=new c,t=(t,n)=>{let r,i=new Promise(e=>r=e),a=e.load(`/kethra-adventure/textures/lichen_rock/`+t,()=>r(),void 0,()=>r());return a.colorSpace=n?T:``,a.wrapS=a.wrapT=f,a.anisotropy=4,{t:a,ready:i}},n=t(`diff.jpg`,!0),r=t(`nor_gl.jpg`,!1);return Z={map:n.t,normal:r.t,ready:Promise.all([n.ready,r.ready]).then(()=>void 0)},Z}function ne(e,t,i,a,o=.42,c={}){let l=te();return new r({defines:c,vertexShader:e,fragmentShader:Y,uniforms:{uRock:{value:l.map},uRockNormal:{value:l.normal},uSunDir:{value:t.sunDir},uRimDir:{value:t.rimDir},uSunColor:{value:t.sunColor??new n(1,.95,.88).multiplyScalar(1.7)},uBounceDir:{value:t.bounceDir},uBounceColor:{value:t.bounceColor??new n(4164186).multiplyScalar(.4)},uFill:{value:t.fillColor??new n(.16,.2,.26)},uRimColor:{value:t.rimGain===void 0?new n(1,.9,.78).multiplyScalar(1.5):(t.sunColor??new n(1,.95,.88).multiplyScalar(1.7)).clone().multiplyScalar(t.rimGain)},uAlbedo:{value:new s(...t.albedo??[.045,.3])},uTexScale:{value:o},uFade:a,...i}})}var Q=(e,t)=>e[0]+(e[1]-e[0])*t,re=Math.PI*2,ie=3;async function ae(e){let t=O(e.seed),n=e.pool.length,r=[],i=new Float32Array(n);for(let a=0;a<n;a++){let[n,o,s]=e.pool[a],c=X(s,101+a*37,o).toNonIndexed();c.scale(n,n,n);let l=c.getAttribute(`position`);for(let e=0;e<l.count;e++)i[a]=Math.max(i[a],Math.hypot(l.getX(e),l.getY(e),l.getZ(e)));c.setAttribute(`aRock`,new y(new Float32Array(l.count).fill(a),1)),c.setAttribute(`aSeed`,new y(new Float32Array(l.count).fill(t()),1)),r.push(c),s>=4&&await e.pace?.()}let a=x(r,!1);for(let e of r)e.dispose();let o=Array.from({length:n},()=>new m),s=Array.from({length:n},()=>new _),c=Array.from({length:n},()=>new m),l=new Float32Array(n),u=new Uint16Array(n),d={value:0},f=new S(a,ne(G(n),e,{uCenter:{value:o},uSpin:{value:s}},d));f.name=`title-asteroids`,f.frustumCulled=!1;let{tanH:p,tanV:h}=e.view,g=p,v=h,b=new m,C=(r,a)=>{let d=w.clamp(r/Math.max(n-1,1)+(t()-.5)*.3,0,1),f=e.distance[0]*(e.distance[1]/e.distance[0])**+d,m=i[r]/f,_=a??.5-.5*g/p-m/(2*p)-.02,v=e.bandTop+m/(2*h)+t()*e.bandDepth;o[r].copy(b.set((2*_-1)*p,(1-2*v)*h,-1).normalize()).multiplyScalar(f);let y=2*f*p/Q(e.crossing,t());c[r].set(y,-y*Q(e.sink,t()),y*Q(e.approach,t())),s[r].set(t()-.5,t()-.5,t()-.5,0).normalize(),s[r].w=t()*re,l[r]=Q(e.spin,t())/Math.sqrt(Math.max(e.pool[r][0],.3))*(t()<.5?-1:1),u[r]++},T=t=>!e.avoid||e.avoid.points.every(n=>n.distanceTo(o[t])>i[t]+e.avoid.clearance),E=Array.from({length:n},(e,t)=>t);for(let e=n-1;e>0;e--){let n=Math.floor(t()*(e+1));[E[e],E[n]]=[E[n],E[e]]}for(let e=0;e<n;e++){let r=E[e],i=!1;for(let a=0;a<24&&!i;a++)C(r,-.05+1.1*(e+t())/n),i=T(r);i||C(r,null),u[r]=0}return await te().ready,{mesh:f,update(e){let t=Math.min(e,.1),r=.5+.5*g/p+.02,a=.5+.5*v/h+.02;for(let e=0;e<n;e++){let n=o[e].addScaledVector(c[e],t);s[e].w=(s[e].w+l[e]*t)%re;let u=-n.z;if(u<ie){C(e,null);continue}let d=i[e]/u,f=.5+.5*n.x/u/p-d/(2*p),m=.5-.5*n.y/u/h-d/(2*h);(f>r||m>a||m+d/h<1-a)&&C(e,null)}},setView(e,t){g=Math.max(e,p),v=Math.max(t,h)},setFade(e){d.value=e},report(){return o.map((e,t)=>({x:.5+.5*e.x/-e.z/p,y:.5-.5*e.y/-e.z/h,d:-e.z,passes:u[t]}))},dispose(){a.dispose(),f.material.dispose()}}}var oe=.06;function se(e){let t=O(e.seed),{tanH:n,tanV:r}=e.view,a={value:0},o={value:0},c={value:new _},l=(e,t)=>{let i=.5*Math.max(e,n)/n+oe,a=.5*Math.max(t,r)/r+oe;c.value.set(.5-i,.5-a,2*i,2*a)};l(n,r);let u=ne(K,e,{uTime:a,uTan:{value:new s(n,r)},uWrap:c},o),d=new D;d.name=`title-debris`;let f=[`pebble`,`pebble`,`pebble`],p=[],h=e.count;return f.forEach((a,o)=>{let s=o===f.length-1?h:Math.round(e.count/f.length);h-=s;let c=X(2,911+o*53,a),l=new i;l.index=c.index;for(let e of[`position`,`normal`,`aCavity`])l.setAttribute(e,c.getAttribute(e));l.instanceCount=s;let _=new Float32Array(s*4),v=new Float32Array(s*2),y=new Float32Array(s*4),b=new Float32Array(s),x=new m;for(let i=0;i<s;i++){let a=e.distance[0]*(e.distance[1]/e.distance[0])**+t();_.set([t(),t(),a,a*Q(e.size,t())],i*4);let o=Q(e.drift,t())*(e.driftAt/a)**+e.parallax,s=t()*re;v.set([Math.cos(s)*o,Math.sin(s)*o*(n/r)],i*2),x.set(t()-.5,t()-.5,t()-.5).normalize(),y.set([x.x,x.y,x.z,Q(e.spin,t())*(t()<.5?-1:1)],i*4),b[i]=t()}l.setAttribute(`aSlot`,new g(_,4)),l.setAttribute(`aDrift`,new g(v,2)),l.setAttribute(`aSpin`,new g(y,4)),l.setAttribute(`aSeed`,new g(b,1)),p.push(l);let C=new S(l,u);C.name=`title-debris-${o}`,C.frustumCulled=!1,d.add(C)}),{group:d,update(e){a.value=e},setView:l,setFade(e){o.value=e},dispose(){for(let e of p)e.dispose();u.dispose()}}}var $=()=>new b(2,2),ce=`
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uSize;
  uniform float uDepth;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uCenter + position.xy * vec2(uSize / uAspect, uSize), uDepth, 1.0);
  }
`,le=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float k = exp(-r * r * 2200.0) * 7.0 + exp(-r * 70.0) * 1.3 + exp(-r * 14.0) * 0.28;
    k *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * k * uIntensity, 1.0);
  }
`,ue=`
  precision highp float;
  uniform float uIntensity;
  uniform float uTime;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float a = atan(vP.y, vP.x);
    float breathe = 0.92 + 0.08 * sin(uTime * 0.7);
    float rays = pow(abs(cos(a * 3.0 + 0.35)), 110.0) * exp(-r * 7.0) * 0.3;
    rays += pow(abs(cos(a * 5.0 + 1.2)), 160.0) * exp(-r * 10.0) * 0.16;
    float streak = exp(-abs(vP.y) * 130.0) * exp(-abs(vP.x) * 2.6) * 0.32;
    float haze = exp(-r * 3.6) * 0.09;
    vec3 col = vec3(1.0, 0.8, 0.56) * (rays * breathe + haze) + vec3(0.62, 0.82, 1.0) * streak;
    col *= smoothstep(1.0, 0.55, r);
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`,de=`
  attribute vec2 aCorner;
  attribute float aAlong;
  attribute float aSize;
  attribute vec3 aTint;
  uniform vec2 uSun;
  uniform float uAspect;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    vCorner = aCorner;
    vTint = aTint;
    vec2 c = uSun + (-uSun) * aAlong * 2.0;
    gl_Position = vec4(c + aCorner * vec2(aSize / uAspect, aSize), 0.0, 1.0);
  }
`,fe=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vCorner;
  varying vec3 vTint;
  void main() {
    // A soft hexagon, like an aperture's ghost.
    vec2 p = abs(vCorner);
    float hex = max(p.x * 0.866 + p.y * 0.5, p.y);
    float k = smoothstep(1.0, 0.82, hex) * (0.35 + 0.65 * smoothstep(0.2, 0.95, hex));
    gl_FragColor = vec4(vTint * k * uIntensity, 1.0);
  }
`,pe=`
  uniform vec2 uHead;
  uniform vec2 uDir;
  uniform float uLength;
  uniform float uWidth;
  uniform float uAspect;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    vec2 side = vec2(-uDir.y, uDir.x);
    // x: 1 at the head, -1 at the tail; y across.
    vec2 p = uHead - uDir * (1.0 - position.x) * 0.5 * uLength + side * position.y * uWidth;
    p.x /= uAspect;
    gl_Position = vec4(p, 0.99999, 1.0);
  }
`,me=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    // along: 0 at the tail, 1 at the head; vP.y across, -1..1.
    float along = vP.x * 0.5 + 0.5;
    float y2 = vP.y * vP.y;
    // The quad is about twice as wide as the streak, so its glow has room to spread past the core.
    // The trail: a crisp white core (pushed well past 1 so the title's grade, its highlight shoulder,
    // holds it at full white) in a soft blue glow kept below white, fading toward the tail.
    float tail = pow(along, 1.8);
    vec3 col = (vec3(1.0) * exp(-y2 * 60.0) * 0.7 + vec3(0.7, 0.85, 1.0) * exp(-y2 * 14.0) * 0.08) * tail;
    // The head: a short white point no wider than the core, in a glow drawn out along the streak rather
    // than round (a round, wide halo bloomed into a ball), so the tip glows.
    float h = 1.0 - along;
    col += vec3(1.0) * exp(-h * h * 3000.0 - y2 * 80.0) * 1.0;
    col += vec3(0.85, 0.93, 1.0) * exp(-h * h * 250.0 - y2 * 10.0) * 0.35;
    gl_FragColor = vec4(col * uIntensity, 1.0);
  }
`,he=`
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uStream;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = mod(position + uStream * uTime - uBoxMin, uBoxSize) + uBoxMin;
    vec3 e = min(p - uBoxMin, uBoxMin + uBoxSize - p) / uBoxSize;
    float edge = smoothstep(0.0, 0.12, min(min(e.x, e.y), e.z));
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    vAlpha = edge * (0.35 + 0.65 * aSeed) * smoothstep(1.5, 4.0, dist);
    gl_PointSize = clamp((14.0 + 22.0 * aSeed) / dist, 1.0, 6.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`,ge=`
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 4.0) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * k * vAlpha * uIntensity, 1.0);
  }
`,_e=`
  precision highp float;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;function ve(e){let t=new D;t.name=`title-sky-fx`;let n={value:16/9},i=new s,a={value:i},o={value:0},c={value:0},u={value:.9999},d=new r({vertexShader:ce,fragmentShader:le,uniforms:{uCenter:a,uAspect:n,uSize:{value:.5},uDepth:u,uIntensity:o},transparent:!0,depthWrite:!1,blending:2}),f=new S($(),d);f.frustumCulled=!1,f.renderOrder=20,t.add(f);let p=new r({vertexShader:ce,fragmentShader:ue,uniforms:{uCenter:a,uAspect:n,uSize:{value:.95},uDepth:{value:0},uIntensity:o,uTime:c},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),h=new S($(),p);h.frustumCulled=!1,h.renderOrder=900,t.add(h);let g=[[.22,.035,[.25,.55,.6]],[.42,.06,[.5,.42,.25]],[.62,.022,[.3,.6,.9]]],_=[],b=[],x=[],C=[],w=[],T=[];g.forEach(([e,t,n],r)=>{for(let[r,i]of[[-1,-1],[1,-1],[1,1],[-1,1]])_.push(0,0,0),b.push(r,i),x.push(e),C.push(t),w.push(...n);T.push(r*4,r*4+1,r*4+2,r*4,r*4+2,r*4+3)});let k=new E;k.setAttribute(`position`,new l(_,3)),k.setAttribute(`aCorner`,new l(b,2)),k.setAttribute(`aAlong`,new l(x,1)),k.setAttribute(`aSize`,new l(C,1)),k.setAttribute(`aTint`,new l(w,3)),k.setIndex(T);let A={value:0},j=new S(k,new r({vertexShader:de,fragmentShader:fe,uniforms:{uSun:a,uAspect:n,uIntensity:A},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}));j.frustumCulled=!1,j.renderOrder=901,t.add(j);let M={uHead:{value:new s},uDir:{value:new s(-.8,-.6)},uLength:{value:.22},uWidth:{value:e.meteors.width},uAspect:n,uIntensity:{value:0}},N=new S($(),new r({vertexShader:pe,fragmentShader:me,uniforms:M,depthWrite:!1,blending:2}));N.frustumCulled=!1,N.renderOrder=-998,N.visible=!1,t.add(N);let P=O(255968),F=!0,I=e.meteors,L=I.first,R=-1,z=new s,B=new Float32Array(e.dust.count*3),V=new Float32Array(e.dust.count);for(let t=0;t<e.dust.count;t++)B[t*3]=e.dust.boxMin.x+P()*e.dust.boxSize.x,B[t*3+1]=e.dust.boxMin.y+P()*e.dust.boxSize.y,B[t*3+2]=e.dust.boxMin.z+P()*e.dust.boxSize.z,V[t]=P();let H=new E;H.setAttribute(`position`,new y(B,3)),H.setAttribute(`aSeed`,new y(V,1));let U={value:0},W={value:1},G=new v(H,new r({vertexShader:he,fragmentShader:ge,uniforms:{uTime:c,uStream:{value:e.dust.stream},uBoxMin:{value:e.dust.boxMin},uBoxSize:{value:e.dust.boxSize},uPixelRatio:W,uIntensity:U},transparent:!0,depthWrite:!1,blending:2}));G.frustumCulled=!1,G.renderOrder=10,G.onBeforeRender=e=>{W.value=e.getPixelRatio()},t.add(G);let K={value:0},q=new S($(),new r({vertexShader:`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:_e,uniforms:{uOpacity:K},transparent:!0,depthWrite:!1,depthTest:!1}));q.frustumCulled=!1,q.renderOrder=1e4,q.visible=!1,t.add(q);let J=new m,Y=new m;return{group:t,update(t,r,a){if(c.value=a,n.value=t.aspect,J.copy(e.sunDir).multiplyScalar(e.coreDistance).add(t.position),Y.copy(J).project(t),i.set(Y.x,Y.y),u.value=Math.min(Y.z,.99999),R>=0){R+=r;let e=R/I.seconds;e>=1?(R=-1,N.visible=!1,L=I.every[0]+P()*(I.every[1]-I.every[0])):(M.uHead.value.copy(M.uDir.value).multiplyScalar(e*I.travel).add(z),M.uIntensity.value=Math.sin(Math.PI*e)*I.brightness)}else if(F&&(L-=r)<=0){let[e,t,r,i]=I.area;z.set((e+P()*(r-e))*n.value,t+P()*(i-t));let a=I.heading[0]+P()*(I.heading[1]-I.heading[0]);M.uDir.value.set(Math.cos(a),Math.sin(a)),M.uLength.value=I.length[0]+P()*(I.length[1]-I.length[0]),R=0,N.visible=!0}},setGlare(e){o.value=e,A.value=e*.05,f.visible=h.visible=j.visible=e>0},setDust(e){U.value=e},setVeil(e){K.value=e,q.visible=e>0},setMeteors(e){F=e},dispose(){t.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}export{se as a,te as c,j as d,ae as i,H as l,J as n,X as o,q as r,ne as s,ve as t,N as u};