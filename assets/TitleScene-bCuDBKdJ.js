import{Bt as e,D as t,H as n,It as r,L as i,Lt as a,Rt as o,S as s,St as c,Tt as l,X as u,Z as d,b as f,bt as p,ft as m,jt as h,mt as g,n as _,r as v,rt as y,tt as b,ut as x,vt as S,x as C,xt as w,z as T}from"./three-CZsmadtC.js";import{n as E,t as D}from"./perfMarks-B6nwIo-H.js";import{t as O}from"./motion-BL9icHyK.js";import{d as k,h as A,i as j,u as M}from"./boot-CrjFB6LJ.js";import{n as N,r as P,t as F}from"./planetShader-Czew4SI0.js";import{t as I}from"./spaceSky-IZNUZymD.js";var L=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;async function R(e,t,n,r={},i={}){let a=new c({vertexShader:L,fragmentShader:n,uniforms:r,depthTest:!1,depthWrite:!1}),o=new y(new m(2,2),a);o.frustumCulled=!1;let l=new w;l.add(o);let u=new s,d=i.strips??1,f=t.texture.generateMipmaps;try{let n=e.getRenderTarget();e.setRenderTarget(t);let r=e.compileAsync(l,u);e.setRenderTarget(n),await r;let a=t.height;for(let n=0;n<d;n++){n>0&&await i.pace?.();let r=Math.floor(n*a/d),o=Math.floor((n+1)*a/d);t.scissor.set(0,r,t.width,o-r),t.scissorTest=d>1,t.texture.generateMipmaps=f&&n===d-1;let s=e.getRenderTarget(),c=e.autoClear;e.autoClear=!1,e.setRenderTarget(t),e.render(l,u),e.setRenderTarget(s),e.autoClear=c}}finally{t.scissorTest=!1,t.texture.generateMipmaps=f,o.geometry.dispose(),a.dispose()}}var z=`
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
`;async function ee(t,n,i=512){let a=new e(i,i,{type:r,wrapS:S,wrapT:S,minFilter:d,magFilter:u,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return a.texture.name=`title-detail-noise`,await R(t,a,z,{uLoop:{value:8}},{strips:2,pace:n}),a}var B=new a(1.35,.95),te=`
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
`,V=`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,H=`
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
`,U=`
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
`,W=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`,G=`
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
`;function K(e,t){return t.set(e.x/-e.z,e.y/-e.z)}async function ne(n,i,s,d){let p=new T;p.name=`title-sky`;let m=new e(1280,900,{type:r,depthBuffer:!1,generateMipmaps:!1,minFilter:u,magFilter:u});m.texture.name=`title-sky-card`,await R(n,m,te,{uHalf:{value:B},uFrom:{value:s.from},uTo:{value:s.to},uCore:{value:s.core},uLoop:{value:6}},{strips:6,pace:d.pace});let h={value:0},_=new y(new l(10,48,24),new c({uniforms:{uCard:{value:m.texture},uDetail:{value:await i},uHalf:{value:B},uBright:h},vertexShader:V,fragmentShader:H,side:1,depthWrite:!1,depthTest:!1}));_.renderOrder=-1e3,_.frustumCulled=!1,p.add(_);let v=M(d.seed??464670),x=Math.cos(b.degToRad(72)),S=s.to.clone().sub(s.from),w=S.length(),E=S.clone().divideScalar(w),D=new a,O=e=>(K(e,D).sub(s.from),Math.abs(D.x*-E.y+D.y*E.x)),k=e=>{let t=-(x+v()*(1-x)),n=v()*Math.PI*2,r=Math.sqrt(1-t*t);return e.set(Math.cos(n)*r,Math.sin(n)*r,t)},A={value:1},j={value:0},N=(e,n,r)=>{let i=new Float32Array(e*3),a=new Float32Array(e*3),s=new Float32Array(e),l=new o,u=new t;for(let t=0;t<e;t++)s[t]=n(t,l,u),i[t*3]=l.x*9,i[t*3+1]=l.y*9,i[t*3+2]=l.z*9,a[t*3]=u.r,a[t*3+1]=u.g,a[t*3+2]=u.b;let d=new C;d.setAttribute(`position`,new f(i,3)),d.setAttribute(`aColor`,new f(a,3)),d.setAttribute(`aSize`,new f(s,1));let p=new g(d,new c({uniforms:{uPixelRatio:A,uBright:j},vertexShader:U,fragmentShader:r,blending:2,depthWrite:!1,depthTest:!1}));return p.renderOrder=-999,p.frustumCulled=!1,p.onBeforeRender=e=>{A.value=e.getPixelRatio()},p},P=()=>{let e=v();return e<.12?3300+v()*1200:e>.86?9e3+v()*6e3:5400+v()*2600};p.add(N(d.stars,(e,t,n)=>{for(let e=0;e<10;e++){k(t);let e=O(t);if(v()<.22+.78*Math.exp(-(e*e)/.05))break}let r=v()**3;return I(P(),n).multiplyScalar(.05+r*.5),.7+r*.9},W));let F=Math.round(d.stars*.07);return p.add(N(F,(e,t,n)=>{k(t);let r=v()**4;return I(P(),n).multiplyScalar(.5+r*1.8),1.5+r*1.9},W)),p.add(N(18,(e,t,n)=>{for(let e=0;e<30&&(k(t),K(t,D),!(D.x>-.15||D.y<-.05));e++);return I(v()<.6?9e3+v()*7e3:5600+v()*1500,n).multiplyScalar(1.1+v()*1.2),16+v()*12},G)),{group:p,update(e){e.getWorldPosition(p.position)},setReveal(e,t){j.value=e,h.value=t},dispose(){m.dispose(),p.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var re=`
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
`,ie=`
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

    float lum = sqrt(dot(base, vec3(0.299, 0.587, 0.114)));
    float height = lum + (d1.r - 0.5) * 0.14 + (d2.r - 0.5) * 0.06 + (d3.r - 0.5) * 0.025;
    // Open water only in the darkest lowlands, broken up by the relief.
    float water = 1.0 - smoothstep(0.15, 0.175, height);

    // Kethra's greens: the map's own colour, deepened in the lowlands and lifted on the uplands and
    // terraces, so the canopy reads as varied forest from orbit rather than one wash.
    vec3 palette = mix(vec3(0.018, 0.058, 0.03), vec3(0.04, 0.125, 0.035), smoothstep(0.18, 0.28, height));
    palette = mix(palette, vec3(0.105, 0.16, 0.05), smoothstep(0.3, 0.42, height));
    palette = mix(palette, vec3(0.16, 0.19, 0.11), smoothstep(0.62, 0.88, d1.g) * 0.45);
    vec3 albedo = mix(base * 1.1, palette, 0.5) * (0.6 + 0.85 * d1.r) * (0.8 + 0.3 * d2.r + 0.2 * d3.a);
    albedo = mix(albedo, vec3(0.010, 0.032, 0.04), water);

    // Bump from the detail height, in world space (derivative-based, no tangents needed).
    float bump = (d1.r + 0.5 * d2.r + 0.4 * d1.g + 0.25 * d3.r) * (1.0 - water);
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
    float cover = cBase * 0.8 + (cd.b - 0.5) * 0.85 + (cd2.b - 0.5) * 0.38 + 0.05;
    float cloud = smoothstep(0.48, 0.8, cover);

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
    float shade = smoothstep(0.48, 0.8, shadowBase * 0.8 + (cd.b - 0.5) * 0.85 + (cd2.b - 0.5) * 0.38 + 0.05);
    ground *= 1.0 - shade * (1.0 - cloud) * 0.6;
    // Sun glint on open water.
    vec3 H = normalize(uSunDir + V);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(nGeo, V), 0.0), 5.0);
    float glint = pow(max(dot(nGeo, H), 0.0), 900.0) * (0.6 + 2.0 * fres);
    ground += uSunColor * twilight * glint * water * day * (1.0 - cloud) * 2.2;

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
`,ae=`
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,oe=`
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
`;function se(e){let n=new T;n.name=`title-hero-planet`,n.position.copy(e.center);let r=new t(1,.97,.92).multiplyScalar(2.3),i={uDay:{value:e.day},uNight:{value:e.night},uClouds:{value:e.clouds},uDetail:{value:e.detail},uSunDir:{value:e.sunDir},uSunColor:{value:r},uCloudShift:{value:0},uBumpScale:{value:e.radius*.0014},uNightGlow:{value:1.25},uCloudHeight:{value:e.radius*.004},uFade:{value:0}},a=new y(new l(e.radius,e.segments,e.segments/2),new c({vertexShader:re,fragmentShader:ie,uniforms:i}));a.name=`title-hero-surface`;let s=new T;s.rotation.set(.32,0,-.42),s.add(a),n.add(s);let u=e.radius*.0075,d={uCenter:{value:e.center},uR:{value:e.radius},uH:{value:u},uSunDir:{value:e.sunDir},uGlareDir:{value:e.glareDir},uSunColor:{value:new t(1,1,1).multiplyScalar(1.15)},uBeta:{value:new o(.014,.042,.078)},uMie:{value:1},uDiscHaze:{value:.5},uFade:{value:0}},f=new y(new l(e.radius+u*8,e.segments,e.segments/2),new c({vertexShader:ae,fragmentShader:oe,uniforms:d,transparent:!0,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendSrcAlpha:200,blendDstAlpha:201}));return f.name=`title-hero-atmosphere`,n.add(f),{group:n,surface:a,radius:e.radius,update(e,t){a.rotation.y+=e*.0011,i.uCloudShift.value=t*22e-5},setReveal(e,t){i.uFade.value=e,d.uFade.value=t},dispose(){a.geometry.dispose(),a.material.dispose(),f.geometry.dispose(),f.material.dispose()}}}var ce=`
  attribute vec3 aCenter;
  attribute vec4 aSpin;
  attribute float aSeed;
  attribute float aCavity;
  uniform float uTime;
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
    float a = aSpin.w * uTime + aSeed * 6.2832;
    vec3 drift = vec3(sin(uTime * 0.041 + aSeed * 9.0), cos(uTime * 0.033 + aSeed * 5.0), sin(uTime * 0.027 + aSeed * 3.0)) * (0.04 + 0.06 * aSeed) * length(aCenter) * 0.02;
    vec3 world = aCenter + spin(position, aSpin.xyz, a) + drift;
    vPosW = world;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(aSpin.xyz, a);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`,le=`
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
`;function ue(e){let t=M(e),n=new Uint8Array(512),r=Array.from({length:256},(e,t)=>t);for(let e=255;e>0;e--){let n=Math.floor(t()*(e+1));[r[e],r[n]]=[r[n],r[e]]}for(let e=0;e<512;e++)n[e]=r[e&255];let i=new Float32Array(256).map(()=>t()),a=(e,t,n)=>e+(t-e)*n,o=e=>e*e*(3-2*e),s=(e,t,r)=>i[n[n[n[e&255]+t&255]+r&255]],c=(e,t,n)=>{let r=Math.floor(e),i=Math.floor(t),c=Math.floor(n),l=o(e-r),u=o(t-i),d=o(n-c);return a(a(a(s(r,i,c),s(r+1,i,c),l),a(s(r,i+1,c),s(r+1,i+1,c),l),u),a(a(s(r,i,c+1),s(r+1,i,c+1),l),a(s(r,i+1,c+1),s(r+1,i+1,c+1),l),u),d)};return(e,t,n,r)=>{let i=0,a=.5,o=1,s=0;for(let l=0;l<r;l++)i+=a*c(e*o,t*o,n*o),s+=a,a*=.5,o*=2.1;return i/s}}function de(e,t){let r=ue(t),i=M(t*7+1),a=new n(1,e);a.deleteAttribute(`uv`),a.deleteAttribute(`normal`),a=v(a);let s=new o(1.15,.55+i()*.3,.7+i()*.25),c=Array.from({length:5+Math.floor(i()*4)},()=>({dir:new o(i()-.5,i()-.5,i()-.5).normalize(),size:.16+i()*.32,depth:.05+i()*.08})),l=a.getAttribute(`position`),u=new Float32Array(l.count),d=new o;for(let e=0;e<l.count;e++){d.fromBufferAttribute(l,e).normalize();let t=.62+.7*r(d.x*1.3+5,d.y*1.3,d.z*1.3,4),n=1-Math.abs(r(d.x*3.2+17,d.y*3.2,d.z*3.2,4)*2-1),i=t+.1*r(d.x*4+11,d.y*4,d.z*4,3)+.07*n*n-.035;for(let e of c){let t=d.distanceTo(e.dir)/e.size;t<1?i-=e.depth*(1-t*t):t<1.45&&(i+=e.depth*.35*(1-Math.abs(t-1.2)/.25)*(t<1.2?(t-1)/.2:1))}u[e]=Math.min(1,Math.max(0,(t-i)*5)),d.multiplyScalar(i).multiply(s),l.setXYZ(e,d.x,d.y,d.z)}return a.setAttribute(`aCavity`,new f(u,1)),a.computeVertexNormals(),a}var q=null;function fe(){if(q)return q;let e=new h,t=(t,n)=>{let r,i=new Promise(e=>r=e),a=e.load(`/kethra-adventure/textures/lichen_rock/`+t,()=>r(),void 0,()=>r());return a.colorSpace=n?p:``,a.wrapS=a.wrapT=S,a.anisotropy=4,{t:a,ready:i}},n=t(`diff.jpg`,!0),r=t(`nor_gl.jpg`,!1);return q={map:n.t,normal:r.t,ready:Promise.all([n.ready,r.ready]).then(()=>void 0)},q}async function pe(e,n){let r=M(n.seed??42366),i=[];for(let t=0;t<e.length;t++){let a=e[t],s=de(a.detail,101+t*37).toNonIndexed();s.scale(a.radius,a.radius,a.radius);let c=s.getAttribute(`position`).count,l=new Float32Array(c*3),u=new Float32Array(c*4),d=new Float32Array(c),p=new o(r()-.5,r()-.5,r()-.5).normalize(),m=(.012+r()*.03)/Math.sqrt(Math.max(a.radius,.3)),h=r();for(let e=0;e<c;e++)l.set([a.at.x,a.at.y,a.at.z],e*3),u.set([p.x,p.y,p.z,m],e*4),d[e]=h;s.setAttribute(`aCenter`,new f(l,3)),s.setAttribute(`aSpin`,new f(u,4)),s.setAttribute(`aSeed`,new f(d,1)),i.push(s),a.detail>=4&&await n.pace?.()}let a=_(i,!1);for(let e of i)e.dispose();let s=fe(),l={uRock:{value:s.map},uRockNormal:{value:s.normal},uSunDir:{value:n.sunDir},uRimDir:{value:n.rimDir},uSunColor:{value:new t(1,.95,.88).multiplyScalar(1.7)},uBounceDir:{value:n.bounceDir},uBounceColor:{value:new t(4164186).multiplyScalar(.4)},uTime:{value:0},uFade:{value:0}},u=new y(a,new c({vertexShader:ce,fragmentShader:le,uniforms:l}));return u.name=`title-asteroids`,u.frustumCulled=!1,await s.ready,{mesh:u,update(e){l.uTime.value=e},setFade(e){l.uFade.value=e},dispose(){a.dispose(),u.material.dispose()}}}var J=()=>new m(2,2),me=`
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uSize;
  uniform float uDepth;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uCenter + position.xy * vec2(uSize / uAspect, uSize), uDepth, 1.0);
  }
`,he=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float k = exp(-r * r * 2200.0) * 7.0 + exp(-r * 70.0) * 1.3 + exp(-r * 14.0) * 0.28;
    k *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * k * uIntensity, 1.0);
  }
`,ge=`
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
`,_e=`
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
`,ve=`
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
`,ye=`
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
`,be=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float along = vP.x * 0.5 + 0.5;
    float k = pow(along, 3.0) * exp(-vP.y * vP.y * 9.0);
    k += exp(-((1.0 - along) * (1.0 - along)) * 900.0 - vP.y * vP.y * 6.0) * 1.5;
    gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * k * uIntensity, 1.0);
  }
`,xe=`
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
`,Se=`
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 4.0) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * k * vAlpha * uIntensity, 1.0);
  }
