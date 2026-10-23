import{At as e,Ct as t,D as n,E as r,Et as i,It as a,St as o,Ut as s,ot as c,st as l,wt as u,z as d}from"./three-BNTvIbIC.js";var f=`
varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

void main() {
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vPosW = worldPos.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`,p=`
precision highp float;

varying vec3 vNormalW;
varying vec3 vPosW;
varying vec2 vUv;

uniform sampler2D uDayMap;
uniform sampler2D uNightMap;
uniform sampler2D uCloudMap;
uniform vec3 uSunDir;
uniform vec3 uCameraPos;
uniform vec3 uAtmoColor;
uniform float uCloudAmount;
uniform float uCloudOffset;
uniform float uAtmoStrength;
uniform float uFade;

void main() {
  vec3 n = normalize(vNormalW);
  float ndl = dot(n, uSunDir);

  // Terminator. A planet's day/night boundary is soft over a band a few degrees wide, so this
  // smoothsteps across ndl rather than clamping it -- a hard cut reads as a rendering error, and a
  // fully linear ramp washes the whole sphere out.
  float day = smoothstep(-0.12, 0.28, ndl);

  vec3 dayColor = texture2D(uDayMap, vUv).rgb;
  vec3 nightColor = texture2D(uNightMap, vUv).rgb;

  // Clouds drift on their own longitude offset so they don't sit locked to the terrain below.
  float cloud = texture2D(uCloudMap, vec2(vUv.x + uCloudOffset, vUv.y)).r * uCloudAmount;
  dayColor = mix(dayColor, vec3(1.0), cloud * 0.85);

  // Lambert falloff across the lit side on top of the day/night mix, so the sub-solar point is
  // brighter than the limb and the sphere reads as a sphere instead of a flat disc.
  float lambert = 0.25 + 0.75 * max(ndl, 0.0);
  vec3 color = dayColor * lambert * day;

  // Night side keeps the world's own glow (Kethra's canopy, Orrun's buried machinery, Isilthe's
  // signal) plus a trace of skylight, and clouds occlude it the way overcast hides city light.
  color += nightColor * (1.0 - day) * (1.0 - cloud * 0.7);
  color += dayColor * 0.02 * (1.0 - day);

  // Atmosphere limb: a fresnel rim on the planet's own surface. Brighter where the rim faces the
  // sun, which is what produces the crescent of light along the day-side edge.
  vec3 viewDir = normalize(uCameraPos - vPosW);
  float rim = 1.0 - clamp(dot(n, viewDir), 0.0, 1.0);
  float limb = pow(rim, 4.0) * uAtmoStrength;
  color += uAtmoColor * limb * (0.25 + 0.75 * day);

  gl_FragColor = vec4(color * uFade, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,m=new a,h=new Map,g=[];function _(){return Promise.all(g).then(()=>void 0)}function v(e,t){let n=`/kethra-adventure/textures/planets/${e}`,i=h.get(n);if(!i){let e;g.push(new Promise(t=>e=t)),i=m.load(n,()=>e(),void 0,()=>e()),i.colorSpace=t?u:``,i.wrapS=o,i.wrapT=r,i.anisotropy=8,h.set(n,i)}return i}function y(e,n,r){let i=new t(e,n,r,1),a=i.attributes.position,o=i.attributes.uv,c=new s;for(let t=0;t<a.count;t++)c.fromBufferAttribute(a,t),o.setXY(t,(c.length()-e)/(n-e),.5);return o.needsUpdate=!0,i}var b={kethra:.55,isilthe:.35};function x(t,r,a,o){let s=new d;s.position.copy(r);let u=a.clone().sub(r).normalize(),m=new n(t.color).lerp(new n(12573183),.5),h=b[t.id]??0,g={uDayMap:{value:v(`${t.id}_day.jpg`,!0)},uNightMap:{value:v(`${t.id}_night.jpg`,!0)},uCloudMap:{value:v(`clouds.jpg`,!1)},uSunDir:{value:u},uCameraPos:{value:o.position.clone()},uAtmoColor:{value:m},uCloudAmount:{value:h},uCloudOffset:{value:0},uAtmoStrength:{value:h>0?1.5:.9},uFade:{value:1}},_=new c(new e(t.radius,48,32),new i({vertexShader:f,fragmentShader:p,uniforms:g}));s.add(_);let x=null;return t.hasRing&&(x=new c(y(t.radius*1.4,t.radius*2.3,96),new l({map:v(`${t.id}_ring.png`,!0),transparent:!0,side:2,depthWrite:!1})),x.rotation.x=Math.PI/2-.34,x.rotation.y=.2,s.add(x)),{group:s,update(e){g.uCameraPos.value.copy(o.position),u.copy(a).sub(s.position).normalize(),g.uCloudOffset.value=e*.004},setFade(e){g.uFade.value=e,x&&(x.material.opacity=e)}}}export{v as n,_ as r,x as t};