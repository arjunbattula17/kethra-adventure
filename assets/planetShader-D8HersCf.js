import{C as e,Ct as t,P as n,S as r,X as i,Z as a,_t as o,dt as s,ft as c,kt as l,mt as u,ut as d}from"./three-DxPhTeda.js";var f=`
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

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`,m=new t,h=new Map;function g(e,t){let n=`/kethra-adventure/textures/planets/${e}`,i=h.get(n);return i||(i=m.load(n),i.colorSpace=t?c:``,i.wrapS=d,i.wrapT=r,i.anisotropy=8,h.set(n,i)),i}function _(e,t,n){let r=new s(e,t,n,1),i=r.attributes.position,a=r.attributes.uv,o=new l;for(let n=0;n<i.count;n++)o.fromBufferAttribute(i,n),a.setXY(n,(o.length()-e)/(t-e),.5);return a.needsUpdate=!0,r}var v={kethra:.55,isilthe:.35};function y(t,r,s,c){let l=new n;l.position.copy(r);let d=s.clone().sub(r).normalize(),m=new e(t.color).lerp(new e(12573183),.5),h=v[t.id]??0,y={uDayMap:{value:g(`${t.id}_day.jpg`,!0)},uNightMap:{value:g(`${t.id}_night.jpg`,!0)},uCloudMap:{value:g(`clouds.jpg`,!1)},uSunDir:{value:d},uCameraPos:{value:c.position.clone()},uAtmoColor:{value:m},uCloudAmount:{value:h},uCloudOffset:{value:0},uAtmoStrength:{value:h>0?1.5:.9}},b=new i(new o(t.radius,48,32),new u({vertexShader:f,fragmentShader:p,uniforms:y}));l.add(b);let x=null;return t.hasRing&&(x=new i(_(t.radius*1.4,t.radius*2.3,96),new a({map:g(`${t.id}_ring.png`,!0),transparent:!0,side:2,depthWrite:!1})),x.rotation.x=Math.PI/2-.34,x.rotation.y=.2,l.add(x)),{group:l,update(e){y.uCameraPos.value.copy(c.position),d.copy(s).sub(l.position).normalize(),y.uCloudOffset.value=e*.004}}}export{y as t};