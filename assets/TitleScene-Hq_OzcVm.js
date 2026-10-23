import{$ as e,A as t,At as n,Ct as r,D as i,E as a,Et as o,F as s,G as c,Ht as l,L as u,Q as d,Tt as f,Ut as p,W as m,Wt as h,_t as g,at as _,b as v,bt as y,it as b,kt as x,mt as S,n as C,ot as w,pt as T,rt as E,w as D,x as O,yt as k,z as A}from"./three-BNTvIbIC.js";import{n as ee,t as j}from"./perfMarks-B6nwIo-H.js";import{t as M}from"./motion-St5-4car.js";import{d as N,h as P,u as F}from"./boot-DRT8CN2B.js";import{n as I,r as L}from"./planetShader-DiFSBZRs.js";import{a as R,c as z,i as B,l as te,n as ne,o as re,r as ie,s as ae,t as oe,u as se}from"./skyFx-BfT5uhZC.js";var ce=`
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
`,le=`
  uniform sampler2D uProfile;
  uniform vec2 uRingSpan;
  vec4 ringAt(float r) {
    float x = (r - uRingSpan.x) / (uRingSpan.y - uRingSpan.x);
    if (x <= 0.0 || x >= 1.0) return vec4(0.0);
    return texture2D(uProfile, vec2(x, 0.5));
  }
`,ue=`
  precision highp float;
  uniform sampler2D uDay;
  uniform sampler2D uDetail;
  uniform vec3 uCenter;
  uniform float uR;
  uniform vec3 uSunDir;
  uniform vec3 uRingNormal;
  uniform vec3 uShineDir;
  uniform float uHazeShift;
  uniform float uFade;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  varying vec2 vUv;
  ${le}

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    vec2 uv = vUv;
    // Explicit gradients with the longitude seam folded out (see heroPlanet.ts).
    vec2 gx = dFdx(uv);
    vec2 gy = dFdy(uv);
    gx.x -= floor(gx.x + 0.5);
    gy.x -= floor(gy.x + 0.5);

    // Isilthe's bands, read through a warp from the detail so they turn into eddies up close.
    vec2 s1 = vec2(10.0, 5.0);
    vec4 d1 = textureGrad(uDetail, uv * s1, gx * s1, gy * s1);
    vec2 s2 = vec2(34.0, 17.0);
    vec4 d2 = textureGrad(uDetail, uv * s2 + vec2(0.37, 0.11), gx * s2, gy * s2);
    vec2 warp = (d1.gb - 0.5) * vec2(0.012, 0.02) + (d2.rg - 0.5) * 0.004;
    vec3 map = textureGrad(uDay, uv + warp, gx, gy).rgb;
    float lum = dot(map, vec3(0.3, 0.55, 0.15));
    vec3 albedo = mix(vec3(0.05, 0.12, 0.17), vec3(0.2, 0.42, 0.5), smoothstep(0.12, 0.42, lum));
    albedo *= 0.75 + 0.5 * d1.r;

    // High haze, drifting at its own rate over the bands: streaks of pale cloud.
    vec2 hz = vec2(uv.x + uHazeShift, uv.y);
    vec2 s3 = vec2(7.0, 7.0);
    vec4 h1 = textureGrad(uDetail, hz * s3 + vec2(0.61, 0.23), gx * s3, gy * s3);
    float haze = smoothstep(0.55, 0.85, h1.b * 0.8 + d2.a * 0.3);
    albedo = mix(albedo, vec3(0.5, 0.62, 0.66), haze * 0.55);

    // The sun, from behind: a soft terminator and an amber crescent along it.
    float ndl = dot(n, uSunDir);
    float lit = smoothstep(-0.06, 0.35, ndl);
    vec3 sunTint = mix(vec3(1.0, 0.46, 0.18), vec3(1.0, 0.86, 0.7), smoothstep(0.0, 0.45, ndl));
    // The rings' shadow: where the ray toward the sun crosses the ring plane.
    float shadow = 1.0;
    float toward = dot(uSunDir, uRingNormal);
    float t = -dot(vPosW - uCenter, uRingNormal) / toward;
    if (t > 0.0) {
      float rr = length(vPosW + uSunDir * t - uCenter) / uR;
      shadow = mix(0.45, 1.0, exp(-ringAt(rr).r * 1.6));
    }
    vec3 col = albedo * sunTint * lit * max(ndl * 0.8 + 0.2, 0.0) * 4.0 * shadow;

    // Ringshine: the glowing rings light the hemisphere that faces their bright side (ours) teal.
    float shine = pow(max(dot(n, uShineDir), 0.0), 1.1) * (0.35 + 0.65 * max(dot(n, V), 0.0));
    col += albedo * vec3(0.3, 0.75, 0.85) * shine * 0.3;
    // Sunlight scattered through the air over the disc on the sun's side: an amber haze deepening to
    // the limb (the sun is behind, so it comes through the atmosphere toward us).
    vec3 sunPerp = normalize(uSunDir - V * dot(uSunDir, V));
    float side = smoothstep(-0.3, 0.9, dot(n, sunPerp));
    float limb = 1.0 - max(dot(n, V), 0.0);
    col += vec3(1.0, 0.5, 0.2) * side * (0.025 + 0.14 * pow(limb, 3.0)) * (0.7 + 0.6 * haze);
    // Night: just enough for the disc to keep its shape against space.
    col += albedo * vec3(0.02, 0.035, 0.05) * (1.0 - lit);

    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,de=`
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,fe=`
  precision highp float;
  uniform vec3 uCenter;
  uniform float uR;
  uniform vec2 uH;
  uniform vec3 uSunDir;
  uniform float uIntensity;
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
    vec2 column;
    vec2 limb = sqrt(6.2832 * uR / uH);
    if (hit) {
      p = ro + rd * (tca - sqrt(uR * uR - d2));
      float mu = max(dot(normalize(p - uCenter), -rd), 0.0);
      column = min(vec2(1.0 / max(mu, 0.02)), limb * 0.5);
    } else {
      p = ro + rd * max(tca, 0.0);
      column = exp(-(b - uR) / uH) * limb;
    }
    vec3 np = normalize(p - uCenter);
    float sunAlt = dot(np, uSunDir);
    // The limb is the terminator from here: lit along all of it, most on the sun's side.
    float lit = smoothstep(-0.55, 0.25, sunAlt);
    float cosT = dot(rd, uSunDir);
    float g = 0.7;
    float phase = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);
    vec3 rim = (1.0 - exp(-column.x * 0.02)) * vec3(1.0, 0.8, 0.82) * (0.45 + 0.25 * phase);
    vec3 halo = (1.0 - exp(-column.y * 0.012)) * vec3(0.32, 0.68, 1.0) * (0.3 + 0.2 * phase);
    vec3 col = (rim + halo) * lit;
    // Over the disc it is a light veil only: the night side stays night.
    if (hit) col *= 0.22;
    gl_FragColor = vec4(col * uIntensity * uFade, 1.0);
  }
`,pe=`
  attribute vec2 aPlane;
  varying vec3 vPosW;
  varying vec2 vPlane;
  void main() {
    vPlane = aPlane;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,me=`
  precision highp float;
  uniform sampler2D uDetail;
  uniform vec3 uCenter;
  uniform float uR;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform float uKepler;
  uniform float uFade;
  uniform float uSwell;
  uniform float uPulse;
  varying vec3 vPosW;
  varying vec2 vPlane;
  ${le}
  const float TAU = 6.2831853;

  void main() {
    float r = length(vPlane) / uR;
    vec4 prof = ringAt(r);
    if (prof.r + prof.b < 0.002) discard;
    // Each radius turns at its own rate (Kepler: inner rings faster), so streaks shear as they go.
    float turn = uTime * uKepler * pow(r / 2.0, -1.5);
    float a = (atan(vPlane.y, vPlane.x) - turn) / TAU;
    // Streaks: the detail sheet stretched far along the orbit (4 repeats round, ~22 across the span).
    vec4 s = texture2D(uDetail, vec2(a * 4.0, r * 5.5));
    vec4 f = texture2D(uDetail, vec2(a * 16.0 + 0.3, r * 31.0));
    float streak = 0.62 + 0.55 * s.b + 0.3 * (f.a - 0.5);
    // Spokes: slow, faint radial brightenings across the dense ring, drifting at their own rate.
    float spoke = texture2D(uDetail, vec2(a * 3.0 - uTime * 0.0021, r * 0.6 + 0.2)).r;

    float ice = prof.r * mix(0.85, 1.15, s.a);
    float dust = prof.b * streak;
    vec3 rd = normalize(vPosW - cameraPosition);
    float cosT = dot(rd, uSunDir);
    // Forward scattering: fine dust blazes when the sun is behind it; ice much less so.
    float g = 0.72;
    float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * cosT, 1.5);

    // The planet's shadow: does the ray from here toward the sun pass within a radius of the centre?
    vec3 oc = uCenter - vPosW;
    float along = dot(oc, uSunDir);
    float miss = length(oc - uSunDir * along) / uR;
    float lit = along > 0.0 ? mix(0.2, 1.0, smoothstep(0.96, 1.06, miss)) : 1.0;

    float iceAlpha = 1.0 - exp(-ice * 2.6);
    vec3 iceCol = mix(vec3(0.3, 0.58, 0.88), vec3(0.7, 0.9, 1.0), prof.g) * iceAlpha * (0.17 + 0.03 * hg) * (0.85 + 0.3 * spoke) * streak;
    vec3 dustCol = vec3(0.2, 0.68, 1.0) * dust * (0.2 + 0.14 * hg);
    vec3 col = (iceCol + dustCol) * lit * uSwell;
    // The Choir's signal (TitleScene): a faint bright front running out through the rings in ~3.5 s.
    if (uPulse >= 0.0) {
      float front = uRingSpan.x + uPulse * 0.9;
      // Squared by hand: pow() of a negative base is NaN on Direct3D.
      float wd = (r - front) / 0.05;
      float wave = exp(-wd * wd) * smoothstep(0.0, 0.25, uPulse) * (1.0 - smoothstep(1.5, 3.5, uPulse));
      col += vec3(0.45, 0.88, 1.0) * wave * (0.04 + 0.5 * (iceAlpha + dust));
    }
    // Premultiplied: the dense rings hide part of what lies behind them; the dust only adds light.
    gl_FragColor = vec4(col * uFade, iceAlpha * 0.45 * uFade);
  }
