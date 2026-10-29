import{$ as e,B as t,D as n,Et as r,G as i,Gt as a,K as o,Kt as s,L as c,Mt as l,Ot as u,Rt as d,U as f,Ut as p,Wt as m,_t as h,b as g,it as _,n as v,qt as y,r as b,st as x,wt as S,x as C,yt as w}from"./three-D-4sCFw3.js";import{_ as T}from"./boot-BYZiNFp_.js";import{n as E}from"./bake-YSKtNCWX.js";import{t as D}from"./spaceSky-BaK9Rpmi.js";var O=new m(1.35,.95),k=`
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
`,A=`
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,j=`
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
`,M=`
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
`,N=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`,P=`
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
`;function F(e,t){return t.set(e.x/-e.z,e.y/-e.z)}async function I(r,i,o,s){let c=new t;c.name=`title-sky`;let d=new y(1280,900,{type:p,depthBuffer:!1,generateMipmaps:!1,minFilter:e,magFilter:e});d.texture.name=`title-sky-card`,await E(r,d,k,{uHalf:{value:O},uFrom:{value:o.from},uTo:{value:o.to},uCore:{value:o.core},uLoop:{value:6}},{strips:6,pace:s.pace});let f={value:0},h=new x(new l(10,48,24),new u({uniforms:{uCard:{value:d.texture},uDetail:{value:await i},uHalf:{value:O},uBright:f},vertexShader:A,fragmentShader:j,side:1,depthWrite:!1,depthTest:!1}));h.renderOrder=-1e3,h.frustumCulled=!1,c.add(h);let v=T(s.seed??464670),b=Math.cos(_.degToRad(72)),S=o.to.clone().sub(o.from),I=S.length(),L=S.clone().divideScalar(I),R=new m,z=e=>(F(e,R).sub(o.from),Math.abs(R.x*-L.y+R.y*L.x)),B=e=>{let t=-(b+v()*(1-b)),n=v()*Math.PI*2,r=Math.sqrt(1-t*t);return e.set(Math.cos(n)*r,Math.sin(n)*r,t)},V={value:1},H={value:0},U=(e,t,r)=>{let i=new Float32Array(e*3),o=new Float32Array(e*3),s=new Float32Array(e),c=new a,l=new n;for(let n=0;n<e;n++)s[n]=t(n,c,l),i[n*3]=c.x*9,i[n*3+1]=c.y*9,i[n*3+2]=c.z*9,o[n*3]=l.r,o[n*3+1]=l.g,o[n*3+2]=l.b;let d=new C;d.setAttribute(`position`,new g(i,3)),d.setAttribute(`aColor`,new g(o,3)),d.setAttribute(`aSize`,new g(s,1));let f=new w(d,new u({uniforms:{uPixelRatio:V,uBright:H},vertexShader:M,fragmentShader:r,blending:2,depthWrite:!1,depthTest:!1}));return f.renderOrder=-999,f.frustumCulled=!1,f.onBeforeRender=e=>{V.value=e.getPixelRatio()},f},W=()=>{let e=v();return e<.12?3300+v()*1200:e>.86?9e3+v()*6e3:5400+v()*2600};c.add(U(s.stars,(e,t,n)=>{for(let e=0;e<10;e++){B(t);let e=z(t);if(v()<.22+.78*Math.exp(-(e*e)/.05))break}let r=v()**3;return D(W(),n).multiplyScalar(.05+r*.5),.7+r*.9},N));let G=Math.round(s.stars*.07);return c.add(U(G,(e,t,n)=>{B(t);let r=v()**4;return D(W(),n).multiplyScalar(.5+r*1.8),1.5+r*1.9},N)),c.add(U(18,(e,t,n)=>{for(let e=0;e<30&&(B(t),F(t,R),!(R.x>-.15||R.y<-.05));e++);return D(v()<.6?9e3+v()*7e3:5600+v()*1500,n).multiplyScalar(1.1+v()*1.2),16+v()*12},P)),{group:c,update(e){e.getWorldPosition(c.position)},setReveal(e,t){H.value=e,f.value=t},dispose(){d.dispose(),c.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}var L=`
  vec3 spin(vec3 v, vec3 k, float a) {
    float c = cos(a);
    float s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
`,R=`
  attribute float aCavity;
  varying vec3 vPosW;
  varying vec3 vLocal;
  varying vec3 vLocalN;
  varying vec4 vSpin;
  varying float vSeed;
  varying float vCavity;
`,z=e=>`
  attribute float aRock;
  attribute float aSeed;
  uniform vec3 uCenter[${e}];
  uniform vec4 uSpin[${e}];
  ${R}
  ${L}
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
`,B=`
  attribute vec4 aSlot;
  attribute vec2 aDrift;
  attribute vec4 aSpin;
  attribute float aSeed;
  uniform float uTime;
  uniform vec2 uTan;
  uniform vec4 uWrap;
  ${R}
  ${L}
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
`,V=`
  attribute float aSeed;
  ${R}
  void main() {
    vPosW = position;
    vLocal = position;
    vLocalN = normal;
    vSpin = vec4(0.0, 1.0, 0.0, 0.0);
    vSeed = aSeed;
    vCavity = aCavity;
    gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0);
  }
`,H=`
  attribute vec4 aOrbit;
  attribute vec4 aSpin;
  attribute float aSize;
  attribute float aSeed;
  uniform float uTime;
  uniform vec3 uOrbitCenter;
  uniform mat3 uOrbitBasis;
  ${R}
  ${L}
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
`,U=`
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
    float facing = clamp(dot(n, V), 0.0, 1.0);
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
`;function W(e){let t=T(e),n=new Uint8Array(512),r=Array.from({length:256},(e,t)=>t);for(let e=255;e>0;e--){let n=Math.floor(t()*(e+1));[r[e],r[n]]=[r[n],r[e]]}for(let e=0;e<512;e++)n[e]=r[e&255];let i=new Float32Array(256).map(()=>t()),a=(e,t,n)=>e+(t-e)*n,o=e=>e*e*(3-2*e),s=(e,t,r)=>i[n[n[n[e&255]+t&255]+r&255]],c=(e,t,n)=>{let r=Math.floor(e),i=Math.floor(t),c=Math.floor(n),l=o(e-r),u=o(t-i),d=o(n-c);return a(a(a(s(r,i,c),s(r+1,i,c),l),a(s(r,i+1,c),s(r+1,i+1,c),l),u),a(a(s(r,i,c+1),s(r+1,i,c+1),l),a(s(r,i+1,c+1),s(r+1,i+1,c+1),l),u),d)};return(e,t,n,r)=>{let i=0,a=.5,o=1,s=0;for(let l=0;l<r;l++)i+=a*c(e*o,t*o,n*o),s+=a,a*=.5,o*=2.1;return i/s}}function G(e,t,n=`chunky`,r={}){let i=W(t),o=T(t*7+1),s=new f(1,e);s.deleteAttribute(`uv`),s.deleteAttribute(`normal`),s=b(s);let c=n===`pebble`,l=r.stretch??(n===`elongated`?new a(1.5+o()*.25,.6+o()*.15,.65+o()*.15):n===`angular`?new a(1.05,.75+o()*.2,.8+o()*.15):c?new a(1.12,.8+o()*.15,.85+o()*.15):new a(1.15,.6+o()*.25,.72+o()*.23)),u=n===`angular`?5+Math.floor(o()*3):c?1+Math.floor(o()*2):3+Math.floor(o()*4),d=n===`angular`?.56:c?.86:.62,p=c?.25:.7,m=c?0:.07,h=Array.from({length:(c?2:5)+Math.floor(o()*4)},()=>({dir:new a(o()-.5,o()-.5,o()-.5).normalize(),size:.16+o()*.32,depth:.05+o()*.08})),_=Array.from({length:u},()=>({n:new a(o()-.5,o()-.5,o()-.5).normalize(),d:d+o()*.22})).concat(r.cuts??[]),v=s.getAttribute(`position`),y=new Float32Array(v.count),x=new a;for(let e=0;e<v.count;e++){x.fromBufferAttribute(v,e).normalize();let t=.97-p*.5+p*i(x.x*1.3+5,x.y*1.3,x.z*1.3,4),n=1-Math.abs(i(x.x*3.2+17,x.y*3.2,x.z*3.2,4)*2-1),r=t+(c?.04:.1)*i(x.x*4+11,x.y*4,x.z*4,3)+m*n*n-.035;for(let e of h){let t=x.distanceTo(e.dir)/e.size;t<1?r-=e.depth*(1-t*t):t<1.45&&(r+=e.depth*.35*(1-Math.abs(t-1.2)/.25)*(t<1.2?(t-1)/.2:1))}y[e]=Math.min(1,Math.max(0,(t-r)*5));for(let e of _){let t=x.dot(e.n);t>.05&&(r=Math.min(r,(e.d+.025*i(x.x*6+3,x.y*6,x.z*6,2))/t))}x.multiplyScalar(r).multiply(l),v.setXYZ(e,x.x,x.y,x.z)}return s.setAttribute(`aCavity`,new g(y,1)),s.computeVertexNormals(),s}var K=null;function q(){if(K)return K;let e=new d,t=(t,n)=>{let i,a=new Promise(e=>i=e),o=e.load(`/kethra-adventure/textures/lichen_rock/`+t,()=>i(),void 0,()=>i());return o.colorSpace=n?r:``,o.wrapS=o.wrapT=S,o.anisotropy=4,{t:o,ready:a}},n=t(`diff.jpg`,!0),i=t(`nor_gl.jpg`,!1);return K={map:n.t,normal:i.t,ready:Promise.all([n.ready,i.ready]).then(()=>void 0)},K}function J(e,t,r,i,a=.42,o={}){let s=q();return new u({defines:o,vertexShader:e,fragmentShader:U,uniforms:{uRock:{value:s.map},uRockNormal:{value:s.normal},uSunDir:{value:t.sunDir},uRimDir:{value:t.rimDir},uSunColor:{value:t.sunColor??new n(1,.95,.88).multiplyScalar(1.7)},uBounceDir:{value:t.bounceDir},uBounceColor:{value:t.bounceColor??new n(4164186).multiplyScalar(.4)},uFill:{value:t.fillColor??new n(.16,.2,.26)},uRimColor:{value:t.rimGain===void 0?new n(1,.9,.78).multiplyScalar(1.5):(t.sunColor??new n(1,.95,.88).multiplyScalar(1.7)).clone().multiplyScalar(t.rimGain)},uAlbedo:{value:new m(...t.albedo??[.045,.3])},uTexScale:{value:a},uFade:i,...r}})}var Y=(e,t)=>e[0]+(e[1]-e[0])*t,X=Math.PI*2,ee=3;async function te(e){let t=T(e.seed),n=e.pool.length,r=[],i=new Float32Array(n);for(let a=0;a<n;a++){let[n,o,s]=e.pool[a],c=G(s,101+a*37,o).toNonIndexed();c.scale(n,n,n);let l=c.getAttribute(`position`);for(let e=0;e<l.count;e++)i[a]=Math.max(i[a],Math.hypot(l.getX(e),l.getY(e),l.getZ(e)));c.setAttribute(`aRock`,new g(new Float32Array(l.count).fill(a),1)),c.setAttribute(`aSeed`,new g(new Float32Array(l.count).fill(t()),1)),r.push(c),s>=4&&await e.pace?.()}let o=v(r,!1);for(let e of r)e.dispose();let c=Array.from({length:n},()=>new a),l=Array.from({length:n},()=>new s),u=Array.from({length:n},()=>new a),d=new Float32Array(n),f=new Uint16Array(n),p={value:0},m=new x(o,J(z(n),e,{uCenter:{value:c},uSpin:{value:l}},p));m.name=`title-asteroids`,m.frustumCulled=!1;let{tanH:h,tanV:y}=e.view,b=h,S=y,C=new a,w=(r,a)=>{let o=_.clamp(r/Math.max(n-1,1)+(t()-.5)*.3,0,1),s=e.distance[0]*(e.distance[1]/e.distance[0])**+o,p=i[r]/s,m=a??.5-.5*b/h-p/(2*h)-.02,g=e.bandTop+p/(2*y)+t()*e.bandDepth;c[r].copy(C.set((2*m-1)*h,(1-2*g)*y,-1).normalize()).multiplyScalar(s);let v=2*s*h/Y(e.crossing,t());u[r].set(v,-v*Y(e.sink,t()),v*Y(e.approach,t())),l[r].set(t()-.5,t()-.5,t()-.5,0).normalize(),l[r].w=t()*X,d[r]=Y(e.spin,t())/Math.sqrt(Math.max(e.pool[r][0],.3))*(t()<.5?-1:1),f[r]++},E=t=>!e.avoid||e.avoid.points.every(n=>n.distanceTo(c[t])>i[t]+e.avoid.clearance),D=Array.from({length:n},(e,t)=>t);for(let e=n-1;e>0;e--){let n=Math.floor(t()*(e+1));[D[e],D[n]]=[D[n],D[e]]}for(let e=0;e<n;e++){let r=D[e],i=!1;for(let a=0;a<24&&!i;a++)w(r,-.05+1.1*(e+t())/n),i=E(r);i||w(r,null),f[r]=0}return await q().ready,{mesh:m,update(e){let t=Math.min(e,.1),r=.5+.5*b/h+.02,a=.5+.5*S/y+.02;for(let e=0;e<n;e++){let n=c[e].addScaledVector(u[e],t);l[e].w=(l[e].w+d[e]*t)%X;let o=-n.z;if(o<ee){w(e,null);continue}let s=i[e]/o,f=.5+.5*n.x/o/h-s/(2*h),p=.5-.5*n.y/o/y-s/(2*y);(f>r||p>a||p+s/y<1-a)&&w(e,null)}},setView(e,t){b=Math.max(e,h),S=Math.max(t,y)},setFade(e){p.value=e},report(){return c.map((e,t)=>({x:.5+.5*e.x/-e.z/h,y:.5-.5*e.y/-e.z/y,d:-e.z,passes:f[t]}))},dispose(){o.dispose(),m.material.dispose()}}}var Z=.06;function ne(e){let n=T(e.seed),{tanH:r,tanV:c}=e.view,l={value:0},u={value:0},d={value:new s},f=(e,t)=>{let n=.5*Math.max(e,r)/r+Z,i=.5*Math.max(t,c)/c+Z;d.value.set(.5-n,.5-i,2*n,2*i)};f(r,c);let p=J(B,e,{uTime:l,uTan:{value:new m(r,c)},uWrap:d},u),h=new t;h.name=`title-debris`;let g=[`pebble`,`pebble`,`pebble`],_=[],v=e.count;return g.forEach((t,s)=>{let l=s===g.length-1?v:Math.round(e.count/g.length);v-=l;let u=G(2,911+s*53,t),d=new o;d.index=u.index;for(let e of[`position`,`normal`,`aCavity`])d.setAttribute(e,u.getAttribute(e));d.instanceCount=l;let f=new Float32Array(l*4),m=new Float32Array(l*2),y=new Float32Array(l*4),b=new Float32Array(l),S=new a;for(let t=0;t<l;t++){let i=e.distance[0]*(e.distance[1]/e.distance[0])**+n();f.set([n(),n(),i,i*Y(e.size,n())],t*4);let a=Y(e.drift,n())*(e.driftAt/i)**+e.parallax,o=n()*X;m.set([Math.cos(o)*a,Math.sin(o)*a*(r/c)],t*2),S.set(n()-.5,n()-.5,n()-.5).normalize(),y.set([S.x,S.y,S.z,Y(e.spin,n())*(n()<.5?-1:1)],t*4),b[t]=n()}d.setAttribute(`aSlot`,new i(f,4)),d.setAttribute(`aDrift`,new i(m,2)),d.setAttribute(`aSpin`,new i(y,4)),d.setAttribute(`aSeed`,new i(b,1)),_.push(d);let C=new x(d,p);C.name=`title-debris-${s}`,C.frustumCulled=!1,h.add(C)}),{group:h,update(e){l.value=e},setView:f,setFade(e){u.value=e},dispose(){for(let e of _)e.dispose();p.dispose()}}}var Q=()=>new h(2,2),$=`
  uniform vec2 uCenter;
  uniform float uAspect;
  uniform float uSize;
  uniform float uDepth;
  varying vec2 vP;
  void main() {
    vP = position.xy;
    gl_Position = vec4(uCenter + position.xy * vec2(uSize / uAspect, uSize), uDepth, 1.0);
  }
`,re=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    float r = length(vP);
    float k = exp(-r * r * 2200.0) * 7.0 + exp(-r * 70.0) * 1.3 + exp(-r * 14.0) * 0.28;
    k *= smoothstep(1.0, 0.6, r);
    gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * k * uIntensity, 1.0);
  }
