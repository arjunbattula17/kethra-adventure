import{a as e,n as t,t as n}from"./perfMarks-7Fm6Y8Jo.js";import{$ as r,Bt as i,C as a,Ct as o,D as s,Dt as c,G as l,H as u,Ht as d,L as f,Nt as p,Q as m,Rt as h,S as g,St as _,Vt as v,W as y,at as b,b as x,bt as S,ft as C,gt as w,it as ee,mt as T,n as E,r as D,rt as O,v as te,vt as k,wt as A,x as ne,z as j,zt as M}from"./three-DrA6UbAx.js";import{t as re}from"./motion--g8NLm3U.js";import{d as ie,h as ae,i as oe,u as se}from"./boot-CvuoH5KO.js";import{n as ce,r as le,t as ue}from"./planetShader-BXua2vnw.js";import{t as de}from"./spaceSky-CJbTtP2V.js";var fe=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;async function pe(e,t,n,r={},i={}){let a=new A({vertexShader:fe,fragmentShader:n,uniforms:r,depthTest:!1,depthWrite:!1}),s=new b(new T(2,2),a);s.frustumCulled=!1;let c=new o;c.add(s);let l=new g,u=i.strips??1,d=t.texture.generateMipmaps;try{let n=e.getRenderTarget();e.setRenderTarget(t);let r=e.compileAsync(c,l);e.setRenderTarget(n),await r;let a=t.height;for(let n=0;n<u;n++){n>0&&await i.pace?.();let r=Math.floor(n*a/u),o=Math.floor((n+1)*a/u);t.scissor.set(0,r,t.width,o-r),t.scissorTest=u>1,t.texture.generateMipmaps=d&&n===u-1;let s=e.getRenderTarget(),f=e.autoClear;e.autoClear=!1,e.setRenderTarget(t),e.render(c,l),e.setRenderTarget(s),e.autoClear=f}}finally{t.scissorTest=!1,t.texture.generateMipmaps=d,s.geometry.dispose(),a.dispose()}}var me=`
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
`;async function he(e,t,n=512){let i=new d(n,n,{type:h,wrapS:S,wrapT:S,minFilter:r,magFilter:m,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return i.texture.name=`title-detail-noise`,await pe(e,i,me,{uLoop:{value:8}},{strips:2,pace:t}),i}var ge=new M(1.35,.95),_e=`
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
`,ve=`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,ye=`
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
`,be=`
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
`,xe=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`,Se=`
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
`;function Ce(e,t){return t.set(e.x/-e.z,e.y/-e.z)}async function we(e,t,n,r){let a=new j;a.name=`title-sky`;let o=new d(1280,900,{type:h,depthBuffer:!1,generateMipmaps:!1,minFilter:m,magFilter:m});o.texture.name=`title-sky-card`,await pe(e,o,_e,{uHalf:{value:ge},uFrom:{value:n.from},uTo:{value:n.to},uCore:{value:n.core},uLoop:{value:6}},{strips:6,pace:r.pace});let l={value:0},u=new b(new c(10,48,24),new A({uniforms:{uCard:{value:o.texture},uDetail:{value:await t},uHalf:{value:ge},uBright:l},vertexShader:ve,fragmentShader:ye,side:1,depthWrite:!1,depthTest:!1}));u.renderOrder=-1e3,u.frustumCulled=!1,a.add(u);let f=se(r.seed??464670),p=Math.cos(O.degToRad(72)),g=n.to.clone().sub(n.from),_=g.length(),v=g.clone().divideScalar(_),y=new M,S=e=>(Ce(e,y).sub(n.from),Math.abs(y.x*-v.y+y.y*v.x)),C=e=>{let t=-(p+f()*(1-p)),n=f()*Math.PI*2,r=Math.sqrt(1-t*t);return e.set(Math.cos(n)*r,Math.sin(n)*r,t)},ee={value:1},T={value:0},E=(e,t,n)=>{let r=new Float32Array(e*3),a=new Float32Array(e*3),o=new Float32Array(e),c=new i,l=new s;for(let n=0;n<e;n++)o[n]=t(n,c,l),r[n*3]=c.x*9,r[n*3+1]=c.y*9,r[n*3+2]=c.z*9,a[n*3]=l.r,a[n*3+1]=l.g,a[n*3+2]=l.b;let u=new ne;u.setAttribute(`position`,new x(r,3)),u.setAttribute(`aColor`,new x(a,3)),u.setAttribute(`aSize`,new x(o,1));let d=new w(u,new A({uniforms:{uPixelRatio:ee,uBright:T},vertexShader:be,fragmentShader:n,blending:2,depthWrite:!1,depthTest:!1}));return d.renderOrder=-999,d.frustumCulled=!1,d.onBeforeRender=e=>{ee.value=e.getPixelRatio()},d},D=()=>{let e=f();return e<.12?3300+f()*1200:e>.86?9e3+f()*6e3:5400+f()*2600};a.add(E(r.stars,(e,t,n)=>{for(let e=0;e<10;e++){C(t);let e=S(t);if(f()<.22+.78*Math.exp(-(e*e)/.05))break}let r=f()**3;return de(D(),n).multiplyScalar(.05+r*.5),.7+r*.9},xe));let te=Math.round(r.stars*.07);return a.add(E(te,(e,t,n)=>{C(t);let r=f()**4;return de(D(),n).multiplyScalar(.5+r*1.8),1.5+r*1.9},xe)),a.add(E(18,(e,t,n)=>{for(let e=0;e<30&&(C(t),Ce(t,y),!(y.x>-.15||y.y<-.05));e++);return de(f()<.6?9e3+f()*7e3:5600+f()*1500,n).multiplyScalar(1.1+f()*1.2),16+f()*12},Se)),{group:a,update(e){e.getWorldPosition(a.position)},setReveal(e,t){T.value=e,l.value=t},dispose(){o.dispose(),a.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var Te=`
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,Ee=`
  precision highp float;
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uClouds;
  uniform sampler2D uDetail;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uCloudShift;
  uniform float uBumpScale;
  uniform float uNightGlow;
  uniform float uCloudHeight;
  uniform float uFade;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;

  // Explicit gradients, wrapped in longitude: at the map's seam u jumps from 1 to 0 inside one pixel
  // quad, and the implicit derivative would pick the smallest mip there (a visible line).
  vec4 sampleWrapped(sampler2D map, vec2 uv, vec2 gx, vec2 gy) {
    return textureGrad(map, uv, gx, gy);
  }

  void main() {
    vec3 nGeo = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec2 uv = vUv;
    vec2 gx = dFdx(uv);
    vec2 gy = dFdy(uv);
    gx.x -= floor(gx.x + 0.5);
    gy.x -= floor(gy.x + 0.5);

    // Three scales of detail; 2:1 so a detail texel is square on the equirect.
    vec2 s1 = vec2(26.0, 13.0);
    vec2 s2 = s1 * 3.7;
    vec2 s3 = s1 * 12.3;
    vec4 d1 = sampleWrapped(uDetail, uv * s1, gx * s1, gy * s1);
    vec4 d2 = sampleWrapped(uDetail, uv * s2 + vec2(0.31, 0.17), gx * s2, gy * s2);
    vec4 d3 = sampleWrapped(uDetail, uv * s3 + vec2(0.63, 0.29), gx * s3, gy * s3);
    // The map is read through a slight warp from the detail, so its texel grid never shows as edges.
    vec3 base = sampleWrapped(uDay, uv + (d1.gb - 0.5) * 0.0028, gx, gy).rgb;

    // Elevation: the map's own brightness (its uplands are bright; sqrt-luminance has its median near
    // 0.3), read two mips softer through a stronger warp so its texel grid never shapes a coast, with
    // the detail sheet's relief at three scales on top: the coastlines and ridges are the noise's,
    // fractal and sharp from this close.
    vec3 broad = sampleWrapped(uDay, uv + (d1.gb - 0.5) * 0.009, gx * 4.0, gy * 4.0).rgb;
    float lum = sqrt(dot(broad, vec3(0.299, 0.587, 0.114)));
    float elev = (lum - 0.3) * 9.0 + (d1.r - 0.5) * 2.6 + (d2.r - 0.5) * 1.2 + (d3.r - 0.5) * 0.5;
    // Seas in the lowest fifth or so; the coast is anti-aliased by its own slope on screen.
    const float SEA = -0.95;
    float aa = max(fwidth(elev), 0.02);
    float water = 1.0 - smoothstep(SEA - aa, SEA + aa, elev);
    float shallow = smoothstep(SEA - 1.1, SEA, elev);
    float above = max(elev - SEA, 0.0);

    // Kethra's greens: dark canopy along the coasts, brighter forest inland, yellow-green plains where
    // it is dry, olive uplands and pale terraces along the ridges.
    float dry = smoothstep(0.42, 0.62, d1.b * 0.6 + d2.g * 0.4);
    vec3 land = mix(vec3(0.014, 0.05, 0.02), vec3(0.03, 0.1, 0.03), smoothstep(0.0, 0.9, above));
    land = mix(land, vec3(0.1, 0.14, 0.035), smoothstep(0.8, 1.8, above) * dry);
    land = mix(land, vec3(0.1, 0.105, 0.055), smoothstep(1.8, 3.0, above));
    land = mix(land, vec3(0.17, 0.18, 0.12), smoothstep(0.62, 0.9, d1.g) * smoothstep(1.0, 2.4, above) * 0.55);
    vec3 albedo = mix(base * 0.9, land, 0.65) * (0.6 + 0.8 * d1.r) * (0.75 + 0.45 * d2.r + 0.25 * d3.a);
    vec3 sea = mix(vec3(0.004, 0.016, 0.036), vec3(0.014, 0.07, 0.085), shallow * shallow);
    albedo = mix(albedo, sea, water);

    // Bump from the detail height, in world space (derivative-based, no tangents needed).
    // Not cut at the coast: a step in the bump field would outline every shore in dark quads.
    float bump = d1.r + 0.5 * d2.r + 0.4 * d1.g + 0.25 * d3.r;
    vec3 dpx = dFdx(vPosW);
    vec3 dpy = dFdy(vPosW);
    vec3 r1 = cross(dpy, nGeo);
    vec3 r2 = cross(nGeo, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(bump) * r1 + dFdy(bump) * r2);
    vec3 n = normalize(abs(det) * nGeo - grad * uBumpScale);

    float ndlGeo = dot(nGeo, uSunDir);
    float ndl = dot(n, uSunDir);
    float day = smoothstep(-0.1, 0.2, ndlGeo);
    vec3 twilight = mix(vec3(1.0, 0.5, 0.24), vec3(1.0), smoothstep(-0.02, 0.32, ndlGeo));

    vec2 cuv = vec2(uv.x + uCloudShift, uv.y);
    vec2 cs = vec2(18.0, 9.0);
    vec2 cs2 = cs * 3.1;
    vec4 cd = sampleWrapped(uDetail, cuv * cs + vec2(0.53, 0.21), gx * cs, gy * cs);
    vec4 cd2 = sampleWrapped(uDetail, cuv * cs2 + vec2(0.71, 0.4), gx * cs2, gy * cs2);
    // The cloud sheet is 512 wide: from this close it gives where weather is, and the detail (and a
    // warp of the lookup) gives its edges.
    float cBase = sampleWrapped(uClouds, cuv + (cd.rg - 0.5) * 0.007, gx, gy).r;
    float cover = cBase * 0.75 + (cd.b - 0.5) * 1.0 + (cd2.b - 0.5) * 0.5 + 0.11;
    // Toward the limb a cloud is seen edge-on through more air: its edges soften instead of drawing a
    // hard white bar.
    float edgeOn = 0.22 * (1.0 - smoothstep(0.04, 0.32, dot(nGeo, V)));
    float cloud = smoothstep(0.5 - edgeOn, 0.7 + edgeOn, cover) * (1.0 - edgeOn * 1.5);

    float lambert = max(ndl, 0.0);
    vec3 ground = albedo * uSunColor * lambert * day * twilight * (1.0 - cloud * 0.4);
    // Cloud shadows: the deck sampled where the ray toward the sun crosses it, so shadows fall beside
    // their clouds and stretch toward the terminator. The world-space offset becomes a uv offset through
    // the screen-space derivatives (a least-squares solve; no tangent frame needed).
    vec3 toward = (uSunDir - nGeo * ndlGeo) * (uCloudHeight / max(ndlGeo, 0.12));
    float a11 = dot(dpx, dpx);
    float a12 = dot(dpx, dpy);
    float a22 = dot(dpy, dpy);
    float b1 = dot(dpx, toward);
    float b2 = dot(dpy, toward);
    vec2 sd = vec2(a22 * b1 - a12 * b2, a11 * b2 - a12 * b1) / max(a11 * a22 - a12 * a12, 1e-12);
    vec2 shift = gx * sd.x + gy * sd.y;
    float shadowBase = sampleWrapped(uClouds, cuv + shift + (cd.rg - 0.5) * 0.007, gx, gy).r;
    float shade = smoothstep(0.5, 0.7, shadowBase * 0.75 + (cd.b - 0.5) * 1.0 + (cd2.b - 0.5) * 0.5 + 0.11);
    ground *= 1.0 - shade * (1.0 - cloud) * 0.6;
    // Sun glint on open water.
    vec3 H = normalize(uSunDir + V);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nGeo, V), 0.0), 5.0);
    float nh = max(dot(nGeo, H), 0.0);
    float glint = (pow(nh, 900.0) * 2.2 + pow(nh, 90.0) * 0.12) * (0.6 + 2.0 * fres);
    ground += uSunColor * twilight * glint * water * day * (1.0 - cloud);

    float cloudLight = max(ndlGeo + 0.08, 0.0);
    vec3 cloudColour = vec3(0.9, 0.94, 1.0) * uSunColor * (0.05 + cloudLight) * day * twilight * (0.8 + 0.25 * cd.b + 0.15 * cd2.b);
    vec3 col = mix(ground, cloudColour, cloud * 0.93);

    // Night side: the canopy's glow, broken by cloud.
    vec3 glowMap = sampleWrapped(uNight, uv, gx, gy).rgb;
    float sparkle = smoothstep(0.6, 0.95, d2.a);
    vec3 glow = glowMap * (0.55 + 0.9 * d1.r + sparkle * 0.8) * uNightGlow;
    col += glow * (1.0 - day) * (1.0 - cloud * 0.8);
    col += albedo * 0.0035 * (1.0 - day);

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,De=`
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,Oe=`
  precision highp float;
  uniform vec3 uCenter;
  uniform float uR;
  uniform float uH;
  uniform vec3 uSunDir;
  uniform vec3 uGlareDir;
  uniform vec3 uSunColor;
  uniform vec3 uBeta;
  uniform float uMie;
  uniform float uDiscHaze;
  uniform float uFade;
  varying vec3 vPosW;
  void main() {
    vec3 ro = cameraPosition;
    vec3 rd = normalize(vPosW - ro);
    vec3 oc = ro - uCenter;
    float tca = -dot(oc, rd);
    float d2 = dot(oc, oc) - tca * tca;
    float b = sqrt(max(d2, 0.0));
    bool hit = b < uR && tca > 0.0;
    vec3 p;
    float column;
    float limbColumn = sqrt(6.2832 * uR / uH);
    if (hit) {
      p = ro + rd * (tca - sqrt(uR * uR - d2));
      float mu = max(dot(normalize(p - uCenter), -rd), 0.0);
      column = min(1.0 / max(mu, 0.02), limbColumn * 0.5);
    } else {
      p = ro + rd * max(tca, 0.0);
      column = exp(-(b - uR) / uH) * limbColumn;
    }
    vec3 np = normalize(p - uCenter);
    float sunAlt = dot(np, uSunDir);
    float lit = smoothstep(-0.24, 0.16, sunAlt);
    vec3 sunTint = mix(vec3(1.0, 0.38, 0.12), vec3(1.0), smoothstep(-0.06, 0.32, sunAlt));
    float cosT = dot(rd, uSunDir);
    float rayleigh = 0.75 * (1.0 + cosT * cosT);
    // The forward lobe follows where the sun is seen (the glare), which the composition places on the
    // limb; the diffuse light follows uSunDir, which is turned toward the camera so the disc is lit.
    float cosG = dot(rd, uGlareDir);
    float g = 0.82;
    float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosG, 1.5) * 0.06;
    float glareLit = smoothstep(-0.2, 0.05, dot(np, uGlareDir));
    vec3 scatter = (1.0 - exp(-column * uBeta)) * rayleigh * lit * sunTint;
    scatter += (1.0 - exp(-column * 0.03)) * mie * uMie * glareLit * vec3(1.0, 0.82, 0.6);
    scatter *= uSunColor;
    // Over the disc the haze is kept light, so the canopy reads green; off the limb it is full.
    if (hit) scatter *= uDiscHaze;
    float alpha = hit ? 1.0 - exp(-column * 0.045) : 0.0;
    gl_FragColor = vec4(scatter * uFade, alpha * uFade);
  }
`,ke=-.0085,Ae=28e-5,je=2.25;function Me(e){let t=new j;t.name=`title-hero-planet`,t.position.copy(e.center);let n=new s(1,.97,.92).multiplyScalar(2.3),r={uDay:{value:e.day},uNight:{value:e.night},uClouds:{value:e.clouds},uDetail:{value:e.detail},uSunDir:{value:e.sunDir},uSunColor:{value:n},uCloudShift:{value:0},uBumpScale:{value:e.radius*.0014},uNightGlow:{value:1.25},uCloudHeight:{value:e.radius*.004},uFade:{value:0}},a=new b(new c(e.radius,e.segments,e.segments/2),new A({vertexShader:Te,fragmentShader:Ee,uniforms:r}));a.name=`title-hero-surface`,a.rotation.y=je;let o=new j;o.rotation.set(.32,0,-.42),o.add(a),t.add(o);let l=e.radius*.0075,u={uCenter:{value:e.center},uR:{value:e.radius},uH:{value:l},uSunDir:{value:e.sunDir},uGlareDir:{value:e.glareDir},uSunColor:{value:new s(1,1,1).multiplyScalar(1.15)},uBeta:{value:new i(.014,.042,.078)},uMie:{value:1},uDiscHaze:{value:.4},uFade:{value:0}},d=new b(new c(e.radius+l*8,e.segments,e.segments/2),new A({vertexShader:De,fragmentShader:Oe,uniforms:u,transparent:!0,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendSrcAlpha:200,blendDstAlpha:201}));return d.name=`title-hero-atmosphere`,t.add(d),{group:t,surface:a,radius:e.radius,update(e){a.rotation.y=je+e*ke,r.uCloudShift.value=e*Ae},setReveal(e,t){r.uFade.value=e,u.uFade.value=t},dispose(){a.geometry.dispose(),a.material.dispose(),d.geometry.dispose(),d.material.dispose()}}}var Ne=`
  varying vec3 vNormalW;
  varying vec3 vLocalN;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vLocalN = normal;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`,Pe=`
  precision highp float;
  uniform sampler2D uDetail;
  uniform vec3 uLight;
  uniform float uFade;
  varying vec3 vNormalW;
  varying vec3 vLocalN;
  void main() {
    vec3 n = normalize(vNormalW);
    vec3 p = normalize(vLocalN);
    // The detail sheet three ways over the sphere: dark maria from the broad height, bright ejecta from
    // the ridges, grain from the fine channel.
    vec3 w = pow(abs(p), vec3(3.0));
    w /= w.x + w.y + w.z;
    vec4 d = texture2D(uDetail, p.yz * 0.7 + 0.31) * w.x + texture2D(uDetail, p.xz * 0.7 + 0.57) * w.y + texture2D(uDetail, p.xy * 0.7 + 0.13) * w.z;
    float albedo = 0.13 + 0.2 * smoothstep(0.3, 0.8, d.r) + 0.08 * d.g + 0.05 * d.a;
    float ndl = dot(n, uLight);
    float lit = smoothstep(-0.03, 0.2, ndl) * (0.3 + 0.7 * max(ndl, 0.0));
    vec3 col = vec3(albedo) * vec3(1.0, 0.97, 0.93) * lit * 1.7;
    // Kethra's light on the night side, very faint.
    col += vec3(0.004, 0.009, 0.011) * (1.0 - lit);
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;function Fe(e){let t={value:0},n=new b(new c(e.radius,40,20),new A({vertexShader:Ne,fragmentShader:Pe,uniforms:{uDetail:{value:e.detail},uLight:{value:e.light},uFade:t}}));return n.name=`title-moon`,n.position.copy(e.position),n.rotation.set(.4,1.2,.2),{mesh:n,setFade(e){t.value=e},dispose(){n.geometry.dispose(),n.material.dispose()}}}var Ie=`
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`,Le=`
  attribute float aCavity;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
`,Re=e=>`
  attribute float aRock;
  attribute float aSeed;
  uniform vec3 uCenter[${e}];
  uniform vec4 uSpin[${e}];
  ${Le}
  ${Ie}
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
`,ze=`
  attribute vec4 aSlot;
  attribute vec2 aDrift;
  attribute vec4 aSpin;
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uTan;
  uniform vec4 uWrap;
  ${Le}
  ${Ie}
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
`,Be=`
  precision highp float;
  uniform sampler2D uRock;
  uniform sampler2D uRockNormal;
  uniform vec3 uSunDir;
  uniform vec3 uRimDir;
  uniform vec3 uSunColor;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    vec3 ln = normalize(vLocalN);
    vec3 w = pow(abs(ln), vec3(4.0));
    w /= w.x + w.y + w.z;
    vec3 p = vLocal * 0.42 + vSeed * 7.0;
    // Colour: three projections, taken to grey and given a per-rock tint.
    float lumX = dot(texture2D(uRock, p.zy).rgb, vec3(0.3, 0.59, 0.11));
    float lumY = dot(texture2D(uRock, p.xz).rgb, vec3(0.3, 0.59, 0.11));
    float lumZ = dot(texture2D(uRock, p.xy).rgb, vec3(0.3, 0.59, 0.11));
    float lum = lumX * w.x + lumY * w.y + lumZ * w.z;
    vec3 tint = mix(vec3(0.95, 0.92, 0.88), vec3(0.86, 0.9, 0.98), vSeed);
    vec3 albedo = tint * (0.045 + lum * 0.3);
    // Grain: the normal map in each projection (whiteout-style blend), in the rock's space, then turned.
    vec2 nx = texture2D(uRockNormal, p.zy).xy * 2.0 - 1.0;
    vec2 ny = texture2D(uRockNormal, p.xz).xy * 2.0 - 1.0;
    vec2 nz = texture2D(uRockNormal, p.xy).xy * 2.0 - 1.0;
    vec3 bent = normalize(ln + (vec3(0.0, nx.y, nx.x) * w.x + vec3(ny.x, 0.0, ny.y) * w.y + vec3(nz.x, nz.y, 0.0) * w.z) * 0.9);
    vec3 n = normalize(spin(bent, vSpin.xyz, vSpin.w));
    vec3 V = normalize(cameraPosition - vPosW);

    float cavity = 1.0 - vCavity * 0.75;
    float ndl = dot(n, uSunDir);
    float key = max(ndl * 0.9 + 0.1, 0.0) * cavity;
    // The seen sun is behind most rocks: their edges toward it catch a hard, warm rim.
    float facing = max(dot(n, V), 0.0);
    float rim = pow(1.0 - facing, 2.4) * max(dot(n, uRimDir) + 0.35, 0.0);
    float bounce = max(dot(n, uBounceDir), 0.0) * cavity;
    // With the sun behind them their faces would be black; the glow of the sky and the limb in front
    // of them gives a faint cool fill, enough for the stone to read.
    vec3 fill = vec3(0.16, 0.2, 0.26) * (0.25 + 0.75 * facing);
    vec3 col = albedo * (uSunColor * key + uBounceColor * bounce + fill);
    col += vec3(1.0, 0.9, 0.78) * rim * (0.4 + 0.9 * lum) * cavity * 1.5;
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;function Ve(e){let t=se(e),n=new Uint8Array(512),r=Array.from({length:256},(e,t)=>t);for(let e=255;e>0;e--){let n=Math.floor(t()*(e+1));[r[e],r[n]]=[r[n],r[e]]}for(let e=0;e<512;e++)n[e]=r[e&255];let i=new Float32Array(256).map(()=>t()),a=(e,t,n)=>e+(t-e)*n,o=e=>e*e*(3-2*e),s=(e,t,r)=>i[n[n[n[e&255]+t&255]+r&255]],c=(e,t,n)=>{let r=Math.floor(e),i=Math.floor(t),c=Math.floor(n),l=o(e-r),u=o(t-i),d=o(n-c);return a(a(a(s(r,i,c),s(r+1,i,c),l),a(s(r,i+1,c),s(r+1,i+1,c),l),u),a(a(s(r,i,c+1),s(r+1,i,c+1),l),a(s(r,i+1,c+1),s(r+1,i+1,c+1),l),u),d)};return(e,t,n,r)=>{let i=0,a=.5,o=1,s=0;for(let l=0;l<r;l++)i+=a*c(e*o,t*o,n*o),s+=a,a*=.5,o*=2.1;return i/s}}function He(e,t,n=`chunky`){let r=Ve(t),a=se(t*7+1),o=new u(1,e);o.deleteAttribute(`uv`),o.deleteAttribute(`normal`),o=D(o);let s=n===`pebble`,c=n===`elongated`?new i(1.5+a()*.25,.6+a()*.15,.65+a()*.15):n===`angular`?new i(1.05,.75+a()*.2,.8+a()*.15):s?new i(1.12,.8+a()*.15,.85+a()*.15):new i(1.15,.6+a()*.25,.72+a()*.23),l=n===`angular`?5+Math.floor(a()*3):s?1+Math.floor(a()*2):3+Math.floor(a()*4),d=n===`angular`?.56:s?.86:.62,f=s?.25:.7,p=s?0:.07,m=Array.from({length:(s?2:5)+Math.floor(a()*4)},()=>({dir:new i(a()-.5,a()-.5,a()-.5).normalize(),size:.16+a()*.32,depth:.05+a()*.08})),h=Array.from({length:l},()=>({n:new i(a()-.5,a()-.5,a()-.5).normalize(),d:d+a()*.22})),g=o.getAttribute(`position`),_=new Float32Array(g.count),v=new i;for(let e=0;e<g.count;e++){v.fromBufferAttribute(g,e).normalize();let t=.97-f*.5+f*r(v.x*1.3+5,v.y*1.3,v.z*1.3,4),n=1-Math.abs(r(v.x*3.2+17,v.y*3.2,v.z*3.2,4)*2-1),i=t+(s?.04:.1)*r(v.x*4+11,v.y*4,v.z*4,3)+p*n*n-.035;for(let e of m){let t=v.distanceTo(e.dir)/e.size;t<1?i-=e.depth*(1-t*t):t<1.45&&(i+=e.depth*.35*(1-Math.abs(t-1.2)/.25)*(t<1.2?(t-1)/.2:1))}_[e]=Math.min(1,Math.max(0,(t-i)*5));for(let e of h){let t=v.dot(e.n);t>.05&&(i=Math.min(i,(e.d+.025*r(v.x*6+3,v.y*6,v.z*6,2))/t))}v.multiplyScalar(i).multiply(c),g.setXYZ(e,v.x,v.y,v.z)}return o.setAttribute(`aCavity`,new x(_,1)),o.computeVertexNormals(),o}var Ue=null;function We(){if(Ue)return Ue;let e=new p,t=(t,n)=>{let r,i=new Promise(e=>r=e),a=e.load(`/kethra-adventure/textures/lichen_rock/`+t,()=>r(),void 0,()=>r());return a.colorSpace=n?_:``,a.wrapS=a.wrapT=S,a.anisotropy=4,{t:a,ready:i}},n=t(`diff.jpg`,!0),r=t(`nor_gl.jpg`,!1);return Ue={map:n.t,normal:r.t,ready:Promise.all([n.ready,r.ready]).then(()=>void 0)},Ue}function Ge(e,t,n,r){let i=We();return new A({vertexShader:e,fragmentShader:Be,uniforms:{uRock:{value:i.map},uRockNormal:{value:i.normal},uSunDir:{value:t.sunDir},uRimDir:{value:t.rimDir},uSunColor:{value:new s(1,.95,.88).multiplyScalar(1.7)},uBounceDir:{value:t.bounceDir},uBounceColor:{value:new s(4164186).multiplyScalar(.4)},uFade:r,...n}})}var Ke=(e,t)=>e[0]+(e[1]-e[0])*t,qe=Math.PI*2,Je=3;async function Ye(e){let t=se(e.seed),n=e.pool.length,r=[],a=new Float32Array(n);for(let i=0;i<n;i++){let[n,o,s]=e.pool[i],c=He(s,101+i*37,o).toNonIndexed();c.scale(n,n,n);let l=c.getAttribute(`position`);for(let e=0;e<l.count;e++)a[i]=Math.max(a[i],Math.hypot(l.getX(e),l.getY(e),l.getZ(e)));c.setAttribute(`aRock`,new x(new Float32Array(l.count).fill(i),1)),c.setAttribute(`aSeed`,new x(new Float32Array(l.count).fill(t()),1)),r.push(c),s>=4&&await e.pace?.()}let o=E(r,!1);for(let e of r)e.dispose();let s=Array.from({length:n},()=>new i),c=Array.from({length:n},()=>new v),l=Array.from({length:n},()=>new i),u=new Float32Array(n),d=new Uint16Array(n),f={value:0},p=new b(o,Ge(Re(n),e,{uCenter:{value:s},uSpin:{value:c}},f));p.name=`title-asteroids`,p.frustumCulled=!1;let{tanH:m,tanV:h}=e.view,g=m,_=h,y=new i,S=(r,i)=>{let o=O.clamp(r/Math.max(n-1,1)+(t()-.5)*.3,0,1),f=e.distance[0]*(e.distance[1]/e.distance[0])**+o,p=a[r]/f,_=i??.5-.5*g/m-p/(2*m)-.02,v=e.bandTop+p/(2*h)+t()*e.bandDepth;s[r].copy(y.set((2*_-1)*m,(1-2*v)*h,-1).normalize()).multiplyScalar(f);let b=2*f*m/Ke(e.crossing,t());l[r].set(b,-b*Ke(e.sink,t()),b*Ke(e.approach,t())),c[r].set(t()-.5,t()-.5,t()-.5,0).normalize(),c[r].w=t()*qe,u[r]=Ke(e.spin,t())/Math.sqrt(Math.max(e.pool[r][0],.3))*(t()<.5?-1:1),d[r]++},C=t=>!e.avoid||e.avoid.points.every(n=>n.distanceTo(s[t])>a[t]+e.avoid.clearance),w=Array.from({length:n},(e,t)=>t);for(let e=n-1;e>0;e--){let n=Math.floor(t()*(e+1));[w[e],w[n]]=[w[n],w[e]]}for(let e=0;e<n;e++){let r=w[e],i=!1;for(let a=0;a<24&&!i;a++)S(r,-.05+1.1*(e+t())/n),i=C(r);i||S(r,null),d[r]=0}return await We().ready,{mesh:p,update(e){let t=Math.min(e,.1),r=.5+.5*g/m+.02,i=.5+.5*_/h+.02;for(let e=0;e<n;e++){let n=s[e].addScaledVector(l[e],t);c[e].w=(c[e].w+u[e]*t)%qe;let o=-n.z;if(o<Je){S(e,null);continue}let d=a[e]/o,f=.5+.5*n.x/o/m-d/(2*m),p=.5-.5*n.y/o/h-d/(2*h);(f>r||p>i)&&S(e,null)}},setView(e,t){g=Math.max(e,m),_=Math.max(t,h)},setFade(e){f.value=e},report(){return s.map((e,t)=>({x:.5+.5*e.x/-e.z/m,y:.5-.5*e.y/-e.z/h,d:-e.z,passes:d[t]}))},dispose(){o.dispose(),p.material.dispose()}}}var Xe=.06;function Ze(e){let t=se(e.seed),{tanH:n,tanV:r}=e.view,a={value:0},o={value:0},s={value:new v},c=(e,t)=>{let i=.5*Math.max(e,n)/n+Xe,a=.5*Math.max(t,r)/r+Xe;s.value.set(.5-i,.5-a,2*i,2*a)};c(n,r);let u=Ge(ze,e,{uTime:a,uTan:{value:new M(n,r)},uWrap:s},o),d=new j;d.name=`title-debris`;let f=[`pebble`,`pebble`,`pebble`],p=[],m=e.count;return f.forEach((a,o)=>{let s=o===f.length-1?m:Math.round(e.count/f.length);m-=s;let c=He(2,911+o*53,a),h=new l;h.index=c.index;for(let e of[`position`,`normal`,`aCavity`])h.setAttribute(e,c.getAttribute(e));h.instanceCount=s;let g=new Float32Array(s*4),_=new Float32Array(s*2),v=new Float32Array(s*4),x=new Float32Array(s),S=new i;for(let i=0;i<s;i++){let a=e.distance[0]*(e.distance[1]/e.distance[0])**+t();g.set([t(),t(),a,a*Ke(e.size,t())],i*4);let o=Ke(e.drift,t())*(e.driftAt/a)**+e.parallax,s=t()*qe;_.set([Math.cos(s)*o,Math.sin(s)*o*(n/r)],i*2),S.set(t()-.5,t()-.5,t()-.5).normalize(),v.set([S.x,S.y,S.z,Ke(e.spin,t())*(t()<.5?-1:1)],i*4),x[i]=t()}h.setAttribute(`aSlot`,new y(g,4)),h.setAttribute(`aDrift`,new y(_,2)),h.setAttribute(`aSpin`,new y(v,4)),h.setAttribute(`aSeed`,new y(x,1)),p.push(h);let C=new b(h,u);C.name=`title-debris-${o}`,C.frustumCulled=!1,d.add(C)}),{group:d,update(e){a.value=e},setView:c,setFade(e){o.value=e},dispose(){for(let e of p)e.dispose();u.dispose()}}}var Qe=()=>new T(2,2),$e=`
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uSize;
  uniform float uDepth;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uCenter + position.xy * vec2(uSize / uAspect, uSize), uDepth, 1.0);
  }
`,et=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float k = exp(-r * r * 2200.0) * 7.0 + exp(-r * 70.0) * 1.3 + exp(-r * 14.0) * 0.28;
    k *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * k * uIntensity, 1.0);
  }
`,tt=`
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
`,nt=`
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
`,rt=`
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
`,it=`
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
`,at=`
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
`,ot=`
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
`,st=`
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 4.0) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * k * vAlpha * uIntensity, 1.0);
  }
`,ct=`
  precision highp float;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;function lt(e){let t=new j;t.name=`title-sky-fx`;let n={value:16/9},r=new M,a={value:r},o={value:0},s={value:0},c={value:.9999},l=new A({vertexShader:$e,fragmentShader:et,uniforms:{uCenter:a,uAspect:n,uSize:{value:.5},uDepth:c,uIntensity:o},transparent:!0,depthWrite:!1,blending:2}),u=new b(Qe(),l);u.frustumCulled=!1,u.renderOrder=20,t.add(u);let d=new A({vertexShader:$e,fragmentShader:tt,uniforms:{uCenter:a,uAspect:n,uSize:{value:.95},uDepth:{value:0},uIntensity:o,uTime:s},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),p=new b(Qe(),d);p.frustumCulled=!1,p.renderOrder=900,t.add(p);let m=[[.22,.035,[.25,.55,.6]],[.42,.06,[.5,.42,.25]],[.62,.022,[.3,.6,.9]]],h=[],g=[],_=[],v=[],y=[],S=[];m.forEach(([e,t,n],r)=>{for(let[r,i]of[[-1,-1],[1,-1],[1,1],[-1,1]])h.push(0,0,0),g.push(r,i),_.push(e),v.push(t),y.push(...n);S.push(r*4,r*4+1,r*4+2,r*4,r*4+2,r*4+3)});let C=new ne;C.setAttribute(`position`,new f(h,3)),C.setAttribute(`aCorner`,new f(g,2)),C.setAttribute(`aAlong`,new f(_,1)),C.setAttribute(`aSize`,new f(v,1)),C.setAttribute(`aTint`,new f(y,3)),C.setIndex(S);let ee={value:0},T=new b(C,new A({vertexShader:nt,fragmentShader:rt,uniforms:{uSun:a,uAspect:n,uIntensity:ee},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}));T.frustumCulled=!1,T.renderOrder=901,t.add(T);let E={uHead:{value:new M},uDir:{value:new M(-.8,-.6)},uLength:{value:.22},uWidth:{value:e.meteors.width},uAspect:n,uIntensity:{value:0}},D=new b(Qe(),new A({vertexShader:it,fragmentShader:at,uniforms:E,depthWrite:!1,blending:2}));D.frustumCulled=!1,D.renderOrder=-998,D.visible=!1,t.add(D);let O=se(255968),te=!0,k=e.meteors,re=k.first,ie=-1,ae=new M,oe=new Float32Array(e.dust.count*3),ce=new Float32Array(e.dust.count);for(let t=0;t<e.dust.count;t++)oe[t*3]=e.dust.boxMin.x+O()*e.dust.boxSize.x,oe[t*3+1]=e.dust.boxMin.y+O()*e.dust.boxSize.y,oe[t*3+2]=e.dust.boxMin.z+O()*e.dust.boxSize.z,ce[t]=O();let le=new ne;le.setAttribute(`position`,new x(oe,3)),le.setAttribute(`aSeed`,new x(ce,1));let ue={value:0},de={value:1},fe=new w(le,new A({vertexShader:ot,fragmentShader:st,uniforms:{uTime:s,uStream:{value:e.dust.stream},uBoxMin:{value:e.dust.boxMin},uBoxSize:{value:e.dust.boxSize},uPixelRatio:de,uIntensity:ue},transparent:!0,depthWrite:!1,blending:2}));fe.frustumCulled=!1,fe.renderOrder=10,fe.onBeforeRender=e=>{de.value=e.getPixelRatio()},t.add(fe);let pe={value:0},me=new b(Qe(),new A({vertexShader:`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:ct,uniforms:{uOpacity:pe},transparent:!0,depthWrite:!1,depthTest:!1}));me.frustumCulled=!1,me.renderOrder=1e4,me.visible=!1,t.add(me);let he=new i,ge=new i;return{group:t,update(t,i,a){if(s.value=a,n.value=t.aspect,he.copy(e.sunDir).multiplyScalar(e.coreDistance).add(t.position),ge.copy(he).project(t),r.set(ge.x,ge.y),c.value=Math.min(ge.z,.99999),ie>=0){ie+=i;let e=ie/k.seconds;e>=1?(ie=-1,D.visible=!1,re=k.every[0]+O()*(k.every[1]-k.every[0])):(E.uHead.value.copy(E.uDir.value).multiplyScalar(e*k.travel).add(ae),E.uIntensity.value=Math.sin(Math.PI*e)*k.brightness)}else if(te&&(re-=i)<=0){let[e,t,r,i]=k.area;ae.set((e+O()*(r-e))*n.value,t+O()*(i-t));let a=k.heading[0]+O()*(k.heading[1]-k.heading[0]);E.uDir.value.set(Math.cos(a),Math.sin(a)),E.uLength.value=k.length[0]+O()*(k.length[1]-k.length[0]),ie=0,D.visible=!0}},setGlare(e){o.value=e,ee.value=e*.05},setDust(e){ue.value=e},setVeil(e){pe.value=e,me.visible=e>0},setMeteors(e){te=e},dispose(){t.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var N=0,P=1,ut=2,F=3,dt=4,I=5,ft=6,pt=7,mt=-5.45,ht=64,gt=.3,_t=.4,L=(e,t,n)=>new i(e,t,n),vt=L(0,1,0),R=L(-1,0,0);function z(e){let t=new i;for(let n of e)t.add(n);return t.divideScalar(e.length)}function B(e,t){if(t<=e[0][0])return e[0].slice(1);for(let n=0;n<e.length-1;n++){let r=e[n],i=e[n+1];if(t<=i[0]){let e=(t-r[0])/(i[0]-r[0]);return r.slice(1).map((t,n)=>t+(i[n+1]-t)*e)}}return e[e.length-1].slice(1)}var yt=new i,bt=new i,xt=new i,St=new i,Ct=new i,wt=class{pos=[];mat=[];uv;kind=N;tint=1;seed=0;xf=null;flip=!1;uvs=null;rand;constructor(e,t=!1){this.rand=e,this.uv=t?[]:null}get triangles(){return this.pos.length/9}use(e,t=1){return this.kind=e,this.tint=t,this.seed=this.rand(),this}place(e){return this.xf=e,this.flip=!!e&&e.determinant()<0,this}triN(e,t,n,r,i=this.tint){if(yt.subVectors(t,e),bt.subVectors(n,e),xt.crossVectors(yt,bt),xt.lengthSq()<1e-14)return;let a=xt.dot(r)>=0;this.flip&&(a=!a);let o=this.uvs;this.push(e,i,o?.[0]),a?(this.push(t,i,o?.[1]),this.push(n,i,o?.[2])):(this.push(n,i,o?.[2]),this.push(t,i,o?.[1]))}push(e,t,n){let r=this.xf?St.copy(e).applyMatrix4(this.xf):e;this.pos.push(r.x,r.y,r.z),this.mat.push(this.kind,t,this.seed),this.uv&&this.uv.push(n?n[0]:0,n?n[1]:0)}tri(e,t,n,r,i=!1,a=this.tint){let o=Ct.copy(e).add(t).add(n).divideScalar(3).sub(r);i&&o.negate(),this.triN(e,t,n,o,a)}quadN(e,t,n,r,i,a=this.tint){this.triN(e,t,n,i,a),this.triN(e,n,r,i,a)}quad(e,t,n,r,i,a=!1){this.tri(e,t,n,i,a),this.tri(e,n,r,i,a)}quadUv(e,t,n,r,i,a,o=this.tint){this.uvs=[a[0],a[1],a[2]],this.triN(e,t,n,i,o),this.uvs=[a[0],a[2],a[3]],this.triN(e,n,r,i,o),this.uvs=null}loft(e,t=[!0,!0],n=!1){let r=e[0].length,a=e.map(z);for(let t=0;t<e.length-1;t++){let i=e[t],o=e[t+1],s=a[t].clone().add(a[t+1]).multiplyScalar(.5);for(let e=0;e<r;e++){let t=(e+1)%r;this.quad(i[e],i[t],o[t],o[e],s,n)}}let o=a.reduce((e,t)=>e.add(t),new i).divideScalar(a.length),s=t=>{let n=e[t],i=a[t].clone().sub(o);for(let e=0;e<r;e++)this.triN(a[t],n[e],n[(e+1)%r],i)};t[0]&&s(0),t[1]&&s(e.length-1)}},V=(e,t)=>t.map(([t,n])=>L(e,t,n));function Tt(e,t,n,r,i){let a=Math.max(1e-4,Math.min(i,n*.45,r*.45));return[[e+n,t+r-a],[e+n,t-r+a],[e+n-a,t-r],[e-n+a,t-r],[e-n,t-r+a],[e-n,t+r-a],[e-n+a,t+r],[e+n-a,t+r]]}function Et(e,t,n=.03,r=[!0,!0]){let i=t.map(([e,t,r,i,a=0])=>V(e,Tt((t+r)/2,a,(r-t)/2,i,n)));return e.loft(i,r),i}function H(e,t,n,r,i,a,o,s=0,c=.03){let l=Math.min(c,(n-t)*.3,(i-r)*.3),u=(e,t)=>Tt((r+i)/2,s,(i-r)/2-t,a+(o-a)*e-t,c),d=n-t;e.loft([V(t,u(0,l)),V(t+l,u(l/d,0)),V(n-l,u(1-l/d,0)),V(n,u(1,l))])}function U(e,t,n,r){let i=r/Math.cos(Math.PI/8),a=[];for(let r=0;r<8;r++){let o=(r+.5)*Math.PI/4;a.push(L(e,t+Math.sin(o)*i,n+Math.cos(o)*i))}return a}function W(e,t,n,r,a=6){let o=n.clone().sub(t).normalize(),s=Math.abs(o.y)<.9?new i().crossVectors(o,vt).normalize():new i().crossVectors(o,R).normalize(),c=new i().crossVectors(o,s),l=e=>{let t=[];for(let n=0;n<a;n++){let i=(n+.5)/a*Math.PI*2;t.push(e.clone().addScaledVector(s,Math.cos(i)*r).addScaledVector(c,Math.sin(i)*r))}return t};e.loft([l(t),l(n)])}function Dt(e,t){let n=e.length,r=[];for(let i=0;i<n;i++){let a=e[i],o=e[(i+n-1)%n],s=e[(i+1)%n],c=a[0]-o[0],l=a[1]-o[1],u=Math.hypot(c,l)||1;c/=u,l/=u;let d=s[0]-a[0],f=s[1]-a[1],p=Math.hypot(d,f)||1;d/=p,f/=p;let m=t/Math.max(.3,1+(-l*-f+c*d));r.push([a[0]+(-l-f)*m,a[1]+(c+d)*m])}return r}var Ot=e=>e.reduce((t,n,r)=>t+n[0]*e[(r+1)%e.length][1]-e[(r+1)%e.length][0]*n[1],0);function G(e,t,n,r,i,a=.02,o=.03){let s=Ot(t)<0?[...t].reverse():t,c=Math.min(a,i*.5),l=c>0?Dt(s,c):s,u=s.map(([e,t])=>n(e,t).addScaledVector(r,-o)),d=s.map(([e,t])=>n(e,t).addScaledVector(r,i-c)),f=l.map(([e,t])=>n(e,t).addScaledVector(r,i)),p=z(d),m=z(f),h=s.length;for(let t=0;t<h;t++){let n=(t+1)%h,i=d[t].clone().add(d[n]).multiplyScalar(.5).sub(p);e.quadN(u[t],u[n],d[n],d[t],i),c>0&&e.quadN(d[t],d[n],f[n],f[t],i.normalize().add(r)),e.triN(m,f[t],f[n],r)}return f}var K=(e,t,n)=>(r,i)=>e.clone().addScaledVector(t,r).addScaledVector(n,i);function q(e,t,n,r,i=.006){let a=n.clone().normalize(),o=t.map(e=>e.clone().addScaledVector(a,i));e.use(I,r),e.quadN(o[0],o[1],o[2],o[3],a)}var kt=1024,At=512,jt={number:[0,0,256,160],code:[256,0,384,88],emblem:[656,0,176,176],warn:[848,0,128,112],hazard:[0,176,512,48],nostep:[512,176,256,56],maint:[0,240,448,44],serial:[0,296,640,40],vent:[512,240,256,44],arrows:[768,176,224,56]};function J(e,t,n,r,a){let[o,s,c,l]=jt[a.cell],u=z(t),d=t[1].clone().sub(t[0]),f=t[3].clone().sub(t[0]),p=a.right??(Math.abs(n.y)<.7?new i().crossVectors(vt,n).normalize():L(0,0,1)),m=Math.abs(d.dot(p))/d.length()>=Math.abs(f.dot(p))/f.length(),h=(m?d:f).clone(),g=h.length();h.normalize(),h.dot(p)<0&&h.negate();let _=(m?f:d).length(),v=new i().crossVectors(n,h).normalize(),y=a.fill??.8,b=c/l*(a.stretch??1),x=g*y/2,S=x/b;S*2>_*y&&(S=_*y/2,x=S*b);let C=u.clone().addScaledVector(v,(a.offset??0)*_).addScaledVector(n,.004),w=(e,t)=>C.clone().addScaledVector(h,e*x).addScaledVector(v,t*S),ee=o/kt,T=(o+c)/kt,E=1-(s+l)/At,D=1-s/At;e.use(r,a.paint),e.quadUv(w(-1,-1),w(1,-1),w(1,1),w(-1,1),n,[[ee,E],[T,E],[T,D],[ee,D]])}async function Mt(){await e();let t=document.createElement(`canvas`);t.width=kt,t.height=At;let n=t.getContext(`2d`);n.fillStyle=`#fff`,n.strokeStyle=`#fff`,n.textAlign=`center`,n.textBaseline=`middle`;let i=(e,t,r,i=0)=>{let[a,o,s,c]=jt[e];n.font=r,n.letterSpacing=`${i}px`,n.fillText(t,a+s/2+i/2,o+c/2+2,s-8)};i(`number`,`07`,`700 168px Rajdhani, "Segoe UI", sans-serif`,4),i(`code`,`AR-07`,`700 80px Rajdhani, "Segoe UI", sans-serif`,10),i(`serial`,`ARK LTD  ·  HULL 2291-07  ·  KESSIC SURVEY`,`600 30px Rajdhani, "Segoe UI", sans-serif`,4),i(`maint`,`MAINT ACCESS 14`,`700 36px Rajdhani, "Segoe UI", sans-serif`,6),i(`vent`,`COOLANT VENT`,`700 34px Rajdhani, "Segoe UI", sans-serif`,5);{let[e,t,r,a]=jt.nostep;n.lineWidth=4,n.strokeRect(e+4,t+4,r-8,a-8),i(`nostep`,`NO STEP`,`700 34px Rajdhani, "Segoe UI", sans-serif`,6)}{let[e,t,r]=jt.emblem,i=e+r/2,a=t+r/2,o=r/176;n.beginPath(),n.moveTo(i,a-34*o),n.lineTo(i+20*o,a-6*o),n.lineTo(i,a+22*o),n.lineTo(i-20*o,a-6*o),n.closePath(),n.fill();for(let e of[-1,1])n.beginPath(),n.moveTo(i+e*26*o,a-10*o),n.lineTo(i+e*84*o,a-40*o),n.lineTo(i+e*70*o,a-18*o),n.lineTo(i+e*30*o,a+6*o),n.closePath(),n.fill(),n.beginPath(),n.moveTo(i+e*30*o,a+12*o),n.lineTo(i+e*66*o,a-6*o),n.lineTo(i+e*56*o,a+10*o),n.lineTo(i+e*30*o,a+24*o),n.closePath(),n.fill();n.lineWidth=9*o,n.beginPath(),n.moveTo(i-40*o,a+44*o),n.lineTo(i,a+66*o),n.lineTo(i+40*o,a+44*o),n.stroke()}{let[e,t,r,i]=jt.warn;n.lineWidth=8,n.beginPath(),n.moveTo(e+r/2,t+8),n.lineTo(e+r-8,t+i-8),n.lineTo(e+8,t+i-8),n.closePath(),n.stroke(),n.fillRect(e+r/2-5,t+40,10,34),n.fillRect(e+r/2-5,t+82,10,10)}{let[e,t,r,i]=jt.hazard;n.save(),n.beginPath(),n.rect(e,t,r,i),n.clip(),n.fillStyle=`#1b1c1e`,n.fillRect(e,t,r,i),n.fillStyle=`#b09662`;for(let a=e-i;a<e+r+i;a+=48)n.beginPath(),n.moveTo(a,t+i),n.lineTo(a+24,t+i),n.lineTo(a+24+i,t),n.lineTo(a+i,t),n.closePath(),n.fill();n.restore()}{let[e,t,,r]=jt.arrows;n.lineWidth=7;for(let i=0;i<4;i++){let a=e+24+i*50;n.beginPath(),n.moveTo(a,t+10),n.lineTo(a+22,t+r/2),n.lineTo(a,t+r-10),n.stroke()}}let o=new a(t);return o.colorSpace=_,o.anisotropy=8,o.minFilter=r,o.name=`title-ship-markings`,o}var Nt=.026;function Pt(e,t){return e.map((n,r)=>{let i=e[(r+1)%4],a=e[(r+3)%4];return n.clone().addScaledVector(i.clone().sub(n).normalize(),t[(r+3)%4]).addScaledVector(a.clone().sub(n).normalize(),t[r])})}function Ft(e,t,n,r){let i=Math.min(.016,r*.4),a=t.map(e=>e.clone().addScaledVector(n,-.012)),o=t.map(e=>e.clone().addScaledVector(n,r-i)),s=Pt(t,[i,i,i,i]).map(e=>e.addScaledVector(n,r)),c=z(o);for(let t=0;t<4;t++){let r=(t+1)%4,i=o[t].clone().add(o[r]).multiplyScalar(.5).sub(c);e.quadN(a[t],a[r],o[r],o[t],i),e.quadN(o[t],o[r],s[r],s[t],i.normalize().add(n))}return e.quadN(s[0],s[1],s[2],s[3],n),s}function It(e,t,n,r){let{hull:i,rand:a}=e,o=t[1].clone().sub(t[0]),s=o.length();o.divideScalar(s);let c=t[3].clone().sub(t[0]),l=c.length();c.divideScalar(l);let u=K(t[0],o,c),d=2+Math.floor(a()*3);for(let e=0;e<d;e++){let e=a()*.55*s,t=Math.min(s*.96,e+(.25+a()*.5)*s),o=a()*.6*l,c=Math.min(l*.95,o+(.2+a()*.4)*l),d=r*(.35+a()*.55);if(a()<.35){let r=Math.min(.028,(c-o)*.4),s=(o+c)/2;i.use(F,.7+a()*.4),W(i,u(e,s).addScaledVector(n,r),u(t,s).addScaledVector(n,r),r,6)}else i.use(a()<.5?F:dt,.6+a()*.5),G(i,[[e,o],[t,o],[t,c],[e,c]],u,n,d,d*.3,.01)}if(a()<.2){let e=(.2+a()*.6)*s,t=(.2+a()*.6)*l;i.use(I,.5),G(i,[[e,t],[e+.035,t],[e+.035,t+.035],[e,t+.035]],u,n,r*.5,0,.01)}}function Lt(e,t,n,r){let i=e.hull,a=t[1].clone().sub(t[0]),o=t[3].clone().sub(t[0]),s=a.length()>=o.length(),c=s?a:o,l=s?o:a,u=c.length(),d=l.length(),f=c.clone().normalize(),p=l.clone().normalize(),m=K(t[0],f,p),h=Math.min(14,Math.floor(u/.05)),g=u/h;i.use(F,.55);for(let e=0;e<h;e++){let t=(e+.3)*g;G(i,[[t,d*.06],[t+g*.45,d*.06],[t+g*.45,d*.94],[t,d*.94]],m,n,r*.7,0,.01)}}function Rt(e,t,n,r){if(r.style===`skip`)return;let i=e.hull,a=[0,1,2,3].map(()=>e.rand()<.18?Nt*2.6:Nt);r.lamp!==void 0&&(a[r.lamp]=Nt*2.2);let o=Pt(t,a);if(r.lamp!==void 0){let e=r.lamp,a=(e+1)%4;q(i,[t[e].clone().lerp(t[a],.06).lerp(o[e].clone().lerp(o[a],.06),.25),t[e].clone().lerp(t[a],.94).lerp(o[e].clone().lerp(o[a],.94),.25),t[e].clone().lerp(t[a],.94).lerp(o[e].clone().lerp(o[a],.94),.75),t[e].clone().lerp(t[a],.06).lerp(o[e].clone().lerp(o[a],.06),.75)],n,r.lampTint??.6,.004)}if(r.style===`bay`){It(e,o,n,r.h);return}if(r.style===`vent`){Lt(e,o,n,r.h);return}i.use(r.kind,r.tint);let s=Ft(i,o,n,r.h);if(r.style===`double`){let t=s[1].distanceTo(s[0]),a=s[3].distanceTo(s[0]),o=t*(.12+e.rand()*.1),c=a*(.14+e.rand()*.1),l=Pt(s,[c,o,c,o]);i.use(r.kind,r.tint*(r.kind===P?.94:1.12)),s=Ft(i,l,n,r.h*.6)}r.decal&&J(e.decals,s,n,r.kind,r.decal)}function Y(e,t,n){let{hull:r,rand:a}=e;r.use(n.base??ut,1),r.loft(t,n.caps??[!1,!1]);let o=t[0].length,s=t.length-1,c=t.map(z);for(let r=0;r<s;r++){let l=t[r],u=t[r+1],d=c[r].clone().add(c[r+1]).multiplyScalar(.5);for(let t=0;t<o;t++){let c=(t+1)%o,f=(l[t].distanceTo(u[t])+l[c].distanceTo(u[c]))/2,p=(l[t].distanceTo(l[c])+u[t].distanceTo(u[c]))/2;if(f<.05||p<.05)continue;let m=Math.max(1,Math.round(f/n.along)),h=Math.max(1,Math.ceil(p/n.across-.2)),g=e=>{let t=[0];for(let n=1;n<e;n++)t.push((n+(a()-.5)*.45)/e);return t.push(1),t},_=g(m),v=g(h),y=(e,n)=>l[t].clone().lerp(l[c],n).lerp(u[t].clone().lerp(u[c],n),e);for(let a=0;a<m;a++)for(let o=0;o<h;o++){let c=[y(_[a],v[o]),y(_[a+1],v[o]),y(_[a+1],v[o+1]),y(_[a],v[o+1])],l=z(c),u=new i().crossVectors(c[2].clone().sub(c[0]),c[3].clone().sub(c[1])).normalize();u.dot(l.clone().sub(d))<0&&u.negate(),Rt(e,c,u,n.paint({c:l,n:u,t:(r+(_[a]+_[a+1])/2)/s,u:(v[o]+v[o+1])/2,span:r,edge:t,len:f*(_[a+1]-_[a]),wid:p*(v[o+1]-v[o])}))}}}}function X(e,t,n={}){let r=e(),i=n.lamps??.07,a=t.len>.28&&e()<i?e()<.5?0:2:void 0,o=t.n.y;if(o>.45){let t=e()<(n.light??.78);return{style:r<.15?`double`:r<.15+(n.bays??.05)?`bay`:`plate`,kind:t?P:N,tint:t?e()<.12?.62:.8+e()*.22:.9+e()*.3,h:.045+e()*.02,lamp:a}}if(o>-.45){let t=e()<(n.light??.2);return{style:r<.16?`double`:r<.16+(n.bays??.09)?`bay`:r<.3?`vent`:`plate`,kind:t?P:N,tint:t?.72+e()*.16:.85+e()*.35,h:.04+e()*.025,lamp:a}}return{style:r<.1?`double`:r<.1+(n.bays??.14)?`bay`:r<.32?`vent`:`plate`,kind:N,tint:.8+e()*.35,h:.04+e()*.02,lamp:a!==void 0&&e()<.2?a:void 0}}var zt=(e,t,n,r,i)=>e.x>t&&e.x<n&&Math.abs(e.z)>r&&Math.abs(e.z)<i;function Bt(e,t,n,r,i,a){let o=i*1.7;e.use(dt,.95),e.loft([U(a,n,r,i*1.28),U(t+.06,n,r,i*1.28),U(t,n,r,i*1.2)],[!1,!1]);let s=U(t,n,r,i*1.2),c=U(t,n,r,i*1.04);e.use(F,.85);for(let t=0;t<8;t++)e.quadN(s[t],s[(t+1)%8],c[(t+1)%8],c[t],R);let l=[[0,1.04,.05],[.3,.98,.22],[.62,.9,.5],[1,.84,.95]];e.use(ft);for(let a=0;a<l.length-1;a++){let[s,c,u]=l[a],[d,f,p]=l[a+1],m=U(t+o*s,n,r,i*c),h=U(t+o*d,n,r,i*f),g=L(t+o*(s+d)*.5,n,r);for(let t=0;t<8;t++){let n=(t+1)%8;e.tri(m[t],m[n],h[n],g,!0,u),e.tri(m[t],h[n],h[t],g,!0,(u+p)/2)}}e.use(F,.45);for(let[a,s]of[[.3,.98],[.62,.9]]){let c=t+o*a,l=U(c,n,r,i*s),u=U(c,n,r,i*(s-.13));for(let t=0;t<8;t++)e.quadN(l[t],l[(t+1)%8],u[(t+1)%8],u[t],R)}let u=t+o,d=U(u,n,r,i*.84),f=U(u,n,r,i*.42);e.use(ft);for(let t=0;t<8;t++)e.quadN(d[t],d[(t+1)%8],f[(t+1)%8],f[t],R,1);e.use(pt);let p=L(u,n,r);for(let t=0;t<8;t++)e.triN(p,f[t],f[(t+1)%8],R);return{at:L(t,n,r),r:i}}function Vt(e,t,n,r=.07){let a=n.clone().normalize(),o=Math.abs(a.y)<.9?new i().crossVectors(a,vt).normalize():L(1,0,0),s=new i().crossVectors(a,o);e.use(dt,.9);let c=z(G(e,[[-r,-r*.6],[r,-r*.6],[r,r*.6],[-r,r*.6]],K(t,o,s),a,r*.6,r*.15,.04));for(let t of[-1,1]){let n=c.clone().addScaledVector(o,t*r*.45),i=(e,t)=>n.clone().addScaledVector(o,e*r*.26).addScaledVector(s,t*r*.3);q(e,[i(-1,-1),i(1,-1),i(1,1),i(-1,1)],a,.25,.003)}}function Ht(e,t,n){e.use(F,.7),G(e,(e=>U(0,0,0,e).map(e=>[e.y,e.z]))(n),K(t,L(1,0,0),L(0,0,1)),vt,n*.3,n*.1,.03),e.use(N,1.25);let r=t.y+n*.25;Et(e,[[t.x-n*.9,r,r+n*.75,n*.7,t.z],[t.x+n*.45,r,r+n*.75,n*.7,t.z],[t.x+n*.95,r,r+n*.4,n*.5,t.z]],n*.12),e.use(F,1);for(let i of[-.28,.28]){let a=r+n*.42;W(e,L(t.x+n*.8,a,t.z+i*n),L(t.x+n*3.2,a,t.z+i*n),n*.09,6)}e.use(I,.5),H(e,t.x+n*.46,t.x+n*.62,r+n*.52,r+n*.62,n*.5,n*.4,t.z,.004)}var Ut=[[-5.45,.84,-.88,.98,.52,.56,.3,.26],[-5.05,.88,-.92,1,.52,.58,.31,.26],[-3.2,1,-1,1.06,.54,.62,.34,.28],[-.6,1.04,-1.02,1.08,.54,.62,.34,.28],[1.6,1.06,-1.02,1.08,.52,.62,.36,.28],[2.7,1.08,-1.04,1.08,.46,.62,.4,.3],[3.8,1.04,-1.04,1.06,.34,.6,.46,.32],[4.9,.88,-1,1,.26,.54,.46,.34],[5.6,.68,-.92,.9,.2,.46,.4,.34],[6.1,.46,-.8,.78,.16,.38,.3,.3]],Z=e=>B(Ut,e),Wt=e=>Z(e)[0];function Gt(e){let[t,n,r,i,a,o,s]=Z(e);return V(e,[[t,i],[t,-i],[t-o,-r],[n+s,-r],[n,-a],[n,a],[n+s,r],[t-o,r]])}var Kt=[[-3.9,.8,1.5,.76,.48],[-3.5,.8,1.86,.82,.54],[-.3,.8,1.96,.86,.58],[.8,.8,1.88,.82,.52],[1.5,.8,1.36,.68,.4]],qt=e=>B(Kt,e);function Jt(e){let[t,n,r,i]=qt(e);return V(e,[[n,i],[n,-i],[n-.2,-r],[t,-r],[t,r],[n-.2,r]])}var Yt=[[-5.35,.6,2.86,.92,-.92],[-4.95,.6,2.94,.98,-.98],[-4.4,.6,3,1,-1.02],[-2.4,.6,3.06,1.02,-1.04],[-.4,.6,3.04,1.02,-1.04],[1.2,.6,2.86,.98,-1],[2.1,.6,2.3,.88,-.9],[2.75,.6,1.24,.66,-.66]],Xt=e=>B(Yt,e);function Zt(e,t,n){let[r,i,a,o]=Xt(e),s=n??r,c=Math.min(.44,(i-r)*.3),l=Math.min(.38,(i-r)*.26),u=1-Math.SQRT1_2;return V(e,[[a,t*s],[a,t*(i-c)],[a-c*u,t*(i-c*u)],[a-c,t*i],[o+l,t*i],[o+l*u,t*(i-l*u)],[o,t*(i-l)],[o,t*s]])}function Qt(e,t,n,r,i,a){let o=[L(0,1,0),L(0,.924,.383*t),L(0,.707,.707*t),L(0,.383,.924*t),L(0,0,t)],s=[0,.15,.4,.62,1],c=(e,n)=>{let r=Zt(e,t);return n===0?r[0].clone().lerp(r[1],.9):n===4?r[3].clone().lerp(r[4],.5):r[n].clone()},l=(e,t,i)=>c(n+(r-n)*e-a*s[t],t).addScaledVector(o[t],i),u=Math.max(1,Math.ceil((r-n)/.5)),d=.035/(r-n),f=Array.from({length:u+1},(e,t)=>t/u),p=f.map((e,t)=>t===0?d:t===u?1-d:e);for(let n=0;n<u;n++){for(let t=0;t<4;t++)e.quadN(l(p[n],t,i),l(p[n+1],t,i),l(p[n+1],t+1,i),l(p[n],t+1,i),o[t].clone().add(o[t+1]));e.quadN(l(f[n],0,-.01),l(f[n+1],0,-.01),l(p[n+1],0,i),l(p[n],0,i),L(0,.3,-t)),e.quadN(l(f[n],4,-.01),l(f[n+1],4,-.01),l(p[n+1],4,i),l(p[n],4,i),L(0,-1,.3*t))}for(let[t,n,r]of[[1,1-d,L(1,0,0)],[0,d,L(-1,0,0)]])for(let a=0;a<4;a++)e.quadN(l(t,a,-.01),l(t,a+1,-.01),l(n,a+1,i),l(n,a,i),r);let m=(e,t)=>l(e,3,i+.004).lerp(l(e,4,i+.004),t);q(e,[m(.06,.86),m(.94,.86),m(.94,.95),m(.06,.95)],o[3].clone().add(o[4]),.8,0)}var $t=[[-4.3,.95,2.5,1.2],[-1.1,.95,2.64,1.24],[.6,.95,2.4,1.18],[1.5,.95,1.7,1.06]],en=e=>B($t,e);function tn(e,t){let[n,r,i]=en(e);return V(e,[[i,t*(n+.1)],[i,t*(r-.14)],[i-.12,t*r],[.92,t*(r+.04)],[.92,t*n],[i-.1,t*n]])}var nn=[[2.85,-1,-4.65,-.02,.62],[3.85,-2.2,-5.1,.02,.54],[4.6,-3.2,-5.55,.06,.46]];function rn(e,t,n=1){let[r,i,a,o]=B(nn,e),s=o*n,c=r-i;return[L(r,a+s*.15,t*e),L(r-.08*c,a+s/2,t*e),L(i+.05*c,a+s/2,t*e),L(i,a+s*.2,t*e),L(i+.04*c,a-s/2,t*e),L(r-.1*c,a-s/2,t*e)]}var an=[[-5.2,-.78,-1.2,.4],[-3.8,-.84,-1.32,.54],[1.4,-.86,-1.36,.56],[3.4,-.86,-1.3,.52],[4.8,-.82,-1.22,.46],[5.75,-.68,-1.06,.38]];function on(e){let[t,n,r]=B(an,e);return V(e,[[t,r],[t,-r],[n+.08,-r],[n,-r+.1],[n,r-.1],[n+.08,r]])}var Q={style:`skip`,kind:0,tint:0,h:0};function sn(e,t){let n=new te().setFromPoints(e),r=n.getCenter(new i),a=n.getSize(new i).multiplyScalar(.5),o=(a.y-t)/a.y,s=(a.z-t)/a.z;return e.map(e=>L(e.x,r.y+(e.y-r.y)*o,r.z+(e.z-r.z)*s))}function cn(e,t,n,r,i){let a=e.hull;Y(e,[t,n],{along:.5,across:.6,paint:i});let o=sn(t,r).map(e=>e.setX(e.x+.02)),s=sn(n,r);a.use(ut,.22),a.loft([o,s],[!1,!1],!0),a.use(F,.8);let c=n.length;for(let e=0;e<c;e++)a.quadN(n[e],n[(e+1)%c],s[(e+1)%c],s[e],R);return[n,s]}function ln(e,t,n,r,i,a,o=.85){let{hull:s,rand:c}=e,l=(e,t)=>L(e,a(e),t);for(let e of[1,-1]){let u=t;for(;u<n-.2;){let t=Math.min(n,u+.45+c()*.4),d=c()<o;s.use(d?P:N,d?c()<.12?.64:.8+c()*.2:1.1);let f=Math.min(i(u),i(t))-.03,p=(u+t)/2,m=L(-(a(p+.05)-a(p-.05))/.1,1,0).normalize(),h=G(s,[[u,e*r],[t,e*r],[t,e*f],[u,e*f]],l,m,.05,.016);c()<.25&&(s.use(d?P:N,d?.84:1.2),Ft(s,Pt(h,[.05,.08,.05,.08]),m,.03)),u=t+.045}}}function un(e,t,n,r,a,o){let s=n.clone().sub(t),c=s.length();s.divideScalar(c);let l=new i().crossVectors(r,s).normalize();G(e,[[-a*.3,-a/2],[c+a*.3,-a/2],[c+a*.3,a/2],[-a*.3,a/2]],K(t,s,l),r,o,Math.min(.012,o*.3),.01)}function dn(e,t,n,r,i,a,o){let s=e=>U(0,0,0,a*e).map(e=>[e.y,e.z]);for(let a of t){let t=K(a,n,r);e.use(F,.95),G(e,s(1),t,i,.022,.008,.01),e.use(ut,1),G(e,s(.78),t,i,.025,0,.004),e.use(ft,o),G(e,s(.45),t,i,.027,0,.002)}}async function fn(e,t){let n=new wt(e),r=new wt(e,!0),a={hull:n,decals:r,rand:e},o=[],s=[1,-1];Y(a,[-4.9,-3.2,-.6,1.6,2.7].map(Gt),{along:.8,across:.6,caps:[!0,!1],paint:t=>{let n=t.edge;return t.c.x<1.6||n===0||n===2||n===4||n===6?Q:n===3||n===5?{...X(e,t),style:`plate`}:X(e,t,{lamps:.08,light:.8})}});let[c,l]=cn(a,Gt(-4.9),Gt(-5.45),.08,t=>t.edge===0||t.edge===2||t.edge===6?Q:X(e,t,{lamps:.1,light:.8}));J(r,[c[0],c[1],l[1],l[0]],R,F,{cell:`hazard`,paint:1,right:L(0,0,1),fill:.86,stretch:1.3}),Y(a,[2.7,3.8,4.9,5.6,6.1].map(Gt),{along:.75,across:.5,caps:[!1,!0],paint:t=>{let n=t.edge;return n===0||n===1||n===7||n===2||n===6?Q:{...X(e,t,{bays:.06}),style:e()<.2?`vent`:`plate`}}}),await t(),n.use(F,.8),n.loft([2.6,3.2,3.8,4.35,4.9,5.25,5.6,6.02].map(e=>V(e,Tt(Wt(e)+.05,0,.09,Math.min(.07,Z(e)[3]*.45),.016))));for(let e of s){let t=t=>L(t,Z(t)[0],e*Z(t)[3]),a=t=>L(t,Z(t)[0]-Z(t)[5],e*Z(t)[2]),o=(e,n)=>t(e).lerp(a(e),n),s=e=>{let n=a(e).sub(t(e)),r=new i().crossVectors(n,L(1,0,0)).normalize();return r.y<0?r.negate():r},c=.34;[[2.76,3.68,.11,1],[3.74,4.56,.095,.92],[4.62,5.36,.08,.98],[5.42,6.12,.065,.9]].forEach(([e,t,r,i],a)=>{n.use(a===2?N:P,a===2?1.25:i);let l=G(n,[[e,.05],[t,.05],[t-c,1.07],[e-c,1.07]],o,s((e+t)/2-c/2),r,.03,.05);(a===0||a===1)&&(n.use(P,.82),Ft(n,Pt(l,[.08,.12,.12,.12]),s((e+t)/2),.04)),q(n,[o(e+.03,.012),o(t-.03,.012),o(t-.03,.036),o(e+.03,.036)],s((e+t)/2),.9,.012)});for(let e of[3.71,5.39]){let t=s(e-c/2);q(n,[o(e-.014,.12),o(e+.014,.12),o(e+.014-c*.76,.88),o(e-.014-c*.76,.88)],t,.75,.012)}let l=e=>Z(e)[2],u=e=>Z(e)[1]+Z(e)[6]+.035,d=e=>Z(e)[0]-Z(e)[5]-.035,f=(t,n)=>L(t,n,e*l(t)),p=t=>L(-(l(t+.05)-l(t-.05))/.1,0,e).normalize();[[2.78,3.6],[3.7,4.45],[4.55,5.2],[5.3,6.02]].forEach(([t,i],a)=>{let o=p((t+i)/2),s=a===1||a===3;n.use(s?N:P,s?1.25:.88+a*.03);let c=a===1?[[t,u(t)],[i,u(i)],[i,d(i)],[t,d(t)]]:[[t,u(t)],[i,u(i)],[i,d(i)-.16],[i-.16,d(i)],[t,d(t)]],l=G(n,c,f,o,a===1?.075:.09,.024);a===1&&(J(r,l,o,N,{cell:`number`,paint:.8,right:L(e,0,0),fill:.62,offset:.08}),J(r,l,o,N,{cell:`code`,paint:.7,right:L(e,0,0),fill:.5,offset:-.3}))});for(let e of[3.65,4.5,5.25]){let t=p(e);q(n,[f(e-.016,u(e)+.07),f(e+.016,u(e)+.07),f(e+.016,d(e)-.07),f(e-.016,d(e)-.07)],t,.8,.01)}let m=(e,t)=>L(6.1+(.75-Math.abs(e))*.12,t,e);n.use(N,1.3);let h=G(n,[[e*.16,-.54],[e*.72,-.54],[e*.72,.1],[e*.16,.2]],m,L(1,0,e*.12).normalize(),.06,.02,.1);n.use(N,1.1),Ft(n,Pt(h,[.07,.07,.07,.07]),L(1,0,e*.12).normalize(),.03),q(n,[L(6.1,-.5,e*.1),L(6.1,-.5,e*.135),L(6.1,.3,e*.135),L(6.1,.3,e*.1)],L(1,0,0),.95,.012),q(n,[L(6.06,-.87,e*.16),L(6.06,-.87,e*.36),L(6.06,-.84,e*.36),L(6.06,-.84,e*.16)],L(1,0,0),.7,.006),Vt(n,L(5.2,-1.12,e*.47),L(0,-.4,e),.05)}n.use(P,.95),G(n,[[-.08,-.66],[.08,-.66],[.08,.38],[0,.44],[-.08,.38]],(e,t)=>L(6.1,t,e),L(1,0,0),.2,.03,.05),n.use(N,1.15),H(n,5.5,6.06,-.98,-.72,.5,.44,0,.04),await t(),Y(a,[-3.9,-3.5,-.3,.8,1.5].map(Jt),{along:.75,across:.5,caps:[!0,!0],paint:t=>{let n=t.edge;if(n===0||n===3)return Q;if(n===1||n===5)return{style:e()<.2?`double`:`plate`,kind:P,tint:.86+e()*.12,h:.045,lamp:e()<.12?0:void 0};if(t.c.x>-3.45&&t.c.x<.62)return Q;let r=X(e,t,{light:.3,bays:.12});return r.style===`plate`&&e()<.2&&(r.lamp=e()<.5?1:3,r.lampTint=.7),r}});for(let e of s){let t=e=>qt(e)[2],i=(n,r)=>L(n,r,e*t(n)),a=n=>L(-(t(n+.05)-t(n-.05))/.1,0,e).normalize(),o=e=>qt(e)[1]-.23;[[-3.4,-2.2],[-2.1,-.62],[-.52,.58]].forEach(([t,s],c)=>{let l=a((t+s)/2);n.use(P,c===1?.88:.8);let u=G(n,[[t,1.04],[s,1.04],[s,o(s)],[t,o(t)]],i,l,.06,.02);c===1&&J(r,u,l,P,{cell:`number`,paint:.85,right:L(e,0,0),fill:.6,offset:.12}),c===0&&J(r,u,l,P,{cell:`emblem`,paint:.8,right:L(e,0,0),fill:.5,offset:.12})});for(let e of[-2.15,-.57]){let t=a(e);q(n,[i(e-.016,1.12),i(e+.016,1.12),i(e+.016,o(e)-.06),i(e-.016,o(e)-.06)],t,.8,.008)}}await t(),ln(a,-3.86,-.5,.1,e=>qt(e)[3],e=>qt(e)[1]);for(let e=-3.4;e<-.7;e+=.55){let t=qt(e)[1],r=qt(e+.32)[1];q(n,[L(e,t,-.02),L(e+.32,r,-.02),L(e+.32,r,.02),L(e,t,.02)],vt,.65,.004)}n.use(N,1.25);let u=Et(n,[[-.45,1.88,2.14,.46],[.85,1.82,2.18,.44],[1.45,1.38,1.86,.28]],.04);{let e=u[1],t=u[2],r=(e,t,r,a,o,s,c,l)=>{let u=(r+1)%e.length,d=(n,i)=>e[r].clone().lerp(e[u],i).lerp(t[r].clone().lerp(t[u],i),n),f=[d(a,s),d(o,s),d(o,c),d(a,c)],p=new i().crossVectors(f[2].clone().sub(f[0]),f[3].clone().sub(f[1])).normalize();p.dot(z(f).sub(z(e).add(z(t)).multiplyScalar(.5)))<0&&p.negate(),q(n,f,p,l,.004)};r(e,t,0,.42,.68,.06,.94,.3),r(e,t,2,.05,.75,.55,.72,.26),r(e,t,6,.05,.75,.28,.45,.26),r(u[0],e,2,.5,.95,.55,.72,.26),r(u[0],e,6,.5,.95,.28,.45,.26)}n.use(P,.95),H(n,-.4,.66,2.12,2.23,.32,.27,0,.03),n.use(F,.9),H(n,-.15,.4,2.21,2.33,.15,.13,0,.03),n.use(F,1.1),W(n,L(.15,2.31,0),L(.15,2.72,0),.02,6),W(n,L(-.05,2.31,.09),L(-.05,2.54,.09),.012,5),W(n,L(-.05,2.31,-.09),L(-.05,2.48,-.09),.012,5),n.use(I,1.6),H(n,.12,.18,2.72,2.76,.03,.03,0,.008),n.use(F,.85),G(n,U(0,0,0,.1).map(e=>[e.y,e.z]),K(L(.5,2.27,-.2),L(.3,.95,0).normalize(),L(0,0,1)),L(.95,-.3,0).normalize(),.03,.01,.02);for(let e of s){let t=(t,n)=>L(t,n,e*.5);n.use(P,.9),G(n,[[-.05,1.86],[-.84,1.86],[-1.04,2.6],[-.58,2.66]],t,L(0,0,1),.05,.02,.05),n.use(N,1.3),G(n,[[-.28,2],[-.74,2],[-.88,2.44],[-.62,2.47]],t,L(0,0,1),.068,.01,.068);for(let t of[1,-1]){let r=(n,r)=>L(-.05+(-.58+.05)*n-r,1.86+.8*n,e*.5+t*.051);q(n,[r(.2,.05),r(.9,.05),r(.9,.085),r(.2,.085)],L(0,0,t),.75,.002)}n.use(I,1.05),H(n,-.76,-.62,2.62,2.68,.035,.035,e*.5,.008)}ln(a,1.54,2.7,.05,e=>Z(e)[3],Wt);{let e=2.05,t=Wt(e)+.05;n.use(F,.75),G(n,U(0,0,0,.24).map(e=>[e.y,e.z]),K(L(e,t,0),L(1,0,0),L(0,0,1)),vt,.06,.02,.02),n.use(N,1.2),Et(n,[[1.8299999999999998,t+.05,t+.2,.18],[2.19,t+.05,t+.2,.18],[2.3499999999999996,t+.05,t+.12,.12]],.03),n.use(F,1);for(let e of[-.07,.07])W(n,L(2.25,t+.14,e),L(2.9099999999999997,t+.14,e),.024,6),W(n,L(2.83,t+.14,e),L(2.9299999999999997,t+.14,e),.032,6)}Y(a,[[-5.52,.8,1.34,.56],[-5.38,.8,1.42,.6],[-4.2,.8,1.42,.6],[-3.92,.8,1.3,.52]].map(([e,t,n,r])=>V(e,Tt((t+n)/2,0,(n-t)/2,r,.08))),{along:.6,across:.45,caps:[!0,!0],paint:t=>{let n=t.edge;return n===4?Q:n===0?{style:e()<.25?`double`:`plate`,kind:P,tint:.9+e()*.2,h:.045,lamp:e()<.15?0:void 0}:X(e,t,{light:.25,lamps:.12})}});{let e=(e,t)=>L(-5.52,t,e);n.use(P,1.6),J(r,G(n,[[-.48,.86],[.48,.86],[.48,1.26],[-.48,1.26]],e,R,.05,.016,.03),R,P,{cell:`number`,paint:.12,right:L(0,0,1),fill:.62}),q(n,[e(-.44,1.29),e(.44,1.29),e(.44,1.315),e(-.44,1.315)],R,.9,.006)}{let e=[[-3.62,1.72],[-4.08,1.36],[-5.3,1.36],[-5.52,2.95],[-4.76,3.02]],t=(e,t)=>L(e,t,0);n.use(N,1.1),G(n,e,t,L(0,0,1),.085,.03,.085),n.use(P,1.1),G(n,[[-4.25,1.6],[-5.2,1.52],[-5.36,2.6],[-4.72,2.64]],t,L(0,0,1),.11,.02,.11);for(let e of s){let t=(t,n)=>L(-3.62+(-4.76+3.62)*t-n,1.72+1.3*t,e*.086);q(n,[t(.08,.06),t(.92,.06),t(.92,.1),t(.08,.1)],L(0,0,e),.9,.003)}n.use(I,1.6),H(n,-5.22,-5,2.96,3.02,.04,.04,0,.01)}await t();for(let o of s){let s=t=>{let n=t.edge,r=t.c;if(n===7||n===0&&r.x<1.5||n===3&&r.x>-2.85&&r.x<-.8||(n===1||n===2)&&r.x>-4.4&&r.x<.9||n===3&&r.y>-.05&&r.x>-4.7&&r.x<.6)return Q;let i=X(e,t,{lamps:.08,light:n<=2||n===3&&r.y>.25?.85:.06,bays:.08});return t.n.x>.35&&r.y<.3&&i.kind===P&&(i.kind=N,i.tint=1+e()*.25),n===3&&i.style===`plate`&&t.len>.35&&e()<.08&&(i.decal={cell:e()<.5?`maint`:`vent`,paint:.75,fill:.7}),n===3&&i.style===`plate`&&e()<.15&&(i.lamp=e()<.5?1:3,i.lampTint=.7),i};Y(a,[-4.8,-4.4,-2.4,-.4,1.2,2.1,2.75].map(e=>Zt(e,o)),{along:.8,across:.6,caps:[!0,!0],paint:s});let[c,l]=cn(a,Zt(-4.8,o,.985),Zt(-5.35,o,.985),.07,e=>e.edge===7?Q:e.edge===0?{style:`plate`,kind:P,tint:.88,h:.05}:s(e));J(r,[c[0],c[1],l[1],l[0]],R,F,{cell:`hazard`,paint:1,right:L(0,0,1),fill:.86,stretch:1.3}),await t();{let e=e=>Xt(e)[1],t=(t,n)=>L(t,n,o*e(t)),i=L(-(e(-1.75)-e(-1.85))/.1,0,o).normalize();n.use(P,.82);let a=G(n,[[-2.8,-.6],[-.85,-.6],[-.85,-.1],[-2.8,-.1]],t,i,.055,.018);J(r,a,i,P,{cell:`code`,paint:.85,right:L(o,0,0),fill:.5,offset:.1}),J(r,a,i,P,{cell:`serial`,paint:.7,right:L(o,0,0),fill:.86,offset:-.32})}{[[-4.3,-2.7,.92],[-2.6,-.95,.8],[-.85,.85,.9]].forEach(([e,t,r])=>{n.use(P,r),Qt(n,o,e,t,.075,.35)});let e=(e,t)=>Zt(-.9-.35*[0,.15,.4,.62,1][e]+t,o)[e].clone().addScaledVector([L(0,1,0),L(0,.924,.383*o),L(0,.707,.707*o),L(0,.383,.924*o)][e],.012);for(let t of[1,2])q(n,[e(t,-.016),e(t,.016),e(t+1,.016),e(t+1,-.016)],L(0,.6,.6*o),.85,0)}{let e=L(.8,.05,o*.6).normalize(),t=new i().crossVectors(vt,e).normalize(),r=new i().crossVectors(e,t).normalize(),a=L(2.4,0,o*1.86);n.use(N,1.3),G(n,[[-.56,-.5],[.56,-.5],[.56,.4],[-.56,.4]],K(a,t,r),e,.14,.04,.26);let s=K(a.clone().addScaledVector(e,.14),t,r),c=[];for(let e of[-.36,-.12,.12,.36])for(let t of[.2,-.07])c.push(s(e,t));dn(n,c,t,r,e,.098,1),q(n,[s(-.46,-.4),s(.46,-.4),s(.46,-.35),s(-.46,-.35)],e,.9,.006)}Y(a,[-4.3,-1.1,.6,1.5].map(e=>tn(e,o)),{along:.8,across:.55,caps:[!0,!0],paint:t=>{let n=t.edge,r=t.c;return n===3||n===0&&(zt(r,-3.15,-1.8,1.15,2.1)||zt(r,-1.35,-.4,1.1,2.15))?Q:n===0?{style:e()<.22?`double`:`plate`,kind:P,tint:.86+e()*.14,h:.05,lamp:e()<.1?0:void 0}:X(e,t,{light:n===4?.1:.5,lamps:.1})}});{let e=e=>en(e)[2],t=(t,n)=>L(t,e(t),o*n),i=L(-(e(-2.3)-e(-2.5))/.2,1,0).normalize();n.use(P,.95),J(r,G(n,[[-3.1,1.2],[-1.85,1.2],[-1.85,2.05],[-3.1,2.05]],t,i,.05,.016),i,P,{cell:`emblem`,paint:.8,right:L(0,0,1),fill:.82}),n.use(F,.65),G(n,[[-1.3,1.15],[-.45,1.15],[-.45,2.1],[-1.3,2.1]],t,i,.04,.015);let a=[];for(let e of[-1.08,-.67])for(let n of[1.31,1.52,1.73,1.94])a.push(t(e,n).addScaledVector(i,.04));dn(n,a,L(1,0,0),L(0,0,o),i,.085,.85)}n.use(F,.8);for(let e=0;e<9;e++){let t=-4.78+e*.062;H(n,t,t+.026,.94,1.16,.72,.72,o*1.7,.006)}n.use(N,1.1);for(let e of[.98,2.42])H(n,-4.8,-4.24,.94,1.19,.035,.035,o*e,.012);Y(a,[[-4.3,-1.08,.36],[-3.9,-1.2,.5],[-.5,-1.2,.5],[-.1,-1.08,.36]].map(([e,t,n])=>V(e,Tt((t-.98)/2,o*1.85,(-.98-t)/2,n,.05))),{along:.75,across:.45,caps:[!0,!0],paint:t=>t.edge===0?Q:X(e,t,{lamps:.05})});for(let[e,t]of[[-3.45,-2.55],[-1.75,-.85]]){let r=(e,t)=>L(e,-1.2,o*t),i=L(0,-1,0);n.use(ut,1),G(n,[[e,1.55],[t,1.55],[t,2.15],[e,2.15]],r,i,.012,.004,.01),n.use(ft,.5),n.quadN(r(e+.05,1.6).setY(-1.215),r(t-.05,1.6).setY(-1.215),r(t-.05,2.1).setY(-1.215),r(e+.05,2.1).setY(-1.215),i),n.use(F,.7);for(let r=e+.08;r<t-.05;r+=.11)H(n,r,r+.03,-1.25,-1.2,.25,.25,o*1.85,.004)}Vt(n,L(.4,Xt(.4)[3]-.01,o*1.6),L(0,-1,0),.06),Vt(n,L(-4.55,Xt(-4.55)[3]-.01,o*2.45),L(0,-1,0),.06),await t()}for(let t of s){let r=t>0?0:1;Y(a,[2.85,3.85,4.6].map(e=>rn(e,t)),{along:.65,across:.6,caps:[!1,!1],paint:t=>{let n=t.edge;if(n===1){let n=e(),i={style:n<.28?`double`:n<.34?`bay`:`plate`,kind:e()<.82?P:N,tint:e()<.15?.64:.8+e()*.2,h:.05};return t.span===0&&t.u>.5&&t.u<.85&&!pn[r]&&(pn[r]=!0,i.style=`plate`,i.kind=P,i.decal={cell:`nostep`,paint:.75,right:L(0,0,1),fill:.5}),i}return n===2?{style:`plate`,kind:N,tint:1.05,h:.035,lamp:t.span===1||e()<.5?0:void 0,lampTint:.6}:X(e,t,{lamps:.04})}});let s=[1.25,1.45,1.45,1.25];Y(a,[4.5,4.58,5.1,5.18].map((e,n)=>{let r=rn(4.6,t,s[n]).map(n=>n.setZ(t*e));return r[0].x+=.25,r[1].x+=.16,r[3].x-=.2,r}),{along:.6,across:.4,caps:[!0,!0],base:N,paint:t=>t.span===1?{...X(e,t,{lamps:0,bays:0}),style:`plate`}:Q});{let e=.26,r=L(0,Math.cos(e),t*Math.sin(e)),a=new i().crossVectors(L(1,0,0),r),o=K(L(0,.36,t*4.84),L(1,0,0),r);n.use(N,1.15),G(n,[[-4.15,0],[-5.45,0],[-5.74,.82],[-5.22,.86]],o,a,.035,.012,.035),n.use(P,.88),G(n,[[-4.6,.1],[-5.36,.1],[-5.52,.62],[-5.18,.64]],o,a,.05,.01,.05);for(let e of[1,-1]){let t=(t,n)=>o(-4.15+(-5.22+4.15)*t-n,.86*t).addScaledVector(a,e*.036);q(n,[t(.15,.04),t(.9,.04),t(.9,.07),t(.15,.07)],a.clone().multiplyScalar(e),.75,.002)}n.use(I,1),G(n,[[-5.48,.84],[-5.34,.85],[-5.34,.9],[-5.48,.89]],o,a,.02,0,.02)}q(n,[L(-5.3,-.04,t*5.185),L(-4,-.04,t*5.185),L(-4,-.01,t*5.185),L(-5.3,-.01,t*5.185)],L(0,0,t),.6,.004),Vt(n,L(-2.96,0,t*4.84),L(1,0,0),.05);for(let e of[4.72,4.96])o.push(Bt(n,-5.8,.05,t*e,.05,-5.5))}await t(),Y(a,[-5.2,-3.8,-1.2,1.4,3.4,4.8,5.75].map(on),{along:.8,across:.55,caps:[!0,!0],paint:t=>{let n=t.edge;if(n===0||n===3&&t.c.x>-3.15&&t.c.x<.75)return Q;let r=X(e,t,{lamps:.03});return(n===1||n===5)&&r.style===`plate`&&t.len>.4&&e()<.12&&(r.decal={cell:e()<.5?`warn`:`arrows`,paint:.75,fill:.5}),r}}),Y(a,[[-3.5,-1.42,.28],[-3.1,-1.52,.4],[.7,-1.52,.4],[1.1,-1.42,.28]].map(([e,t,n])=>V(e,Tt((t-1.3)/2,0,(-1.3-t)/2,n,.05))),{along:.75,across:.45,caps:[!0,!0],paint:t=>t.edge===0||t.edge===4&&t.c.x>-2.75&&t.c.x<-.35?Q:X(e,t,{lamps:.04})});{let e=(e,t)=>L(e,-1.52,t),t=L(0,-1,0);n.use(N,1.25);let i=G(n,[[-2.7,-.32],[-.4,-.32],[-.4,.32],[-2.7,.32]],e,t,.03,.012);for(let e of[-.26,.26])J(r,[L(-2.62,0,e-.03),L(-.48,0,e-.03),L(-.48,0,e+.03),L(-2.62,0,e+.03)].map(e=>e.setY(i[0].y)),t,N,{cell:`hazard`,paint:1,right:L(1,0,0),fill:1,stretch:2.2});for(let[e,t]of[[-2.6,-.22],[-2.6,.22],[-.5,-.22],[-.5,.22]])n.use(I,.6),H(n,e-.02,e+.02,i[0].y-.012,i[0].y+.003,.02,.02,t,.004);let a=e=>B(an,e)[1];for(let e of s)for(let t=-4.6;t<4.4;t+=1.8){if(t>-3.4&&t<1)continue;let r=a(t)+.04,i=e*(B(an,t)[2]+.002);q(n,[L(t,r-.012,i),L(t+.5,r-.012,i),L(t+.5,r+.012,i),L(t,r+.012,i)],L(0,0,e),.45,.002)}}await t();{let e=sn(Gt(-5.45),.13).map(e=>[e.z,e.y]);n.use(N,.95),G(n,e,(e,t)=>L(-5.28,t,e),R,.05,.025,.25);let t=(e,t)=>L(-5.33,t,e);n.use(N,1.25);for(let e of[.5,-.48])G(n,[[-.62,e],[.62,e],[.62,e+.05],[-.62,e+.05]],t,R,.025,.008,.01);J(r,[t(-.4,-.32),t(.4,-.32),t(.4,.4),t(-.4,.4)],R,N,{cell:`emblem`,paint:.85,right:L(0,0,1),fill:.92}),J(r,[t(-.42,-.68),t(.42,-.68),t(.42,-.6),t(-.42,-.6)],R,N,{cell:`hazard`,paint:1,right:L(0,0,1),fill:1,stretch:1.6}),n.use(F,.9);for(let e of[-.56,.56])G(n,[[e-.06,-.64],[e+.06,-.64],[e+.06,-.52],[e-.06,-.52]],t,R,.07,.015,.01);for(let e of s)q(n,[L(-5.31,-.5,e*.862),L(-5.31,-.5,e*.888),L(-5.31,.42,e*.888),L(-5.31,.42,e*.862)],R,.95,0),n.use(I,1.2),G(n,[[e*.28,.6],[e*.34,.6],[e*.34,.64],[e*.28,.64]],t,R,.01,0,.005);q(n,[L(-5.31,.722,-.4),L(-5.31,.722,.4),L(-5.31,.746,.4),L(-5.31,.746,-.4)],R,.95,0)}for(let e of s){let t=sn(Zt(-5.35,e,.985),.072).map(e=>[e.z,e.y]);n.use(N,.9),G(n,t,(e,t)=>L(-4.95,t,e),R,.03,.01,.1);let i=(e,t)=>L(-4.98,t,e),a=[[1.38,.24],[1.52,.1],[2.32,.1],[2.46,.24],[2.46,.52],[2.32,.66],[1.52,.66],[1.38,.52]];n.use(F,.9),a.forEach(([t,r],o)=>{let[s,c]=a[(o+1)%a.length];un(n,i(e*t,r),i(e*s,c),R,.05,.22)}),n.use(ut,1),G(n,a.map(([t,n])=>[e*t,n]),i,R,.004,0,.004);for(let t of[.25,.51])for(let r of[1.56,1.8,2.04,2.28])o.push(Bt(n,-5.17,t,e*r,.07,-4.96));n.use(N,1.3),J(r,G(n,[[e*1.36,-.62],[e*2.48,-.62],[e*2.48,-.04],[e*1.36,-.04]],i,R,.06,.016,.01),R,N,{cell:`emblem`,paint:.8,right:L(0,0,1),fill:.78});for(let t of[1.3,2.54])q(n,[i(e*(t-.013),-.55),i(e*(t+.013),-.55),i(e*(t+.013),-.12),i(e*(t-.013),-.12)],R,.9,.004)}for(let e of[-.15,.15])Bt(n,-5.34,-1,e,.07,-5.15);for(let e of s){let t=e=>en(e)[2];for(let[r,i]of[[-3.62,1.62],[-.05,1.5]])Ht(n,L(r,t(r)+.05,e*i),.17);n.use(F,.85);let r=t=>e*(B(an,t)[2]+.035);W(n,L(-3.7,-1.1,r(-3.7)),L(1.3,-1.1,r(1.3)),.03,6),W(n,L(-3.5,-1.2,r(-3.5)),L(.9,-1.2,r(.9)),.022,6);let i=t=>e*(qt(t)[2]+.035);W(n,L(-3.3,1.05,i(-3.3)),L(.6,1.05,i(.6)),.026,6),n.use(dt,1.1);for(let t=-3.4;t<1.2;t+=.62)H(n,t,t+.06,-1.24,-1.04,.035,.035,r(t)+e*.005,.01);for(let e=-3.1;e<.5;e+=.7)H(n,e,e+.06,1,1.09,.035,.035,i(e),.01);n.use(N,1.2),Et(n,[[-4.5,-.42,.36,.1,e*3.1],[-1.4,-.36,.3,.1,e*3.07],[-1.05,-.18,.12,.06,e*3.05]],.03),n.use(P,.85);for(let t of[-4.1,-3.15,-2.2])H(n,t,t+.55,-.3,.26,.05,.05,e*3.18,.012);n.use(F,1);for(let t of[.66,.94])W(n,L(-3,.08,e*(4.18+t)),L(-2.4,.08,e*(4.18+t)),.011,5)}{let e=B(an,4.9)[1];n.use(F,.9),G(n,U(0,0,0,.15).map(e=>[e.y,e.z]),K(L(4.95,e,0),L(1,0,0),L(0,0,1)),L(0,-1,0),.05,.02,.02),n.use(ut,1),G(n,U(0,0,0,.1).map(e=>[e.y,e.z]),K(L(4.95,e-.05,0),L(1,0,0),L(0,0,1)),L(0,-1,0),.04,.02,.01),n.use(I,.5),G(n,U(0,0,0,.035).map(e=>[e.y,e.z]),K(L(4.95,e-.09,0),L(1,0,0),L(0,0,1)),L(0,-1,0),.006,0,.004)}let d=e=>{let t=new ne;return t.setAttribute(`position`,new f(e.pos,3)),t.setAttribute(`aMat`,new f(e.mat,3)),e.uv&&t.setAttribute(`aUv`,new f(e.uv,2)),t.computeBoundingSphere(),t};return{hull:d(n),decals:d(r),engines:o}}var pn=[!1,!1],mn=`
  precision highp float;
  varying vec2 vUv;
  // Loop bound from a uniform (5) so Direct3D keeps a loop rather than unrolling it (see bake.ts).
  uniform int uLoop;
  float h21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  void main() {
    // 4 x 4 cells a tile, each split at random into small panels (a k-d split, so it tiles).
    vec2 p = vUv * 4.0;
    vec2 cell = floor(p);
    vec2 lo = cell;
    vec2 hi = cell + 1.0;
    float id = h21(mod(cell, 4.0) + 0.37);
    for (int i = 0; i < uLoop; i++) {
      vec2 size = hi - lo;
      float fi = float(i);
      float r = h21(vec2(id * 61.7 + 0.3, fi * 1.37 + 0.7));
      if (i > 1 && r < 0.2) break;
      bool cutX = size.x > size.y * 1.6 ? true : (size.y > size.x * 1.6 ? false : r > 0.5);
      float t = 0.28 + 0.44 * h21(vec2(id * 13.1 + 2.1, fi * 3.3 + 1.1));
      if (cutX) {
        float m = mix(lo.x, hi.x, t);
        if (p.x < m) { hi.x = m; id = h21(vec2(id * 7.3, 1.0 + fi)); } else { lo.x = m; id = h21(vec2(id * 7.3, 5.0 + fi)); }
      } else {
        float m = mix(lo.y, hi.y, t);
        if (p.y < m) { hi.y = m; id = h21(vec2(id * 7.3, 9.0 + fi)); } else { lo.y = m; id = h21(vec2(id * 7.3, 13.0 + fi)); }
      }
    }
    vec2 size = hi - lo;
    vec2 q = (p - lo) / size;
    vec2 dEdge = min(p - lo, hi - p);
    float edge = min(dEdge.x, dEdge.y);
    // Fine seams: about a texel and a half.
    float seam = smoothstep(0.004, 0.013, edge);
    float type = h21(vec2(id * 3.1, 7.7));
    float plateH = 0.56 + 0.1 * h21(vec2(id * 5.7, 2.2));
    float height = plateH;
    float albedo = 0.9 + 0.1 * h21(vec2(id * 9.1, 4.4));
    float rough = 0.32 + 0.36 * h21(vec2(id * 2.9, 8.8));
    float lamp = 0.0;
    bool longX = size.x > size.y;
    float acrossQ = longX ? q.y : q.x;
    float alongQ = longX ? q.x : q.y;
    float alongLen = longX ? size.x : size.y;
    float acrossLen = longX ? size.y : size.x;
    float rim = min(edge / 0.05, 1.0);
    if (type < 0.1) {
      // A small vent: slats inside a recessed frame.
      float inset = step(0.045, edge);
      float slat = smoothstep(0.35, 0.5, abs(fract(alongQ * alongLen * 22.0) - 0.5) * 2.0);
      height = mix(plateH, 0.3 + 0.25 * slat, inset);
      albedo *= mix(1.0, 0.55, inset);
      rough = mix(rough, 0.6, inset);
    } else if (type < 0.2) {
      // A raised block.
      float inner = smoothstep(0.03, 0.045, edge);
      height = plateH + 0.16 * inner;
    } else if (type < 0.26 && acrossLen < 0.34) {
      // A strip of ports along a narrow panel, some lit.
      float slot = floor(alongQ * alongLen * 10.0);
      float ports = step(0.3, fract(alongQ * alongLen * 10.0)) * step(abs(acrossQ - 0.5) * acrossLen, 0.028);
      lamp = ports * step(0.5, h21(vec2(id * 4.4, slot)));
      height = plateH - 0.12 * ports;
      albedo *= 0.75;
    } else if (type < 0.4) {
      // An access hatch: an inset outline, two flush handles.
      float ring = step(0.05, edge) * (1.0 - step(0.064, edge));
      vec2 hq = abs(q - 0.5) * size;
      float handle = step(hq.x, 0.02) * step(abs(hq.y - 0.04), 0.008);
      height = plateH - 0.2 * ring - 0.08 * handle;
      albedo *= 1.0 - 0.3 * ring;
    } else {
      // A plain panel with a bolt row inside each long edge.
      float edgeDist = min(acrossQ, 1.0 - acrossQ) * acrossLen;
      float bolts = step(abs(edgeDist - 0.026), 0.007) * step(0.55, fract(alongQ * alongLen * 28.0));
      height += 0.1 * bolts;
      albedo *= 1.0 - 0.12 * bolts;
    }
    height += 0.04 * (1.0 - rim) * seam;
    // A little variation along the hull, kept faint: the ship is new.
    float lane = floor(vUv.x * 128.0);
    float wear = h21(vec2(lane, 3.3)) * smoothstep(0.5, 1.0, h21(vec2(lane, floor(vUv.y * 8.0))));
    albedo *= 1.0 - 0.07 * wear;
    height = mix(0.28, height, seam);
    albedo *= mix(0.5, 1.0, seam);
    rough = mix(0.8, rough, seam);
    gl_FragColor = vec4(height, albedo, rough, lamp);
  }
`;async function hn(e,t){let n=new d(512,512,{type:h,wrapS:S,wrapT:S,minFilter:r,magFilter:m,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return n.texture.name=`title-ship-panels`,await pe(e,n,mn,{uLoop:{value:5}},{strips:2,pace:t}),n}var gn=`
  attribute vec3 aMat;
  #ifdef DECAL
  attribute vec2 aUv;
  varying vec2 vUv;
  #endif
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vMat;
  void main() {
    vLocal = position;
    vMat = aMat;
    #ifdef DECAL
    vUv = aUv;
    #endif
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,_n=`
  precision highp float;
  uniform sampler2D uPanel;
  #ifdef DECAL
  uniform sampler2D uMarks;
  varying vec2 vUv;
  #endif
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform vec3 uPlanetCenter;
  uniform float uPlanetRadius;
  uniform vec3 uPlanetLight;
  uniform vec3 uEngineA;
  uniform vec3 uEngineB;
  uniform vec3 uEngineC;
  uniform vec3 uEngineColor;
  uniform vec3 uLampColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform float uPower;
  uniform float uBump;
  uniform float uFade;
  uniform float uDetailScale;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vMat;

  const float PI = 3.14159265;

  // What the metal reflects: space, Kethra below with its lit side and limb haze, the sun.
  vec3 environment(vec3 p, vec3 r, float rough) {
    vec3 oc = p - uPlanetCenter;
    float b = dot(oc, r);
    float c = dot(oc, oc) - uPlanetRadius * uPlanetRadius;
    float disc = b * b - c;
    vec3 col = vec3(0.003, 0.005, 0.011);
    if (disc > 0.0 && b < 0.0) {
      vec3 hn = normalize(oc + r * (-b - sqrt(disc)));
      float lit = smoothstep(-0.2, 0.45, dot(hn, uPlanetLight));
      col = mix(vec3(0.004, 0.012, 0.018), vec3(0.07, 0.16, 0.14), lit);
      float graze = 1.0 - max(dot(hn, -r), 0.0);
      col += vec3(0.07, 0.15, 0.3) * pow(graze, 5.0) * (0.25 + lit);
    } else {
      // Off the limb: the atmosphere's glow, by how close the ray passes.
      float closest = b < 0.0 ? sqrt(max(dot(oc, oc) - b * b, 0.0)) : length(oc);
      float h = (closest - uPlanetRadius) / (uPlanetRadius * 0.035);
      col += vec3(0.08, 0.2, 0.42) * exp(-max(h, 0.0)) * 0.9;
    }
    float s = max(dot(r, uSunDir), 0.0);
    float sharp = mix(320.0, 10.0, rough);
    col += uSunColor * pow(s, sharp) * (sharp * 0.004 + 0.05);
    return col;
  }

  float engineGlow(vec3 e, vec3 ln) {
    vec3 d = e - vLocal;
    float dd = dot(d, d);
    return max(dot(ln, d * inversesqrt(dd)), 0.0) / (1.0 + dd * 0.8);
  }

  void main() {
    float kind = vMat.x;
    float tint = vMat.y;
    float seed = vMat.z;

    if (kind > 4.5) {
      // Light strips, the chambers, the cores: light, not lit.
      vec3 e;
      if (kind < 5.5) e = mix(uLampColor, vec3(0.86, 0.93, 1.0), clamp(tint - 1.0, 0.0, 1.0)) * (0.7 + 2.6 * min(tint, 1.0) + 2.0 * max(tint - 1.0, 0.0));
      else if (kind < 6.5) e = uEngineColor * tint * tint * 2.3 * uPower;
      else e = mix(uEngineColor, vec3(1.0), 0.6) * 2.6 * uPower;
      gl_FragColor = vec4(e * uFade, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    // Flat normals from the triangle itself, turned toward us (back faces are culled).
    vec3 V = normalize(cameraPosition - vPosW);
    vec3 dpx = dFdx(vPosW);
    vec3 dpy = dFdy(vPosW);
    vec3 nG = normalize(cross(dpx, dpy));
    float facing = dot(nG, V) < 0.0 ? -1.0 : 1.0;
    nG *= facing;
    vec3 ln = normalize(cross(dFdx(vLocal), dFdy(vLocal))) * facing;

    // The panel sheet, box-projected in ship space by the face's own axis, at two scales.
    vec3 an = abs(ln);
    vec2 uv = an.x > max(an.y, an.z) ? vLocal.zy : (an.y > an.z ? vLocal.xz : vLocal.xy);
    uv = uv * uDetailScale + vec2(seed * 7.31, seed * 3.17);
    vec4 s = texture2D(uPanel, uv);
    vec4 s2 = texture2D(uPanel, uv * 0.43 + vec2(0.37, 0.61));
    // The bump reads a mip down, so the seams stay crisp without sparkling where the sheet is minified.
    float height = texture2D(uPanel, uv, 1.0).r * 0.75 + s2.r * 0.25;

    // Bump from the sheet's height, through screen derivatives (no tangents).
    vec3 r1 = cross(dpy, nG);
    vec3 r2 = cross(nG, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
    vec3 n = normalize(abs(det) * nG - grad * uBump * (kind > 0.5 && kind < 1.5 ? 0.5 : 1.0));

    float isPlate = 1.0 - step(0.5, kind);
    float isLight = step(0.5, kind) * (1.0 - step(1.5, kind));
    float isFrame = step(1.5, kind) * (1.0 - step(2.5, kind));
    float isMetal = step(2.5, kind) * (1.0 - step(3.5, kind));
    float isHeat = step(3.5, kind);
    vec3 base = vec3(0.038, 0.04, 0.046) * isPlate + vec3(0.105, 0.11, 0.12) * isLight + vec3(0.01, 0.011, 0.013) * isFrame
      + vec3(0.1, 0.104, 0.112) * isMetal + vec3(0.048, 0.048, 0.054) * isHeat;
    float metal = 0.55 * isPlate + 0.22 * isLight + 0.7 * isFrame + 0.88 * isMetal + 0.75 * isHeat;
    float rough = 0.44 * isPlate + 0.6 * isLight + 0.36 * isFrame + 0.42 * isMetal + 0.55 * isHeat;
    // Panels differ a little: the ship is built from parts, all of them new.
    float plateShade = 0.82 + 0.22 * s.g * (0.8 + 0.2 * s2.g);
    float alpha = 1.0;
    #ifdef DECAL
    vec4 mark = texture2D(uMarks, vUv);
    base = mark.rgb * tint * 0.6;
    metal = 0.05;
    rough = 0.55;
    plateShade = 1.0;
    alpha = mark.a;
    #else
    base *= tint;
    #endif
    base *= plateShade;
    rough = clamp(rough + 0.3 * (s.b - 0.5), 0.18, 0.9);
    // Seams and undersides are in shade.
    float ao = mix(0.45, 1.0, smoothstep(0.2, 0.5, height)) * mix(0.55, 1.0, smoothstep(-0.95, 0.15, ln.y));

    float NdV = max(dot(n, V), 1e-3);
    vec3 F0 = mix(vec3(0.04), base * 2.4 + 0.05, metal);
    vec3 diffuse = base * (1.0 - metal);

    // Key light: high on the left.
    float NdL = max(dot(n, uKeyDir), 0.0);
    vec3 H = normalize(uKeyDir + V);
    float NdH = max(dot(n, H), 0.0);
    float a = rough * rough;
    float a2 = a * a;
    float dd = NdH * NdH * (a2 - 1.0) + 1.0;
    float D = a2 / (PI * dd * dd);
    float k = (rough + 1.0) * (rough + 1.0) * 0.125;
    float G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    vec3 spec = D * G * F / max(4.0 * NdL * NdV, 1e-3);
    vec3 col = (diffuse + spec) * uKeyColor * NdL * mix(0.6, 1.0, ao);

    // Reflections of the sky, Kethra and the sun.
    vec3 R = reflect(-V, n);
    vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
    col += environment(vPosW, R, rough) * Fe * ao;

    // Kethra's bounce from below.
    float bounce = max(dot(n, uBounceDir) * 0.8 + 0.2, 0.0);
    col += (diffuse + F0 * 0.25) * uBounceColor * bounce * ao;
    // A cool fill from our side, so the flank toward us reads, and a soft sheen on its metal.
    float NdF = max(dot(n, uFillDir), 0.0);
    vec3 Hf = normalize(uFillDir + V);
    col += (diffuse + F0 * pow(max(dot(n, Hf), 0.0), 24.0) * 1.4) * uFillColor * NdF * ao;
    // The sun's rim from behind, catching edges and chamfers.
    float rim = pow(1.0 - NdV, 3.0) * max(dot(n, uSunDir) + 0.25, 0.0);
    col += uSunColor * rim * (0.05 + 0.3 * metal + 0.15 * isLight) * ao;

    // The engines light the stern blue.
    float glow = engineGlow(uEngineA, ln) + engineGlow(uEngineB, ln) + engineGlow(uEngineC, ln) * 0.4;
    col += uEngineColor * glow * uPower * 0.6 * (diffuse * 2.0 + F0 * 0.5);

    // Lit ports from the panel sheet, on some of the dark plates.
    col += uLampColor * s.a * isPlate * step(0.6, fract(seed * 13.7)) * 1.4;

    // The black recess material with a tint below 1 is inside something: that much of the light reaches it.
    col *= mix(1.0, min(tint, 1.0), isFrame);

    gl_FragColor = vec4(col * uFade, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,vn=`
  attribute vec3 aNozzle;
  attribute vec4 aShape;
  uniform float uLength;
  varying vec2 vShape;
  varying float vKind;
  varying float vSeed;
  void main() {
    vec3 p0 = (modelMatrix * vec4(aNozzle, 1.0)).xyz;
    vec3 axisL = mat3(modelMatrix) * vec3(-1.0, 0.0, 0.0);
    float scale = length(axisL);
    vec3 axis = axisL / scale;
    vShape = aShape.xy;
    vKind = aShape.w;
    vSeed = aNozzle.z * 3.7 + aNozzle.y * 1.3;
    float r = aShape.z * scale;
    if (aShape.w < 0.5) {
      // The plume: a ribbon along the engine's axis, turned about it to face the camera.
      float along = aShape.x;
      vec3 toCam = normalize(cameraPosition - p0);
      vec3 side = normalize(cross(axis, toCam));
      float width = r * mix(1.0, 1.8, along);
      vec3 world = p0 + axis * along * uLength * r + side * aShape.y * width;
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    } else {
      // The glow in the cell's mouth: a quad facing the camera.
      vec4 mv = viewMatrix * vec4(p0 + axis * r * 0.1, 1.0);
      mv.xy += aShape.xy * r * 2.2;
      gl_Position = projectionMatrix * mv;
    }
  }
`,yn=`
  precision highp float;
  uniform float uPower;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uFade;
  varying vec2 vShape;
  varying float vKind;
  varying float vSeed;
  float h11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
  }
  float n11(float x) {
    float i = floor(x);
    float f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(h11(i), h11(i + 1.0), f);
  }
  void main() {
    vec3 col;
    if (vKind < 0.5) {
      float along = vShape.x;
      float across = vShape.y;
      float core = exp(-across * across * 26.0);
      float sheath = exp(-across * across * 5.0) * smoothstep(1.0, 0.7, abs(across));
      float fall = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.02, along);
      // Streaks flowing out of the nozzle.
      float flow = along * 16.0 - uTime * 7.0 + vSeed;
      float streak = 0.72 + 0.28 * n11(flow + across * 2.5) + 0.14 * n11(along * 41.0 - uTime * 17.0 + across * 6.0 + vSeed);
      float hot = exp(-along * 14.0) * smoothstep(0.0, 0.03, along);
      col = uColor * (sheath * 0.3 + core * 0.8) * fall * streak + vec3(0.4, 0.74, 1.0) * core * hot * 0.45;
    } else {
      float r = length(vShape);
      float k = exp(-r * r * 26.0) * 0.5 + exp(-r * 5.0) * 0.18;
      k *= smoothstep(1.0, 0.6, r);
      col = mix(uColor, vec3(0.7, 0.9, 1.0), exp(-r * r * 200.0)) * k;
    }
    gl_FragColor = vec4(col * uPower * uFade, 1.0);
  }
`;function bn(e){let t=[],n=[],r=[],i=0;for(let a of e){for(let e=0;e<=10;e++){let r=e/10;for(let e of[-1,1])t.push(a.at.x,a.at.y,a.at.z),n.push(r,e,a.r,0)}for(let e=0;e<10;e++){let t=i+e*2;r.push(t,t+1,t+3,t,t+3,t+2)}i+=22;for(let[e,r]of[[-1,-1],[1,-1],[1,1],[-1,1]])t.push(a.at.x,a.at.y,a.at.z),n.push(e,r,a.r,1);r.push(i,i+1,i+2,i,i+2,i+3),i+=4}let a=new ne;return a.setAttribute(`position`,new f(Array(t.length).fill(0),3)),a.setAttribute(`aNozzle`,new f(t,3)),a.setAttribute(`aShape`,new f(n,4)),a.setIndex(r),a}async function xn(e,t){let n=()=>t.pace?.()??Promise.resolve(),[r,i]=await Promise.all([hn(e,t.pace),Mt()]);e.initTexture(i),pn[0]=pn[1]=!1;let a=await fn(se(373239),n),{engines:o}=a,c=new s(.1,.38,1),l={value:1},u={value:1},d={value:ht},f={value:0},p={uPanel:{value:r.texture},uMarks:{value:i},uKeyDir:{value:t.keyDir},uKeyColor:{value:new s(1,.9,.78).multiplyScalar(2.8)},uFillDir:{value:t.fillDir},uFillColor:{value:new s(.36,.5,.7)},uSunDir:{value:t.sunDir},uSunColor:{value:new s(1,.86,.7).multiplyScalar(2.2)},uBounceDir:{value:t.bounceDir},uBounceColor:{value:new s(.24,.46,.5)},uPlanetCenter:{value:t.planetCenter},uPlanetRadius:{value:t.planetRadius},uPlanetLight:{value:t.planetLight},uEngineA:{value:L(-5.5,.38,-1.92)},uEngineB:{value:L(-5.5,.38,1.92)},uEngineC:{value:L(-5.6,-.95,0)},uEngineColor:{value:c},uLampColor:{value:new s(.3,.72,1)},uPower:l,uBump:{value:.013},uDetailScale:{value:.42},uFade:f},m=new A({vertexShader:gn,fragmentShader:_n,uniforms:p}),h=new b(a.hull,m);h.name=`title-ship-hull`,h.frustumCulled=!1;let g=new A({vertexShader:gn,fragmentShader:_n,uniforms:p,defines:{DECAL:1},transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),_=new b(a.decals,g);_.name=`title-ship-markings`,_.frustumCulled=!1,_.renderOrder=1;let v={value:0},y=new b(bn(o),new A({vertexShader:vn,fragmentShader:yn,uniforms:{uLength:d,uPower:u,uTime:v,uColor:{value:c},uFade:f},transparent:!0,depthWrite:!1,blending:2}));y.name=`title-ship-plumes`,y.frustumCulled=!1,y.renderOrder=5;let x=new j;x.add(h,_,y);let S=new j;return S.name=`title-ship`,S.add(x),{group:S,update(e,t){let n=e,r=1-t;x.position.set(Math.sin(n*.21)*.1*r,(Math.sin(n*.29+1.1)*.07+Math.sin(n*.11)*.05)*r,Math.sin(n*.17+2)*.12*r),x.rotation.set(Math.sin(n*.19+.4)*.022*r,Math.sin(n*.13+1.3)*.012*r,Math.sin(n*.23+2.2)*.01*r),v.value=e;let i=1+.035*Math.sin(n*11.3)+.025*Math.sin(n*17.9+1);l.value=(_t+.6*t)*i,u.value=t*i,d.value=ht*(gt+.7*t)},setFade(e){f.value=e},dispose(){r.dispose(),i.dispose(),a.hull.dispose(),a.decals.dispose(),m.dispose(),g.dispose(),y.geometry.dispose(),y.material.dispose()}}}var Sn=40,Cn=Math.tan(O.degToRad(Sn/2)),wn=16/9*Cn,Tn=Math.PI/180,En=new i(1,0,0);function Dn(e,t,n=new i){return n.set((2*e-1)*wn,(1-2*t)*Cn,-1).normalize()}function On(e,t){return new M((2*e-1)*wn,(1-2*t)*Cn)}var kn={planetRadius:6e3,limb:[[.32,.74],[.62,.37],[1,.14]],sunAt:[.635,.355],sunLift:.9,lightTowardCamera:.42,isilthe:{at:[.89,.15],distance:17e3,angularRadius:6.2},moon:{at:[.425,.43],distance:9e3,angularRadius:1.45},band:{from:[.42,-.08],to:[1.02,.6],knot:[.7,.2]},dustDrift:[.25,-.12,1]},An={nose:[.585,.53],noseDistance:30,stern:[.8,.66],sternDistance:20,roll:-8},$={delay:2,distance:34,speed:60,tau:.15,drift:.2,driftTau:120,composedAt:3,turn:16,turnDistance:26,bank:10,plumeHold:.35,plumeFade:.6,clearance:8},jn=!1,Mn={pool:[[2.3,`chunky`,5],[1.8,`angular`,5],[1.5,`elongated`,4],[1.2,`chunky`,4],[1,`angular`,4],[.85,`elongated`,4],[.7,`chunky`,3],[.6,`angular`,3],[.5,`elongated`,3],[.42,`chunky`,3],[.35,`angular`,2],[.3,`chunky`,2]],distance:[11,70],bandTop:.8,bandDepth:.12,crossing:[26,60],sink:[-.02,.1],approach:[0,.12],spin:[.04,.1],seed:42366},Nn={area:[-.7,.78,-.05,.9],heading:[Math.PI+.08,Math.PI+.22],first:5,every:[8,10.5],seconds:1.1,travel:.85,length:[.55,.75],width:.022,brightness:9},Pn={count:11,countLow:9,distance:[7,70],size:[.0072,.0155],drift:[.008,.016],driftAt:25,parallax:.35,spin:[.15,.7],seed:912146},Fn=[[`kethra_day.jpg`,!0],[`kethra_night.jpg`,!0],[`clouds.jpg`,!1],[`isilthe_day.jpg`,!0],[`isilthe_night.jpg`,!0],[`isilthe_ring.png`,!0]];function In(){for(let[e,t]of Fn)ce(e,t);We()}var Ln=.6,Rn=e=>e<0?0:e>1?1:e,zn=e=>e*e*(3-2*e),Bn=class{kind=`TitleScene`;usesAO=!1;grade=ae.title;needsEnvironment=!1;governed=!1;scene=new o;camera=new C(Sn,window.innerWidth/window.innerHeight,.5,4e4);onFirstFrame=null;detail=null;sky;hero;worlds=[];moon;rocks;debris;ship;fx;sunSeen=new i;light=new i;elapsed=0;firstFrame=!0;disposed=!1;yaw=0;leaveT=-1;onLeft=null;lowTier=!1;shipScale=1;pose={position:new i,quaternion:new k,forward:new i,up:new i,side:new i};flightClock=-$.delay;thrust=1;turnQ=new k;bankQ=new k;offset=new i;scratchW=new i;lookTarget=new i;async init(e){let n=ie();if(!n)throw Error(`TitleScene needs the engine`);let r=n.renderer;this.lowTier=n.getQualityTier()===`low`,this.scene.background=new s(330002);let[a,o,c]=kn.limb.map(([e,t])=>Dn(e,t)),l=new i().crossVectors(o.clone().sub(a),c.clone().sub(a)).normalize();l.dot(Dn(1,1))<0&&l.negate();let u=Math.acos(O.clamp(a.dot(l),-1,1)),d=kn.planetRadius,f=l.clone().multiplyScalar(d/Math.sin(u)),p=Dn(...kn.sunAt),m=p.clone().sub(l.clone().multiplyScalar(p.dot(l))).normalize(),h=u+kn.sunLift*Tn;this.sunSeen.copy(l).multiplyScalar(Math.cos(h)).addScaledVector(m,Math.sin(h)).normalize(),this.light.copy(this.sunSeen).lerp(l.clone().negate(),kn.lightTowardCamera).normalize();let g=Dn(.85,.95),_=()=>e?.breathe()??Promise.resolve(),v=performance.now(),y=e=>{t(`title:${e}`,v),v=performance.now()},b=kn.band,x=he(r,_),S=we(r,x.then(e=>e.texture),{from:On(...b.from),to:On(...b.to),core:On(...b.knot)},{stars:this.lowTier?4200:8e3,pace:_}),C=this.sunSeen.clone().add(new i(0,.6,0)).normalize(),w=new i(-.45,.35,.82).normalize(),ee=xn(r,{keyDir:C,sunDir:this.sunSeen,bounceDir:g,fillDir:w,planetCenter:f,planetRadius:d,planetLight:this.light,pace:_}),[T,E]=await Promise.all([x,S]);this.detail=T,this.sky=E,this.scene.add(this.sky.group),y(`bakes`),await e?.tick(),this.hero=Me({radius:d,center:f,sunDir:this.light,glareDir:this.sunSeen,day:ce(`kethra_day.jpg`,!0),night:ce(`kethra_night.jpg`,!0),clouds:ce(`clouds.jpg`,!1),detail:T.texture,segments:this.lowTier?160:224}),this.scene.add(this.hero.group);let D=this.light.clone().multiplyScalar(1e7),te=kn.isilthe,k=oe.find(e=>e.id===`isilthe`),A=Dn(...te.at).multiplyScalar(te.distance),ne=ue({...k,radius:te.distance*Math.sin(te.angularRadius*Tn)},A,D,this.camera);ne.group.rotation.set(0,0,Math.PI+.06),this.scene.add(ne.group),this.worlds.push(ne);let j=kn.moon;this.moon=Fe({position:Dn(...j.at).multiplyScalar(j.distance),radius:j.distance*Math.sin(j.angularRadius*Tn),light:this.light,detail:T.texture}),this.scene.add(this.moon.mesh),y(`planets`),await e?.tick(),(jn||re.reduced)&&(this.flightClock=$.composedAt),this.solveShip();let M={tanH:wn,tanV:Cn},ae={sunDir:this.light,rimDir:this.sunSeen,bounceDir:g},se=Mn;this.rocks=await Ye({...se,...ae,pool:se.pool.map(([e,t,n])=>[e,t,this.lowTier?Math.min(n,4):n]),avoid:{points:this.flightPath(2),clearance:$.clearance},view:M,pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.rocks.mesh),this.debris=Ze({...Pn,...ae,count:this.lowTier?Pn.countLow:Pn.count,view:M}),this.scene.add(this.debris.group),y(`rocks`),await e?.tick(),this.ship=await ee,this.flyShip(this.flightClock),this.scene.add(this.ship.group),y(`ship`);let de=new i(...kn.dustDrift).normalize().multiplyScalar(1.1);this.fx=lt({sunDir:this.sunSeen,coreDistance:3e4,dust:{count:this.lowTier?110:240,boxMin:new i(-16,-11,-42),boxSize:new i(40,22,38),stream:de},meteors:Nn}),this.fx.setMeteors(!re.reduced),this.scene.add(this.fx.group),this.sky.setReveal(1,1),this.hero.setReveal(1,1);for(let e of this.worlds)e.setFade(1);this.moon.setFade(1),this.rocks.setFade(1),this.debris.setFade(1),this.ship.setFade(1),this.fx.setGlare(1),this.fx.setDust(.9),this.frame(window.innerWidth/window.innerHeight),this.placeCamera(0),y(`fx`),await le(),y(`maps`)}solveShip(){let e=Dn(...An.nose).multiplyScalar(An.noseDistance),t=Dn(...An.stern).multiplyScalar(An.sternDistance),n=e.sub(t);this.shipScale=n.length()/(6-mt),n.normalize();let r=new i(0,1,0).addScaledVector(n,-n.y).normalize().applyAxisAngle(n,An.roll*Tn),a=new i().crossVectors(n,r),o=this.pose;o.quaternion.setFromRotationMatrix(new ee().makeBasis(n,r,a)),o.position.copy(t).addScaledVector(n,-mt*this.shipScale),o.forward.copy(n),o.up.copy(r),o.side.crossVectors(r,n)}travelled(e){if(e<=0)return 0;let t=$,n=t.distance/t.speed-t.tau,r=e<=n?t.speed*e:t.speed*n+t.speed*t.tau*(1-Math.exp(-(e-n)/t.tau));return t.drift*t.driftTau*(1-Math.exp(-e/t.driftTau))+r}pathOffset(e,t){let{forward:n,side:r}=this.pose;if(e<=0)return t.copy(n).multiplyScalar(-e),0;let i=$.turn*Tn,a=$.turnDistance,o=i/a,s=Math.min(e,a);return t.copy(n).multiplyScalar(-Math.sin(o*s)/o).addScaledVector(r,-(1-Math.cos(o*s))/o),e>a&&t.addScaledVector(n,-Math.cos(i)*(e-a)).addScaledVector(r,-Math.sin(i)*(e-a)),s/a*i}flightPath(e){let t=[],n=this.travelled($.composedAt)-this.travelled(Math.max(this.flightClock,0));for(let r=n;r>-e;r-=e)this.pathOffset(Math.max(r,0),this.offset),t.push(this.pose.position.clone().add(this.offset));return t}flyShip(e){let t=Math.max(e,0),n=this.pathOffset(this.travelled($.composedAt)-this.travelled(t),this.offset),r=this.ship.group;r.position.copy(this.pose.position).add(this.offset),this.turnQ.setFromAxisAngle(this.pose.up,n),this.bankQ.setFromAxisAngle(En,$.bank*Tn*(n/($.turn*Tn))),r.quaternion.copy(this.turnQ).multiply(this.pose.quaternion).multiply(this.bankQ),r.scale.setScalar(this.shipScale);let i=$.distance/$.speed-$.tau;this.thrust=1-zn(Rn((t-i-$.plumeHold)/$.plumeFade))}onEnter(){n(`title:backdrop`),jn=!0}leave(){return new Promise(e=>{if(this.disposed){e();return}let t=this.onLeft;this.onLeft=()=>{t?.(),e()},this.leaveT<0&&(this.leaveT=0)})}update(e){this.elapsed+=e;let t=this.elapsed;for(let n of this.worlds)n.update(t,e);this.hero.update(t),this.rocks.update(e),this.debris.update(t),this.flyShip(t+this.flightClock),this.ship.update(t,this.thrust);let n=0;if(this.leaveT>=0){this.leaveT+=e;let t=Rn(this.leaveT/(re.reduced?.35:Ln));if(this.fx.setVeil(zn(t)),n=re.reduced?0:t*t*2.4,t>=1&&this.onLeft){let e=this.onLeft;this.onLeft=null,e()}}this.placeCamera(n),this.fx.update(this.camera,e,t),this.sky.update(this.camera),this.firstFrame&&(this.firstFrame=!1,this.onFirstFrame?.())}placeCamera(e){let t=+!re.reduced,n=this.elapsed;this.camera.position.set(Math.sin(n*.11)*.22*t,Math.sin(n*.083+1.3)*.12*t,Math.sin(n*.061+.6)*.3*t),this.lookTarget.set(Math.sin(this.yaw)*120,0,-Math.cos(this.yaw)*120),e>0&&(this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize(),this.camera.position.addScaledVector(this.scratchW,e)),this.camera.lookAt(this.lookTarget)}frame(e){let t=Math.max(Cn,.36/e);this.camera.fov=2*Math.atan(t)/Tn,this.camera.aspect=e,this.camera.updateProjectionMatrix(),this.yaw=Math.max(0,Math.atan(wn)-Math.atan(t*e)),this.rocks?.setView(t*e,t),this.debris?.setView(t*e,t)}onResize(e,t){this.frame(e/t)}dispose(){this.disposed=!0;let e=this.onLeft;this.onLeft=null,e?.(),this.detail?.dispose(),this.sky?.dispose(),this.hero?.dispose(),this.moon?.dispose(),this.rocks?.dispose(),this.debris?.dispose(),this.ship?.dispose(),this.fx?.dispose();for(let e of this.worlds)Vn(e.group)}};function Vn(e){e.traverse(e=>{let t=e;t.geometry?.dispose();let n=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(let e of n)e.dispose()})}export{Bn as TitleScene,In as preloadTitle};