`,Ce=`
  precision highp float;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;function we(e){let t=new T;t.name=`title-sky-fx`;let n={value:16/9},r=new a,s={value:r},l={value:0},u={value:0},d={value:.9999},p=new c({vertexShader:me,fragmentShader:he,uniforms:{uCenter:s,uAspect:n,uSize:{value:.5},uDepth:d,uIntensity:l},transparent:!0,depthWrite:!1,blending:2}),m=new y(J(),p);m.frustumCulled=!1,m.renderOrder=20,t.add(m);let h=new c({vertexShader:me,fragmentShader:ge,uniforms:{uCenter:s,uAspect:n,uSize:{value:.95},uDepth:{value:0},uIntensity:l,uTime:u},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),_=new y(J(),h);_.frustumCulled=!1,_.renderOrder=900,t.add(_);let v=[[.22,.035,[.25,.55,.6]],[.42,.06,[.5,.42,.25]],[.62,.022,[.3,.6,.9]]],b=[],x=[],S=[],w=[],E=[],D=[];v.forEach(([e,t,n],r)=>{for(let[r,i]of[[-1,-1],[1,-1],[1,1],[-1,1]])b.push(0,0,0),x.push(r,i),S.push(e),w.push(t),E.push(...n);D.push(r*4,r*4+1,r*4+2,r*4,r*4+2,r*4+3)});let O=new C;O.setAttribute(`position`,new i(b,3)),O.setAttribute(`aCorner`,new i(x,2)),O.setAttribute(`aAlong`,new i(S,1)),O.setAttribute(`aSize`,new i(w,1)),O.setAttribute(`aTint`,new i(E,3)),O.setIndex(D);let k={value:0},A=new y(O,new c({vertexShader:_e,fragmentShader:ve,uniforms:{uSun:s,uAspect:n,uIntensity:k},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}));A.frustumCulled=!1,A.renderOrder=901,t.add(A);let j={uHead:{value:new a},uDir:{value:new a(-.8,-.6)},uLength:{value:.22},uWidth:{value:.0024},uAspect:n,uIntensity:{value:0}},N=new y(J(),new c({vertexShader:ye,fragmentShader:be,uniforms:j,depthWrite:!1,blending:2}));N.frustumCulled=!1,N.renderOrder=-998,N.visible=!1,t.add(N);let P=M(255968),F=!0,I=6+P()*6,L=-1,R=new a,z=new Float32Array(e.dust.count*3),ee=new Float32Array(e.dust.count);for(let t=0;t<e.dust.count;t++)z[t*3]=e.dust.boxMin.x+P()*e.dust.boxSize.x,z[t*3+1]=e.dust.boxMin.y+P()*e.dust.boxSize.y,z[t*3+2]=e.dust.boxMin.z+P()*e.dust.boxSize.z,ee[t]=P();let B=new C;B.setAttribute(`position`,new f(z,3)),B.setAttribute(`aSeed`,new f(ee,1));let te={value:0},V={value:1},H=new g(B,new c({vertexShader:xe,fragmentShader:Se,uniforms:{uTime:u,uStream:{value:e.dust.stream},uBoxMin:{value:e.dust.boxMin},uBoxSize:{value:e.dust.boxSize},uPixelRatio:V,uIntensity:te},transparent:!0,depthWrite:!1,blending:2}));H.frustumCulled=!1,H.renderOrder=10,H.onBeforeRender=e=>{V.value=e.getPixelRatio()},t.add(H);let U={value:0},W=new y(J(),new c({vertexShader:`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:Ce,uniforms:{uOpacity:U},transparent:!0,depthWrite:!1,depthTest:!1}));W.frustumCulled=!1,W.renderOrder=1e4,W.visible=!1,t.add(W);let G=new o,K=new o;return{group:t,update(t,i,a){if(u.value=a,n.value=t.aspect,G.copy(e.sunDir).multiplyScalar(e.coreDistance).add(t.position),K.copy(G).project(t),r.set(K.x,K.y),d.value=Math.min(K.z,.99999),L>=0){L+=i;let e=L/.7;e>=1?(L=-1,N.visible=!1,I=9+P()*11):(j.uHead.value.copy(j.uDir.value).multiplyScalar(e*.5).add(R),j.uIntensity.value=Math.sin(Math.PI*e)*.9)}else if(F&&(I-=i)<=0){let[t,r,i,a]=e.meteorArea;R.set((t+P()*(i-t))*n.value,r+P()*(a-r));let o=Math.PI+.35+P()*.5;j.uDir.value.set(Math.cos(o),Math.sin(o)),j.uLength.value=.12+P()*.12,L=0,N.visible=!0}},setGlare(e){l.value=e,k.value=e*.05},setDust(e){te.value=e},setVeil(e){U.value=e,W.visible=e>0},setMeteors(e){F=e},dispose(){t.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var Te=40,Y=Math.tan(b.degToRad(Te/2)),Ee=16/9*Y,De=Math.PI/180;function X(e,t,n=new o){return n.set((2*e-1)*Ee,(1-2*t)*Y,-1).normalize()}function Oe(e,t){return new a((2*e-1)*Ee,(1-2*t)*Y)}var Z={planetRadius:6e3,limb:[[.3,1],[.6,.385],[1,.17]],sunAt:[.64,.36],sunLift:.9,lightTowardCamera:.42,isilthe:{at:[.905,.215],distance:17e3,angularRadius:4.1},band:{from:[.42,-.08],to:[1.02,.6],knot:[.7,.2]},dustDrift:[.25,-.12,1]},ke=[[.03,1.04,9,2.3,5],[.17,1.09,8,1.6,4],[-.07,.8,12,2.1,4],[.3,1,16,.7,3],[.95,1.02,11,1.25,5],[.72,.66,22,.85,4],[.8,.52,34,.55,3],[.62,.76,28,.5,3],[.47,.86,26,.6,3],[.53,.8,34,.38,2],[.41,.72,44,.36,2],[.66,.58,50,.28,2],[.95,.66,26,.4,3],[.56,.62,60,.22,2],[.86,.38,64,.3,2],[.12,.84,30,.35,2]],Q={stars:[0,1],nebula:[.15,1.5],planet:[.45,2],atmosphere:[.8,2.3],worlds:[.7,2],rocks:[.5,1.9],glare:[1.3,2.5],dust:[1.1,2.4],end:2.5},Ae=[[`kethra_day.jpg`,!0],[`kethra_night.jpg`,!0],[`clouds.jpg`,!1],[`isilthe_day.jpg`,!0],[`isilthe_night.jpg`,!0],[`isilthe_ring.png`,!0]];function je(){for(let[e,t]of Ae)N(e,t);fe()}var Me=.6,$=e=>e<0?0:e>1?1:e,Ne=e=>e*e*(3-2*e),Pe=class{kind=`TitleScene`;usesAO=!1;grade=A.title;needsEnvironment=!1;governed=!1;scene=new w;camera=new x(Te,window.innerWidth/window.innerHeight,.5,4e4);onFirstFrame=null;detail=null;sky;hero;worlds=[];rocks;fx;sunSeen=new o;light=new o;t=0;elapsed=0;firstFrame=!0;disposed=!1;yaw=0;pointer=new a;pointerSmooth=new a;energy=0;energyTarget=0;energyHold=0;leaveT=-1;onLeft=null;lowTier=!1;scratchW=new o;lookTarget=new o;async init(e){let n=k();if(!n)throw Error(`TitleScene needs the engine`);let r=n.renderer;this.lowTier=n.getQualityTier()===`low`,this.scene.background=new t(330002);let[i,a,s]=Z.limb.map(([e,t])=>X(e,t)),c=new o().crossVectors(a.clone().sub(i),s.clone().sub(i)).normalize();c.dot(X(1,1))<0&&c.negate();let l=Math.acos(b.clamp(i.dot(c),-1,1)),u=Z.planetRadius,d=c.clone().multiplyScalar(u/Math.sin(l)),f=X(...Z.sunAt),p=f.clone().sub(c.clone().multiplyScalar(f.dot(c))).normalize(),m=l+Z.sunLift*De;this.sunSeen.copy(c).multiplyScalar(Math.cos(m)).addScaledVector(p,Math.sin(m)).normalize(),this.light.copy(this.sunSeen).lerp(c.clone().negate(),Z.lightTowardCamera).normalize();let h=()=>e?.breathe()??Promise.resolve(),g=performance.now(),_=e=>{E(`title:${e}`,g),g=performance.now()},v=Z.band,y=ee(r,h),x=ne(r,y.then(e=>e.texture),{from:Oe(...v.from),to:Oe(...v.to),core:Oe(...v.knot)},{stars:this.lowTier?4200:8e3,pace:h}),[S,C]=await Promise.all([y,x]);this.detail=S,this.sky=C,this.scene.add(this.sky.group),_(`bakes`),await e?.tick(),this.hero=se({radius:u,center:d,sunDir:this.light,glareDir:this.sunSeen,day:N(`kethra_day.jpg`,!0),night:N(`kethra_night.jpg`,!0),clouds:N(`clouds.jpg`,!1),detail:S.texture,segments:this.lowTier?160:224}),this.hero.surface.rotation.y=2.25,this.scene.add(this.hero.group);let w=this.light.clone().multiplyScalar(1e7);((e,t,n,r,i)=>{let a=j.find(t=>t.id===e),o=X(...t).multiplyScalar(n),s=F({...a,radius:n*Math.sin(r*De)},o,w,this.camera);s.group.rotation.y=i,s.setFade(0),this.scene.add(s.group),this.worlds.push(s)})(`isilthe`,Z.isilthe.at,Z.isilthe.distance,Z.isilthe.angularRadius,.6),_(`planets`),await e?.tick();let T=ke.map(([e,t,n,r,i])=>({at:X(e,t).multiplyScalar(n),radius:r,detail:this.lowTier?Math.min(i,4):i}));this.rocks=await pe(T,{sunDir:this.light,rimDir:this.sunSeen,bounceDir:X(.85,.95),pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.rocks.mesh),_(`rocks`),await e?.tick();let D=new o(...Z.dustDrift).normalize().multiplyScalar(1.1);this.fx=we({sunDir:this.sunSeen,coreDistance:3e4,dust:{count:this.lowTier?110:240,boxMin:new o(-16,-11,-42),boxSize:new o(40,22,38),stream:D},meteorArea:[.05,.45,.85,.92]}),this.fx.setMeteors(!O.reduced),this.scene.add(this.fx.group),this.frame(window.innerWidth/window.innerHeight),this.placeCamera(0,0),_(`fx`),await P(),_(`maps`)}onEnter(){D(`title:backdrop`)}setPointer(e,t){this.pointer.set(e,t)}nudge(){this.energyTarget=1,this.energyHold=.45}skipReveal(){this.t=Math.max(this.t,Q.end)}leave(){return new Promise(e=>{if(this.disposed){e();return}let t=this.onLeft;this.onLeft=()=>{t?.(),e()},this.leaveT<0&&(this.leaveT=0)})}update(e){this.elapsed+=e,this.t+=O.reduced?e*2.2:e;let t=this.t,n=e=>Ne($((t-e[0])/(e[1]-e[0])));this.sky.setReveal(n(Q.stars),n(Q.nebula)),this.hero.setReveal(n(Q.planet),n(Q.atmosphere));let r=n(Q.worlds);for(let t of this.worlds)t.setFade(r),t.update(this.elapsed,e);this.hero.update(e,this.elapsed),this.rocks.setFade(n(Q.rocks)),this.rocks.update(this.elapsed),(this.energyHold-=e)<=0&&(this.energyTarget=0),this.energy+=(this.energyTarget-this.energy)*(1-Math.exp(-e/(this.energyTarget>this.energy?.12:.6)));let i=n(Q.glare),a=1+.35*Math.sin(Math.PI*$((t-Q.glare[0])/1.6));this.fx.setGlare(i*(t<Q.glare[0]+1.6?a:1)*(1+this.energy*.12)),this.fx.setDust(n(Q.dust)*.9);let o=0;if(this.leaveT>=0){this.leaveT+=e;let t=$(this.leaveT/(O.reduced?.35:Me));if(this.fx.setVeil(Ne(t)),o=O.reduced?0:t*t*2.4,t>=1&&this.onLeft){let e=this.onLeft;this.onLeft=null,e()}}this.placeCamera(o,e),this.fx.update(this.camera,e,this.elapsed),this.sky.update(this.camera),this.firstFrame&&(this.firstFrame=!1,this.onFirstFrame?.())}placeCamera(e,t){let n=+!O.reduced,r=this.elapsed;this.pointerSmooth.lerp(this.pointer,1-Math.exp(-t/.9));let i=this.pointerSmooth.x*.55*n,a=this.pointerSmooth.y*.3*n;this.camera.position.set(Math.sin(r*.11)*.2*n+i,Math.sin(r*.083+1.3)*.12*n-a,0),this.lookTarget.set(Math.sin(this.yaw)*120,0,-Math.cos(this.yaw)*120),e>0&&(this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize(),this.camera.position.addScaledVector(this.scratchW,e)),this.camera.lookAt(this.lookTarget)}frame(e){let t=Math.max(Y,.36/e);this.camera.fov=2*Math.atan(t)/De,this.camera.aspect=e,this.camera.updateProjectionMatrix(),this.yaw=Math.max(0,Math.atan(Ee)-Math.atan(t*e))}onResize(e,t){this.frame(e/t)}dispose(){this.disposed=!0;let e=this.onLeft;this.onLeft=null,e?.(),this.detail?.dispose(),this.sky?.dispose(),this.hero?.dispose(),this.rocks?.dispose(),this.fx?.dispose();for(let e of this.worlds)Fe(e.group)}};function Fe(e){e.traverse(e=>{let t=e;t.geometry?.dispose();let n=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(let e of n)e.dispose()})}export{Pe as TitleScene,je as preloadTitle};