`,ie=`
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
`,ae=`
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
`,oe=`
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
`,se=`
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
`,ce=`
  precision highp float;
  uniform float uIntensity;
  varying vec2 vP;
  void main() {
    // along: 0 at the tail, 1 at the head; vP.y across, -1..1. Clamped: MSAA samples the varying past
    // the quad's ends, and pow() of a negative is NaN, which High's bloom spread over the whole title.
    float along = clamp(vP.x * 0.5 + 0.5, 0.0, 1.0);
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
`,le=`
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
`,ue=`
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 4.0) * smoothstep(1.0, 0.7, r);
    gl_FragColor = vec4(vec3(0.62, 0.78, 0.92) * k * vAlpha * uIntensity, 1.0);
  }
`,de=`
  precision highp float;
  uniform float uOpacity;
  void main() {
    gl_FragColor = vec4(0.0, 0.0, 0.0, uOpacity);
  }
`;function fe(e){let n=new t;n.name=`title-sky-fx`;let r={value:16/9},i=new m,o={value:i},s={value:0},l={value:0},d={value:.9999},f=new u({vertexShader:$,fragmentShader:re,uniforms:{uCenter:o,uAspect:r,uSize:{value:.5},uDepth:d,uIntensity:s},transparent:!0,depthWrite:!1,blending:2}),p=new x(Q(),f);p.frustumCulled=!1,p.renderOrder=20,n.add(p);let h=new u({vertexShader:$,fragmentShader:ie,uniforms:{uCenter:o,uAspect:r,uSize:{value:.95},uDepth:{value:0},uIntensity:s,uTime:l},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}),_=new x(Q(),h);_.frustumCulled=!1,_.renderOrder=900,n.add(_);let v=[[.22,.035,[.25,.55,.6]],[.42,.06,[.5,.42,.25]],[.62,.022,[.3,.6,.9]]],y=[],b=[],S=[],E=[],D=[],O=[];v.forEach(([e,t,n],r)=>{for(let[r,i]of[[-1,-1],[1,-1],[1,1],[-1,1]])y.push(0,0,0),b.push(r,i),S.push(e),E.push(t),D.push(...n);O.push(r*4,r*4+1,r*4+2,r*4,r*4+2,r*4+3)});let k=new C;k.setAttribute(`position`,new c(y,3)),k.setAttribute(`aCorner`,new c(b,2)),k.setAttribute(`aAlong`,new c(S,1)),k.setAttribute(`aSize`,new c(E,1)),k.setAttribute(`aTint`,new c(D,3)),k.setIndex(O);let A={value:0},j=new x(k,new u({vertexShader:ae,fragmentShader:oe,uniforms:{uSun:o,uAspect:r,uIntensity:A},transparent:!0,depthWrite:!1,depthTest:!1,blending:2}));j.frustumCulled=!1,j.renderOrder=901,n.add(j);let M={uHead:{value:new m},uDir:{value:new m(-.8,-.6)},uLength:{value:.22},uWidth:{value:e.meteors.width},uAspect:r,uIntensity:{value:0}},N=new x(Q(),new u({vertexShader:se,fragmentShader:ce,uniforms:M,depthWrite:!1,blending:2}));N.frustumCulled=!1,N.renderOrder=-998,N.visible=!1,n.add(N);let P=T(255968),F=!0,I=e.meteors,L=I.first,R=-1,z=new m,B=new Float32Array(e.dust.count*3),V=new Float32Array(e.dust.count);for(let t=0;t<e.dust.count;t++)B[t*3]=e.dust.boxMin.x+P()*e.dust.boxSize.x,B[t*3+1]=e.dust.boxMin.y+P()*e.dust.boxSize.y,B[t*3+2]=e.dust.boxMin.z+P()*e.dust.boxSize.z,V[t]=P();let H=new C;H.setAttribute(`position`,new g(B,3)),H.setAttribute(`aSeed`,new g(V,1));let U={value:0},W={value:1},G=new w(H,new u({vertexShader:le,fragmentShader:ue,uniforms:{uTime:l,uStream:{value:e.dust.stream},uBoxMin:{value:e.dust.boxMin},uBoxSize:{value:e.dust.boxSize},uPixelRatio:W,uIntensity:U},transparent:!0,depthWrite:!1,blending:2}));G.frustumCulled=!1,G.renderOrder=10,G.onBeforeRender=e=>{W.value=e.getPixelRatio()},n.add(G);let K={value:0},q=new x(Q(),new u({vertexShader:`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`,fragmentShader:de,uniforms:{uOpacity:K},transparent:!0,depthWrite:!1,depthTest:!1}));q.frustumCulled=!1,q.renderOrder=1e4,q.visible=!1,n.add(q);let J=new a,Y=new a;return{group:n,update(t,n,a){if(l.value=a,r.value=t.aspect,J.copy(e.sunDir).multiplyScalar(e.coreDistance).add(t.position),Y.copy(J).project(t),i.set(Y.x,Y.y),d.value=Math.min(Y.z,.99999),R>=0){R+=n;let e=R/I.seconds;e>=1?(R=-1,N.visible=!1,L=I.every[0]+P()*(I.every[1]-I.every[0])):(M.uHead.value.copy(M.uDir.value).multiplyScalar(e*I.travel).add(z),M.uIntensity.value=Math.sin(Math.PI*e)*I.brightness)}else if(F&&(L-=n)<=0){let[e,t,n,i]=I.area;z.set((e+P()*(n-e))*r.value,t+P()*(i-t));let a=I.heading[0]+P()*(I.heading[1]-I.heading[0]);M.uDir.value.set(Math.cos(a),Math.sin(a)),M.uLength.value=I.length[0]+P()*(I.length[1]-I.length[0]),R=0,N.visible=!0}},setGlare(e){s.value=e,A.value=e*.05,p.visible=_.visible=j.visible=e>0},setDust(e){U.value=e},setVeil(e){K.value=e,q.visible=e>0},setMeteors(e){F=e},dispose(){n.traverse(e=>{let t=e;t.geometry&&t.geometry.dispose(),t.material&&t.material.dispose()})}}}export{ne as a,q as c,te as i,I as l,H as n,G as o,V as r,J as s,fe as t};