`;function he(n,r){let i=2048,o=new Uint8Array(i*4),s=F(r),c=Array.from({length:40},()=>({k:20+s()*260,p:s()*Math.PI*2,a:.3+s()*.7})),l=e=>{let t=0;for(let n of c)t+=n.a*Math.sin(e*n.k+n.p);return t/12},u=(e,t,n,r)=>{let i=e=>Math.min(1,Math.max(0,e));return i((e-t)/r)*i((n-e)/r)},f=(e,t,n)=>Math.exp(-(((e-t)/n)**2));for(let e=0;e<i;e++){let t=n[0]+(n[1]-n[0])*(e+.5)/i,r=l(t),a=.2*u(t,1.32,1.53,.02)*(.8+r);a+=(.72+.18*Math.sin(t*9))*u(t,1.53,2,.015)*(.85+r*.9),a+=.5*u(t,2.09,2.56,.012)*(.9+r*.6)*(1-.92*f(t,2.44,.007)),a+=.85*f(t,2.63,.006),a=Math.min(1,Math.max(0,a));let s=.1*u(t,1.4,2.6,.05);s+=.9*u(t,2.68,3.35,.09)*(.75+r*1.4)+.5*f(t,2.92,.08),s+=.32*u(t,3.35,4.4,.6)*(.8+r),s=Math.min(1,Math.max(0,s));let c=Math.min(1,Math.max(0,.5+.5*u(t,1.6,1.95,.08)+r*.8-.2*u(t,2.09,2.56,.02)));o.set([a*255,c*255,s*255,255],e*4)}let p=new t(o,i,1,y);return p.minFilter=e,p.magFilter=d,p.wrapS=p.wrapT=a,p.generateMipmaps=!0,p.needsUpdate=!0,p.name=`title-ring-profile`,p}var ge=[1.32,4.4];function _e(e){let t=e.radius,i=new A;i.name=`title-ringworld`,i.position.copy(e.center),i.quaternion.setFromUnitVectors(new p(0,1,0),e.ringNormal);let a={value:0},s={value:0},u=he(ge,1380734),d={uProfile:{value:u},uRingSpan:{value:new l(...ge)}},f=e.center.clone().negate().normalize(),h=e.ringNormal.clone().multiplyScalar(Math.sign(e.ringNormal.dot(f))||1),g={value:0},y=new w(new n(t,e.segments,e.segments/2),new o({vertexShader:ce,fragmentShader:ue,uniforms:{uDay:{value:e.day},uDetail:{value:e.detail},uCenter:{value:e.center},uR:{value:t},uSunDir:{value:e.sunDir},uRingNormal:{value:e.ringNormal},uShineDir:{value:h},uHazeShift:g,uFade:a,...d}}));y.name=`title-planet-surface`,y.rotation.y=2.4;let x=y.rotation.y;i.add(y);let S=new w(new n(t*1.16,e.segments,e.segments/2),new o({vertexShader:de,fragmentShader:fe,uniforms:{uCenter:{value:e.center},uR:{value:t},uH:{value:new l(t*.0045,t*.03)},uSunDir:{value:e.sunDir},uIntensity:{value:e.glow},uFade:a},transparent:!0,depthWrite:!1,blending:2}));S.name=`title-planet-atmosphere`,S.renderOrder=1,i.add(S);let C={value:1},T={value:-1},E=-1/0,D=0,O=new r(t*ge[0],t*ge[1],384,8);O.rotateX(-Math.PI/2);let k=O.getAttribute(`position`),ee=new Float32Array(k.count*2);for(let e=0;e<k.count;e++)ee.set([k.getX(e),k.getZ(e)],e*2);O.setAttribute(`aPlane`,new v(ee,2));let j=new w(O,new o({vertexShader:pe,fragmentShader:me,uniforms:{uDetail:{value:e.detail},uCenter:{value:e.center},uR:{value:t},uSunDir:{value:e.sunDir},uTime:s,uKepler:{value:e.ringRate},uSwell:C,uPulse:T,uFade:a,...d},transparent:!0,depthWrite:!1,side:2,blending:5,blendSrc:201,blendDst:205}));j.name=`title-rings`,j.renderOrder=2,i.add(j);let M=F(e.rubble.seed),N=e.rubble.count,P=re(2,4021,`chunky`),I=new c;I.index=P.index;for(let e of[`position`,`normal`,`aCavity`])I.setAttribute(e,P.getAttribute(e));I.instanceCount=N;let L=new Float32Array(N*4),R=new Float32Array(N*4),z=new Float32Array(N),B=new Float32Array(N);for(let n=0;n<N;n++){let r=(M()<.75?1.45+M()*1.2:2.7+M()*.9)*t,i=e.ringRate*(r/t/2)**-1.5;L.set([r,M()*Math.PI*2,i,(M()-.5)*.03*t],n*4);let a=new p(M()-.5,M()-.5,M()-.5).normalize();R.set([a.x,a.y,a.z,(.05+M()*.25)*(M()<.5?-1:1)],n*4),z[n]=e.rubble.size[0]+(e.rubble.size[1]-e.rubble.size[0])*(M()<.125?.7+M()*.3:M()**2*.5),B[n]=M()}I.setAttribute(`aOrbit`,new m(L,4)),I.setAttribute(`aSpin`,new m(R,4)),I.setAttribute(`aSize`,new m(z,1)),I.setAttribute(`aSeed`,new m(B,1));let te=new b().setFromMatrix4(new _().makeRotationFromQuaternion(i.quaternion)),ie=ae(ne,e.rubble.light,{uTime:s,uOrbitCenter:{value:e.center},uOrbitBasis:{value:te}},a),oe=new w(I,ie);oe.name=`title-ring-rubble`,oe.frustumCulled=!1;let se=new A;se.add(oe);let le=new A;return le.add(i,se),{group:le,surface:y,update(t){D=t,s.value=t,T.value=t-E<3.6?t-E:-1,y.rotation.y=x+t*e.spin%(Math.PI*2),g.value=t*e.hazeDrift%1,C.value=1+.045*Math.sin(t*.13)+.03*Math.sin(t*.047+1.7)},pulse(){E=D},setFade(e){a.value=e},dispose(){u.dispose();for(let e of[y,S,j])e.geometry.dispose(),e.material.dispose();P.dispose(),I.dispose(),ie.dispose()}}}var V={Fabric:0,Hard:1,Visor:2,Lamp:3},H={Root:0,Torso:1,Head:2,Shoulders:3,HandL:4,HandR:5},ve=11844543,ye=3099481,U=14468133,be=11127093,W=12106940,G=3818056,xe=856083,Se=9212564,K=(e,t,n)=>new p(e,t,n),Ce=class{pos=[];nor=[];col=[];mat=[];bone=[];proxy=[];index=[];c=new i;grid(e,t,n,r,i,a){let o=r?t:t+1,s=[];for(let r=0;r<=e;r++)for(let i=0;i<o;i++){let a=n(r/e,i/t);s.push(a.x,a.y,a.z)}let c=[];for(let n=0;n<e;n++)for(let e=0;e<t;e++){let t=n*o+e,r=n*o+(e+1)%o,i=(n+1)*o+e,a=(n+1)*o+(e+1)%o;c.push(t,i,r,r,i,a)}let l=new O;l.setAttribute(`position`,new u(s,3)),l.setIndex(c),l.computeVertexNormals();let d=l.getAttribute(`normal`),f=0,p=0,m=0,h=s.length/3;for(let e=0;e<h;e++)f+=s[e*3]/h,p+=s[e*3+1]/h,m+=s[e*3+2]/h;let g=0;for(let e=0;e<h;e++)g+=(s[e*3]-f)*d.getX(e)+(s[e*3+1]-p)*d.getY(e)+(s[e*3+2]-m)*d.getZ(e);if(g<0){for(let e=0;e<h;e++)d.setXYZ(e,-d.getX(e),-d.getY(e),-d.getZ(e));for(let e=0;e<c.length;e+=3)[c[e+1],c[e+2]]=[c[e+2],c[e+1]]}let _=this.pos.length/3;this.c.set(i.color).convertSRGBToLinear();for(let e=0;e<s.length/3;e++){this.pos.push(s[e*3],s[e*3+1],s[e*3+2]),this.nor.push(d.getX(e),d.getY(e),d.getZ(e)),this.col.push(this.c.r,this.c.g,this.c.b);let t=a?a(Math.floor(e/o),e%o):0;this.mat.push(i.rough,i.metal??0,i.kind??V.Hard,t),this.bone.push(i.bone),this.proxy.push(i.proxy??-1)}for(let e of c)this.index.push(_+e);l.dispose()}tube(e){let t=new we(e.path,e.side,e.rx,e.ry??e.rx),n=e.seg??24,r=e.steps??16,[i,a]=e.caps??[!0,!0],o=(i?5:0)+r+1+(a?5:0),s=new p;return this.grid(o-1,n,(e,n)=>{let a=Math.round(e*(o-1)),c=n*Math.PI*2;if(i&&a<5){let e=Math.PI/2*(1-a/5);return t.at(0,c,0,s,Math.cos(e),-Math.sin(e))}let l=a-(i?5:0);if(l<=r)return t.at(l/r,c,0,s);let u=Math.PI/2*((l-r)/5);return t.at(1,c,0,s,Math.cos(u),Math.sin(u))},!0,e.finish),t}plate(e,t,n,r,i,a,o=.006,s=.008,c=10,l=12){let u=.07,d=e=>e<=0?0:e>=1?1:e<u?e/u:e>.9299999999999999?(1-e)/u:1,f=new p,m=(e,t)=>e===0?0:e===t?1:e===1?u:e===t-1?.9299999999999999:u+(1-2*u)*(e-1)/(t-2);this.grid(c,l,(a,u)=>{let p=m(Math.round(a*c),c),h=m(Math.round(u*l),l),g=o+s*Math.min(d(p),d(h));return e.at(t+(n-t)*p,r+(i-r)*h,g,f)},!1,a,(e,t)=>+(e<=1||e>=c-1||t<=1||t>=l-1))}blob(e,t,n,r,i,a=14,o=20){let s=(e,t)=>Math.sign(e)*Math.abs(e)**+t,c=new p;this.grid(a,o,(i,a)=>{let o=-Math.PI/2+i*Math.PI,l=a*Math.PI*2,u=s(Math.cos(o),n);return c.set(t.x*u*s(Math.cos(l),n),t.y*s(Math.sin(o),n),t.z*u*s(Math.sin(l),n)),c.applyQuaternion(r).add(e)},!0,i)}spherePatch(e,t,n,r,i,a,o,s,c,l,u=14,d=22){let f=.06,m=e=>e<f?e/f:e>.94?(1-e)/f:1,h=new p,g=(e,t)=>e===0?0:e===t?1:e===1?f:e===t-1?.94:f+(1-2*f)*(e-1)/(t-2);this.grid(u,d,(s,f)=>{let p=g(Math.round(s*u),u),_=g(Math.round(f*d),d),v=a+(o-a)*p,y=r+(i-r)*_,b=t+c+l*Math.min(m(p),m(_));return h.set(Math.sin(y)*Math.cos(v),Math.sin(v),Math.cos(y)*Math.cos(v)).multiplyScalar(b),h.applyQuaternion(n).add(e)},!1,s,(e,t)=>+(e<=1||e>=u-1||t<=1||t>=d-1))}ring(e,t,n,r,i,a=32,o=10){let s=new k().setFromUnitVectors(new p(0,1,0),t.clone().normalize()),c=new p;this.grid(a,o,(t,i)=>{let a=t*Math.PI*2,o=i*Math.PI*2;return c.set((n+r*Math.cos(o))*Math.cos(a),r*Math.sin(o),(n+r*Math.cos(o))*Math.sin(a)),c.applyQuaternion(s).add(e)},!0,i)}},we=class e{curve;rx;ry;samples=[];static N=48;constructor(t,n,r,i){this.curve=new D(t,!1,`centripetal`),this.rx=typeof r==`number`?()=>r:r,this.ry=typeof i==`number`?()=>i:i;let a=n.clone();for(let t=0;t<=e.N;t++){let n=t/e.N,r=this.curve.getTangentAt(n).normalize();a=a.sub(r.clone().multiplyScalar(a.dot(r))).normalize();let i=new p().crossVectors(r,a);this.samples.push({p:this.curve.getPointAt(n),t:r,u:a.clone(),w:i})}}at(t,n,r,i,a=1,o=0){let s=t*e.N,c=Math.min(Math.floor(s),e.N-1),l=s-c,u=this.samples[c],d=this.samples[c+1],f=this.rx(t),p=this.ry(t),m=Math.cos(n),h=Math.sin(n),g=u.u.x+(d.u.x-u.u.x)*l,_=u.u.y+(d.u.y-u.u.y)*l,v=u.u.z+(d.u.z-u.u.z)*l,y=u.w.x+(d.w.x-u.w.x)*l,b=u.w.y+(d.w.y-u.w.y)*l,x=u.w.z+(d.w.z-u.w.z)*l,S=(f+r)*m*a,C=(p+r)*h*a,w=o*Math.max(f,p),T=u.t.x+(d.t.x-u.t.x)*l,E=u.t.y+(d.t.y-u.t.y)*l,D=u.t.z+(d.t.z-u.t.z)*l;return i.set(u.p.x+(d.p.x-u.p.x)*l+g*S+y*C+T*w,u.p.y+(d.p.y-u.p.y)*l+_*S+b*C+E*w,u.p.z+(d.p.z-u.p.z)*l+v*S+x*C+D*w)}point(e){return this.curve.getPointAt(e)}};function Te(e,t,n,r,i){if(e<t||e>n)return 1;let a=(e-t)/(n-t);return 1+i*(.5-.5*Math.cos(a*Math.PI*2*r))*Math.sin(a*Math.PI)}function Ee(e,t,n){let r=e.pos.length/3,i=new Float32Array(r),a=new p,o=new p,s=new p,c=new p;for(let l=0;l<r;l++){a.set(e.pos[l*3],e.pos[l*3+1],e.pos[l*3+2]),o.set(e.nor[l*3],e.nor[l*3+1],e.nor[l*3+2]);let r=0;for(let n=0;n<t.length;n++){if(n===e.proxy[l])continue;let i=t[n];s.subVectors(i.b,i.a);let u=E.clamp(c.subVectors(a,i.a).dot(s)/Math.max(s.lengthSq(),1e-9),0,1);c.copy(i.a).addScaledVector(s,u).sub(a);let d=c.length();if(d<1e-4)continue;let f=o.dot(c)/d;f<=0||(r+=f*(i.r*i.r)/Math.max(d*d,i.r*i.r))}let u=Math.max(a.y-n,0);r+=Math.max(-o.y,0)*.7*Math.exp(-u/.12),i[l]=Math.max(.18,1-r*.9)}return i}var De=`
  attribute vec3 aColor;
  attribute vec4 aMat;
  attribute float aBone;
  attribute float aAO;
  uniform mat4 uBones[6];
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vColor;
  varying vec4 vMat;
  varying float vAO;
  void main() {
    mat4 bone = uBones[int(aBone + 0.5)];
    vec4 local = bone * vec4(position, 1.0);
    vec4 world = modelMatrix * local;
    vPosW = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * mat3(bone) * normal);
    vLocal = position;
    vColor = aColor;
    vMat = aMat;
    vAO = aAO;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,Oe=`
  precision highp float;
  uniform sampler2D uDetail;
  uniform vec3 uKeyDir;
  uniform vec3 uKeyColor;
  uniform vec3 uRimDir;
  uniform vec3 uRimColor;
  uniform vec3 uFill;
  uniform vec3 uBounceDir;
  uniform vec3 uBounceColor;
  uniform vec3 uPlanetDir;
  uniform float uPlanetCos;
  uniform vec3 uRingNormal;
  uniform float uLamp;
  uniform float uFade;
  varying vec3 vPosW;
  varying vec3 vNormalW;
  varying vec3 vLocal;
  varying vec3 vColor;
  varying vec4 vMat;
  varying float vAO;

  // The sky as the suit and visor reflect it: space, the planet's dark disc and its bright rim, the
  // ring band either side of it, and the broad glow the key light comes from.
  vec3 sky(vec3 r) {
    vec3 col = vec3(0.004, 0.008, 0.016) + vec3(0.01, 0.02, 0.035) * max(r.y, 0.0);
    float c = dot(r, uPlanetDir);
    // Squares written out: pow() of a negative base is NaN on Direct3D.
    float rd = (c - uPlanetCos) / 0.0025;
    float rimBand = exp(-rd * rd);
    float off = 1.0 - smoothstep(uPlanetCos - 0.002, uPlanetCos + 0.002, c);
    // The rings span a wide arc of the sky round the planet: a band along their plane, brightest near it.
    float rb = dot(r, uRingNormal) / 0.07;
    float ringBand = exp(-rb * rb) * smoothstep(-0.2, uPlanetCos, c);
    col += vec3(0.35, 0.75, 1.0) * ringBand * off * 1.4;
    col += vec3(1.0, 0.85, 0.85) * rimBand * 2.0;
    col = mix(col, vec3(0.01, 0.025, 0.035), (1.0 - off));
    col += uKeyColor * (pow(max(dot(r, uKeyDir), 0.0), 24.0) * 0.25 + pow(max(dot(r, uKeyDir), 0.0), 3.0) * 0.06);
    return col;
  }

  void main() {
    float rough = vMat.x;
    float metal = vMat.y;
    float kind = vMat.z;
    float edge = vMat.w;
    vec3 n = normalize(vNormalW);
    vec3 V = normalize(cameraPosition - vPosW);
    if (dot(n, V) < -0.2) n = -n;

    vec3 albedo = vColor;
    // Fabric: a fine weave and soft creases from the detail sheet, as bump.
    if (kind < 0.5) {
      vec3 w = pow(abs(n), vec3(4.0));
      w /= w.x + w.y + w.z;
      vec3 p = vLocal * 9.0;
      float hgt = texture2D(uDetail, p.zy).b * w.x + texture2D(uDetail, p.xz).b * w.y + texture2D(uDetail, p.xy).b * w.z;
      float weave = texture2D(uDetail, vLocal.xy * 60.0 + vLocal.z * 31.0).a;
      vec3 dpx = dFdx(vPosW);
      vec3 dpy = dFdy(vPosW);
      vec3 r1 = cross(dpy, n);
      vec3 r2 = cross(n, dpx);
      float det = dot(dpx, r1);
      vec3 grad = sign(det) * (dFdx(hgt) * r1 + dFdy(hgt) * r2);
      n = normalize(abs(det) * n - grad * 0.0045);
      albedo *= 0.85 + 0.3 * weave;
    } else if (kind < 1.5) {
      // Hard plates: paint worn back along the rims, a little grime in the mid tones.
      float grime = texture2D(uDetail, vLocal.xy * 7.0 + vLocal.z * 3.0).r;
      albedo *= 0.88 + 0.24 * grime;
      albedo = mix(albedo, vec3(0.55, 0.57, 0.58), edge * 0.35);
    }

    float ao = vAO;
    vec3 H = normalize(uKeyDir + V);
    float ndl = dot(n, uKeyDir);
    // Fabric wraps the light a little; plates take it hard.
    float wrap = kind < 0.5 ? 0.25 : 0.05;
    float diff = max((ndl + wrap) / (1.0 + wrap), 0.0);
    float shininess = mix(220.0, 8.0, rough);
    float spec = pow(max(dot(n, H), 0.0), shininess) * (shininess + 8.0) / 25.0 * step(0.0, ndl);
    float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
    vec3 f0 = mix(vec3(0.04), albedo, metal);
    vec3 F = f0 + (1.0 - f0) * fres * (1.0 - rough * 0.7);

    vec3 col = albedo * (1.0 - metal) * (uKeyColor * diff + uFill * (0.4 + 0.6 * max(dot(n, V), 0.0)) + uBounceColor * max(dot(n, uBounceDir), 0.0)) * ao;
    col += uKeyColor * spec * F * (1.0 - rough * 0.6);
    // The planet's side: a cool rim along the edges turned toward it.
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.2) * max(dot(n, uRimDir) + 0.25, 0.0);
    col += uRimColor * rim * (kind < 0.5 ? 0.5 : 0.9) * ao;
    // Reflections of the sky, dimmed by roughness.
    vec3 R = reflect(-V, n);
    col += sky(R) * F * (1.0 - rough) * ao;

    if (kind > 1.5 && kind < 2.5) {
      // The visor: dark gold glass, a mirror of the sky and a sharp highlight of the key.
      float vf = 0.35 + 0.65 * pow(1.0 - max(dot(n, V), 0.0), 3.0);
      vec3 gold = vec3(1.0, 0.78, 0.42);
      col = albedo * 0.02 + sky(R) * gold * vf + uKeyColor * gold * pow(max(dot(n, H), 0.0), 900.0) * 2.5;
      col += uRimColor * rim * 0.6;
    } else if (kind > 2.5) {
      col = albedo * (0.4 + 2.6 * uLamp);
    }
    gl_FragColor = vec4(col * uFade, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`,q={torso:K(0,.1,-.02),neck:K(0,.71,.07),wristL:K(.14,.355,.6),wristR:K(-.15,.32,.57)};function ke(e){let t=new Ce,n=[],r=(e,t,r)=>n.push({a:e,b:t,r})-1,i=[K(0,.05,-.03),K(0,.2,-.02),K(0,.42,.02),K(0,.6,.06),K(0,.69,.075)],a=r(K(0,.15,-.02),K(0,.58,.05),.15),c=t.tube({path:i,rx:e=>{let t=[.14,.18,.165,.19,.215,.2,.115],n=e*(t.length-1),r=Math.min(Math.floor(n),t.length-2),i=n-r;return t[r]+(t[r+1]-t[r])*i*i*(3-2*i)},ry:e=>.11+.025*Math.sin(Math.PI*Math.min(e*1.2,1))-.03*Math.max(e-.85,0)/.15,side:K(1,0,0),seg:32,steps:22,finish:{color:ve,rough:.82,kind:V.Fabric,bone:H.Torso,proxy:a}}),l=-Math.PI/2;t.plate(c,.6,.93,l-1.15,l+1.15,{color:U,rough:.45,bone:H.Torso,proxy:a},.008,.012,12,16),t.plate(c,.38,.57,l-.95,l+.95,{color:W,rough:.5,bone:H.Torso,proxy:a},.006,.009,8,14),t.plate(c,.17,.27,0,Math.PI*2,{color:G,rough:.4,metal:.6,bone:H.Torso,proxy:a},.004,.012,6,32),t.plate(c,.62,.95,l+Math.PI-1.2,l+Math.PI+1.2,{color:W,rough:.55,bone:H.Torso,proxy:a},.006,.01,10,14);for(let e of[0,Math.PI])t.plate(c,.33,.6,e-.55,e+.55,{color:U,rough:.45,bone:H.Torso,proxy:a},.008,.01,8,10),t.plate(c,.6,.66,e-.5,e+.5,{color:be,rough:.5,bone:H.Torso,proxy:a},.008,.008,4,8);let d=new k().setFromAxisAngle(K(1,0,0),-.2);t.blob(K(0,.43,.135),K(.06,.035,.025),.35,d,{color:xe,rough:.35,metal:.3,bone:H.Torso,proxy:a}),t.blob(K(.035,.435,.157),K(.009,.009,.006),.6,d,{color:4776191,rough:.3,kind:V.Lamp,bone:H.Torso,proxy:a},8,10),t.blob(K(0,.1,-.01),K(.18,.09,.14),.55,new k,{color:ye,rough:.85,kind:V.Fabric,bone:H.Root,proxy:a});let f=[{side:1,hip:K(.1,.11,.03),knee:K(.15,.38,.44),ankle:K(.17,-.04,.58),toe:K(.18,-.1,.8)},{side:-1,hip:K(-.1,.1,.03),knee:K(-.17,.32,.43),ankle:K(-.2,-.08,.5),toe:K(-.22,-.14,.72)}];for(let e of f){let n=r(e.hip,e.knee,.085),i=r(e.knee,e.ankle,.065),a=t.tube({path:[e.hip,e.hip.clone().lerp(e.knee,.5).add(K(0,.02,0)),e.knee],rx:e=>(.106-.024*e)*Te(e,.82,1,2,.08),ry:e=>(.098-.02*e)*Te(e,.82,1,2,.08),side:K(0,1,0),finish:{color:ye,rough:.82,kind:V.Fabric,bone:H.Root,proxy:n}});t.plate(a,.12,.72,-1.05,1.05,{color:U,rough:.45,bone:H.Root,proxy:n},.006,.011,12,14),t.plate(a,.2,.68,e.side>0?-1.75:1.12,e.side>0?-1.12:1.75,{color:U,rough:.5,bone:H.Root,proxy:n},.006,.008,10,6);let o=t.tube({path:[e.knee,e.knee.clone().lerp(e.ankle,.5),e.ankle],rx:e=>(.08-.017*e)*Te(e,0,.16,2,.08),side:K(0,0,1),finish:{color:ye,rough:.82,kind:V.Fabric,bone:H.Root,proxy:i}});t.plate(o,.16,.86,-1.1,1.1,{color:W,rough:.5,bone:H.Root,proxy:i},.006,.008,12,12),t.plate(o,.22,.6,-.75,.75,{color:U,rough:.45,bone:H.Root,proxy:i},.016,.008,10,10);let s=e.knee.clone().sub(e.hip).normalize().add(e.knee.clone().sub(e.ankle).normalize()).normalize(),c=new k().setFromUnitVectors(K(0,0,1),s);t.blob(e.knee.clone().addScaledVector(s,.045),K(.066,.066,.045),.6,c,{color:W,rough:.45,bone:H.Root,proxy:i}),t.blob(e.knee.clone().addScaledVector(s,.075),K(.03,.03,.02),.5,c,{color:G,rough:.35,metal:.6,bone:H.Root,proxy:i},8,12);let l=e.toe.clone().sub(e.ankle).setY(0).normalize(),u=new k().setFromUnitVectors(K(0,0,1),l),d=e.ankle.clone().lerp(e.toe,.5).add(K(0,-.005,0)),f=r(e.ankle.clone().add(K(0,-.04,0)),e.toe,.06);t.blob(d,K(.07,.065,.15),.42,u,{color:Se,rough:.6,bone:H.Root,proxy:f}),t.blob(d.clone().add(K(0,-.058,.005)),K(.075,.018,.16),.3,u,{color:xe,rough:.8,bone:H.Root,proxy:f}),t.blob(e.ankle.clone().add(K(0,.03,0)),K(.078,.06,.078),.6,u,{color:G,rough:.45,metal:.4,bone:H.Root,proxy:f}),t.blob(d.clone().add(K(0,.035,0)).addScaledVector(l,.02),K(.074,.03,.035),.4,u,{color:U,rough:.45,bone:H.Root,proxy:f})}let m=[{side:1,shoulder:K(.21,.6,.05),elbow:K(.25,.43,.34),wrist:q.wristL,hand:K(.125,.3,.66),bone:H.HandL},{side:-1,shoulder:K(-.21,.6,.05),elbow:K(-.27,.39,.32),wrist:q.wristR,hand:K(-.14,.26,.63),bone:H.HandR}];for(let e of m){let n=r(e.shoulder,e.elbow,.07),i=r(e.elbow,e.wrist,.058),a=t.tube({path:[e.shoulder,e.shoulder.clone().lerp(e.elbow,.5).add(K(.012*e.side,0,0)),e.elbow],rx:e=>(.09-.012*e)*Te(e,.8,1,2,.09),side:K(e.side,0,0),finish:{color:ve,rough:.82,kind:V.Fabric,bone:H.Shoulders,proxy:n}});t.plate(a,.25,.72,-1.2,1.2,{color:U,rough:.5,bone:H.Shoulders,proxy:n},.005,.007,8,10);let o=K(e.side,.55,0).normalize(),s=new k().setFromUnitVectors(K(0,0,1),o);t.spherePatch(e.shoulder.clone().add(K(-.012*e.side,-.01,0)),.085,s,-1.25,1.25,-1.1,1.1,{color:U,rough:.42,bone:H.Shoulders,proxy:n},.006,.012),t.ring(e.shoulder.clone().add(K(.03*e.side,-.055,0)),e.elbow.clone().sub(e.shoulder).normalize(),.072,.012,{color:G,rough:.35,metal:.7,bone:H.Shoulders,proxy:n});let c=t.tube({path:[e.elbow,e.elbow.clone().lerp(e.wrist,.5),e.wrist],rx:e=>(.078-.016*e)*Te(e,0,.18,2,.08),side:K(0,1,0),finish:{color:ve,rough:.82,kind:V.Fabric,bone:H.Root,proxy:i}});t.plate(c,.25,.85,-1.3,1.3,{color:U,rough:.45,bone:H.Root,proxy:i},.006,.01,10,12),t.plate(c,.86,.98,0,Math.PI*2,{color:W,rough:.5,bone:H.Root,proxy:i},.006,.01,4,24);let l=e.elbow.clone().sub(e.shoulder).normalize().add(e.elbow.clone().sub(e.wrist).normalize()).normalize();t.blob(e.elbow.clone().addScaledVector(l,.035),K(.05,.05,.035),.6,new k().setFromUnitVectors(K(0,0,1),l),{color:W,rough:.45,bone:H.Root,proxy:i});let u=e.hand.clone().sub(e.wrist).normalize(),d=new k().setFromUnitVectors(K(0,-1,0),u);d.multiply(new k().setFromAxisAngle(K(0,1,0),e.side*.5));let f=r(e.wrist,e.hand,.045),m={color:2041387,rough:.75,bone:e.bone,proxy:f};t.blob(e.wrist.clone().lerp(e.hand,.45),K(.052,.06,.03),.5,d,m);let h=e.hand.clone().addScaledVector(u,.02);t.blob(h.clone().add(K(0,0,.012)),K(.05,.042,.03),.6,d,m),t.blob(e.wrist.clone().lerp(e.hand,.55).add(new p(.035*e.side,0,.02).applyQuaternion(d)),K(.016,.04,.016),.8,d,m,8,10),t.blob(e.wrist.clone().lerp(e.hand,.62).add(new p(0,0,.03).applyQuaternion(d)),K(.05,.016,.012),.45,d,{...m,color:U,rough:.5},8,12)}let g=new k().setFromAxisAngle(K(1,0,0),.2),y=r(K(0,.36,-.2),K(0,.66,-.15),.15);t.blob(K(0,.48,-.2),K(.2,.25,.1),.28,g,{color:W,rough:.55,bone:H.Torso,proxy:y},16,24),t.blob(K(0,.5,-.29),K(.17,.2,.035),.25,g,{color:G,rough:.5,metal:.4,bone:H.Torso,proxy:y},12,20),t.blob(K(0,.3,-.24),K(.18,.05,.08),.3,g,{color:U,rough:.45,bone:H.Torso,proxy:y},10,18);for(let e of[1,-1])t.tube({path:[K(.19*e,.3,-.21),K(.19*e,.68,-.13)],rx:.045,side:K(1,0,0),seg:16,steps:6,finish:{color:G,rough:.35,metal:.65,bone:H.Torso,proxy:y}});t.tube({path:[K(.17,.66,-.2),K(.26,.74,-.08),K(.2,.78,.04),K(.14,.8,.1)],rx:.017,side:K(0,1,0),seg:10,steps:18,finish:{color:2238509,rough:.6,bone:H.Torso,proxy:y}}),t.tube({path:[K(-.15,.7,-.22),K(-.16,.9,-.25),K(-.17,1.02,-.27)],rx:.005,side:K(1,0,0),seg:6,steps:6,finish:{color:G,rough:.4,metal:.6,bone:H.Torso,proxy:y}}),t.blob(K(-.17,1.03,-.27),K(.01,.01,.01),1,new k,{color:16734780,rough:.4,kind:V.Lamp,bone:H.Torso,proxy:y},6,8),t.ring(q.neck,K(0,1,.15),.115,.022,{color:G,rough:.3,metal:.75,bone:H.Torso,proxy:a},36,12),t.ring(q.neck.clone().add(K(0,.025,.003)),K(0,1,.15),.108,.012,{color:U,rough:.45,bone:H.Torso,proxy:a},36,8);let b=q.neck.clone().add(K(0,.15,.025)),x=r(b,b,.16),S=new k().setFromAxisAngle(K(1,0,0),-.08),C={color:14277592,rough:.35,bone:H.Head,proxy:x};t.blob(b,K(.152,.158,.155),1,S,C,24,36),t.spherePatch(b,.152,S,-1.45,1.45,-.72,.78,{color:be,rough:.45,bone:H.Head,proxy:x},.002,.006),t.spherePatch(b,.152,S,-1.25,1.25,-.55,.62,{color:329482,rough:.05,kind:V.Visor,bone:H.Head,proxy:x},.009,.004,16,26),t.spherePatch(b,.152,S,-1,1,.72,1,{color:W,rough:.4,bone:H.Head,proxy:x},.004,.008,6,14);for(let e of[1,-1]){let n=new p(e,.05,-.05).normalize(),r=new k().setFromUnitVectors(K(0,0,1),n);t.blob(b.clone().addScaledVector(n,.158),K(.05,.05,.022),.7,r,{color:G,rough:.4,metal:.5,bone:H.Head,proxy:x},10,16),t.blob(b.clone().addScaledVector(n,.178),K(.03,.03,.01),.7,r,{color:U,rough:.45,bone:H.Head,proxy:x},8,12)}t.blob(b.clone().add(K(.07,.13,.03)),K(.03,.02,.04),.4,S,{color:G,rough:.4,metal:.5,bone:H.Head,proxy:x},8,12),t.blob(b.clone().add(K(.07,.13,.07)),K(.018,.012,.004),.5,S,{color:12580095,rough:.3,kind:V.Lamp,bone:H.Head,proxy:x},6,8);let T=Ee(t,n,0),E=new O;E.setAttribute(`position`,new u(t.pos,3)),E.setAttribute(`normal`,new u(t.nor,3)),E.setAttribute(`aColor`,new u(t.col,3)),E.setAttribute(`aMat`,new u(t.mat,4)),E.setAttribute(`aBone`,new u(t.bone,1)),E.setAttribute(`aAO`,new v(T,1)),E.setIndex(t.index),E.computeBoundingSphere();let D=Array.from({length:6},()=>new _),ee={value:0},j={value:0},M=e.light,N=new o({vertexShader:De,fragmentShader:Oe,uniforms:{uBones:{value:D},uDetail:{value:e.detail},uKeyDir:{value:M.keyDir},uKeyColor:{value:M.keyColor},uRimDir:{value:M.rimDir},uRimColor:{value:M.rimColor},uFill:{value:M.fill},uBounceDir:{value:M.bounceDir},uBounceColor:{value:M.bounceColor},uPlanetDir:{value:M.planetDir},uPlanetCos:{value:Math.cos(M.planetAngle)},uRingNormal:{value:M.ringNormal},uLamp:j,uFade:ee}}),P=new w(E,N);P.name=`title-astronaut`;let F=new A;F.name=`title-astronaut-root`,F.add(P);let I=new _,L=new k,R=new s,z=new _,B=(e,t,n,r=0)=>(e.makeTranslation(t.x,t.y+r,t.z).multiply(I.makeRotationFromQuaternion(n)).multiply(z.makeTranslation(-t.x,-t.y,-t.z)),e),te=new _,ne=n.map(()=>new h);return{group:F,update(t){let n=+!e.still,r=Math.sin(t*1.37)*.8+Math.sin(t*.61+1.2)*.2;R.set(-.006*r*n,0,0),B(D[H.Torso],q.torso,L.setFromEuler(R),.0025*r*n),R.set(-.003*r*n,0,0),B(D[H.Shoulders],q.torso,L.setFromEuler(R),.0012*r*n);let i=(Math.sin(t*.071)*.09+Math.sin(t*.163+2.1)*.035)*n,a=(Math.sin(t*.053+.7)*.04+Math.sin(t*.19+1.1)*.012)*n;R.set(a,i,0,`YXZ`),B(te,q.neck,L.setFromEuler(R)),D[H.Head].multiplyMatrices(D[H.Torso],te),R.set(Math.sin(t*.83)*.02*n,0,Math.sin(t*.57+.4)*.015*n),B(D[H.HandL],q.wristL,L.setFromEuler(R)),R.set(Math.sin(t*.77+2)*.02*n,0,Math.sin(t*.49+1.3)*.015*n),B(D[H.HandR],q.wristR,L.setFromEuler(R));let o=t%3.4/3.4;j.value=e.still?.6:Math.max(Math.exp(-(((o-.05)/.012)**2)),Math.exp(-(((o-.11)/.012)**2)))*.9+.1},setFade(e){ee.value=e},occluders(){F.updateMatrixWorld(!0);let e=F.matrixWorld,t=new p().setFromMatrixScale(e).x;return n.map((n,r)=>{let i=n.a.clone().lerp(n.b,.5).applyMatrix4(e),a=(n.r+n.a.distanceTo(n.b)*.35)*t;return ne[r].set(i.x,i.y,i.z,a)})},dispose(){E.dispose(),N.dispose()}}}async function Ae(e){let t=[],n=new k().setFromRotationMatrix(e.perch),r=F(986682);for(let i of e.rocks){let a=`screen`in i.at?e.dirAt(...i.at.screen).multiplyScalar(i.at.distance):new p(...i.at.perch).applyMatrix4(e.perch),o=new k().setFromEuler(new s(...i.turn??[0,0,0]));`perch`in i.at&&o.premultiply(n);let c=new p(...i.stretch).multiplyScalar(i.radius),l=new _().compose(a,o,c).invert().multiply(e.perch),u=(i.planes??[]).map(({n:e,p:t})=>{let n=new S().setFromNormalAndCoplanarPoint(new p(...e).normalize(),new p(...t));return n.applyMatrix4(l),{n:n.normal.clone(),d:-n.constant}}),d=re(i.detail,i.seed,i.shape,{cuts:u,stretch:new p(1,1,1)});d.applyMatrix4(new _().compose(a,o,c));let f=d.getAttribute(`position`).count;d.setAttribute(`aSeed`,new v(new Float32Array(f).fill(r()),1)),t.push(d),await e.pace?.()}let i=C(t,!1);for(let e of t)e.dispose();let a={value:0},o=new x().setFromPoints(e.occluders.map(e=>new p(e.x,e.y,e.z))),c=Math.max(...e.occluders.map(e=>e.w)),l=new h(o.center.x,o.center.y,o.center.z,o.radius+c+1.2),u=ae(ie,e.light,{uOcc:{value:e.occluders},uOccCount:{value:e.occluders.length},uOccBound:{value:l}},a,.7,{OCCLUDERS:e.occluders.length}),d=new w(i,u);return d.name=`title-formations`,await z().ready,{mesh:d,setFade(e){a.value=e},dispose(){i.dispose(),u.dispose()}}}var je=`
  attribute vec4 aSeed;
  uniform float uTime;
  uniform vec3 uBoxMin;
  uniform vec3 uBoxSize;
  uniform float uPixelRatio;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    vec3 drift = vec3(-0.06 - 0.1 * aSeed.x, 0.05 + 0.08 * aSeed.y, 0.02 * (aSeed.z - 0.5));
    // A slow curl on top, so no two drift in quite straight lines.
    vec3 curl = vec3(sin(uTime * 0.21 + aSeed.w * 30.0), cos(uTime * 0.17 + aSeed.z * 20.0), 0.0) * 0.12;
    vec3 p = mod(position + drift * uTime + curl - uBoxMin, uBoxSize) + uBoxMin;
    vec3 e = min(p - uBoxMin, uBoxMin + uBoxSize - p) / uBoxSize;
    float edge = smoothstep(0.0, 0.15, min(min(e.x, e.y), e.z));
    // Each mote flares for a moment every 5-12 s, and glows faintly between.
    float period = 5.0 + 7.0 * aSeed.y;
    float c = fract(uTime / period + aSeed.w);
    // Squared by hand: pow() of a negative base is NaN on Direct3D.
    float fd = (c - 0.5) / 0.05;
    float flare = exp(-fd * fd);
    vec4 mv = viewMatrix * vec4(p, 1.0);
    float dist = -mv.z;
    vAlpha = edge * (0.18 + 0.82 * flare) * (0.5 + 0.5 * aSeed.x);
    vWarm = aSeed.z;
    gl_PointSize = clamp((26.0 + 30.0 * aSeed.x) / dist, 1.0, 5.0) * uPixelRatio;
    gl_Position = projectionMatrix * mv;
  }
`,Me=`
  precision highp float;
  uniform float uIntensity;
  varying float vAlpha;
  varying float vWarm;
  void main() {
    float r = length(gl_PointCoord - 0.5) * 2.0;
    float k = exp(-r * r * 5.0) * smoothstep(1.0, 0.6, r);
    vec3 col = mix(vec3(1.0, 0.55, 0.2), vec3(1.0, 0.78, 0.45), vWarm);
    gl_FragColor = vec4(col * k * vAlpha * uIntensity * 2.2, 1.0);
  }
`;function Ne(e){let t=F(e.seed),n=new Float32Array(e.count*3),r=new Float32Array(e.count*4);for(let i=0;i<e.count;i++)n.set([e.boxMin.x+t()*e.boxSize.x,e.boxMin.y+t()*e.boxSize.y,e.boxMin.z+t()*e.boxSize.z],i*3),r.set([t(),t(),t(),t()],i*4);let i=new O;i.setAttribute(`position`,new v(n,3)),i.setAttribute(`aSeed`,new v(r,4));let a={value:0},s={value:0},c={value:1},l=new o({vertexShader:je,fragmentShader:Me,uniforms:{uTime:a,uBoxMin:{value:e.boxMin},uBoxSize:{value:e.boxSize},uPixelRatio:c,uIntensity:s},transparent:!0,depthWrite:!1,blending:2}),u=new g(i,l);return u.name=`title-embers`,u.frustumCulled=!1,u.renderOrder=11,u.onBeforeRender=e=>{c.value=e.getPixelRatio()},{points:u,update(e){a.value=e},setIntensity(e){s.value=e},dispose(){i.dispose(),l.dispose()}}}var Pe=40,J=Math.tan(E.degToRad(Pe/2)),Y=16/9*J,X=Math.PI/180;function Fe(e,t,n=new p){return n.set((2*e-1)*Y,(1-2*t)*J,-1).normalize()}function Ie(e,t){return new l((2*e-1)*Y,(1-2*t)*J)}var Z={planet:{at:[.69,.36],angularRadius:10.5,distance:6e3},rings:{opening:25,tilt:17},sunBehind:[-.42,-.4],spin:.015,hazeDrift:.0011,ringRate:.02,glow:2.4,band:{from:[.2,-.08],to:[1.05,.78],knot:[.86,.2]},dustDrift:[.22,-.1,1]},Le={at:[.445,.705],distance:4.4,facing:62},Re=[{at:{perch:[.05,-.7,-.35]},radius:1,stretch:[1.5,.95,1.1],shape:`angular`,detail:6,seed:311,planes:[{n:[0,1,0],p:[0,0,0]},{n:[0,-.2,1],p:[0,0,.3]}]},{at:{perch:[.02,-.75,.75]},radius:.9,stretch:[1.3,.85,1],shape:`chunky`,detail:5,seed:523,planes:[{n:[-.11,1,.04],p:[0,-.145,0]}]},{at:{perch:[-.85,-.35,-.75]},radius:.6,stretch:[1.2,1.3,1],shape:`angular`,detail:5,seed:731},{at:{perch:[-1.2,-1.35,.4]},radius:1.3,stretch:[1.4,1,1.2],shape:`chunky`,detail:5,seed:977},{at:{perch:[1,-1.1,1.1]},radius:.9,stretch:[1.2,1,1.3],shape:`angular`,detail:5,seed:1181},{at:{screen:[-.07,.52],distance:8},radius:3.6,stretch:[.75,1.5,.9],turn:[.3,.5,.1],shape:`angular`,detail:5,seed:1409},{at:{screen:[.1,-.1],distance:11},radius:2.8,stretch:[1.5,.7,1],turn:[.2,.9,-.2],shape:`chunky`,detail:5,seed:1601},{at:{screen:[1.09,-.1],distance:26},radius:6,stretch:[1.25,.9,1],turn:[.6,.2,.4],shape:`angular`,detail:5,seed:1873},{at:{screen:[.88,1.06],distance:9},radius:2.3,stretch:[1.6,.8,1],turn:[.1,1.1,.15],shape:`angular`,detail:5,seed:2111},{at:{screen:[1.05,.84],distance:13},radius:2.6,stretch:[1,1.2,1],turn:[.4,.3,.7],shape:`chunky`,detail:5,seed:2333},{at:{screen:[.16,1.1],distance:7},radius:2,stretch:[1.8,.7,1.1],turn:[.1,.4,-.1],shape:`chunky`,detail:5,seed:2557}],ze={pool:[[1.4,`chunky`,5],[1.2,`angular`,5],[1.1,`elongated`,4],[1.1,`chunky`,4],[.9,`angular`,4],[.8,`elongated`,4],[.65,`chunky`,3],[.55,`angular`,3],[.45,`elongated`,3],[.4,`chunky`,3],[.32,`angular`,2],[.28,`chunky`,2]],distance:[16,150],bandTop:.02,bandDepth:.62,crossing:[32,110],sink:[.08,.32],approach:[0,.08],spin:[.05,.12],seed:88702},Be={area:[-.15,.62,.55,.86],heading:[Math.PI+.12,Math.PI+.3],first:6,every:[8,12],seconds:1,travel:.75,length:[.45,.65],width:.022,brightness:7},Ve={count:18,countLow:12,distance:[6.5,60],size:[.0065,.014],drift:[.007,.015],driftAt:25,parallax:.35,spin:[.15,.7],seed:912147},Q={drift:[.05,.03,.07],lean:.06,leanTurn:.6,follow:1.6,push:1.4},He={first:11,every:[18,28],seed:23582},$={keep:[.372,.865],menuEdge:.37,right:.985,landscape:1.2},Ue=[[`isilthe_day.jpg`,!0]];function We(){for(let[e,t]of Ue)I(e,t);z()}var Ge=.6,Ke=e=>e<0?0:e>1?1:e,qe=e=>e*e*(3-2*e),Je=class{kind=`TitleScene`;usesAO=!1;grade=P.title;needsEnvironment=!1;governed=!1;scene=new f;camera=new T(Pe,window.innerWidth/window.innerHeight,.3,4e4);onFirstFrame=null;onSignal=null;signalRand=F(He.seed);nextSignal=He.first;detail=null;sky;world;astronaut;formations;rocks;debris;embers;fx;elapsed=0;firstFrame=!0;disposed=!1;yaw=0;leaveT=-1;onLeft=null;lowTier=!1;pointer=new l;lean=new l;onPointer=e=>{this.pointer.set(e.clientX/window.innerWidth*2-1,e.clientY/window.innerHeight*2-1)};scratchW=new p;lookTarget=new p;async init(e){let t=N();if(!t)throw Error(`TitleScene needs the engine`);let n=t.renderer;this.lowTier=t.getQualityTier()===`low`,this.scene.background=new i(198156);let r=Z.planet,a=Fe(...r.at),o=a.clone().multiplyScalar(r.distance),s=r.distance*Math.sin(r.angularRadius*X),c=new p().crossVectors(a,new p(0,1,0)).normalize(),l=new p().crossVectors(c,a).normalize(),{opening:u,tilt:d}=Z.rings,f=c.clone().multiplyScalar(Math.cos(d*X)).addScaledVector(l,Math.sin(d*X)),m=l.clone().multiplyScalar(Math.cos(d*X)).addScaledVector(c,-Math.sin(d*X)),h=a.clone().multiplyScalar(Math.cos(u*X)).addScaledVector(m,Math.sin(u*X)),g=new p().crossVectors(f,h).normalize(),[v,y]=Z.sunBehind,b=a.clone().addScaledVector(c,v).addScaledVector(l,y).normalize(),x=new p(.8,.42,-.18).normalize(),S=a.clone().addScaledVector(c,.35).addScaledVector(l,.25).normalize(),C=new p(-.3,-.85,.3).normalize(),w={sunDir:x,rimDir:S,bounceDir:C,sunColor:new i(.62,.8,1).multiplyScalar(.8),bounceColor:new i(.42,.26,.14).multiplyScalar(.25),fillColor:new i(.022,.036,.06),rimGain:2.2,albedo:[.035,.24]},T={sunDir:b,rimDir:b,bounceDir:g,sunColor:new i(1,.9,.8).multiplyScalar(1.4),bounceColor:new i(.2,.45,.6).multiplyScalar(.25),fillColor:new i(.02,.035,.05),rimGain:1.4,albedo:[.035,.24]},E=()=>e?.breathe()??Promise.resolve(),D=performance.now(),O=e=>{ee(`title:${e}`,D),D=performance.now()},A=Z.band,j=se(n,E),P=te(n,j.then(e=>e.texture),{from:Ie(...A.from),to:Ie(...A.to),core:Ie(...A.knot)},{stars:this.lowTier?4200:8e3,pace:E}),[F,z]=await Promise.all([j,P]);this.detail=F,this.sky=z,this.scene.add(this.sky.group),O(`bakes`),await e?.tick(),this.world=_e({center:o,radius:s,ringNormal:g,sunDir:b,day:I(`isilthe_day.jpg`,!0),detail:F.texture,segments:this.lowTier?128:192,spin:Z.spin,hazeDrift:Z.hazeDrift,ringRate:Z.ringRate,glow:Z.glow,rubble:{count:this.lowTier?36:56,size:[s*.004,s*.02],light:T,seed:502558}}),this.scene.add(this.world.group),O(`planet`),await e?.tick();let ne=Fe(...Le.at).multiplyScalar(Le.distance),re=new _().compose(ne,new k().setFromAxisAngle(new p(0,1,0),Le.facing*X),new p(1,1,1));this.astronaut=ke({detail:F.texture,still:M.reduced,light:{keyDir:x,keyColor:new i(.85,.92,1).multiplyScalar(1.15),rimDir:S,rimColor:new i(.45,.8,1).multiplyScalar(.9),fill:new i(.05,.075,.11),bounceDir:C,bounceColor:new i(.4,.26,.15).multiplyScalar(.3),planetDir:a,planetAngle:r.angularRadius*X,ringNormal:g}}),this.astronaut.group.matrixAutoUpdate=!1,this.astronaut.group.matrix.copy(re),this.scene.add(this.astronaut.group),O(`astronaut`),await e?.tick(),this.formations=await Ae({rocks:Re,perch:re,dirAt:(e,t)=>Fe(e,t),light:w,occluders:this.astronaut.occluders(),pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.formations.mesh),O(`formations`);let ie={tanH:Y,tanV:J},ae=ze,ce={...w,fillColor:new i(.06,.09,.13),rimGain:3};this.rocks=await B({...ae,...ce,pool:ae.pool.map(([e,t,n])=>[e,t,this.lowTier?Math.min(n,4):n]),view:ie,pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.rocks.mesh),this.debris=R({...Ve,...w,count:this.lowTier?Ve.countLow:Ve.count,view:ie}),this.scene.add(this.debris.group),O(`rocks`),await e?.tick(),this.embers=Ne({count:this.lowTier?26:44,boxMin:new p(-1,-5,-26),boxSize:new p(14,10,20),seed:932837}),this.scene.add(this.embers.points);let le=new p(...Z.dustDrift).normalize().multiplyScalar(.9);this.fx=oe({sunDir:b,coreDistance:3e4,dust:{count:this.lowTier?90:180,boxMin:new p(-16,-11,-42),boxSize:new p(40,22,36),stream:le},meteors:Be}),this.fx.setMeteors(!M.reduced),this.scene.add(this.fx.group),this.sky.setReveal(1,1),this.world.setFade(1),this.astronaut.setFade(1),this.formations.setFade(1),this.rocks.setFade(1),this.debris.setFade(1),this.embers.setIntensity(1),this.fx.setGlare(0),this.fx.setDust(.6),this.frame(window.innerWidth/window.innerHeight),this.world.update(0),this.astronaut.update(0),this.placeCamera(0,0),O(`fx`),await L(),O(`maps`)}onEnter(){j(`title:backdrop`),window.addEventListener(`pointermove`,this.onPointer)}leave(){return new Promise(e=>{if(this.disposed){e();return}let t=this.onLeft;this.onLeft=()=>{t?.(),e()},this.leaveT<0&&(this.leaveT=0)})}update(e){this.elapsed+=e;let t=this.elapsed;this.world.update(t),this.astronaut.update(t),this.rocks.update(e),this.debris.update(t),this.embers.update(t),t>=this.nextSignal&&this.leaveT<0&&(this.nextSignal=t+He.every[0]+this.signalRand()*(He.every[1]-He.every[0]),this.world.pulse(),this.onSignal?.());let n=0;if(this.leaveT>=0){this.leaveT+=e;let t=Ke(this.leaveT/(M.reduced?.35:Ge));if(this.fx.setVeil(qe(t)),n=M.reduced?0:t*t*Q.push,t>=1&&this.onLeft){let e=this.onLeft;this.onLeft=null,e()}}this.placeCamera(n,e),this.fx.update(this.camera,e,t),this.sky.update(this.camera),this.firstFrame&&(this.firstFrame=!1,this.onFirstFrame?.())}placeCamera(e,t){let n=+!M.reduced,r=this.elapsed,[i,a,o]=Q.drift,s=1-Math.exp(-Q.follow*Math.min(t,.1));this.lean.x+=(this.pointer.x*n-this.lean.x)*s,this.lean.y+=(this.pointer.y*n-this.lean.y)*s,this.camera.position.set((Math.sin(r*.11)*i+this.lean.x*Q.lean)*n,(Math.sin(r*.083+1.3)*a-this.lean.y*Q.lean*.6)*n,Math.sin(r*.061+.6)*o*n);let c=Q.leanTurn*X,l=this.yaw+this.lean.x*c*n;this.lookTarget.set(Math.sin(l)*120,-this.lean.y*c*.6*n*120,-Math.cos(l)*120),e>0&&(this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize(),this.camera.position.addScaledVector(this.scratchW,e)),this.camera.lookAt(this.lookTarget)}frame(e){let t,n=0;if(e>=$.landscape){let[r,i]=$.keep.map(e=>(2*e-1)*Y),a=$.right-$.menuEdge,o=Math.max(J*e,(i-r)/(2*a));t=o/e,n=Math.min(0,r-(2*$.menuEdge-1)*o)}else t=Math.max(J,.36/e),n=Math.tan(Math.max(0,Math.atan(Y)-Math.atan(t*e))*.6);this.camera.fov=2*Math.atan(t)/X,this.camera.aspect=e,this.camera.updateProjectionMatrix(),this.yaw=Math.atan(n),this.rocks?.setView(t*e,t),this.debris?.setView(t*e,t)}onResize(e,t){this.frame(e/t)}dispose(){this.disposed=!0,window.removeEventListener(`pointermove`,this.onPointer);let e=this.onLeft;this.onLeft=null,e?.(),this.detail?.dispose(),this.sky?.dispose(),this.world?.dispose(),this.astronaut?.dispose(),this.formations?.dispose(),this.rocks?.dispose(),this.debris?.dispose(),this.embers?.dispose(),this.fx?.dispose()}};export{Je as TitleScene,We as preloadTitle};