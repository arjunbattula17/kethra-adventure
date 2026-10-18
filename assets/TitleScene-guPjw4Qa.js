import{$ as e,Bt as t,Ct as n,D as r,Dt as i,G as a,H as o,Ht as s,L as c,Nt as l,Q as u,Rt as d,S as f,St as p,Vt as m,W as h,at as g,b as _,bt as v,ft as y,gt as b,it as x,mt as S,n as C,r as w,rt as T,vt as E,wt as D,x as O,z as k,zt as A}from"./three-DrA6UbAx.js";import{n as j,t as M}from"./perfMarks-B6nwIo-H.js";import{t as N}from"./motion-DWi00b8f.js";import{d as ee,h as P,i as F,u as I}from"./boot-CjIpwYox.js";import{n as L,r as te,t as ne}from"./planetShader-BXua2vnw.js";import{t as R}from"./spaceSky-DAekqCtz.js";var re=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;async function z(e,t,r,i={},a={}){let o=new D({vertexShader:re,fragmentShader:r,uniforms:i,depthTest:!1,depthWrite:!1}),s=new g(new S(2,2),o);s.frustumCulled=!1;let c=new n;c.add(s);let l=new f,u=a.strips??1,d=t.texture.generateMipmaps;try{let n=e.getRenderTarget();e.setRenderTarget(t);let r=e.compileAsync(c,l);e.setRenderTarget(n),await r;let i=t.height;for(let n=0;n<u;n++){n>0&&await a.pace?.();let r=Math.floor(n*i/u),o=Math.floor((n+1)*i/u);t.scissor.set(0,r,t.width,o-r),t.scissorTest=u>1,t.texture.generateMipmaps=d&&n===u-1;let s=e.getRenderTarget(),f=e.autoClear;e.autoClear=!1,e.setRenderTarget(t),e.render(c,l),e.setRenderTarget(s),e.autoClear=f}}finally{t.scissorTest=!1,t.texture.generateMipmaps=d,s.geometry.dispose(),o.dispose()}}var B=`
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
`;async function ie(t,n,r=512){let i=new s(r,r,{type:d,wrapS:v,wrapT:v,minFilter:e,magFilter:u,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return i.texture.name=`title-detail-noise`,await z(t,i,B,{uLoop:{value:8}},{strips:2,pace:n}),i}var V=new A(1.35,.95),ae=`
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
`,oe=`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,se=`
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
`,ce=`
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
`,le=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`,ue=`
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
`;function de(e,t){return t.set(e.x/-e.z,e.y/-e.z)}async function fe(e,n,a,o){let c=new k;c.name=`title-sky`;let l=new s(1280,900,{type:d,depthBuffer:!1,generateMipmaps:!1,minFilter:u,magFilter:u});l.texture.name=`title-sky-card`,await z(e,l,ae,{uHalf:{value:V},uFrom:{value:a.from},uTo:{value:a.to},uCore:{value:a.core},uLoop:{value:6}},{strips:6,pace:o.pace});let f={value:0},p=new g(new i(10,48,24),new D({uniforms:{uCard:{value:l.texture},uDetail:{value:await n},uHalf:{value:V},uBright:f},vertexShader:oe,fragmentShader:se,side:1,depthWrite:!1,depthTest:!1}));p.renderOrder=-1e3,p.frustumCulled=!1,c.add(p);let m=I(o.seed??464670),h=Math.cos(T.degToRad(72)),v=a.to.clone().sub(a.from),y=v.length(),x=v.clone().divideScalar(y),S=new A,C=e=>(de(e,S).sub(a.from),Math.abs(S.x*-x.y+S.y*x.x)),w=e=>{let t=-(h+m()*(1-h)),n=m()*Math.PI*2,r=Math.sqrt(1-t*t);return e.set(Math.cos(n)*r,Math.sin(n)*r,t)},E={value:1},j={value:0},M=(e,n,i)=>{let a=new Float32Array(e*3),o=new Float32Array(e*3),s=new Float32Array(e),c=new t,l=new r;for(let t=0;t<e;t++)s[t]=n(t,c,l),a[t*3]=c.x*9,a[t*3+1]=c.y*9,a[t*3+2]=c.z*9,o[t*3]=l.r,o[t*3+1]=l.g,o[t*3+2]=l.b;let u=new O;u.setAttribute(`position`,new _(a,3)),u.setAttribute(`aColor`,new _(o,3)),u.setAttribute(`aSize`,new _(s,1));let d=new b(u,new D({uniforms:{uPixelRatio:E,uBright:j},vertexShader:ce,fragmentShader:i,blending:2,depthWrite:!1,depthTest:!1}));return d.renderOrder=-999,d.frustumCulled=!1,d.onBeforeRender=e=>{E.value=e.getPixelRatio()},d},N=()=>{let e=m();return e<.12?3300+m()*1200:e>.86?9e3+m()*6e3:5400+m()*2600};c.add(M(o.stars,(e,t,n)=>{for(let e=0;e<10;e++){w(t);let e=C(t);if(m()<.22+.78*Math.exp(-(e*e)/.05))break}let r=m()**3;return R(N(),n).multiplyScalar(.05+r*.5),.7+r*.9},le));let ee=Math.round(o.stars*.07);return c.add(M(ee,(e,t,n)=>{w(t);let r=m()**4;return R(N(),n).multiplyScalar(.5+r*1.8),1.5+r*1.9},le)),c.add(M(18,(e,t,n)=>{for(let e=0;e<30&&(w(t),de(t,S),!(S.x>-.15||S.y<-.05));e++);return R(m()<.6?9e3+m()*7e3:5600+m()*1500,n).multiplyScalar(1.1+m()*1.2),16+m()*12},ue)),{group:c,update(e){e.getWorldPosition(c.position)},setReveal(e,t){j.value=e,f.value=t},dispose(){l.dispose(),c.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var pe=`
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
`,me=`
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
`,he=`
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,ge=`
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
`,_e=-.0085,ve=28e-5,ye=2.25;function be(e){let n=new k;n.name=`title-hero-planet`,n.position.copy(e.center);let a=new r(1,.97,.92).multiplyScalar(2.3),o={uDay:{value:e.day},uNight:{value:e.night},uClouds:{value:e.clouds},uDetail:{value:e.detail},uSunDir:{value:e.sunDir},uSunColor:{value:a},uCloudShift:{value:0},uBumpScale:{value:e.radius*.0014},uNightGlow:{value:1.25},uCloudHeight:{value:e.radius*.004},uFade:{value:0}},s=new g(new i(e.radius,e.segments,e.segments/2),new D({vertexShader:pe,fragmentShader:me,uniforms:o}));s.name=`title-hero-surface`,s.rotation.y=ye;let c=new k;c.rotation.set(.32,0,-.42),c.add(s),n.add(c);let l=e.radius*.0075,u={uCenter:{value:e.center},uR:{value:e.radius},uH:{value:l},uSunDir:{value:e.sunDir},uGlareDir:{value:e.glareDir},uSunColor:{value:new r(1,1,1).multiplyScalar(1.15)},uBeta:{value:new t(.014,.042,.078)},uMie:{value:1},uDiscHaze:{value:.4},uFade:{value:0}},d=new g(new i(e.radius+l*8,e.segments,e.segments/2),new D({vertexShader:he,fragmentShader:ge,uniforms:u,transparent:!0,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendSrcAlpha:200,blendDstAlpha:201}));return d.name=`title-hero-atmosphere`,n.add(d),{group:n,surface:s,radius:e.radius,update(e){s.rotation.y=ye+e*_e,o.uCloudShift.value=e*ve},setReveal(e,t){o.uFade.value=e,u.uFade.value=t},dispose(){s.geometry.dispose(),s.material.dispose(),d.geometry.dispose(),d.material.dispose()}}}var xe=`
  varying vec3 vNormalW;
  varying vec3 vLocalN;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vLocalN = normal;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`,Se=`
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
`;function Ce(e){let t={value:0},n=new g(new i(e.radius,40,20),new D({vertexShader:xe,fragmentShader:Se,uniforms:{uDetail:{value:e.detail},uLight:{value:e.light},uFade:t}}));return n.name=`title-moon`,n.position.copy(e.position),n.rotation.set(.4,1.2,.2),{mesh:n,setFade(e){t.value=e},dispose(){n.geometry.dispose(),n.material.dispose()}}}var we=`
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`,Te=`
  attribute float aCavity;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
`,Ee=e=>`
  attribute float aRock;
  attribute float aSeed;
  uniform vec3 uCenter[${e}];
  uniform vec4 uSpin[${e}];
  ${Te}
  ${we}
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
`,De=`
  attribute vec4 aSlot;
  attribute vec2 aDrift;
  attribute vec4 aSpin;
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uTan;
  uniform vec4 uWrap;
  ${Te}
  ${we}
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
`,Oe=`
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
`;function ke(e){let t=I(e),n=new Uint8Array(512),r=Array.from({length:256},(e,t)=>t);for(let e=255;e>0;e--){let n=Math.floor(t()*(e+1));[r[e],r[n]]=[r[n],r[e]]}for(let e=0;e<512;e++)n[e]=r[e&255];let i=new Float32Array(256).map(()=>t()),a=(e,t,n)=>e+(t-e)*n,o=e=>e*e*(3-2*e),s=(e,t,r)=>i[n[n[n[e&255]+t&255]+r&255]],c=(e,t,n)=>{let r=Math.floor(e),i=Math.floor(t),c=Math.floor(n),l=o(e-r),u=o(t-i),d=o(n-c);return a(a(a(s(r,i,c),s(r+1,i,c),l),a(s(r,i+1,c),s(r+1,i+1,c),l),u),a(a(s(r,i,c+1),s(r+1,i,c+1),l),a(s(r,i+1,c+1),s(r+1,i+1,c+1),l),u),d)};return(e,t,n,r)=>{let i=0,a=.5,o=1,s=0;for(let l=0;l<r;l++)i+=a*c(e*o,t*o,n*o),s+=a,a*=.5,o*=2.1;return i/s}}function Ae(e,n,r=`chunky`){let i=ke(n),a=I(n*7+1),s=new o(1,e);s.deleteAttribute(`uv`),s.deleteAttribute(`normal`),s=w(s);let c=r===`pebble`,l=r===`elongated`?new t(1.5+a()*.25,.6+a()*.15,.65+a()*.15):r===`angular`?new t(1.05,.75+a()*.2,.8+a()*.15):c?new t(1.12,.8+a()*.15,.85+a()*.15):new t(1.15,.6+a()*.25,.72+a()*.23),u=r===`angular`?5+Math.floor(a()*3):c?1+Math.floor(a()*2):3+Math.floor(a()*4),d=r===`angular`?.56:c?.86:.62,f=c?.25:.7,p=c?0:.07,m=Array.from({length:(c?2:5)+Math.floor(a()*4)},()=>({dir:new t(a()-.5,a()-.5,a()-.5).normalize(),size:.16+a()*.32,depth:.05+a()*.08})),h=Array.from({length:u},()=>({n:new t(a()-.5,a()-.5,a()-.5).normalize(),d:d+a()*.22})),g=s.getAttribute(`position`),v=new Float32Array(g.count),y=new t;for(let e=0;e<g.count;e++){y.fromBufferAttribute(g,e).normalize();let t=.97-f*.5+f*i(y.x*1.3+5,y.y*1.3,y.z*1.3,4),n=1-Math.abs(i(y.x*3.2+17,y.y*3.2,y.z*3.2,4)*2-1),r=t+(c?.04:.1)*i(y.x*4+11,y.y*4,y.z*4,3)+p*n*n-.035;for(let e of m){let t=y.distanceTo(e.dir)/e.size;t<1?r-=e.depth*(1-t*t):t<1.45&&(r+=e.depth*.35*(1-Math.abs(t-1.2)/.25)*(t<1.2?(t-1)/.2:1))}v[e]=Math.min(1,Math.max(0,(t-r)*5));for(let e of h){let t=y.dot(e.n);t>.05&&(r=Math.min(r,(e.d+.025*i(y.x*6+3,y.y*6,y.z*6,2))/t))}y.multiplyScalar(r).multiply(l),g.setXYZ(e,y.x,y.y,y.z)}return s.setAttribute(`aCavity`,new _(v,1)),s.computeVertexNormals(),s}var je=null;function Me(){if(je)return je;let e=new l,t=(t,n)=>{let r,i=new Promise(e=>r=e),a=e.load(`/kethra-adventure/textures/lichen_rock/`+t,()=>r(),void 0,()=>r());return a.colorSpace=n?p:``,a.wrapS=a.wrapT=v,a.anisotropy=4,{t:a,ready:i}},n=t(`diff.jpg`,!0),r=t(`nor_gl.jpg`,!1);return je={map:n.t,normal:r.t,ready:Promise.all([n.ready,r.ready]).then(()=>void 0)},je}function Ne(e,t,n,i){let a=Me();return new D({vertexShader:e,fragmentShader:Oe,uniforms:{uRock:{value:a.map},uRockNormal:{value:a.normal},uSunDir:{value:t.sunDir},uRimDir:{value:t.rimDir},uSunColor:{value:new r(1,.95,.88).multiplyScalar(1.7)},uBounceDir:{value:t.bounceDir},uBounceColor:{value:new r(4164186).multiplyScalar(.4)},uFade:i,...n}})}var H=(e,t)=>e[0]+(e[1]-e[0])*t,Pe=Math.PI*2,Fe=3;async function Ie(e){let n=I(e.seed),r=e.pool.length,i=[],a=new Float32Array(r);for(let t=0;t<r;t++){let[r,o,s]=e.pool[t],c=Ae(s,101+t*37,o).toNonIndexed();c.scale(r,r,r);let l=c.getAttribute(`position`);for(let e=0;e<l.count;e++)a[t]=Math.max(a[t],Math.hypot(l.getX(e),l.getY(e),l.getZ(e)));c.setAttribute(`aRock`,new _(new Float32Array(l.count).fill(t),1)),c.setAttribute(`aSeed`,new _(new Float32Array(l.count).fill(n()),1)),i.push(c),s>=4&&await e.pace?.()}let o=C(i,!1);for(let e of i)e.dispose();let s=Array.from({length:r},()=>new t),c=Array.from({length:r},()=>new m),l=Array.from({length:r},()=>new t),u=new Float32Array(r),d=new Uint16Array(r),f={value:0},p=new g(o,Ne(Ee(r),e,{uCenter:{value:s},uSpin:{value:c}},f));p.name=`title-asteroids`,p.frustumCulled=!1;let{tanH:h,tanV:v}=e.view,y=h,b=v,x=new t,S=(t,i)=>{let o=T.clamp(t/Math.max(r-1,1)+(n()-.5)*.3,0,1),f=e.distance[0]*(e.distance[1]/e.distance[0])**+o,p=a[t]/f,m=i??.5-.5*y/h-p/(2*h)-.02,g=e.bandTop+p/(2*v)+n()*e.bandDepth;s[t].copy(x.set((2*m-1)*h,(1-2*g)*v,-1).normalize()).multiplyScalar(f);let _=2*f*h/H(e.crossing,n());l[t].set(_,-_*H(e.sink,n()),_*H(e.approach,n())),c[t].set(n()-.5,n()-.5,n()-.5,0).normalize(),c[t].w=n()*Pe,u[t]=H(e.spin,n())/Math.sqrt(Math.max(e.pool[t][0],.3))*(n()<.5?-1:1),d[t]++},w=t=>!e.avoid||e.avoid.points.every(n=>n.distanceTo(s[t])>a[t]+e.avoid.clearance),E=Array.from({length:r},(e,t)=>t);for(let e=r-1;e>0;e--){let t=Math.floor(n()*(e+1));[E[e],E[t]]=[E[t],E[e]]}for(let e=0;e<r;e++){let t=E[e],i=!1;for(let a=0;a<24&&!i;a++)S(t,-.05+1.1*(e+n())/r),i=w(t);i||S(t,null),d[t]=0}return await Me().ready,{mesh:p,update(e){let t=Math.min(e,.1),n=.5+.5*y/h+.02,i=.5+.5*b/v+.02;for(let e=0;e<r;e++){let r=s[e].addScaledVector(l[e],t);c[e].w=(c[e].w+u[e]*t)%Pe;let o=-r.z;if(o<Fe){S(e,null);continue}let d=a[e]/o,f=.5+.5*r.x/o/h-d/(2*h),p=.5-.5*r.y/o/v-d/(2*v);(f>n||p>i)&&S(e,null)}},setView(e,t){y=Math.max(e,h),b=Math.max(t,v)},setFade(e){f.value=e},report(){return s.map((e,t)=>({x:.5+.5*e.x/-e.z/h,y:.5-.5*e.y/-e.z/v,d:-e.z,passes:d[t]}))},dispose(){o.dispose(),p.material.dispose()}}}var Le=.06;function Re(e){let n=I(e.seed),{tanH:r,tanV:i}=e.view,o={value:0},s={value:0},c={value:new m},l=(e,t)=>{let n=.5*Math.max(e,r)/r+Le,a=.5*Math.max(t,i)/i+Le;c.value.set(.5-n,.5-a,2*n,2*a)};l(r,i);let u=Ne(De,e,{uTime:o,uTan:{value:new A(r,i)},uWrap:c},s),d=new k;d.name=`title-debris`;let f=[`pebble`,`pebble`,`pebble`],p=[],_=e.count;return f.forEach((o,s)=>{let c=s===f.length-1?_:Math.round(e.count/f.length);_-=c;let l=Ae(2,911+s*53,o),m=new a;m.index=l.index;for(let e of[`position`,`normal`,`aCavity`])m.setAttribute(e,l.getAttribute(e));m.instanceCount=c;let v=new Float32Array(c*4),y=new Float32Array(c*2),b=new Float32Array(c*4),x=new Float32Array(c),S=new t;for(let t=0;t<c;t++){let a=e.distance[0]*(e.distance[1]/e.distance[0])**+n();v.set([n(),n(),a,a*H(e.size,n())],t*4);let o=H(e.drift,n())*(e.driftAt/a)**+e.parallax,s=n()*Pe;y.set([Math.cos(s)*o,Math.sin(s)*o*(r/i)],t*2),S.set(n()-.5,n()-.5,n()-.5).normalize(),b.set([S.x,S.y,S.z,H(e.spin,n())*(n()<.5?-1:1)],t*4),x[t]=n()}m.setAttribute(`aSlot`,new h(v,4)),m.setAttribute(`aDrift`,new h(y,2)),m.setAttribute(`aSpin`,new h(b,4)),m.setAttribute(`aSeed`,new h(x,1)),p.push(m);let C=new g(m,u);C.name=`title-debris-${s}`,C.frustumCulled=!1,d.add(C)}),{group:d,update(e){o.value=e},setView:l,setFade(e){s.value=e},dispose(){for(let e of p)e.dispose();u.dispose()}}}var ze=()=>new S(2,2),Be=`
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uSize;
  uniform float uDepth;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uCenter + position.xy * vec2(uSize / uAspect, uSize), uDepth, 1.0);
  }
`,Ve=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float k = exp(-r * r * 2200.0) * 7.0 + exp(-r * 70.0) * 1.3 + exp(-r * 14.0) * 0.28;
    k *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * k * uIntensity, 1.0);
  }
`,He=`
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
`,Ue=`
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
`,We=`
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
`,Ge=`
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
`,Ke=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float along = vP.x * 0.5 + 0.5;
    float k = pow(along, 3.0) * exp(-vP.y * vP.y * 9.0);
    k += exp(-((1.0 - along) * (1.0 - along)) * 900.0 - vP.y * vP.y * 6.0) * 1.5;
    gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * k * uIntensity, 1.0);
  }
`,qe=`
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
`,Je=`
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 4.0) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * k * vAlpha * uIntensity, 1.0);
  }
