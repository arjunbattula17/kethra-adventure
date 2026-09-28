import{C as e,Ct as t,D as n,P as r,X as i,_t as a,it as o,mt as s}from"./three-DxPhTeda.js";import{t as c}from"./spaceSky-DmaAUQmS.js";var l=7,u=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,d=`
  precision highp float;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  uniform float uDisc;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // Streamers: a few broad lobes, longer and shorter, so the outer glow isn't a perfect disc
    // without turning into a starburst.
    float lobes = 0.86 + 0.08 * sin(a * 3.0 + 1.3) + 0.04 * sin(a * 5.0 + 0.4) + 0.02 * sin(a * 9.0 + 2.1);
    float x = max(r - uDisc, 0.0);
    vec3 col = uInner * exp(-x * 22.0) * 0.7 + uOuter * exp(-x * 5.0 / lobes) * 0.3;
    col *= smoothstep(1.0, 0.75, r);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;function f(f){let p=new r;p.name=`sun`;let m=new s({uniforms:{uMap:{value:new t().load(`/kethra-adventure/textures/planets/sun.jpg`)},uDrift:{value:0}},vertexShader:`
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,fragmentShader:`
      precision highp float;
      uniform sampler2D uMap;
      uniform float uDrift;
      varying vec2 vUv;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec3 base = texture2D(uMap, vec2(vUv.x + uDrift, vUv.y)).rgb;
        // Limb darkening: a real star is dimmer and redder at its edge because the line of sight
        // there exits the photosphere at a shallower depth.
        float mu = clamp(dot(normalize(vNormal), normalize(vViewDir)), 0.0, 1.0);
        float limb = 0.42 + 0.58 * pow(mu, 0.55);
        vec3 color = base * limb;
        color.b *= mix(0.72, 1.0, mu);
        gl_FragColor = vec4(color * 1.35, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `}),h=new i(new a(f.radius,48,32),m);p.add(h);let g=c(5800,new e),_=new i(new o(f.radius*l*2,f.radius*l*2),new s({uniforms:{uInner:{value:g.clone().multiplyScalar(1.1)},uOuter:{value:new e(16758896)},uDisc:{value:1/l}},vertexShader:u,fragmentShader:d,transparent:!0,depthWrite:!1,blending:2}));return p.add(_),{group:p,light:new n(g,3.2),update(e,t){_.quaternion.copy(e.quaternion),m.uniforms.uDrift.value+=t*.004}}}export{f as t};