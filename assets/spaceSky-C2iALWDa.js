import{Bt as e,D as t,Dt as n,St as r,at as i,b as a,gt as o,wt as s,x as c,z as l}from"./three-DrA6UbAx.js";import{u}from"./boot-Cs1MUhFJ.js";function d(e,t){let n=e/100,i,a,o;return n<=66?(i=255,a=99.4708025861*Math.log(n)-161.1195681661,o=n<=19?0:138.5177312231*Math.log(n-10)-305.0447927307):(i=329.698727446*(n-60)**-.1332047592,a=288.1221695283*(n-60)**-.0755148492,o=255),t.setRGB(Math.min(255,Math.max(0,i))/255,Math.min(255,Math.max(0,a))/255,Math.min(255,Math.max(0,o))/255,r),t}var f=new e(.28,.93,-.24).normalize(),p=`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,m=`
  precision highp float;
  uniform vec3 uVoid;
  uniform vec3 uBand;
  uniform vec3 uPole;
  uniform float uBrightness;
  varying vec3 vDir;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  void main() {
    vec3 d = normalize(vDir);
    float lat = dot(d, uPole);
    // Two octaves of noise give the band an uneven edge.
    float n = noise(d * 3.1) * 0.6 + noise(d * 7.3) * 0.4;
    float band = exp(-lat * lat / (0.05 + 0.03 * n)) * (0.55 + 0.45 * n);
    vec3 col = uVoid + uBand * band;
    col *= uBrightness;
    // Dither: a dark gradient bands visibly in 8 bits without it.
    col += (hash(vec3(gl_FragCoord.xy, 1.0)) - 0.5) / 255.0 * 0.6;
    gl_FragColor = vec4(col, 1.0);
  }
`,h=`
  attribute float aSize;
  attribute vec3 aColor;
  uniform float uPixelRatio;
  uniform float uBrightness;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vColor = aColor * uBrightness;
    vSize = aSize * uPixelRatio;
    gl_PointSize = vSize + 2.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,g=`
  precision highp float;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    // A sharp core with a thin halo, sized in real pixels so a star stays a point at any resolution.
    float r = length(gl_PointCoord - 0.5) * (vSize + 2.0);
    float core = exp(-r * r / max(0.35, vSize * 0.18));
    float halo = exp(-r / max(0.8, vSize * 0.55)) * 0.12;
    gl_FragColor = vec4(vColor * (core + halo), 1.0);
  }
`;function _(r={}){let _=u(r.seed??24229),v=r.stars??3e3,y=new l;y.name=`space-sky`;let b={value:1},x=new i(new n(10,32,16),new s({uniforms:{uVoid:{value:new t(460810)},uBand:{value:new t(724244)},uPole:{value:f},uBrightness:b},vertexShader:p,fragmentShader:m,side:1,depthWrite:!1,depthTest:!1}));x.renderOrder=-1e3,x.frustumCulled=!1,y.add(x);let S=new Float32Array(v*3),C=new Float32Array(v*3),w=new Float32Array(v),T=new e,E=new t;for(let e=0;e<v;e++){let t=_()**7;for(let e=0;e<12;e++){T.set(_()*2-1,_()*2-1,_()*2-1);let e=T.length();if(e<.001||e>1)continue;T.divideScalar(e);let n=T.dot(f),r=t>.05?1:.3+.7*Math.exp(-(n*n)/.04);if(_()<r)break}S[e*3]=T.x*9,S[e*3+1]=T.y*9,S[e*3+2]=T.z*9;let n=_();d(n<.12?3200+_()*1200:n>.88?9e3+_()*5e3:5200+_()*2600,E);let r=.1+t*2.4;C[e*3]=E.r*r,C[e*3+1]=E.g*r,C[e*3+2]=E.b*r,w[e]=.9+t*2.6}let D=new c;D.setAttribute(`position`,new a(S,3)),D.setAttribute(`aColor`,new a(C,3)),D.setAttribute(`aSize`,new a(w,1));let O={value:1},k=new o(D,new s({uniforms:{uPixelRatio:O,uBrightness:b},vertexShader:h,fragmentShader:g,blending:2,depthWrite:!1,depthTest:!1}));return k.renderOrder=-999,k.frustumCulled=!1,k.onBeforeRender=e=>{O.value=e.getPixelRatio()},y.add(k),{group:y,update(e){e.getWorldPosition(y.position)},setBrightness(e){b.value=e}}}export{_ as n,d as t};