`,Ye=`
  precision highp float;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;function Xe(e){let n=new k;n.name=`title-sky-fx`;let r={value:16/9},i=new A,a={value:i},o={value:0},s={value:0},l={value:.9999},u=new D({vertexShader:Be,fragmentShader:Ve,uniforms:{uCenter:a,uAspect:r,uSize:{value:.5},uDepth:l,uIntensity:o},transparent:!0,depthWrite:!1,blending:2}),d=new g(ze(),u);d.frustumCulled=!1,d.renderOrder=20,n.add(d);let f=new D({vertexShader:Be,fragmentShader:He,uniforms:{uCenter:a,uAspect:r,uSize:{value:.95},uDepth:{value:0},uIntensity:o,uTime:s},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),p=new g(ze(),f);p.frustumCulled=!1,p.renderOrder=900,n.add(p);let m=[[.22,.035,[.25,.55,.6]],[.42,.06,[.5,.42,.25]],[.62,.022,[.3,.6,.9]]],h=[],v=[],y=[],x=[],S=[],C=[];m.forEach(([e,t,n],r)=>{for(let[r,i]of[[-1,-1],[1,-1],[1,1],[-1,1]])h.push(0,0,0),v.push(r,i),y.push(e),x.push(t),S.push(...n);C.push(r*4,r*4+1,r*4+2,r*4,r*4+2,r*4+3)});let w=new O;w.setAttribute(`position`,new c(h,3)),w.setAttribute(`aCorner`,new c(v,2)),w.setAttribute(`aAlong`,new c(y,1)),w.setAttribute(`aSize`,new c(x,1)),w.setAttribute(`aTint`,new c(S,3)),w.setIndex(C);let T={value:0},E=new g(w,new D({vertexShader:Ue,fragmentShader:We,uniforms:{uSun:a,uAspect:r,uIntensity:T},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}));E.frustumCulled=!1,E.renderOrder=901,n.add(E);let j={uHead:{value:new A},uDir:{value:new A(-.8,-.6)},uLength:{value:.22},uWidth:{value:.0024},uAspect:r,uIntensity:{value:0}},M=new g(ze(),new D({vertexShader:Ge,fragmentShader:Ke,uniforms:j,depthWrite:!1,blending:2}));M.frustumCulled=!1,M.renderOrder=-998,M.visible=!1,n.add(M);let N=I(255968),ee=!0,P=10+N()*8,F=-1,L=new A,te=new Float32Array(e.dust.count*3),ne=new Float32Array(e.dust.count);for(let t=0;t<e.dust.count;t++)te[t*3]=e.dust.boxMin.x+N()*e.dust.boxSize.x,te[t*3+1]=e.dust.boxMin.y+N()*e.dust.boxSize.y,te[t*3+2]=e.dust.boxMin.z+N()*e.dust.boxSize.z,ne[t]=N();let R=new O;R.setAttribute(`position`,new _(te,3)),R.setAttribute(`aSeed`,new _(ne,1));let re={value:0},z={value:1},B=new b(R,new D({vertexShader:qe,fragmentShader:Je,uniforms:{uTime:s,uStream:{value:e.dust.stream},uBoxMin:{value:e.dust.boxMin},uBoxSize:{value:e.dust.boxSize},uPixelRatio:z,uIntensity:re},transparent:!0,depthWrite:!1,blending:2}));B.frustumCulled=!1,B.renderOrder=10,B.onBeforeRender=e=>{z.value=e.getPixelRatio()},n.add(B);let ie={value:0},V=new g(ze(),new D({vertexShader:`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:Ye,uniforms:{uOpacity:ie},transparent:!0,depthWrite:!1,depthTest:!1}));V.frustumCulled=!1,V.renderOrder=1e4,V.visible=!1,n.add(V);let ae=new t,oe=new t;return{group:n,update(t,n,a){if(s.value=a,r.value=t.aspect,ae.copy(e.sunDir).multiplyScalar(e.coreDistance).add(t.position),oe.copy(ae).project(t),i.set(oe.x,oe.y),l.value=Math.min(oe.z,.99999),F>=0){F+=n;let e=F/.7;e>=1?(F=-1,M.visible=!1,P=14+N()*16):(j.uHead.value.copy(j.uDir.value).multiplyScalar(e*.5).add(L),j.uIntensity.value=Math.sin(Math.PI*e)*.7)}else if(ee&&(P-=n)<=0){let[t,n,i,a]=e.meteorArea;L.set((t+N()*(i-t))*r.value,n+N()*(a-n));let o=Math.PI+.35+N()*.5;j.uDir.value.set(Math.cos(o),Math.sin(o)),j.uLength.value=.12+N()*.12,F=0,M.visible=!0}},setGlare(e){o.value=e,T.value=e*.05},setDust(e){re.value=e},setVeil(e){ie.value=e,V.visible=e>0},setMeteors(e){ee=e},dispose(){n.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var U=0,W=1,G=2,Ze=3,Qe=4,$e=5,et=5.6,tt=-5.4,nt=30,rt=.3,it=.3,K=(e,n,r)=>new t(e,n,r),at=class{pos=[];mat=[];kind=U;tint=1;seed=0;xf=null;e1=new t;e2=new t;n=new t;c=new t;rand;constructor(e){this.rand=e}use(e,t=1){return this.kind=e,this.tint=t,this.seed=this.rand(),this}place(e){return this.xf=e,this}tri(e,t,n,r,i=!1,a=this.tint){if(this.e1.subVectors(t,e),this.e2.subVectors(n,e),this.n.crossVectors(this.e1,this.e2),this.n.lengthSq()<1e-10)return;this.c.copy(e).add(t).add(n).divideScalar(3).sub(r);let o=[e,t,n];this.n.dot(this.c)<0!==i&&(o=[e,n,t]);for(let e of o){let t=this.xf?e.clone().applyMatrix4(this.xf):e;this.pos.push(t.x,t.y,t.z),this.mat.push(this.kind,a,this.seed)}}quad(e,t,n,r,i,a=!1){this.tri(e,t,n,i,a),this.tri(e,n,r,i,a)}loft(e,n=[!0,!0]){let r=e=>{let t=0,n=0;for(let[r,i]of e.pts)t+=r,n+=i;return K(e.x,t/e.pts.length,n/e.pts.length)},i=e[0].pts.length;for(let t=0;t<e.length-1;t++){let n=e[t],a=e[t+1],o=r(n).add(r(a)).multiplyScalar(.5);for(let e=0;e<i;e++){let t=(e+1)%i;this.quad(K(n.x,n.pts[e][0],n.pts[e][1]),K(n.x,n.pts[t][0],n.pts[t][1]),K(a.x,a.pts[t][0],a.pts[t][1]),K(a.x,a.pts[e][0],a.pts[e][1]),o)}}let a=e.reduce((e,t)=>e.add(r(t)),new t).divideScalar(e.length),o=e=>{let t=r(e);for(let n=0;n<i;n++){let r=(n+1)%i;this.tri(t,K(e.x,e.pts[n][0],e.pts[n][1]),K(e.x,e.pts[r][0],e.pts[r][1]),a)}};n[0]&&o(e[0]),n[1]&&o(e[e.length-1])}};function ot(e,t,n,r,i){let a=Math.max(1e-4,Math.min(i,n*.45,r*.45));return[[e+n,t+r-a],[e+n,t-r+a],[e+n-a,t-r],[e-n+a,t-r],[e-n,t-r+a],[e-n,t+r-a],[e-n+a,t+r],[e+n-a,t+r]]}function q(e,t,n,r,i,a,o=.18,s=.2,c=0){return{x:e,pts:[[t,c+i],[t,c-i],[t-o,c-r],[n+s,c-r],[n,c-a],[n,c+a],[n+s,c+r],[t-o,c+r]]}}function st(e,t,n,r,i,a=0){let o=[],s=[[t-i,a+r-i,0],[t-i,a-r+i,90],[n+i,a-r+i,180],[n+i,a+r-i,270]];for(let[e,t,n]of s)for(let r=0;r<3;r++){let a=(n+r*45)*Math.PI/180;o.push([e+Math.sin(a)*i,t+Math.cos(a)*i])}return{x:e,pts:o}}function J(e,t,n,r){let i=[];for(let a=0;a<r;a++){let o=a/r*Math.PI*2;i.push([e+Math.sin(o)*n,t+Math.cos(o)*n])}return i}function Y(e,t,n,r,i,a,o,s=0,c=.06,l=0){let u=Math.min(c,(n-t)*.25,(i-r)*.3),d=(e,t)=>{let n=a+(o-a)*e,u=(i-l*e-r)/2;return ot(r+u,s,u-t,n-t,c)},f=n-t;e.loft([{x:t,pts:d(0,u)},{x:t+u,pts:d(u/f,0)},{x:n-u,pts:d(1-u/f,0)},{x:n,pts:d(1,u)}])}function ct(e,t,n,r,i,a,o,s,c=.03){let l=Math.min(c,Math.abs(n-t)*.25),u=Math.sign(n-t);e.loft([{x:t,pts:J(r,i,a-l,s)},{x:t+l*u,pts:J(r,i,a,s)},{x:n-l*u,pts:J(r,i,o,s)},{x:n,pts:J(r,i,o-l,s)}])}function lt(e,t,n,r,i){let a=t+i*.9;e.use(G,.85),ct(e,a+i*3.6,a+i*.25,n,r,i*1.08,i*1.12,24),e.use(W);for(let t of[2.4,1.2])ct(e,a+i*t,a+i*(t-.32),n,r,i*1.22,i*1.22,24,.02);e.use(G,.7),e.loft([{x:a+i*.3,pts:J(n,r,i*1.1,24)},{x:t+i*.35,pts:J(n,r,i*1.12,24)},{x:t,pts:J(n,r,i*1.2,24)}],[!1,!1]);let o=[[t,i*1.13,.06],[t+i*.4,i*.98,.3],[a-i*.1,i*.8,.85]];for(let t=0;t<o.length-1;t++){let[i,a,s]=o[t],[c,l,u]=o[t+1],d=J(n,r,a,24),f=J(n,r,l,24);e.use(Qe);for(let t=0;t<24;t++){let a=(t+1)%24,o=K((i+c)/2,n,r),l=K(i,d[t][0],d[t][1]),p=K(i,d[a][0],d[a][1]),m=K(c,f[a][0],f[a][1]),h=K(c,f[t][0],f[t][1]);e.tri(l,p,m,o,!0,s),e.tri(l,m,h,o,!0,(s+u)/2)}}let s=J(n,r,i*1.2,24),c=J(n,r,i*1.13,24);e.use(G,.9);for(let i=0;i<24;i++){let a=(i+1)%24;e.quad(K(t,s[i][0],s[i][1]),K(t,s[a][0],s[a][1]),K(t,c[a][0],c[a][1]),K(t,c[i][0],c[i][1]),K(t+1,n,r))}let l=a-i*.1,u=K(l+1,n,r),d=J(n,r,i*.8,24),f=J(n,r,i*.42,24);e.use(Qe);for(let t=0;t<24;t++){let n=(t+1)%24;e.tri(K(l,d[t][0],d[t][1]),K(l,d[n][0],d[n][1]),K(l,f[n][0],f[n][1]),u,!1,1),e.tri(K(l,d[t][0],d[t][1]),K(l,f[n][0],f[n][1]),K(l,f[t][0],f[t][1]),u,!1,1)}e.use($e);let p=K(l,n,r);for(let t=0;t<24;t++){let n=(t+1)%24;e.tri(p,K(l,f[t][0],f[t][1]),K(l,f[n][0],f[n][1]),u)}}function ut(e){let t=new at(e),n=[];t.use(U),t.loft([q(-3.7,.62,-.62,1,.66,.56),q(-1,.72,-.7,1.12,.76,.62,.2,.22),q(1.3,.72,-.68,1.06,.72,.58,.2,.22),q(3.3,.6,-.56,.8,.5,.42),q(4.7,.36,-.32,.44,.24,.2,.12,.12),q(et,.12,-.08,.14,.07,.05,.04,.04)]),t.use(W),Y(t,-3.1,2.2,.66,1,.4,.34,0,.08),t.use(U,1.08);for(let e of[1,-1])Y(t,-3.3,2.6,.66,.8,.2,.18,e*.56,.04);t.use(U,1.14),Y(t,.35,1.8,.96,1.24,.5,.38,0,.1,.08),t.use(W),Y(t,.6,1.5,1.22,1.3,.34,.26,0,.03),t.use(G),Y(t,.9,.96,1.28,1.56,.025,.025,0,.01),t.use(U,.96),Y(t,1.9,3.8,.62,.78,.64,.4,0,.05,.08),Y(t,3.5,4.95,.46,.6,.4,.18,0,.04,.14),t.use(U,1.05),Y(t,-3.85,-1.6,.56,.86,.86,.84,0,.07);for(let e of[1,-1])t.use(U,1.12),Y(t,-1.4,.3,.6,.74,.16,.16,e*.94,.03),Y(t,.4,2.1,.6,.74,.16,.15,e*.94,.03),t.use(U,.9),Y(t,2,3.3,.38,.6,.08,.06,e*.88,.03,.06),Y(t,3.4,4.6,.2,.44,.07,.05,e*.6,.03,.08);t.use(Ze,.4),Y(t,1.74,1.82,1.06,1.12,.32,.3,0,.005);for(let e of[1,-1])for(let n=0;n<4;n++)Y(t,2.85+n*.24,2.99+n*.24,.2,.27,.02,.02,e*(.88-n*.065),.005);for(let e of[1,-1]){t.use(U,1.04);for(let[n,r,i,a]of[[1.55,2.45,1.07,.98],[2.55,3.35,.96,.83]]){let o=(n+r)/2,s=e*((i+a)/2+.04),c=Math.hypot(r-n,i-a),l=new x().makeRotationY(e*Math.atan2(i-a,r-n));l.setPosition(o,0,s),t.place(l),Y(t,-c/2,c/2,-.34,.34,.05,.05,0,.02),Y(t,-c/2+.06,c/2-.06,-.58,-.42,.04,.04,-.01*e,.015)}t.place(null),t.use(G,.9),Y(t,1.4,2.9,.42,.48,.035,.035,e*1.06,.01)}for(let e of[1,-1]){let r=e*1.62;t.use(U,.98),t.loft([st(-4.2,.4600000000000001,-.7,.76,.3,r),st(-1.2,.52,-.74,.8,.32,r),st(.4,.4,-.64,.64,.26,r-e*.14),st(1.6,.07999999999999999,-.38,.28,.1,r-e*.46)]);let i=r+e*.8;t.use(U,1.06);for(let[e,n]of[[-4,-3],[-2.9,-1.9],[-1.8,-.7],[-.6,.4]])Y(t,e,n,-.33999999999999997,.22,.045,.045,i,.02);t.use(U,.92);for(let[n,r]of[[-4,-3.3],[-3.2,-2.2],[-2.1,-1.2],[-1.1,.2]])Y(t,n,r,-.58,-.4,.035,.035,i-e*.05,.015);t.use(U,1.1);for(let[n,i]of[[-4,-2.8],[-2.7,-1],[-.9,.5]])Y(t,n,i,.4600000000000001,.56,.22,.2,r+e*.26,.02);t.use(Ze,.15),Y(t,-2.6,-2.1,.31999999999999995,.36,.02,.02,i+e*.02,.004),Y(t,-1.3,-.95,.31999999999999995,.36,.02,.02,i+e*.02,.004),t.use(W);for(let n=0;n<6;n++)Y(t,-3.9+n*.45,-3.72+n*.45,-.6,-.4,.12,.12,i-e*.06,.01);for(let e of[.38,-.38]){let i=K(tt,-.14,r+e);lt(t,i.x,i.y,i.z,.35),n.push({at:i,r:.35})}t.use(W),Y(t,-4.35,-3.95,-.6799999999999999,.4,.78,.78,r,.06),t.use(W,1.06),Y(t,-5.75,-1.2,.4,.68,.16,.18,r,.04),t.use(U,1.1),Y(t,-5.3,-2.4,.68,.74,.12,.14,r,.02),t.use(Ze,.6),Y(t,-5.8,-5.74,.5,.5800000000000001,.05,.05,r,.005)}t.use(W,1.04),Y(t,-6,-1,-1.12,-.62,.22,.3,0,.06,-.14),t.use(Ze,.7),Y(t,-6.05,-5.99,-.98,-.86,.06,.06,0,.005),t.use(U,1.02),Y(t,.4,3.4,-1.1,-.64,.54,.42,0,.08,-.08),t.use(W),Y(t,.9,2.8,-1.2,-1.08,.34,.3,0,.03);let r=(n,r,i,a,o,s,c=0)=>{for(let l=0;l<s;l++){let s=n+e()*(r-n),l=i+(e()*2-1)*a;Math.abs(l-i)<c&&(l=i+Math.sign(l-i||1)*c);let u=.12+e()*.42,d=.05+e()*.12,f=.04+e()*.1;t.use(e()<.6?W:G,.85+e()*.3),Y(t,s,s+u,o-.08,o+f,d,d,l,Math.min(d,f)*.3)}};r(-3.2,2.2,0,.72,.72,30,.42),r(2,3.2,0,.45,.7,6);for(let e of[1,-1])r(-4,.2,e*1.62,.42,.5,14);let i=new O;return i.setAttribute(`position`,new c(t.pos,3)),i.setAttribute(`aMat`,new c(t.mat,3)),i.computeVertexNormals(),i.computeBoundingSphere(),{geometry:i,engines:n}}var dt=`
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
    // 4 x 4 cells a tile, each split at random into plates (a k-d split, so it tiles).
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
    // One cell is 128 texels: the grooves are about two texels wide.
    float groove = smoothstep(0.006, 0.018, edge);
    float type = h21(vec2(id * 3.1, 7.7));
    float plateH = 0.45 + 0.22 * h21(vec2(id * 5.7, 2.2));
    float height = plateH;
    float albedo = 0.8 + 0.2 * h21(vec2(id * 9.1, 4.4));
    float rough = 0.3 + 0.42 * h21(vec2(id * 2.9, 8.8));
    float lamp = 0.0;
    bool longX = size.x > size.y;
    float acrossQ = longX ? q.y : q.x;
    float alongQ = longX ? q.x : q.y;
    float alongLen = longX ? size.x : size.y;
    float acrossLen = longX ? size.y : size.x;
    float rim = min(min(dEdge.x, dEdge.y) / 0.06, 1.0);
    if (type < 0.15) {
      // Vents: slats across the panel, inside a recessed frame.
      float inset = step(0.05, edge);
      float slat = smoothstep(0.35, 0.5, abs(fract(alongQ * alongLen * 20.0) - 0.5) * 2.0);
      height = mix(plateH, 0.2 + 0.3 * slat, inset);
      albedo *= mix(1.0, 0.5, inset);
      rough = mix(rough, 0.6, inset);
    } else if (type < 0.3) {
      // A raised block on the plate.
      float inner = smoothstep(0.035, 0.05, edge);
      height = plateH + 0.26 * inner;
      albedo *= 1.0 + 0.12 * inner;
    } else if (type < 0.4 && acrossLen < 0.34) {
      // A strip of lit ports along a narrow plate, some dark.
      float slot = floor(alongQ * alongLen * 10.0);
      float ports = step(0.3, fract(alongQ * alongLen * 10.0)) * step(abs(acrossQ - 0.5) * acrossLen, 0.03);
      lamp = ports * step(0.45, h21(vec2(id * 4.4, slot)));
      height = plateH - 0.1 * ports;
      albedo *= 0.7;
    } else {
      // A plain plate with a bolt row inside each long edge.
      float edgeDist = min(acrossQ, 1.0 - acrossQ) * acrossLen;
      float bolts = step(abs(edgeDist - 0.03), 0.008) * step(0.55, fract(alongQ * alongLen * 26.0));
      height += 0.12 * bolts;
      albedo *= 1.0 - 0.1 * bolts;
    }
    // Panel edges sit a little proud of the plate, then drop into the groove.
    height += 0.05 * (1.0 - rim) * groove;
    // Soot and wear running along the hull.
    float lane = floor(vUv.x * 128.0);
    float wear = h21(vec2(lane, 3.3)) * smoothstep(0.3, 1.0, h21(vec2(lane, floor(vUv.y * 8.0))));
    albedo *= 1.0 - 0.22 * wear;
    height *= groove;
    albedo *= mix(0.3, 1.0, groove);
    rough = mix(0.85, rough, groove);
    gl_FragColor = vec4(height, albedo, rough, lamp);
  }
`;async function ft(t,n){let r=new s(512,512,{type:d,wrapS:v,wrapT:v,minFilter:e,magFilter:u,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return r.texture.name=`title-ship-panels`,await z(t,r,dt,{uLoop:{value:5}},{strips:2,pace:n}),r}var pt=`
  attribute vec3 aMat;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec3 vMat;
  void main() {
    vLocal = position;
    vLocalN = normal;
    vMat = aMat;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,mt=`
  precision highp float;
  uniform sampler2D uPanel;
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
  uniform vec3 uEngineColor;
  uniform vec3 uLampColor;
  uniform vec3 uFillDir;
  uniform vec3 uFillColor;
  uniform float uPower;
  uniform float uBump;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
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
    col += uSunColor * pow(s, sharp) * (sharp * 0.008 + 0.1);
    return col;
  }

  void main() {
    float kind = vMat.x;
    float tint = vMat.y;
    float seed = vMat.z;
    vec3 ln = normalize(vLocalN);

    if (kind > 2.5) {
      // Lamps, the insides of the bells, the throats: light, not lit.
      vec3 e;
      if (kind < 3.5) e = uLampColor * (1.2 + 2.5 * tint);
      else if (kind < 4.5) e = uEngineColor * tint * tint * 2.3;
      else e = mix(uEngineColor, vec3(1.0), 0.55) * 2.5;
      gl_FragColor = vec4(e * (kind > 3.5 ? uPower : 1.0) * uFade, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      return;
    }

    // The panel sheet, box-projected in ship space by the face's own axis, at two scales.
    vec3 an = abs(ln);
    vec2 uv = an.x > max(an.y, an.z) ? vLocal.zy : (an.y > an.z ? vLocal.xz : vLocal.xy);
    uv = uv * 0.32 + vec2(seed * 7.31, seed * 3.17);
    vec4 s = texture2D(uPanel, uv);
    vec4 s2 = texture2D(uPanel, uv * 0.45 + vec2(0.37, 0.61));
    // The bump reads a mip down, so plating stays crisp without sparkling where the sheet is minified.
    float height = texture2D(uPanel, uv, 1.0).r * 0.7 + s2.r * 0.3;

    // Bump from the sheet's height, through screen derivatives (no tangents).
    vec3 nG = normalize(vNormalW);
    vec3 dpx = dFdx(vPosW);
    vec3 dpy = dFdy(vPosW);
    vec3 r1 = cross(dpy, nG);
    vec3 r2 = cross(nG, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
    vec3 n = normalize(abs(det) * nG - grad * uBump);

    float isFrame = step(0.5, kind) * (1.0 - step(1.5, kind));
    float isMetal = step(1.5, kind);
    float isPlate = 1.0 - isFrame - isMetal;
    vec3 base = vec3(0.075, 0.079, 0.087) * isPlate + vec3(0.045, 0.047, 0.052) * isFrame + vec3(0.13, 0.135, 0.145) * isMetal;
    // Plates differ: some lighter, some sooted, so the hull reads as built from parts.
    float plateShade = 0.55 + 0.75 * s.g * s.g * (0.75 + 0.25 * s2.g);
    base *= tint * plateShade;
    float metal = 0.5 * isPlate + 0.65 * isFrame + 0.85 * isMetal;
    float rough = clamp(0.36 + 0.36 * s.b + 0.08 * isFrame - 0.08 * isMetal, 0.3, 0.92);
    // Grooves and the undersides are in shade.
    float ao = mix(0.4, 1.0, smoothstep(0.06, 0.34, height)) * mix(0.5, 1.0, smoothstep(-0.95, 0.15, ln.y));

    vec3 V = normalize(cameraPosition - vPosW);
    float NdV = max(dot(n, V), 1e-3);
    vec3 F0 = mix(vec3(0.04), base * 2.6 + 0.06, metal);
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
    vec3 col = (diffuse + spec) * uKeyColor * NdL * mix(0.55, 1.0, ao);

    // Reflections of the sky, Kethra and the sun.
    vec3 R = reflect(-V, n);
    vec3 Fe = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NdV, 5.0);
    col += environment(vPosW, R, rough) * Fe * ao;

    // Kethra's bounce from below, a little cool fill, and the sun's rim from behind.
    float bounce = max(dot(n, uBounceDir) * 0.8 + 0.2, 0.0);
    col += (diffuse + F0 * 0.25) * uBounceColor * bounce * ao;
    // A cool fill from our side, the way a cinematographer would light it: enough for the plating on
    // the flank toward us to read, and a soft sheen on its metal.
    float NdF = max(dot(n, uFillDir), 0.0);
    vec3 Hf = normalize(uFillDir + V);
    col += (diffuse + F0 * pow(max(dot(n, Hf), 0.0), 24.0) * 1.4) * uFillColor * NdF * ao;
    float rim = pow(1.0 - NdV, 3.0) * max(dot(n, uSunDir) + 0.25, 0.0);
    col += uSunColor * rim * (0.05 + 0.3 * metal) * ao;

    // The engines light the stern blue.
    vec3 eA = uEngineA - vLocal;
    vec3 eB = uEngineB - vLocal;
    float dA = dot(eA, eA);
    float dB = dot(eB, eB);
    float glow = max(dot(ln, eA * inversesqrt(dA)), 0.0) / (1.0 + dA * 0.9) + max(dot(ln, eB * inversesqrt(dB)), 0.0) / (1.0 + dB * 0.9);
    col += uEngineColor * glow * uPower * (diffuse * 2.0 + F0 * 0.5);

    // Lit ports from the panel sheet, on about half the plates.
    col += uLampColor * s.a * isPlate * step(0.5, fract(seed * 13.7)) * 1.6;

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,ht=`
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
      float width = r * mix(1.0, 1.9, along);
      vec3 world = p0 + axis * along * uLength * r + side * aShape.y * width;
      gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    } else {
      // The glow in the bell's mouth: a quad facing the camera.
      vec4 mv = viewMatrix * vec4(p0 + axis * r * 0.1, 1.0);
      mv.xy += aShape.xy * r * 2.6;
      gl_Position = projectionMatrix * mv;
    }
  }
`,gt=`
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
      col = uColor * (sheath * 0.42 + core * 1.05) * fall * streak + vec3(0.4, 0.74, 1.0) * core * hot * 0.5;
    } else {
      float r = length(vShape);
      float k = exp(-r * r * 26.0) * 0.55 + exp(-r * 5.0) * 0.22;
      k *= smoothstep(1.0, 0.6, r);
      col = mix(uColor, vec3(0.7, 0.9, 1.0), exp(-r * r * 200.0)) * k;
    }
    gl_FragColor = vec4(col * uPower * uFade, 1.0);
  }
`;function _t(e){let t=[],n=[],r=[],i=0;for(let a of e){for(let e=0;e<=10;e++){let r=e/10;for(let e of[-1,1])t.push(a.at.x,a.at.y,a.at.z),n.push(r,e,a.r,0)}for(let e=0;e<10;e++){let t=i+e*2;r.push(t,t+1,t+3,t,t+3,t+2)}i+=22;for(let[e,r]of[[-1,-1],[1,-1],[1,1],[-1,1]])t.push(a.at.x,a.at.y,a.at.z),n.push(e,r,a.r,1);r.push(i,i+1,i+2,i,i+2,i+3),i+=4}let a=new O;return a.setAttribute(`position`,new c(Array(t.length).fill(0),3)),a.setAttribute(`aNozzle`,new c(t,3)),a.setAttribute(`aShape`,new c(n,4)),a.setIndex(r),a}async function vt(e,n){let i=await ft(e,n.pace),{geometry:a,engines:o}=ut(I(373239)),s=new r(.1,.38,1),c={value:1},l={value:1},u={value:nt},d={value:0},f=o.filter(e=>e.at.z>0),p=o.filter(e=>e.at.z<0),m=e=>e.reduce((e,t)=>e.add(t.at),new t).divideScalar(e.length).add(new t(-.6,0,0)),h=new g(a,new D({vertexShader:pt,fragmentShader:mt,uniforms:{uPanel:{value:i.texture},uKeyDir:{value:n.keyDir},uKeyColor:{value:new r(1,.9,.78).multiplyScalar(3.4)},uFillDir:{value:n.fillDir},uFillColor:{value:new r(.32,.45,.62)},uSunDir:{value:n.sunDir},uSunColor:{value:new r(1,.86,.7).multiplyScalar(2.2)},uBounceDir:{value:n.bounceDir},uBounceColor:{value:new r(.16,.34,.36)},uPlanetCenter:{value:n.planetCenter},uPlanetRadius:{value:n.planetRadius},uPlanetLight:{value:n.planetLight},uEngineA:{value:m(p)},uEngineB:{value:m(f)},uEngineColor:{value:s},uLampColor:{value:new r(.35,.72,1)},uPower:c,uBump:{value:.022},uFade:d}}));h.name=`title-ship-hull`,h.frustumCulled=!1;let _={value:0},v=new g(_t(o),new D({vertexShader:ht,fragmentShader:gt,uniforms:{uLength:u,uPower:l,uTime:_,uColor:{value:s},uFade:d},transparent:!0,depthWrite:!1,blending:2}));v.name=`title-ship-plumes`,v.frustumCulled=!1,v.renderOrder=5;let y=new k;y.add(h,v);let b=new k;return b.name=`title-ship`,b.add(y),{group:b,update(e,t){let n=e,r=1-t;y.position.set(Math.sin(n*.21)*.1*r,(Math.sin(n*.29+1.1)*.07+Math.sin(n*.11)*.05)*r,Math.sin(n*.17+2)*.12*r),y.rotation.set(Math.sin(n*.19+.4)*.022*r,Math.sin(n*.13+1.3)*.012*r,Math.sin(n*.23+2.2)*.01*r),_.value=e;let i=1+.035*Math.sin(n*11.3)+.025*Math.sin(n*17.9+1);c.value=(it+.7*t)*i,l.value=t*i,u.value=nt*(rt+.7*t)},setFade(e){d.value=e},dispose(){i.dispose(),a.dispose(),h.material.dispose(),v.geometry.dispose(),v.material.dispose()}}}var yt=40,bt=Math.tan(T.degToRad(yt/2)),xt=16/9*bt,X=Math.PI/180,St=new t(1,0,0);function Z(e,n,r=new t){return r.set((2*e-1)*xt,(1-2*n)*bt,-1).normalize()}function Ct(e,t){return new A((2*e-1)*xt,(1-2*t)*bt)}var Q={planetRadius:6e3,limb:[[.32,.74],[.62,.37],[1,.14]],sunAt:[.635,.355],sunLift:.9,lightTowardCamera:.42,isilthe:{at:[.89,.15],distance:17e3,angularRadius:6.2},moon:{at:[.425,.43],distance:9e3,angularRadius:1.45},band:{from:[.42,-.08],to:[1.02,.6],knot:[.7,.2]},dustDrift:[.25,-.12,1]},wt={nose:[.585,.53],noseDistance:30,stern:[.8,.66],sternDistance:20,roll:-8},$={delay:.5,distance:28,tau:.18,drift:.2,driftTau:120,composedAt:14,turn:8,turnDistance:22,bank:9,thrustGain:25,thrustCut:.02,clearance:8},Tt=!1,Et={pool:[[2.3,`chunky`,5],[1.8,`angular`,5],[1.5,`elongated`,4],[1.2,`chunky`,4],[1,`angular`,4],[.85,`elongated`,4],[.7,`chunky`,3],[.6,`angular`,3],[.5,`elongated`,3],[.42,`chunky`,3],[.35,`angular`,2],[.3,`chunky`,2]],distance:[11,70],bandTop:.8,bandDepth:.12,crossing:[26,60],sink:[-.02,.1],approach:[0,.12],spin:[.04,.1],seed:42366},Dt={count:12,countLow:10,distance:[7,70],size:[.006,.013],drift:[.008,.016],driftAt:25,parallax:.35,spin:[.15,.7],seed:912146},Ot=[[`kethra_day.jpg`,!0],[`kethra_night.jpg`,!0],[`clouds.jpg`,!1],[`isilthe_day.jpg`,!0],[`isilthe_night.jpg`,!0],[`isilthe_ring.png`,!0]];function kt(){for(let[e,t]of Ot)L(e,t);Me()}var At=.6,jt=e=>e<0?0:e>1?1:e,Mt=e=>e*e*(3-2*e),Nt=class{kind=`TitleScene`;usesAO=!1;grade=P.title;needsEnvironment=!1;governed=!1;scene=new n;camera=new y(yt,window.innerWidth/window.innerHeight,.5,4e4);onFirstFrame=null;detail=null;sky;hero;worlds=[];moon;rocks;debris;ship;fx;sunSeen=new t;light=new t;elapsed=0;firstFrame=!0;disposed=!1;yaw=0;leaveT=-1;onLeft=null;lowTier=!1;shipScale=1;pose={position:new t,quaternion:new E,forward:new t,up:new t,side:new t};flightClock=-$.delay;thrust=1;turnQ=new E;bankQ=new E;offset=new t;scratchW=new t;lookTarget=new t;async init(e){let n=ee();if(!n)throw Error(`TitleScene needs the engine`);let i=n.renderer;this.lowTier=n.getQualityTier()===`low`,this.scene.background=new r(330002);let[a,o,s]=Q.limb.map(([e,t])=>Z(e,t)),c=new t().crossVectors(o.clone().sub(a),s.clone().sub(a)).normalize();c.dot(Z(1,1))<0&&c.negate();let l=Math.acos(T.clamp(a.dot(c),-1,1)),u=Q.planetRadius,d=c.clone().multiplyScalar(u/Math.sin(l)),f=Z(...Q.sunAt),p=f.clone().sub(c.clone().multiplyScalar(f.dot(c))).normalize(),m=l+Q.sunLift*X;this.sunSeen.copy(c).multiplyScalar(Math.cos(m)).addScaledVector(p,Math.sin(m)).normalize(),this.light.copy(this.sunSeen).lerp(c.clone().negate(),Q.lightTowardCamera).normalize();let h=Z(.85,.95),g=()=>e?.breathe()??Promise.resolve(),_=performance.now(),v=e=>{j(`title:${e}`,_),_=performance.now()},y=Q.band,b=ie(i,g),x=fe(i,b.then(e=>e.texture),{from:Ct(...y.from),to:Ct(...y.to),core:Ct(...y.knot)},{stars:this.lowTier?4200:8e3,pace:g}),S=this.sunSeen.clone().add(new t(0,.6,0)).normalize(),C=new t(-.45,.35,.82).normalize(),w=vt(i,{keyDir:S,sunDir:this.sunSeen,bounceDir:h,fillDir:C,planetCenter:d,planetRadius:u,planetLight:this.light,pace:g}),[E,D]=await Promise.all([b,x]);this.detail=E,this.sky=D,this.scene.add(this.sky.group),v(`bakes`),await e?.tick(),this.hero=be({radius:u,center:d,sunDir:this.light,glareDir:this.sunSeen,day:L(`kethra_day.jpg`,!0),night:L(`kethra_night.jpg`,!0),clouds:L(`clouds.jpg`,!1),detail:E.texture,segments:this.lowTier?160:224}),this.scene.add(this.hero.group);let O=this.light.clone().multiplyScalar(1e7),k=Q.isilthe,A=F.find(e=>e.id===`isilthe`),M=Z(...k.at).multiplyScalar(k.distance),P=ne({...A,radius:k.distance*Math.sin(k.angularRadius*X)},M,O,this.camera);P.group.rotation.set(0,0,Math.PI+.06),this.scene.add(P.group),this.worlds.push(P);let I=Q.moon;this.moon=Ce({position:Z(...I.at).multiplyScalar(I.distance),radius:I.distance*Math.sin(I.angularRadius*X),light:this.light,detail:E.texture}),this.scene.add(this.moon.mesh),v(`planets`),await e?.tick(),(Tt||N.reduced)&&(this.flightClock=$.composedAt),this.solveShip();let R={tanH:xt,tanV:bt},re={sunDir:this.light,rimDir:this.sunSeen,bounceDir:h},z=Et;this.rocks=await Ie({...z,...re,pool:z.pool.map(([e,t,n])=>[e,t,this.lowTier?Math.min(n,4):n]),avoid:{points:this.flightPath(2),clearance:$.clearance},view:R,pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.rocks.mesh),this.debris=Re({...Dt,...re,count:this.lowTier?Dt.countLow:Dt.count,view:R}),this.scene.add(this.debris.group),v(`rocks`),await e?.tick(),this.ship=await w,this.flyShip(this.flightClock),this.scene.add(this.ship.group),v(`ship`);let B=new t(...Q.dustDrift).normalize().multiplyScalar(1.1);this.fx=Xe({sunDir:this.sunSeen,coreDistance:3e4,dust:{count:this.lowTier?110:240,boxMin:new t(-16,-11,-42),boxSize:new t(40,22,38),stream:B},meteorArea:[.05,.4,.7,.78]}),this.fx.setMeteors(!N.reduced),this.scene.add(this.fx.group),this.sky.setReveal(1,1),this.hero.setReveal(1,1);for(let e of this.worlds)e.setFade(1);this.moon.setFade(1),this.rocks.setFade(1),this.debris.setFade(1),this.ship.setFade(1),this.fx.setGlare(1),this.fx.setDust(.9),this.frame(window.innerWidth/window.innerHeight),this.placeCamera(0),v(`fx`),await te(),v(`maps`)}solveShip(){let e=Z(...wt.nose).multiplyScalar(wt.noseDistance),n=Z(...wt.stern).multiplyScalar(wt.sternDistance),r=e.sub(n);this.shipScale=r.length()/(et-tt),r.normalize();let i=new t(0,1,0).addScaledVector(r,-r.y).normalize().applyAxisAngle(r,wt.roll*X),a=new t().crossVectors(r,i),o=this.pose;o.quaternion.setFromRotationMatrix(new x().makeBasis(r,i,a)),o.position.copy(n).addScaledVector(r,-tt*this.shipScale),o.forward.copy(r),o.up.copy(i),o.side.crossVectors(i,r)}travelled(e){if(e<=0)return 0;let t=$;return t.drift*t.driftTau*(1-Math.exp(-e/t.driftTau))+t.distance*(1-Math.exp(-e/t.tau))}pathOffset(e,t){let{forward:n,side:r}=this.pose;if(e<=0)return t.copy(n).multiplyScalar(-e),0;let i=$.turn*X,a=$.turnDistance,o=i/a,s=Math.min(e,a);return t.copy(n).multiplyScalar(-Math.sin(o*s)/o).addScaledVector(r,-(1-Math.cos(o*s))/o),e>a&&t.addScaledVector(n,-Math.cos(i)*(e-a)).addScaledVector(r,-Math.sin(i)*(e-a)),s/a*i}flightPath(e){let t=[],n=this.travelled($.composedAt)-this.travelled(Math.max(this.flightClock,0));for(let r=n;r>-e;r-=e)this.pathOffset(Math.max(r,0),this.offset),t.push(this.pose.position.clone().add(this.offset));return t}flyShip(e){let t=Math.max(e,0),n=this.pathOffset(this.travelled($.composedAt)-this.travelled(t),this.offset),r=this.ship.group;r.position.copy(this.pose.position).add(this.offset),this.turnQ.setFromAxisAngle(this.pose.up,n),this.bankQ.setFromAxisAngle(St,$.bank*X*(n/($.turn*X))),r.quaternion.copy(this.turnQ).multiply(this.pose.quaternion).multiply(this.bankQ),r.scale.setScalar(this.shipScale);let i=Math.exp(-t/$.tau);this.thrust=jt((i*$.thrustGain-$.thrustCut)/(1-$.thrustCut))}onEnter(){M(`title:backdrop`),Tt=!0}leave(){return new Promise(e=>{if(this.disposed){e();return}let t=this.onLeft;this.onLeft=()=>{t?.(),e()},this.leaveT<0&&(this.leaveT=0)})}update(e){this.elapsed+=e;let t=this.elapsed;for(let n of this.worlds)n.update(t,e);this.hero.update(t),this.rocks.update(e),this.debris.update(t),this.flyShip(t+this.flightClock),this.ship.update(t,this.thrust);let n=0;if(this.leaveT>=0){this.leaveT+=e;let t=jt(this.leaveT/(N.reduced?.35:At));if(this.fx.setVeil(Mt(t)),n=N.reduced?0:t*t*2.4,t>=1&&this.onLeft){let e=this.onLeft;this.onLeft=null,e()}}this.placeCamera(n),this.fx.update(this.camera,e,t),this.sky.update(this.camera),this.firstFrame&&(this.firstFrame=!1,this.onFirstFrame?.())}placeCamera(e){let t=+!N.reduced,n=this.elapsed;this.camera.position.set(Math.sin(n*.11)*.22*t,Math.sin(n*.083+1.3)*.12*t,Math.sin(n*.061+.6)*.3*t),this.lookTarget.set(Math.sin(this.yaw)*120,0,-Math.cos(this.yaw)*120),e>0&&(this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize(),this.camera.position.addScaledVector(this.scratchW,e)),this.camera.lookAt(this.lookTarget)}frame(e){let t=Math.max(bt,.36/e);this.camera.fov=2*Math.atan(t)/X,this.camera.aspect=e,this.camera.updateProjectionMatrix(),this.yaw=Math.max(0,Math.atan(xt)-Math.atan(t*e)),this.rocks?.setView(t*e,t),this.debris?.setView(t*e,t)}onResize(e,t){this.frame(e/t)}dispose(){this.disposed=!0;let e=this.onLeft;this.onLeft=null,e?.(),this.detail?.dispose(),this.sky?.dispose(),this.hero?.dispose(),this.moon?.dispose(),this.rocks?.dispose(),this.debris?.dispose(),this.ship?.dispose(),this.fx?.dispose();for(let e of this.worlds)Pt(e.group)}};function Pt(e){e.traverse(e=>{let t=e;t.geometry?.dispose();let n=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(let e of n)e.dispose()})}export{Nt as TitleScene,kt as preloadTitle};