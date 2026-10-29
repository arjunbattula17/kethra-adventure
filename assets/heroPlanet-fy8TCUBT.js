import{B as e,D as t,Gt as n,Mt as r,Ot as i,st as a}from"./three-D-4sCFw3.js";var o=`
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
`,s=`
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
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(nGeo, V), 0.0, 1.0), 5.0);
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
`,c=`
  varying vec3 vPosW;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`,l=`
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
`,u=-.0085,d=28e-5,f=2.25;function p(p){let m=new e;m.name=`title-hero-planet`,m.position.copy(p.center);let h=new t(1,.97,.92).multiplyScalar(2.3),g={uDay:{value:p.day},uNight:{value:p.night},uClouds:{value:p.clouds},uDetail:{value:p.detail},uSunDir:{value:p.sunDir},uSunColor:{value:h},uCloudShift:{value:0},uBumpScale:{value:p.radius*.0014},uNightGlow:{value:p.nightGlow??1.25},uCloudHeight:{value:p.radius*.004},uFade:{value:0}},_=new a(new r(p.radius,p.segments,p.segments/2),new i({vertexShader:o,fragmentShader:s,uniforms:g}));_.name=`title-hero-surface`,_.rotation.y=f;let v=new e;v.rotation.set(.32,0,-.42),v.add(_),m.add(v);let y=p.radius*.0075,b={uCenter:{value:p.center},uR:{value:p.radius},uH:{value:y},uSunDir:{value:p.sunDir},uGlareDir:{value:p.glareDir},uSunColor:{value:new t(1,1,1).multiplyScalar(1.15)},uBeta:{value:new n(.014,.042,.078)},uMie:{value:1},uDiscHaze:{value:.4},uFade:{value:0}},x=new a(new r(p.radius+y*8,p.segments,p.segments/2),new i({vertexShader:c,fragmentShader:l,uniforms:b,transparent:!0,depthWrite:!1,blending:5,blendEquation:100,blendSrc:201,blendDst:205,blendSrcAlpha:200,blendDstAlpha:201}));return x.name=`title-hero-atmosphere`,m.add(x),{group:m,surface:_,radius:p.radius,update(e){_.rotation.y=f+e*u,g.uCloudShift.value=e*d},setReveal(e,t){g.uFade.value=e,b.uFade.value=t},dispose(){_.geometry.dispose(),_.material.dispose(),x.geometry.dispose(),x.material.dispose()}}}var m=`
  varying vec3 vNormalW;
  varying vec3 vLocalN;
  void main() {
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vLocalN = normal;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`,h=`
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
`;function g(e){let t={value:0},n=new a(new r(e.radius,40,20),new i({vertexShader:m,fragmentShader:h,uniforms:{uDetail:{value:e.detail},uLight:{value:e.light},uFade:t}}));return n.name=`title-moon`,n.position.copy(e.position),n.rotation.set(.4,1.2,.2),{mesh:n,setFade(e){t.value=e},dispose(){n.geometry.dispose(),n.material.dispose()}}}export{g as n,p as t};