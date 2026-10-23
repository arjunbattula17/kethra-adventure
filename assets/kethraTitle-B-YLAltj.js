import{$ as e,At as t,C as n,D as r,Et as i,Gt as a,Ht as o,L as s,Q as c,St as l,Tt as u,Ut as d,Vt as f,at as p,ot as m,pt as h,rt as g,v as _,wt as v,x as y,yt as b,z as x}from"./three-BNTvIbIC.js";import{n as S,t as C}from"./perfMarks-B6nwIo-H.js";import{t as w}from"./motion-St5-4car.js";import{d as ee,h as te,i as ne,u as re,v as ie}from"./boot-DRT8CN2B.js";import{n as ae,r as oe,t as se}from"./planetShader-DiFSBZRs.js";import{a as ce,c as le,d as ue,i as de,l as fe,t as pe,u as me}from"./skyFx-BfT5uhZC.js";var he=`
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
`,ge=`
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
`,_e=`
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,ve=`
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
`,ye=-.0085,be=28e-5,xe=2.25;function Se(e){let n=new x;n.name=`title-hero-planet`,n.position.copy(e.center);let a=new r(1,.97,.92).multiplyScalar(2.3),o={uDay:{value:e.day},uNight:{value:e.night},uClouds:{value:e.clouds},uDetail:{value:e.detail},uSunDir:{value:e.sunDir},uSunColor:{value:a},uCloudShift:{value:0},uBumpScale:{value:e.radius*.0014},uNightGlow:{value:1.25},uCloudHeight:{value:e.radius*.004},uFade:{value:0}},s=new m(new t(e.radius,e.segments,e.segments/2),new i({vertexShader:he,fragmentShader:ge,uniforms:o}));s.name=`title-hero-surface`,s.rotation.y=xe;let c=new x;c.rotation.set(.32,0,-.42),c.add(s),n.add(c);let l=e.radius*.0075,u={uCenter:{value:e.center},uR:{value:e.radius},uH:{value:l},uSunDir:{value:e.sunDir},uGlareDir:{value:e.glareDir},uSunColor:{value:new r(1,1,1).multiplyScalar(1.15)},uBeta:{value:new d(.014,.042,.078)},uMie:{value:1},uDiscHaze:{value:.4},uFade:{value:0}},f=new m(new t(e.radius+l*8,e.segments,e.segments/2),new i({vertexShader:_e,fragmentShader:ve,uniforms:u,transparent:!0,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendSrcAlpha:200,blendDstAlpha:201}));return f.name=`title-hero-atmosphere`,n.add(f),{group:n,surface:s,radius:e.radius,update(e){s.rotation.y=xe+e*ye,o.uCloudShift.value=e*be},setReveal(e,t){o.uFade.value=e,u.uFade.value=t},dispose(){s.geometry.dispose(),s.material.dispose(),f.geometry.dispose(),f.material.dispose()}}}var Ce=`
  varying vec3 vNormalW;
  varying vec3 vLocalN;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vLocalN = normal;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`,we=`
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
`;function Te(e){let n={value:0},r=new m(new t(e.radius,40,20),new i({vertexShader:Ce,fragmentShader:we,uniforms:{uDetail:{value:e.detail},uLight:{value:e.light},uFade:n}}));return r.name=`title-moon`,r.position.copy(e.position),r.rotation.set(.4,1.2,.2),{mesh:r,setFade(e){n.value=e},dispose(){r.geometry.dispose(),r.material.dispose()}}}var T=0,E=1,D=2,O=3,Ee=4,k=5,De=6,Oe=7,ke=-5.45,Ae=64,je=.3,Me=.4,A=(e,t,n)=>new d(e,t,n),j=A(0,1,0),M=A(-1,0,0);function N(e){let t=new d;for(let n of e)t.add(n);return t.divideScalar(e.length)}function P(e,t){if(t<=e[0][0])return e[0].slice(1);for(let n=0;n<e.length-1;n++){let r=e[n],i=e[n+1];if(t<=i[0]){let e=(t-r[0])/(i[0]-r[0]);return r.slice(1).map((t,n)=>t+(i[n+1]-t)*e)}}return e[e.length-1].slice(1)}var Ne=new d,Pe=new d,Fe=new d,Ie=new d,Le=new d,Re=class{pos=[];mat=[];uv;kind=T;tint=1;seed=0;xf=null;flip=!1;uvs=null;rand;constructor(e,t=!1){this.rand=e,this.uv=t?[]:null}get triangles(){return this.pos.length/9}use(e,t=1){return this.kind=e,this.tint=t,this.seed=this.rand(),this}place(e){return this.xf=e,this.flip=!!e&&e.determinant()<0,this}triN(e,t,n,r,i=this.tint){if(Ne.subVectors(t,e),Pe.subVectors(n,e),Fe.crossVectors(Ne,Pe),Fe.lengthSq()<1e-14)return;let a=Fe.dot(r)>=0;this.flip&&(a=!a);let o=this.uvs;this.push(e,i,o?.[0]),a?(this.push(t,i,o?.[1]),this.push(n,i,o?.[2])):(this.push(n,i,o?.[2]),this.push(t,i,o?.[1]))}push(e,t,n){let r=this.xf?Ie.copy(e).applyMatrix4(this.xf):e;this.pos.push(r.x,r.y,r.z),this.mat.push(this.kind,t,this.seed),this.uv&&this.uv.push(n?n[0]:0,n?n[1]:0)}tri(e,t,n,r,i=!1,a=this.tint){let o=Le.copy(e).add(t).add(n).divideScalar(3).sub(r);i&&o.negate(),this.triN(e,t,n,o,a)}quadN(e,t,n,r,i,a=this.tint){this.triN(e,t,n,i,a),this.triN(e,n,r,i,a)}quad(e,t,n,r,i,a=!1){this.tri(e,t,n,i,a),this.tri(e,n,r,i,a)}quadUv(e,t,n,r,i,a,o=this.tint){this.uvs=[a[0],a[1],a[2]],this.triN(e,t,n,i,o),this.uvs=[a[0],a[2],a[3]],this.triN(e,n,r,i,o),this.uvs=null}loft(e,t=[!0,!0],n=!1){let r=e[0].length,i=e.map(N);for(let t=0;t<e.length-1;t++){let a=e[t],o=e[t+1],s=i[t].clone().add(i[t+1]).multiplyScalar(.5);for(let e=0;e<r;e++){let t=(e+1)%r;this.quad(a[e],a[t],o[t],o[e],s,n)}}let a=i.reduce((e,t)=>e.add(t),new d).divideScalar(i.length),o=t=>{let n=e[t],o=i[t].clone().sub(a);for(let e=0;e<r;e++)this.triN(i[t],n[e],n[(e+1)%r],o)};t[0]&&o(0),t[1]&&o(e.length-1)}},F=(e,t)=>t.map(([t,n])=>A(e,t,n));function I(e,t,n,r,i){let a=Math.max(1e-4,Math.min(i,n*.45,r*.45));return[[e+n,t+r-a],[e+n,t-r+a],[e+n-a,t-r],[e-n+a,t-r],[e-n,t-r+a],[e-n,t+r-a],[e-n+a,t+r],[e+n-a,t+r]]}function ze(e,t,n=.03,r=[!0,!0]){let i=t.map(([e,t,r,i,a=0])=>F(e,I((t+r)/2,a,(r-t)/2,i,n)));return e.loft(i,r),i}function L(e,t,n,r,i,a,o,s=0,c=.03){let l=Math.min(c,(n-t)*.3,(i-r)*.3),u=(e,t)=>I((r+i)/2,s,(i-r)/2-t,a+(o-a)*e-t,c),d=n-t;e.loft([F(t,u(0,l)),F(t+l,u(l/d,0)),F(n-l,u(1-l/d,0)),F(n,u(1,l))])}function R(e,t,n,r){let i=r/Math.cos(Math.PI/8),a=[];for(let r=0;r<8;r++){let o=(r+.5)*Math.PI/4;a.push(A(e,t+Math.sin(o)*i,n+Math.cos(o)*i))}return a}function z(e,t,n,r,i=6){let a=n.clone().sub(t).normalize(),o=Math.abs(a.y)<.9?new d().crossVectors(a,j).normalize():new d().crossVectors(a,M).normalize(),s=new d().crossVectors(a,o),c=e=>{let t=[];for(let n=0;n<i;n++){let a=(n+.5)/i*Math.PI*2;t.push(e.clone().addScaledVector(o,Math.cos(a)*r).addScaledVector(s,Math.sin(a)*r))}return t};e.loft([c(t),c(n)])}function Be(e,t){let n=e.length,r=[];for(let i=0;i<n;i++){let a=e[i],o=e[(i+n-1)%n],s=e[(i+1)%n],c=a[0]-o[0],l=a[1]-o[1],u=Math.hypot(c,l)||1;c/=u,l/=u;let d=s[0]-a[0],f=s[1]-a[1],p=Math.hypot(d,f)||1;d/=p,f/=p;let m=t/Math.max(.3,1+(-l*-f+c*d));r.push([a[0]+(-l-f)*m,a[1]+(c+d)*m])}return r}var Ve=e=>e.reduce((t,n,r)=>t+n[0]*e[(r+1)%e.length][1]-e[(r+1)%e.length][0]*n[1],0);function B(e,t,n,r,i,a=.02,o=.03){let s=Ve(t)<0?[...t].reverse():t,c=Math.min(a,i*.5),l=c>0?Be(s,c):s,u=s.map(([e,t])=>n(e,t).addScaledVector(r,-o)),d=s.map(([e,t])=>n(e,t).addScaledVector(r,i-c)),f=l.map(([e,t])=>n(e,t).addScaledVector(r,i)),p=N(d),m=N(f),h=s.length;for(let t=0;t<h;t++){let n=(t+1)%h,i=d[t].clone().add(d[n]).multiplyScalar(.5).sub(p);e.quadN(u[t],u[n],d[n],d[t],i),c>0&&e.quadN(d[t],d[n],f[n],f[t],i.normalize().add(r)),e.triN(m,f[t],f[n],r)}return f}var V=(e,t,n)=>(r,i)=>e.clone().addScaledVector(t,r).addScaledVector(n,i);function H(e,t,n,r,i=.006){let a=n.clone().normalize(),o=t.map(e=>e.clone().addScaledVector(a,i));e.use(k,r),e.quadN(o[0],o[1],o[2],o[3],a)}var He=1024,Ue=512,U={number:[0,0,256,160],code:[256,0,384,88],emblem:[656,0,176,176],warn:[848,0,128,112],hazard:[0,176,512,48],nostep:[512,176,256,56],maint:[0,240,448,44],serial:[0,296,640,40],vent:[512,240,256,44],arrows:[768,176,224,56]};function W(e,t,n,r,i){let[a,o,s,c]=U[i.cell],l=N(t),u=t[1].clone().sub(t[0]),f=t[3].clone().sub(t[0]),p=i.right??(Math.abs(n.y)<.7?new d().crossVectors(j,n).normalize():A(0,0,1)),m=Math.abs(u.dot(p))/u.length()>=Math.abs(f.dot(p))/f.length(),h=(m?u:f).clone(),g=h.length();h.normalize(),h.dot(p)<0&&h.negate();let _=(m?f:u).length(),v=new d().crossVectors(n,h).normalize(),y=i.fill??.8,b=s/c*(i.stretch??1),x=g*y/2,S=x/b;S*2>_*y&&(S=_*y/2,x=S*b);let C=l.clone().addScaledVector(v,(i.offset??0)*_).addScaledVector(n,.004),w=(e,t)=>C.clone().addScaledVector(h,e*x).addScaledVector(v,t*S),ee=a/He,te=(a+s)/He,ne=1-(o+c)/Ue,re=1-o/Ue;e.use(r,i.paint),e.quadUv(w(-1,-1),w(1,-1),w(1,1),w(-1,1),n,[[ee,ne],[te,ne],[te,re],[ee,re]])}async function We(){await ie();let t=document.createElement(`canvas`);t.width=He,t.height=Ue;let r=t.getContext(`2d`);r.fillStyle=`#fff`,r.strokeStyle=`#fff`,r.textAlign=`center`,r.textBaseline=`middle`;let i=(e,t,n,i=0)=>{let[a,o,s,c]=U[e];r.font=n,r.letterSpacing=`${i}px`,r.fillText(t,a+s/2+i/2,o+c/2+2,s-8)};i(`number`,`07`,`700 168px Rajdhani, "Segoe UI", sans-serif`,4),i(`code`,`AR-07`,`700 80px Rajdhani, "Segoe UI", sans-serif`,10),i(`serial`,`ARK LTD  ·  HULL 2291-07  ·  KESSIC SURVEY`,`600 30px Rajdhani, "Segoe UI", sans-serif`,4),i(`maint`,`MAINT ACCESS 14`,`700 36px Rajdhani, "Segoe UI", sans-serif`,6),i(`vent`,`COOLANT VENT`,`700 34px Rajdhani, "Segoe UI", sans-serif`,5);{let[e,t,n,a]=U.nostep;r.lineWidth=4,r.strokeRect(e+4,t+4,n-8,a-8),i(`nostep`,`NO STEP`,`700 34px Rajdhani, "Segoe UI", sans-serif`,6)}{let[e,t,n]=U.emblem,i=e+n/2,a=t+n/2,o=n/176;r.beginPath(),r.moveTo(i,a-34*o),r.lineTo(i+20*o,a-6*o),r.lineTo(i,a+22*o),r.lineTo(i-20*o,a-6*o),r.closePath(),r.fill();for(let e of[-1,1])r.beginPath(),r.moveTo(i+e*26*o,a-10*o),r.lineTo(i+e*84*o,a-40*o),r.lineTo(i+e*70*o,a-18*o),r.lineTo(i+e*30*o,a+6*o),r.closePath(),r.fill(),r.beginPath(),r.moveTo(i+e*30*o,a+12*o),r.lineTo(i+e*66*o,a-6*o),r.lineTo(i+e*56*o,a+10*o),r.lineTo(i+e*30*o,a+24*o),r.closePath(),r.fill();r.lineWidth=9*o,r.beginPath(),r.moveTo(i-40*o,a+44*o),r.lineTo(i,a+66*o),r.lineTo(i+40*o,a+44*o),r.stroke()}{let[e,t,n,i]=U.warn;r.lineWidth=8,r.beginPath(),r.moveTo(e+n/2,t+8),r.lineTo(e+n-8,t+i-8),r.lineTo(e+8,t+i-8),r.closePath(),r.stroke(),r.fillRect(e+n/2-5,t+40,10,34),r.fillRect(e+n/2-5,t+82,10,10)}{let[e,t,n,i]=U.hazard;r.save(),r.beginPath(),r.rect(e,t,n,i),r.clip(),r.fillStyle=`#1b1c1e`,r.fillRect(e,t,n,i),r.fillStyle=`#b09662`;for(let a=e-i;a<e+n+i;a+=48)r.beginPath(),r.moveTo(a,t+i),r.lineTo(a+24,t+i),r.lineTo(a+24+i,t),r.lineTo(a+i,t),r.closePath(),r.fill();r.restore()}{let[e,t,,n]=U.arrows;r.lineWidth=7;for(let i=0;i<4;i++){let a=e+24+i*50;r.beginPath(),r.moveTo(a,t+10),r.lineTo(a+22,t+n/2),r.lineTo(a,t+n-10),r.stroke()}}let a=new n(t);return a.colorSpace=v,a.anisotropy=8,a.minFilter=e,a.name=`title-ship-markings`,a}var Ge=.026;function Ke(e,t){return e.map((n,r)=>{let i=e[(r+1)%4],a=e[(r+3)%4];return n.clone().addScaledVector(i.clone().sub(n).normalize(),t[(r+3)%4]).addScaledVector(a.clone().sub(n).normalize(),t[r])})}function qe(e,t,n,r){let i=Math.min(.016,r*.4),a=t.map(e=>e.clone().addScaledVector(n,-.012)),o=t.map(e=>e.clone().addScaledVector(n,r-i)),s=Ke(t,[i,i,i,i]).map(e=>e.addScaledVector(n,r)),c=N(o);for(let t=0;t<4;t++){let r=(t+1)%4,i=o[t].clone().add(o[r]).multiplyScalar(.5).sub(c);e.quadN(a[t],a[r],o[r],o[t],i),e.quadN(o[t],o[r],s[r],s[t],i.normalize().add(n))}return e.quadN(s[0],s[1],s[2],s[3],n),s}function Je(e,t,n,r){let{hull:i,rand:a}=e,o=t[1].clone().sub(t[0]),s=o.length();o.divideScalar(s);let c=t[3].clone().sub(t[0]),l=c.length();c.divideScalar(l);let u=V(t[0],o,c),d=2+Math.floor(a()*3);for(let e=0;e<d;e++){let e=a()*.55*s,t=Math.min(s*.96,e+(.25+a()*.5)*s),o=a()*.6*l,c=Math.min(l*.95,o+(.2+a()*.4)*l),d=r*(.35+a()*.55);if(a()<.35){let r=Math.min(.028,(c-o)*.4),s=(o+c)/2;i.use(O,.7+a()*.4),z(i,u(e,s).addScaledVector(n,r),u(t,s).addScaledVector(n,r),r,6)}else i.use(a()<.5?O:Ee,.6+a()*.5),B(i,[[e,o],[t,o],[t,c],[e,c]],u,n,d,d*.3,.01)}if(a()<.2){let e=(.2+a()*.6)*s,t=(.2+a()*.6)*l;i.use(k,.5),B(i,[[e,t],[e+.035,t],[e+.035,t+.035],[e,t+.035]],u,n,r*.5,0,.01)}}function Ye(e,t,n,r){let i=e.hull,a=t[1].clone().sub(t[0]),o=t[3].clone().sub(t[0]),s=a.length()>=o.length(),c=s?a:o,l=s?o:a,u=c.length(),d=l.length(),f=c.clone().normalize(),p=l.clone().normalize(),m=V(t[0],f,p),h=Math.min(14,Math.floor(u/.05)),g=u/h;i.use(O,.55);for(let e=0;e<h;e++){let t=(e+.3)*g;B(i,[[t,d*.06],[t+g*.45,d*.06],[t+g*.45,d*.94],[t,d*.94]],m,n,r*.7,0,.01)}}function Xe(e,t,n,r){if(r.style===`skip`)return;let i=e.hull,a=[0,1,2,3].map(()=>e.rand()<.18?Ge*2.6:Ge);r.lamp!==void 0&&(a[r.lamp]=Ge*2.2);let o=Ke(t,a);if(r.lamp!==void 0){let e=r.lamp,a=(e+1)%4;H(i,[t[e].clone().lerp(t[a],.06).lerp(o[e].clone().lerp(o[a],.06),.25),t[e].clone().lerp(t[a],.94).lerp(o[e].clone().lerp(o[a],.94),.25),t[e].clone().lerp(t[a],.94).lerp(o[e].clone().lerp(o[a],.94),.75),t[e].clone().lerp(t[a],.06).lerp(o[e].clone().lerp(o[a],.06),.75)],n,r.lampTint??.6,.004)}if(r.style===`bay`){Je(e,o,n,r.h);return}if(r.style===`vent`){Ye(e,o,n,r.h);return}i.use(r.kind,r.tint);let s=qe(i,o,n,r.h);if(r.style===`double`){let t=s[1].distanceTo(s[0]),a=s[3].distanceTo(s[0]),o=t*(.12+e.rand()*.1),c=a*(.14+e.rand()*.1),l=Ke(s,[c,o,c,o]);i.use(r.kind,r.tint*(r.kind===E?.94:1.12)),s=qe(i,l,n,r.h*.6)}r.decal&&W(e.decals,s,n,r.kind,r.decal)}function G(e,t,n){let{hull:r,rand:i}=e;r.use(n.base??D,1),r.loft(t,n.caps??[!1,!1]);let a=t[0].length,o=t.length-1,s=t.map(N);for(let r=0;r<o;r++){let c=t[r],l=t[r+1],u=s[r].clone().add(s[r+1]).multiplyScalar(.5);for(let t=0;t<a;t++){let s=(t+1)%a,f=(c[t].distanceTo(l[t])+c[s].distanceTo(l[s]))/2,p=(c[t].distanceTo(c[s])+l[t].distanceTo(l[s]))/2;if(f<.05||p<.05)continue;let m=Math.max(1,Math.round(f/n.along)),h=Math.max(1,Math.ceil(p/n.across-.2)),g=e=>{let t=[0];for(let n=1;n<e;n++)t.push((n+(i()-.5)*.45)/e);return t.push(1),t},_=g(m),v=g(h),y=(e,n)=>c[t].clone().lerp(c[s],n).lerp(l[t].clone().lerp(l[s],n),e);for(let i=0;i<m;i++)for(let a=0;a<h;a++){let s=[y(_[i],v[a]),y(_[i+1],v[a]),y(_[i+1],v[a+1]),y(_[i],v[a+1])],c=N(s),l=new d().crossVectors(s[2].clone().sub(s[0]),s[3].clone().sub(s[1])).normalize();l.dot(c.clone().sub(u))<0&&l.negate(),Xe(e,s,l,n.paint({c,n:l,t:(r+(_[i]+_[i+1])/2)/o,u:(v[a]+v[a+1])/2,span:r,edge:t,len:f*(_[i+1]-_[i]),wid:p*(v[a+1]-v[a])}))}}}}function K(e,t,n={}){let r=e(),i=n.lamps??.07,a=t.len>.28&&e()<i?e()<.5?0:2:void 0,o=t.n.y;if(o>.45){let t=e()<(n.light??.78);return{style:r<.15?`double`:r<.15+(n.bays??.05)?`bay`:`plate`,kind:t?E:T,tint:t?e()<.12?.62:.8+e()*.22:.9+e()*.3,h:.045+e()*.02,lamp:a}}if(o>-.45){let t=e()<(n.light??.2);return{style:r<.16?`double`:r<.16+(n.bays??.09)?`bay`:r<.3?`vent`:`plate`,kind:t?E:T,tint:t?.72+e()*.16:.85+e()*.35,h:.04+e()*.025,lamp:a}}return{style:r<.1?`double`:r<.1+(n.bays??.14)?`bay`:r<.32?`vent`:`plate`,kind:T,tint:.8+e()*.35,h:.04+e()*.02,lamp:a!==void 0&&e()<.2?a:void 0}}var Ze=(e,t,n,r,i)=>e.x>t&&e.x<n&&Math.abs(e.z)>r&&Math.abs(e.z)<i;function Qe(e,t,n,r,i,a){let o=i*1.7;e.use(Ee,.95),e.loft([R(a,n,r,i*1.28),R(t+.06,n,r,i*1.28),R(t,n,r,i*1.2)],[!1,!1]);let s=R(t,n,r,i*1.2),c=R(t,n,r,i*1.04);e.use(O,.85);for(let t=0;t<8;t++)e.quadN(s[t],s[(t+1)%8],c[(t+1)%8],c[t],M);let l=[[0,1.04,.05],[.3,.98,.22],[.62,.9,.5],[1,.84,.95]];e.use(De);for(let a=0;a<l.length-1;a++){let[s,c,u]=l[a],[d,f,p]=l[a+1],m=R(t+o*s,n,r,i*c),h=R(t+o*d,n,r,i*f),g=A(t+o*(s+d)*.5,n,r);for(let t=0;t<8;t++){let n=(t+1)%8;e.tri(m[t],m[n],h[n],g,!0,u),e.tri(m[t],h[n],h[t],g,!0,(u+p)/2)}}e.use(O,.45);for(let[a,s]of[[.3,.98],[.62,.9]]){let c=t+o*a,l=R(c,n,r,i*s),u=R(c,n,r,i*(s-.13));for(let t=0;t<8;t++)e.quadN(l[t],l[(t+1)%8],u[(t+1)%8],u[t],M)}let u=t+o,d=R(u,n,r,i*.84),f=R(u,n,r,i*.42);e.use(De);for(let t=0;t<8;t++)e.quadN(d[t],d[(t+1)%8],f[(t+1)%8],f[t],M,1);e.use(Oe);let p=A(u,n,r);for(let t=0;t<8;t++)e.triN(p,f[t],f[(t+1)%8],M);return{at:A(t,n,r),r:i}}function $e(e,t,n,r=.07){let i=n.clone().normalize(),a=Math.abs(i.y)<.9?new d().crossVectors(i,j).normalize():A(1,0,0),o=new d().crossVectors(i,a);e.use(Ee,.9);let s=N(B(e,[[-r,-r*.6],[r,-r*.6],[r,r*.6],[-r,r*.6]],V(t,a,o),i,r*.6,r*.15,.04));for(let t of[-1,1]){let n=s.clone().addScaledVector(a,t*r*.45),c=(e,t)=>n.clone().addScaledVector(a,e*r*.26).addScaledVector(o,t*r*.3);H(e,[c(-1,-1),c(1,-1),c(1,1),c(-1,1)],i,.25,.003)}}function et(e,t,n){e.use(O,.7),B(e,(e=>R(0,0,0,e).map(e=>[e.y,e.z]))(n),V(t,A(1,0,0),A(0,0,1)),j,n*.3,n*.1,.03),e.use(T,1.25);let r=t.y+n*.25;ze(e,[[t.x-n*.9,r,r+n*.75,n*.7,t.z],[t.x+n*.45,r,r+n*.75,n*.7,t.z],[t.x+n*.95,r,r+n*.4,n*.5,t.z]],n*.12),e.use(O,1);for(let i of[-.28,.28]){let a=r+n*.42;z(e,A(t.x+n*.8,a,t.z+i*n),A(t.x+n*3.2,a,t.z+i*n),n*.09,6)}e.use(k,.5),L(e,t.x+n*.46,t.x+n*.62,r+n*.52,r+n*.62,n*.5,n*.4,t.z,.004)}var tt=[[-5.45,.84,-.88,.98,.52,.56,.3,.26],[-5.05,.88,-.92,1,.52,.58,.31,.26],[-3.2,1,-1,1.06,.54,.62,.34,.28],[-.6,1.04,-1.02,1.08,.54,.62,.34,.28],[1.6,1.06,-1.02,1.08,.52,.62,.36,.28],[2.7,1.08,-1.04,1.08,.46,.62,.4,.3],[3.8,1.04,-1.04,1.06,.34,.6,.46,.32],[4.9,.88,-1,1,.26,.54,.46,.34],[5.6,.68,-.92,.9,.2,.46,.4,.34],[6.1,.46,-.8,.78,.16,.38,.3,.3]],q=e=>P(tt,e),nt=e=>q(e)[0];function rt(e){let[t,n,r,i,a,o,s]=q(e);return F(e,[[t,i],[t,-i],[t-o,-r],[n+s,-r],[n,-a],[n,a],[n+s,r],[t-o,r]])}var it=[[-3.9,.8,1.5,.76,.48],[-3.5,.8,1.86,.82,.54],[-.3,.8,1.96,.86,.58],[.8,.8,1.88,.82,.52],[1.5,.8,1.36,.68,.4]],J=e=>P(it,e);function at(e){let[t,n,r,i]=J(e);return F(e,[[n,i],[n,-i],[n-.2,-r],[t,-r],[t,r],[n-.2,r]])}var ot=[[-5.35,.6,2.86,.92,-.92],[-4.95,.6,2.94,.98,-.98],[-4.4,.6,3,1,-1.02],[-2.4,.6,3.06,1.02,-1.04],[-.4,.6,3.04,1.02,-1.04],[1.2,.6,2.86,.98,-1],[2.1,.6,2.3,.88,-.9],[2.75,.6,1.24,.66,-.66]],st=e=>P(ot,e);function ct(e,t,n){let[r,i,a,o]=st(e),s=n??r,c=Math.min(.44,(i-r)*.3),l=Math.min(.38,(i-r)*.26),u=1-Math.SQRT1_2;return F(e,[[a,t*s],[a,t*(i-c)],[a-c*u,t*(i-c*u)],[a-c,t*i],[o+l,t*i],[o+l*u,t*(i-l*u)],[o,t*(i-l)],[o,t*s]])}function lt(e,t,n,r,i,a){let o=[A(0,1,0),A(0,.924,.383*t),A(0,.707,.707*t),A(0,.383,.924*t),A(0,0,t)],s=[0,.15,.4,.62,1],c=(e,n)=>{let r=ct(e,t);return n===0?r[0].clone().lerp(r[1],.9):n===4?r[3].clone().lerp(r[4],.5):r[n].clone()},l=(e,t,i)=>c(n+(r-n)*e-a*s[t],t).addScaledVector(o[t],i),u=Math.max(1,Math.ceil((r-n)/.5)),d=.035/(r-n),f=Array.from({length:u+1},(e,t)=>t/u),p=f.map((e,t)=>t===0?d:t===u?1-d:e);for(let n=0;n<u;n++){for(let t=0;t<4;t++)e.quadN(l(p[n],t,i),l(p[n+1],t,i),l(p[n+1],t+1,i),l(p[n],t+1,i),o[t].clone().add(o[t+1]));e.quadN(l(f[n],0,-.01),l(f[n+1],0,-.01),l(p[n+1],0,i),l(p[n],0,i),A(0,.3,-t)),e.quadN(l(f[n],4,-.01),l(f[n+1],4,-.01),l(p[n+1],4,i),l(p[n],4,i),A(0,-1,.3*t))}for(let[t,n,r]of[[1,1-d,A(1,0,0)],[0,d,A(-1,0,0)]])for(let a=0;a<4;a++)e.quadN(l(t,a,-.01),l(t,a+1,-.01),l(n,a+1,i),l(n,a,i),r);let m=(e,t)=>l(e,3,i+.004).lerp(l(e,4,i+.004),t);H(e,[m(.06,.86),m(.94,.86),m(.94,.95),m(.06,.95)],o[3].clone().add(o[4]),.8,0)}var ut=[[-4.3,.95,2.5,1.2],[-1.1,.95,2.64,1.24],[.6,.95,2.4,1.18],[1.5,.95,1.7,1.06]],dt=e=>P(ut,e);function ft(e,t){let[n,r,i]=dt(e);return F(e,[[i,t*(n+.1)],[i,t*(r-.14)],[i-.12,t*r],[.92,t*(r+.04)],[.92,t*n],[i-.1,t*n]])}var pt=[[2.85,-1,-4.65,-.02,.62],[3.85,-2.2,-5.1,.02,.54],[4.6,-3.2,-5.55,.06,.46]];function mt(e,t,n=1){let[r,i,a,o]=P(pt,e),s=o*n,c=r-i;return[A(r,a+s*.15,t*e),A(r-.08*c,a+s/2,t*e),A(i+.05*c,a+s/2,t*e),A(i,a+s*.2,t*e),A(i+.04*c,a-s/2,t*e),A(r-.1*c,a-s/2,t*e)]}var ht=[[-5.2,-.78,-1.2,.4],[-3.8,-.84,-1.32,.54],[1.4,-.86,-1.36,.56],[3.4,-.86,-1.3,.52],[4.8,-.82,-1.22,.46],[5.75,-.68,-1.06,.38]];function gt(e){let[t,n,r]=P(ht,e);return F(e,[[t,r],[t,-r],[n+.08,-r],[n,-r+.1],[n,r-.1],[n+.08,r]])}var Y={style:`skip`,kind:0,tint:0,h:0};function _t(e,t){let n=new _().setFromPoints(e),r=n.getCenter(new d),i=n.getSize(new d).multiplyScalar(.5),a=(i.y-t)/i.y,o=(i.z-t)/i.z;return e.map(e=>A(e.x,r.y+(e.y-r.y)*a,r.z+(e.z-r.z)*o))}function vt(e,t,n,r,i){let a=e.hull;G(e,[t,n],{along:.5,across:.6,paint:i});let o=_t(t,r).map(e=>e.setX(e.x+.02)),s=_t(n,r);a.use(D,.22),a.loft([o,s],[!1,!1],!0),a.use(O,.8);let c=n.length;for(let e=0;e<c;e++)a.quadN(n[e],n[(e+1)%c],s[(e+1)%c],s[e],M);return[n,s]}function yt(e,t,n,r,i,a,o=.85){let{hull:s,rand:c}=e,l=(e,t)=>A(e,a(e),t);for(let e of[1,-1]){let u=t;for(;u<n-.2;){let t=Math.min(n,u+.45+c()*.4),d=c()<o;s.use(d?E:T,d?c()<.12?.64:.8+c()*.2:1.1);let f=Math.min(i(u),i(t))-.03,p=(u+t)/2,m=A(-(a(p+.05)-a(p-.05))/.1,1,0).normalize(),h=B(s,[[u,e*r],[t,e*r],[t,e*f],[u,e*f]],l,m,.05,.016);c()<.25&&(s.use(d?E:T,d?.84:1.2),qe(s,Ke(h,[.05,.08,.05,.08]),m,.03)),u=t+.045}}}function bt(e,t,n,r,i,a){let o=n.clone().sub(t),s=o.length();o.divideScalar(s);let c=new d().crossVectors(r,o).normalize();B(e,[[-i*.3,-i/2],[s+i*.3,-i/2],[s+i*.3,i/2],[-i*.3,i/2]],V(t,o,c),r,a,Math.min(.012,a*.3),.01)}function xt(e,t,n,r,i,a,o){let s=e=>R(0,0,0,a*e).map(e=>[e.y,e.z]);for(let a of t){let t=V(a,n,r);e.use(O,.95),B(e,s(1),t,i,.022,.008,.01),e.use(D,1),B(e,s(.78),t,i,.025,0,.004),e.use(De,o),B(e,s(.45),t,i,.027,0,.002)}}async function St(e,t){let n=new Re(e),r=new Re(e,!0),i={hull:n,decals:r,rand:e},a=[],o=[1,-1];G(i,[-4.9,-3.2,-.6,1.6,2.7].map(rt),{along:.8,across:.6,caps:[!0,!1],paint:t=>{let n=t.edge;return t.c.x<1.6||n===0||n===2||n===4||n===6?Y:n===3||n===5?{...K(e,t),style:`plate`}:K(e,t,{lamps:.08,light:.8})}});let[c,l]=vt(i,rt(-4.9),rt(-5.45),.08,t=>t.edge===0||t.edge===2||t.edge===6?Y:K(e,t,{lamps:.1,light:.8}));W(r,[c[0],c[1],l[1],l[0]],M,O,{cell:`hazard`,paint:1,right:A(0,0,1),fill:.86,stretch:1.3}),G(i,[2.7,3.8,4.9,5.6,6.1].map(rt),{along:.75,across:.5,caps:[!1,!0],paint:t=>{let n=t.edge;return n===0||n===1||n===7||n===2||n===6?Y:{...K(e,t,{bays:.06}),style:e()<.2?`vent`:`plate`}}}),await t(),n.use(O,.8),n.loft([2.6,3.2,3.8,4.35,4.9,5.25,5.6,6.02].map(e=>F(e,I(nt(e)+.05,0,.09,Math.min(.07,q(e)[3]*.45),.016))));for(let e of o){let t=t=>A(t,q(t)[0],e*q(t)[3]),i=t=>A(t,q(t)[0]-q(t)[5],e*q(t)[2]),a=(e,n)=>t(e).lerp(i(e),n),o=e=>{let n=i(e).sub(t(e)),r=new d().crossVectors(n,A(1,0,0)).normalize();return r.y<0?r.negate():r},s=.34;[[2.76,3.68,.11,1],[3.74,4.56,.095,.92],[4.62,5.36,.08,.98],[5.42,6.12,.065,.9]].forEach(([e,t,r,i],c)=>{n.use(c===2?T:E,c===2?1.25:i);let l=B(n,[[e,.05],[t,.05],[t-s,1.07],[e-s,1.07]],a,o((e+t)/2-s/2),r,.03,.05);(c===0||c===1)&&(n.use(E,.82),qe(n,Ke(l,[.08,.12,.12,.12]),o((e+t)/2),.04)),H(n,[a(e+.03,.012),a(t-.03,.012),a(t-.03,.036),a(e+.03,.036)],o((e+t)/2),.9,.012)});for(let e of[3.71,5.39]){let t=o(e-s/2);H(n,[a(e-.014,.12),a(e+.014,.12),a(e+.014-s*.76,.88),a(e-.014-s*.76,.88)],t,.75,.012)}let c=e=>q(e)[2],l=e=>q(e)[1]+q(e)[6]+.035,u=e=>q(e)[0]-q(e)[5]-.035,f=(t,n)=>A(t,n,e*c(t)),p=t=>A(-(c(t+.05)-c(t-.05))/.1,0,e).normalize();[[2.78,3.6],[3.7,4.45],[4.55,5.2],[5.3,6.02]].forEach(([t,i],a)=>{let o=p((t+i)/2),s=a===1||a===3;n.use(s?T:E,s?1.25:.88+a*.03);let c=a===1?[[t,l(t)],[i,l(i)],[i,u(i)],[t,u(t)]]:[[t,l(t)],[i,l(i)],[i,u(i)-.16],[i-.16,u(i)],[t,u(t)]],d=B(n,c,f,o,a===1?.075:.09,.024);a===1&&(W(r,d,o,T,{cell:`number`,paint:.8,right:A(e,0,0),fill:.62,offset:.08}),W(r,d,o,T,{cell:`code`,paint:.7,right:A(e,0,0),fill:.5,offset:-.3}))});for(let e of[3.65,4.5,5.25]){let t=p(e);H(n,[f(e-.016,l(e)+.07),f(e+.016,l(e)+.07),f(e+.016,u(e)-.07),f(e-.016,u(e)-.07)],t,.8,.01)}let m=(e,t)=>A(6.1+(.75-Math.abs(e))*.12,t,e);n.use(T,1.3);let h=B(n,[[e*.16,-.54],[e*.72,-.54],[e*.72,.1],[e*.16,.2]],m,A(1,0,e*.12).normalize(),.06,.02,.1);n.use(T,1.1),qe(n,Ke(h,[.07,.07,.07,.07]),A(1,0,e*.12).normalize(),.03),H(n,[A(6.1,-.5,e*.1),A(6.1,-.5,e*.135),A(6.1,.3,e*.135),A(6.1,.3,e*.1)],A(1,0,0),.95,.012),H(n,[A(6.06,-.87,e*.16),A(6.06,-.87,e*.36),A(6.06,-.84,e*.36),A(6.06,-.84,e*.16)],A(1,0,0),.7,.006),$e(n,A(5.2,-1.12,e*.47),A(0,-.4,e),.05)}n.use(E,.95),B(n,[[-.08,-.66],[.08,-.66],[.08,.38],[0,.44],[-.08,.38]],(e,t)=>A(6.1,t,e),A(1,0,0),.2,.03,.05),n.use(T,1.15),L(n,5.5,6.06,-.98,-.72,.5,.44,0,.04),await t(),G(i,[-3.9,-3.5,-.3,.8,1.5].map(at),{along:.75,across:.5,caps:[!0,!0],paint:t=>{let n=t.edge;if(n===0||n===3)return Y;if(n===1||n===5)return{style:e()<.2?`double`:`plate`,kind:E,tint:.86+e()*.12,h:.045,lamp:e()<.12?0:void 0};if(t.c.x>-3.45&&t.c.x<.62)return Y;let r=K(e,t,{light:.3,bays:.12});return r.style===`plate`&&e()<.2&&(r.lamp=e()<.5?1:3,r.lampTint=.7),r}});for(let e of o){let t=e=>J(e)[2],i=(n,r)=>A(n,r,e*t(n)),a=n=>A(-(t(n+.05)-t(n-.05))/.1,0,e).normalize(),o=e=>J(e)[1]-.23;[[-3.4,-2.2],[-2.1,-.62],[-.52,.58]].forEach(([t,s],c)=>{let l=a((t+s)/2);n.use(E,c===1?.88:.8);let u=B(n,[[t,1.04],[s,1.04],[s,o(s)],[t,o(t)]],i,l,.06,.02);c===1&&W(r,u,l,E,{cell:`number`,paint:.85,right:A(e,0,0),fill:.6,offset:.12}),c===0&&W(r,u,l,E,{cell:`emblem`,paint:.8,right:A(e,0,0),fill:.5,offset:.12})});for(let e of[-2.15,-.57]){let t=a(e);H(n,[i(e-.016,1.12),i(e+.016,1.12),i(e+.016,o(e)-.06),i(e-.016,o(e)-.06)],t,.8,.008)}}await t(),yt(i,-3.86,-.5,.1,e=>J(e)[3],e=>J(e)[1]);for(let e=-3.4;e<-.7;e+=.55){let t=J(e)[1],r=J(e+.32)[1];H(n,[A(e,t,-.02),A(e+.32,r,-.02),A(e+.32,r,.02),A(e,t,.02)],j,.65,.004)}n.use(T,1.25);let u=ze(n,[[-.45,1.88,2.14,.46],[.85,1.82,2.18,.44],[1.45,1.38,1.86,.28]],.04);{let e=u[1],t=u[2],r=(e,t,r,i,a,o,s,c)=>{let l=(r+1)%e.length,u=(n,i)=>e[r].clone().lerp(e[l],i).lerp(t[r].clone().lerp(t[l],i),n),f=[u(i,o),u(a,o),u(a,s),u(i,s)],p=new d().crossVectors(f[2].clone().sub(f[0]),f[3].clone().sub(f[1])).normalize();p.dot(N(f).sub(N(e).add(N(t)).multiplyScalar(.5)))<0&&p.negate(),H(n,f,p,c,.004)};r(e,t,0,.42,.68,.06,.94,.3),r(e,t,2,.05,.75,.55,.72,.26),r(e,t,6,.05,.75,.28,.45,.26),r(u[0],e,2,.5,.95,.55,.72,.26),r(u[0],e,6,.5,.95,.28,.45,.26)}n.use(E,.95),L(n,-.4,.66,2.12,2.23,.32,.27,0,.03),n.use(O,.9),L(n,-.15,.4,2.21,2.33,.15,.13,0,.03),n.use(O,1.1),z(n,A(.15,2.31,0),A(.15,2.72,0),.02,6),z(n,A(-.05,2.31,.09),A(-.05,2.54,.09),.012,5),z(n,A(-.05,2.31,-.09),A(-.05,2.48,-.09),.012,5),n.use(k,1.6),L(n,.12,.18,2.72,2.76,.03,.03,0,.008),n.use(O,.85),B(n,R(0,0,0,.1).map(e=>[e.y,e.z]),V(A(.5,2.27,-.2),A(.3,.95,0).normalize(),A(0,0,1)),A(.95,-.3,0).normalize(),.03,.01,.02);for(let e of o){let t=(t,n)=>A(t,n,e*.5);n.use(E,.9),B(n,[[-.05,1.86],[-.84,1.86],[-1.04,2.6],[-.58,2.66]],t,A(0,0,1),.05,.02,.05),n.use(T,1.3),B(n,[[-.28,2],[-.74,2],[-.88,2.44],[-.62,2.47]],t,A(0,0,1),.068,.01,.068);for(let t of[1,-1]){let r=(n,r)=>A(-.05+(-.58+.05)*n-r,1.86+.8*n,e*.5+t*.051);H(n,[r(.2,.05),r(.9,.05),r(.9,.085),r(.2,.085)],A(0,0,t),.75,.002)}n.use(k,1.05),L(n,-.76,-.62,2.62,2.68,.035,.035,e*.5,.008)}yt(i,1.54,2.7,.05,e=>q(e)[3],nt);{let e=2.05,t=nt(e)+.05;n.use(O,.75),B(n,R(0,0,0,.24).map(e=>[e.y,e.z]),V(A(e,t,0),A(1,0,0),A(0,0,1)),j,.06,.02,.02),n.use(T,1.2),ze(n,[[1.8299999999999998,t+.05,t+.2,.18],[2.19,t+.05,t+.2,.18],[2.3499999999999996,t+.05,t+.12,.12]],.03),n.use(O,1);for(let e of[-.07,.07])z(n,A(2.25,t+.14,e),A(2.9099999999999997,t+.14,e),.024,6),z(n,A(2.83,t+.14,e),A(2.9299999999999997,t+.14,e),.032,6)}G(i,[[-5.52,.8,1.34,.56],[-5.38,.8,1.42,.6],[-4.2,.8,1.42,.6],[-3.92,.8,1.3,.52]].map(([e,t,n,r])=>F(e,I((t+n)/2,0,(n-t)/2,r,.08))),{along:.6,across:.45,caps:[!0,!0],paint:t=>{let n=t.edge;return n===4?Y:n===0?{style:e()<.25?`double`:`plate`,kind:E,tint:.9+e()*.2,h:.045,lamp:e()<.15?0:void 0}:K(e,t,{light:.25,lamps:.12})}});{let e=(e,t)=>A(-5.52,t,e);n.use(E,1.6),W(r,B(n,[[-.48,.86],[.48,.86],[.48,1.26],[-.48,1.26]],e,M,.05,.016,.03),M,E,{cell:`number`,paint:.12,right:A(0,0,1),fill:.62}),H(n,[e(-.44,1.29),e(.44,1.29),e(.44,1.315),e(-.44,1.315)],M,.9,.006)}{let e=[[-3.62,1.72],[-4.08,1.36],[-5.3,1.36],[-5.52,2.95],[-4.76,3.02]],t=(e,t)=>A(e,t,0);n.use(T,1.1),B(n,e,t,A(0,0,1),.085,.03,.085),n.use(E,1.1),B(n,[[-4.25,1.6],[-5.2,1.52],[-5.36,2.6],[-4.72,2.64]],t,A(0,0,1),.11,.02,.11);for(let e of o){let t=(t,n)=>A(-3.62+(-4.76+3.62)*t-n,1.72+1.3*t,e*.086);H(n,[t(.08,.06),t(.92,.06),t(.92,.1),t(.08,.1)],A(0,0,e),.9,.003)}n.use(k,1.6),L(n,-5.22,-5,2.96,3.02,.04,.04,0,.01)}await t();for(let a of o){let o=t=>{let n=t.edge,r=t.c;if(n===7||n===0&&r.x<1.5||n===3&&r.x>-2.85&&r.x<-.8||(n===1||n===2)&&r.x>-4.4&&r.x<.9||n===3&&r.y>-.05&&r.x>-4.7&&r.x<.6)return Y;let i=K(e,t,{lamps:.08,light:n<=2||n===3&&r.y>.25?.85:.06,bays:.08});return t.n.x>.35&&r.y<.3&&i.kind===E&&(i.kind=T,i.tint=1+e()*.25),n===3&&i.style===`plate`&&t.len>.35&&e()<.08&&(i.decal={cell:e()<.5?`maint`:`vent`,paint:.75,fill:.7}),n===3&&i.style===`plate`&&e()<.15&&(i.lamp=e()<.5?1:3,i.lampTint=.7),i};G(i,[-4.8,-4.4,-2.4,-.4,1.2,2.1,2.75].map(e=>ct(e,a)),{along:.8,across:.6,caps:[!0,!0],paint:o});let[s,c]=vt(i,ct(-4.8,a,.985),ct(-5.35,a,.985),.07,e=>e.edge===7?Y:e.edge===0?{style:`plate`,kind:E,tint:.88,h:.05}:o(e));W(r,[s[0],s[1],c[1],c[0]],M,O,{cell:`hazard`,paint:1,right:A(0,0,1),fill:.86,stretch:1.3}),await t();{let e=e=>st(e)[1],t=(t,n)=>A(t,n,a*e(t)),i=A(-(e(-1.75)-e(-1.85))/.1,0,a).normalize();n.use(E,.82);let o=B(n,[[-2.8,-.6],[-.85,-.6],[-.85,-.1],[-2.8,-.1]],t,i,.055,.018);W(r,o,i,E,{cell:`code`,paint:.85,right:A(a,0,0),fill:.5,offset:.1}),W(r,o,i,E,{cell:`serial`,paint:.7,right:A(a,0,0),fill:.86,offset:-.32})}{[[-4.3,-2.7,.92],[-2.6,-.95,.8],[-.85,.85,.9]].forEach(([e,t,r])=>{n.use(E,r),lt(n,a,e,t,.075,.35)});let e=(e,t)=>ct(-.9-.35*[0,.15,.4,.62,1][e]+t,a)[e].clone().addScaledVector([A(0,1,0),A(0,.924,.383*a),A(0,.707,.707*a),A(0,.383,.924*a)][e],.012);for(let t of[1,2])H(n,[e(t,-.016),e(t,.016),e(t+1,.016),e(t+1,-.016)],A(0,.6,.6*a),.85,0)}{let e=A(.8,.05,a*.6).normalize(),t=new d().crossVectors(j,e).normalize(),r=new d().crossVectors(e,t).normalize(),i=A(2.4,0,a*1.86);n.use(T,1.3),B(n,[[-.56,-.5],[.56,-.5],[.56,.4],[-.56,.4]],V(i,t,r),e,.14,.04,.26);let o=V(i.clone().addScaledVector(e,.14),t,r),s=[];for(let e of[-.36,-.12,.12,.36])for(let t of[.2,-.07])s.push(o(e,t));xt(n,s,t,r,e,.098,1),H(n,[o(-.46,-.4),o(.46,-.4),o(.46,-.35),o(-.46,-.35)],e,.9,.006)}G(i,[-4.3,-1.1,.6,1.5].map(e=>ft(e,a)),{along:.8,across:.55,caps:[!0,!0],paint:t=>{let n=t.edge,r=t.c;return n===3||n===0&&(Ze(r,-3.15,-1.8,1.15,2.1)||Ze(r,-1.35,-.4,1.1,2.15))?Y:n===0?{style:e()<.22?`double`:`plate`,kind:E,tint:.86+e()*.14,h:.05,lamp:e()<.1?0:void 0}:K(e,t,{light:n===4?.1:.5,lamps:.1})}});{let e=e=>dt(e)[2],t=(t,n)=>A(t,e(t),a*n),i=A(-(e(-2.3)-e(-2.5))/.2,1,0).normalize();n.use(E,.95),W(r,B(n,[[-3.1,1.2],[-1.85,1.2],[-1.85,2.05],[-3.1,2.05]],t,i,.05,.016),i,E,{cell:`emblem`,paint:.8,right:A(0,0,1),fill:.82}),n.use(O,.65),B(n,[[-1.3,1.15],[-.45,1.15],[-.45,2.1],[-1.3,2.1]],t,i,.04,.015);let o=[];for(let e of[-1.08,-.67])for(let n of[1.31,1.52,1.73,1.94])o.push(t(e,n).addScaledVector(i,.04));xt(n,o,A(1,0,0),A(0,0,a),i,.085,.85)}n.use(O,.8);for(let e=0;e<9;e++){let t=-4.78+e*.062;L(n,t,t+.026,.94,1.16,.72,.72,a*1.7,.006)}n.use(T,1.1);for(let e of[.98,2.42])L(n,-4.8,-4.24,.94,1.19,.035,.035,a*e,.012);G(i,[[-4.3,-1.08,.36],[-3.9,-1.2,.5],[-.5,-1.2,.5],[-.1,-1.08,.36]].map(([e,t,n])=>F(e,I((t-.98)/2,a*1.85,(-.98-t)/2,n,.05))),{along:.75,across:.45,caps:[!0,!0],paint:t=>t.edge===0?Y:K(e,t,{lamps:.05})});for(let[e,t]of[[-3.45,-2.55],[-1.75,-.85]]){let r=(e,t)=>A(e,-1.2,a*t),i=A(0,-1,0);n.use(D,1),B(n,[[e,1.55],[t,1.55],[t,2.15],[e,2.15]],r,i,.012,.004,.01),n.use(De,.5),n.quadN(r(e+.05,1.6).setY(-1.215),r(t-.05,1.6).setY(-1.215),r(t-.05,2.1).setY(-1.215),r(e+.05,2.1).setY(-1.215),i),n.use(O,.7);for(let r=e+.08;r<t-.05;r+=.11)L(n,r,r+.03,-1.25,-1.2,.25,.25,a*1.85,.004)}$e(n,A(.4,st(.4)[3]-.01,a*1.6),A(0,-1,0),.06),$e(n,A(-4.55,st(-4.55)[3]-.01,a*2.45),A(0,-1,0),.06),await t()}for(let t of o){let r=t>0?0:1;G(i,[2.85,3.85,4.6].map(e=>mt(e,t)),{along:.65,across:.6,caps:[!1,!1],paint:t=>{let n=t.edge;if(n===1){let n=e(),i={style:n<.28?`double`:n<.34?`bay`:`plate`,kind:e()<.82?E:T,tint:e()<.15?.64:.8+e()*.2,h:.05};return t.span===0&&t.u>.5&&t.u<.85&&!Ct[r]&&(Ct[r]=!0,i.style=`plate`,i.kind=E,i.decal={cell:`nostep`,paint:.75,right:A(0,0,1),fill:.5}),i}return n===2?{style:`plate`,kind:T,tint:1.05,h:.035,lamp:t.span===1||e()<.5?0:void 0,lampTint:.6}:K(e,t,{lamps:.04})}});let o=[1.25,1.45,1.45,1.25];G(i,[4.5,4.58,5.1,5.18].map((e,n)=>{let r=mt(4.6,t,o[n]).map(n=>n.setZ(t*e));return r[0].x+=.25,r[1].x+=.16,r[3].x-=.2,r}),{along:.6,across:.4,caps:[!0,!0],base:T,paint:t=>t.span===1?{...K(e,t,{lamps:0,bays:0}),style:`plate`}:Y});{let e=.26,r=A(0,Math.cos(e),t*Math.sin(e)),i=new d().crossVectors(A(1,0,0),r),a=V(A(0,.36,t*4.84),A(1,0,0),r);n.use(T,1.15),B(n,[[-4.15,0],[-5.45,0],[-5.74,.82],[-5.22,.86]],a,i,.035,.012,.035),n.use(E,.88),B(n,[[-4.6,.1],[-5.36,.1],[-5.52,.62],[-5.18,.64]],a,i,.05,.01,.05);for(let e of[1,-1]){let t=(t,n)=>a(-4.15+(-5.22+4.15)*t-n,.86*t).addScaledVector(i,e*.036);H(n,[t(.15,.04),t(.9,.04),t(.9,.07),t(.15,.07)],i.clone().multiplyScalar(e),.75,.002)}n.use(k,1),B(n,[[-5.48,.84],[-5.34,.85],[-5.34,.9],[-5.48,.89]],a,i,.02,0,.02)}H(n,[A(-5.3,-.04,t*5.185),A(-4,-.04,t*5.185),A(-4,-.01,t*5.185),A(-5.3,-.01,t*5.185)],A(0,0,t),.6,.004),$e(n,A(-2.96,0,t*4.84),A(1,0,0),.05);for(let e of[4.72,4.96])a.push(Qe(n,-5.8,.05,t*e,.05,-5.5))}await t(),G(i,[-5.2,-3.8,-1.2,1.4,3.4,4.8,5.75].map(gt),{along:.8,across:.55,caps:[!0,!0],paint:t=>{let n=t.edge;if(n===0||n===3&&t.c.x>-3.15&&t.c.x<.75)return Y;let r=K(e,t,{lamps:.03});return(n===1||n===5)&&r.style===`plate`&&t.len>.4&&e()<.12&&(r.decal={cell:e()<.5?`warn`:`arrows`,paint:.75,fill:.5}),r}}),G(i,[[-3.5,-1.42,.28],[-3.1,-1.52,.4],[.7,-1.52,.4],[1.1,-1.42,.28]].map(([e,t,n])=>F(e,I((t-1.3)/2,0,(-1.3-t)/2,n,.05))),{along:.75,across:.45,caps:[!0,!0],paint:t=>t.edge===0||t.edge===4&&t.c.x>-2.75&&t.c.x<-.35?Y:K(e,t,{lamps:.04})});{let e=(e,t)=>A(e,-1.52,t),t=A(0,-1,0);n.use(T,1.25);let i=B(n,[[-2.7,-.32],[-.4,-.32],[-.4,.32],[-2.7,.32]],e,t,.03,.012);for(let e of[-.26,.26])W(r,[A(-2.62,0,e-.03),A(-.48,0,e-.03),A(-.48,0,e+.03),A(-2.62,0,e+.03)].map(e=>e.setY(i[0].y)),t,T,{cell:`hazard`,paint:1,right:A(1,0,0),fill:1,stretch:2.2});for(let[e,t]of[[-2.6,-.22],[-2.6,.22],[-.5,-.22],[-.5,.22]])n.use(k,.6),L(n,e-.02,e+.02,i[0].y-.012,i[0].y+.003,.02,.02,t,.004);let a=e=>P(ht,e)[1];for(let e of o)for(let t=-4.6;t<4.4;t+=1.8){if(t>-3.4&&t<1)continue;let r=a(t)+.04,i=e*(P(ht,t)[2]+.002);H(n,[A(t,r-.012,i),A(t+.5,r-.012,i),A(t+.5,r+.012,i),A(t,r+.012,i)],A(0,0,e),.45,.002)}}await t();{let e=_t(rt(-5.45),.13).map(e=>[e.z,e.y]);n.use(T,.95),B(n,e,(e,t)=>A(-5.28,t,e),M,.05,.025,.25);let t=(e,t)=>A(-5.33,t,e);n.use(T,1.25);for(let e of[.5,-.48])B(n,[[-.62,e],[.62,e],[.62,e+.05],[-.62,e+.05]],t,M,.025,.008,.01);W(r,[t(-.4,-.32),t(.4,-.32),t(.4,.4),t(-.4,.4)],M,T,{cell:`emblem`,paint:.85,right:A(0,0,1),fill:.92}),W(r,[t(-.42,-.68),t(.42,-.68),t(.42,-.6),t(-.42,-.6)],M,T,{cell:`hazard`,paint:1,right:A(0,0,1),fill:1,stretch:1.6}),n.use(O,.9);for(let e of[-.56,.56])B(n,[[e-.06,-.64],[e+.06,-.64],[e+.06,-.52],[e-.06,-.52]],t,M,.07,.015,.01);for(let e of o)H(n,[A(-5.31,-.5,e*.862),A(-5.31,-.5,e*.888),A(-5.31,.42,e*.888),A(-5.31,.42,e*.862)],M,.95,0),n.use(k,1.2),B(n,[[e*.28,.6],[e*.34,.6],[e*.34,.64],[e*.28,.64]],t,M,.01,0,.005);H(n,[A(-5.31,.722,-.4),A(-5.31,.722,.4),A(-5.31,.746,.4),A(-5.31,.746,-.4)],M,.95,0)}for(let e of o){let t=_t(ct(-5.35,e,.985),.072).map(e=>[e.z,e.y]);n.use(T,.9),B(n,t,(e,t)=>A(-4.95,t,e),M,.03,.01,.1);let i=(e,t)=>A(-4.98,t,e),o=[[1.38,.24],[1.52,.1],[2.32,.1],[2.46,.24],[2.46,.52],[2.32,.66],[1.52,.66],[1.38,.52]];n.use(O,.9),o.forEach(([t,r],a)=>{let[s,c]=o[(a+1)%o.length];bt(n,i(e*t,r),i(e*s,c),M,.05,.22)}),n.use(D,1),B(n,o.map(([t,n])=>[e*t,n]),i,M,.004,0,.004);for(let t of[.25,.51])for(let r of[1.56,1.8,2.04,2.28])a.push(Qe(n,-5.17,t,e*r,.07,-4.96));n.use(T,1.3),W(r,B(n,[[e*1.36,-.62],[e*2.48,-.62],[e*2.48,-.04],[e*1.36,-.04]],i,M,.06,.016,.01),M,T,{cell:`emblem`,paint:.8,right:A(0,0,1),fill:.78});for(let t of[1.3,2.54])H(n,[i(e*(t-.013),-.55),i(e*(t+.013),-.55),i(e*(t+.013),-.12),i(e*(t-.013),-.12)],M,.9,.004)}for(let e of[-.15,.15])Qe(n,-5.34,-1,e,.07,-5.15);for(let e of o){let t=e=>dt(e)[2];for(let[r,i]of[[-3.62,1.62],[-.05,1.5]])et(n,A(r,t(r)+.05,e*i),.17);n.use(O,.85);let r=t=>e*(P(ht,t)[2]+.035);z(n,A(-3.7,-1.1,r(-3.7)),A(1.3,-1.1,r(1.3)),.03,6),z(n,A(-3.5,-1.2,r(-3.5)),A(.9,-1.2,r(.9)),.022,6);let i=t=>e*(J(t)[2]+.035);z(n,A(-3.3,1.05,i(-3.3)),A(.6,1.05,i(.6)),.026,6),n.use(Ee,1.1);for(let t=-3.4;t<1.2;t+=.62)L(n,t,t+.06,-1.24,-1.04,.035,.035,r(t)+e*.005,.01);for(let e=-3.1;e<.5;e+=.7)L(n,e,e+.06,1,1.09,.035,.035,i(e),.01);n.use(T,1.2),ze(n,[[-4.5,-.42,.36,.1,e*3.1],[-1.4,-.36,.3,.1,e*3.07],[-1.05,-.18,.12,.06,e*3.05]],.03),n.use(E,.85);for(let t of[-4.1,-3.15,-2.2])L(n,t,t+.55,-.3,.26,.05,.05,e*3.18,.012);n.use(O,1);for(let t of[.66,.94])z(n,A(-3,.08,e*(4.18+t)),A(-2.4,.08,e*(4.18+t)),.011,5)}{let e=P(ht,4.9)[1];n.use(O,.9),B(n,R(0,0,0,.15).map(e=>[e.y,e.z]),V(A(4.95,e,0),A(1,0,0),A(0,0,1)),A(0,-1,0),.05,.02,.02),n.use(D,1),B(n,R(0,0,0,.1).map(e=>[e.y,e.z]),V(A(4.95,e-.05,0),A(1,0,0),A(0,0,1)),A(0,-1,0),.04,.02,.01),n.use(k,.5),B(n,R(0,0,0,.035).map(e=>[e.y,e.z]),V(A(4.95,e-.09,0),A(1,0,0),A(0,0,1)),A(0,-1,0),.006,0,.004)}let f=e=>{let t=new y;return t.setAttribute(`position`,new s(e.pos,3)),t.setAttribute(`aMat`,new s(e.mat,3)),e.uv&&t.setAttribute(`aUv`,new s(e.uv,2)),t.computeBoundingSphere(),t};return{hull:f(n),decals:f(r),engines:a}}var Ct=[!1,!1],wt=`
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
`;async function Tt(t,n){let r=new a(512,512,{type:f,wrapS:l,wrapT:l,minFilter:e,magFilter:c,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return r.texture.name=`title-ship-panels`,await ue(t,r,wt,{uLoop:{value:5}},{strips:2,pace:n}),r}var Et=`
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
`,Dt=`
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
`,Ot=`
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
`,kt=`
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
`;function At(e){let t=[],n=[],r=[],i=0;for(let a of e){for(let e=0;e<=10;e++){let r=e/10;for(let e of[-1,1])t.push(a.at.x,a.at.y,a.at.z),n.push(r,e,a.r,0)}for(let e=0;e<10;e++){let t=i+e*2;r.push(t,t+1,t+3,t,t+3,t+2)}i+=22;for(let[e,r]of[[-1,-1],[1,-1],[1,1],[-1,1]])t.push(a.at.x,a.at.y,a.at.z),n.push(e,r,a.r,1);r.push(i,i+1,i+2,i,i+2,i+3),i+=4}let a=new y;return a.setAttribute(`position`,new s(Array(t.length).fill(0),3)),a.setAttribute(`aNozzle`,new s(t,3)),a.setAttribute(`aShape`,new s(n,4)),a.setIndex(r),a}async function jt(e,t){let n=()=>t.pace?.()??Promise.resolve(),[a,o]=await Promise.all([Tt(e,t.pace),We()]);e.initTexture(o),Ct[0]=Ct[1]=!1;let s=await St(re(373239),n),{engines:c}=s,l=new r(.1,.38,1),u={value:1},d={value:1},f={value:Ae},p={value:0},h={uPanel:{value:a.texture},uMarks:{value:o},uKeyDir:{value:t.keyDir},uKeyColor:{value:new r(1,.9,.78).multiplyScalar(2.8)},uFillDir:{value:t.fillDir},uFillColor:{value:new r(.36,.5,.7)},uSunDir:{value:t.sunDir},uSunColor:{value:new r(1,.86,.7).multiplyScalar(2.2)},uBounceDir:{value:t.bounceDir},uBounceColor:{value:new r(.24,.46,.5)},uPlanetCenter:{value:t.planetCenter},uPlanetRadius:{value:t.planetRadius},uPlanetLight:{value:t.planetLight},uEngineA:{value:A(-5.5,.38,-1.92)},uEngineB:{value:A(-5.5,.38,1.92)},uEngineC:{value:A(-5.6,-.95,0)},uEngineColor:{value:l},uLampColor:{value:new r(.3,.72,1)},uPower:u,uBump:{value:.013},uDetailScale:{value:.42},uFade:p},g=new i({vertexShader:Et,fragmentShader:Dt,uniforms:h}),_=new m(s.hull,g);_.name=`title-ship-hull`,_.frustumCulled=!1;let v=new i({vertexShader:Et,fragmentShader:Dt,uniforms:h,defines:{DECAL:1},transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),y=new m(s.decals,v);y.name=`title-ship-markings`,y.frustumCulled=!1,y.renderOrder=1;let b={value:0},S=new m(At(c),new i({vertexShader:Ot,fragmentShader:kt,uniforms:{uLength:f,uPower:d,uTime:b,uColor:{value:l},uFade:p},transparent:!0,depthWrite:!1,blending:2}));S.name=`title-ship-plumes`,S.frustumCulled=!1,S.renderOrder=5;let C=new x;C.add(_,y,S);let w=new x;return w.name=`title-ship`,w.add(C),{group:w,update(e,t){let n=e,r=1-t;C.position.set(Math.sin(n*.21)*.1*r,(Math.sin(n*.29+1.1)*.07+Math.sin(n*.11)*.05)*r,Math.sin(n*.17+2)*.12*r),C.rotation.set(Math.sin(n*.19+.4)*.022*r,Math.sin(n*.13+1.3)*.012*r,Math.sin(n*.23+2.2)*.01*r),b.value=e;let i=1+.035*Math.sin(n*11.3)+.025*Math.sin(n*17.9+1);u.value=(Me+.6*t)*i,d.value=t*i,f.value=Ae*(je+.7*t)},setFade(e){p.value=e},dispose(){a.dispose(),o.dispose(),s.hull.dispose(),s.decals.dispose(),g.dispose(),v.dispose(),S.geometry.dispose(),S.material.dispose()}}}var Mt=40,Nt=Math.tan(g.degToRad(Mt/2)),Pt=16/9*Nt,X=Math.PI/180,Ft=new d(1,0,0);function Z(e,t,n=new d){return n.set((2*e-1)*Pt,(1-2*t)*Nt,-1).normalize()}function It(e,t){return new o((2*e-1)*Pt,(1-2*t)*Nt)}var Q={planetRadius:6e3,limb:[[.32,.74],[.62,.37],[1,.14]],sunAt:[.635,.355],sunLift:.9,lightTowardCamera:.42,isilthe:{at:[.89,.15],distance:17e3,angularRadius:6.2},moon:{at:[.425,.43],distance:9e3,angularRadius:1.45},band:{from:[.42,-.08],to:[1.02,.6],knot:[.7,.2]},dustDrift:[.25,-.12,1]},Lt={nose:[.585,.53],noseDistance:30,stern:[.8,.66],sternDistance:20,roll:-8},$={delay:2,distance:34,speed:60,tau:.15,drift:.2,driftTau:120,composedAt:3,turn:16,turnDistance:26,bank:10,plumeHold:.35,plumeFade:.6,clearance:8},Rt=!1,zt={pool:[[2.3,`chunky`,5],[1.8,`angular`,5],[1.5,`elongated`,4],[1.2,`chunky`,4],[1,`angular`,4],[.85,`elongated`,4],[.7,`chunky`,3],[.6,`angular`,3],[.5,`elongated`,3],[.42,`chunky`,3],[.35,`angular`,2],[.3,`chunky`,2]],distance:[11,70],bandTop:.8,bandDepth:.12,crossing:[26,60],sink:[-.02,.1],approach:[0,.12],spin:[.04,.1],seed:42366},Bt={area:[-.7,.78,-.05,.9],heading:[Math.PI+.08,Math.PI+.22],first:5,every:[8,10.5],seconds:1.1,travel:.85,length:[.55,.75],width:.022,brightness:9},Vt={count:11,countLow:9,distance:[7,70],size:[.0072,.0155],drift:[.008,.016],driftAt:25,parallax:.35,spin:[.15,.7],seed:912146},Ht=[[`kethra_day.jpg`,!0],[`kethra_night.jpg`,!0],[`clouds.jpg`,!1],[`isilthe_day.jpg`,!0],[`isilthe_night.jpg`,!0],[`isilthe_ring.png`,!0]];function Ut(){for(let[e,t]of Ht)ae(e,t);le()}var Wt=.6,Gt=e=>e<0?0:e>1?1:e,Kt=e=>e*e*(3-2*e),qt=class{kind=`TitleScene`;usesAO=!1;grade=te.title;needsEnvironment=!1;governed=!1;scene=new u;camera=new h(Mt,window.innerWidth/window.innerHeight,.5,4e4);onFirstFrame=null;detail=null;sky;hero;worlds=[];moon;rocks;debris;ship;fx;sunSeen=new d;light=new d;elapsed=0;firstFrame=!0;disposed=!1;yaw=0;leaveT=-1;onLeft=null;lowTier=!1;shipScale=1;pose={position:new d,quaternion:new b,forward:new d,up:new d,side:new d};flightClock=-$.delay;thrust=1;turnQ=new b;bankQ=new b;offset=new d;scratchW=new d;lookTarget=new d;async init(e){let t=ee();if(!t)throw Error(`TitleScene needs the engine`);let n=t.renderer;this.lowTier=t.getQualityTier()===`low`,this.scene.background=new r(330002);let[i,a,o]=Q.limb.map(([e,t])=>Z(e,t)),s=new d().crossVectors(a.clone().sub(i),o.clone().sub(i)).normalize();s.dot(Z(1,1))<0&&s.negate();let c=Math.acos(g.clamp(i.dot(s),-1,1)),l=Q.planetRadius,u=s.clone().multiplyScalar(l/Math.sin(c)),f=Z(...Q.sunAt),p=f.clone().sub(s.clone().multiplyScalar(f.dot(s))).normalize(),m=c+Q.sunLift*X;this.sunSeen.copy(s).multiplyScalar(Math.cos(m)).addScaledVector(p,Math.sin(m)).normalize(),this.light.copy(this.sunSeen).lerp(s.clone().negate(),Q.lightTowardCamera).normalize();let h=Z(.85,.95),_=()=>e?.breathe()??Promise.resolve(),v=performance.now(),y=e=>{S(`title:${e}`,v),v=performance.now()},b=Q.band,x=me(n,_),C=fe(n,x.then(e=>e.texture),{from:It(...b.from),to:It(...b.to),core:It(...b.knot)},{stars:this.lowTier?4200:8e3,pace:_}),te=this.sunSeen.clone().add(new d(0,.6,0)).normalize(),re=new d(-.45,.35,.82).normalize(),ie=jt(n,{keyDir:te,sunDir:this.sunSeen,bounceDir:h,fillDir:re,planetCenter:u,planetRadius:l,planetLight:this.light,pace:_}),[le,ue]=await Promise.all([x,C]);this.detail=le,this.sky=ue,this.scene.add(this.sky.group),y(`bakes`),await e?.tick(),this.hero=Se({radius:l,center:u,sunDir:this.light,glareDir:this.sunSeen,day:ae(`kethra_day.jpg`,!0),night:ae(`kethra_night.jpg`,!0),clouds:ae(`clouds.jpg`,!1),detail:le.texture,segments:this.lowTier?160:224}),this.scene.add(this.hero.group);let he=this.light.clone().multiplyScalar(1e7),ge=Q.isilthe,_e=ne.find(e=>e.id===`isilthe`),ve=Z(...ge.at).multiplyScalar(ge.distance),ye=se({..._e,radius:ge.distance*Math.sin(ge.angularRadius*X)},ve,he,this.camera);ye.group.rotation.set(0,0,Math.PI+.06),this.scene.add(ye.group),this.worlds.push(ye);let be=Q.moon;this.moon=Te({position:Z(...be.at).multiplyScalar(be.distance),radius:be.distance*Math.sin(be.angularRadius*X),light:this.light,detail:le.texture}),this.scene.add(this.moon.mesh),y(`planets`),await e?.tick(),(Rt||w.reduced)&&(this.flightClock=$.composedAt),this.solveShip();let xe={tanH:Pt,tanV:Nt},Ce={sunDir:this.light,rimDir:this.sunSeen,bounceDir:h},we=zt;this.rocks=await de({...we,...Ce,pool:we.pool.map(([e,t,n])=>[e,t,this.lowTier?Math.min(n,4):n]),avoid:{points:this.flightPath(2),clearance:$.clearance},view:xe,pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.rocks.mesh),this.debris=ce({...Vt,...Ce,count:this.lowTier?Vt.countLow:Vt.count,view:xe}),this.scene.add(this.debris.group),y(`rocks`),await e?.tick(),this.ship=await ie,this.flyShip(this.flightClock),this.scene.add(this.ship.group),y(`ship`);let T=new d(...Q.dustDrift).normalize().multiplyScalar(1.1);this.fx=pe({sunDir:this.sunSeen,coreDistance:3e4,dust:{count:this.lowTier?110:240,boxMin:new d(-16,-11,-42),boxSize:new d(40,22,38),stream:T},meteors:Bt}),this.fx.setMeteors(!w.reduced),this.scene.add(this.fx.group),this.sky.setReveal(1,1),this.hero.setReveal(1,1);for(let e of this.worlds)e.setFade(1);this.moon.setFade(1),this.rocks.setFade(1),this.debris.setFade(1),this.ship.setFade(1),this.fx.setGlare(1),this.fx.setDust(.9),this.frame(window.innerWidth/window.innerHeight),this.placeCamera(0),y(`fx`),await oe(),y(`maps`)}solveShip(){let e=Z(...Lt.nose).multiplyScalar(Lt.noseDistance),t=Z(...Lt.stern).multiplyScalar(Lt.sternDistance),n=e.sub(t);this.shipScale=n.length()/(6-ke),n.normalize();let r=new d(0,1,0).addScaledVector(n,-n.y).normalize().applyAxisAngle(n,Lt.roll*X),i=new d().crossVectors(n,r),a=this.pose;a.quaternion.setFromRotationMatrix(new p().makeBasis(n,r,i)),a.position.copy(t).addScaledVector(n,-ke*this.shipScale),a.forward.copy(n),a.up.copy(r),a.side.crossVectors(r,n)}travelled(e){if(e<=0)return 0;let t=$,n=t.distance/t.speed-t.tau,r=e<=n?t.speed*e:t.speed*n+t.speed*t.tau*(1-Math.exp(-(e-n)/t.tau));return t.drift*t.driftTau*(1-Math.exp(-e/t.driftTau))+r}pathOffset(e,t){let{forward:n,side:r}=this.pose;if(e<=0)return t.copy(n).multiplyScalar(-e),0;let i=$.turn*X,a=$.turnDistance,o=i/a,s=Math.min(e,a);return t.copy(n).multiplyScalar(-Math.sin(o*s)/o).addScaledVector(r,-(1-Math.cos(o*s))/o),e>a&&t.addScaledVector(n,-Math.cos(i)*(e-a)).addScaledVector(r,-Math.sin(i)*(e-a)),s/a*i}flightPath(e){let t=[],n=this.travelled($.composedAt)-this.travelled(Math.max(this.flightClock,0));for(let r=n;r>-e;r-=e)this.pathOffset(Math.max(r,0),this.offset),t.push(this.pose.position.clone().add(this.offset));return t}flyShip(e){let t=Math.max(e,0),n=this.pathOffset(this.travelled($.composedAt)-this.travelled(t),this.offset),r=this.ship.group;r.position.copy(this.pose.position).add(this.offset),this.turnQ.setFromAxisAngle(this.pose.up,n),this.bankQ.setFromAxisAngle(Ft,$.bank*X*(n/($.turn*X))),r.quaternion.copy(this.turnQ).multiply(this.pose.quaternion).multiply(this.bankQ),r.scale.setScalar(this.shipScale);let i=$.distance/$.speed-$.tau;this.thrust=1-Kt(Gt((t-i-$.plumeHold)/$.plumeFade))}onEnter(){C(`title:backdrop`),Rt=!0}leave(){return new Promise(e=>{if(this.disposed){e();return}let t=this.onLeft;this.onLeft=()=>{t?.(),e()},this.leaveT<0&&(this.leaveT=0)})}update(e){this.elapsed+=e;let t=this.elapsed;for(let n of this.worlds)n.update(t,e);this.hero.update(t),this.rocks.update(e),this.debris.update(t),this.flyShip(t+this.flightClock),this.ship.update(t,this.thrust);let n=0;if(this.leaveT>=0){this.leaveT+=e;let t=Gt(this.leaveT/(w.reduced?.35:Wt));if(this.fx.setVeil(Kt(t)),n=w.reduced?0:t*t*2.4,t>=1&&this.onLeft){let e=this.onLeft;this.onLeft=null,e()}}this.placeCamera(n),this.fx.update(this.camera,e,t),this.sky.update(this.camera),this.firstFrame&&(this.firstFrame=!1,this.onFirstFrame?.())}placeCamera(e){let t=+!w.reduced,n=this.elapsed;this.camera.position.set(Math.sin(n*.11)*.22*t,Math.sin(n*.083+1.3)*.12*t,Math.sin(n*.061+.6)*.3*t),this.lookTarget.set(Math.sin(this.yaw)*120,0,-Math.cos(this.yaw)*120),e>0&&(this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize(),this.camera.position.addScaledVector(this.scratchW,e)),this.camera.lookAt(this.lookTarget)}frame(e){let t=Math.max(Nt,.36/e);this.camera.fov=2*Math.atan(t)/X,this.camera.aspect=e,this.camera.updateProjectionMatrix(),this.yaw=Math.max(0,Math.atan(Pt)-Math.atan(t*e)),this.rocks?.setView(t*e,t),this.debris?.setView(t*e,t)}onResize(e,t){this.frame(e/t)}dispose(){this.disposed=!0;let e=this.onLeft;this.onLeft=null,e?.(),this.detail?.dispose(),this.sky?.dispose(),this.hero?.dispose(),this.moon?.dispose(),this.rocks?.dispose(),this.debris?.dispose(),this.ship?.dispose(),this.fx?.dispose();for(let e of this.worlds)Jt(e.group)}};function Jt(e){e.traverse(e=>{let t=e;t.geometry?.dispose();let n=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(let e of n)e.dispose()})}export{qt as KethraTitleScene,Ut as preloadKethraTitle};