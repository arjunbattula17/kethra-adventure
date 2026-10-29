import{B as e,I as t,Mt as n,Ot as r,T as i,Wt as a,dt as o,ft as s,k as c,kt as l,st as u,y as d}from"./three-D-4sCFw3.js";function f(e,n,r){let i=new l(e.map(([e,t])=>new a(e,t)));return new t(i,{depth:n,bevelEnabled:!0,bevelSize:r,bevelThickness:r,bevelSegments:1}).rotateX(Math.PI/2)}function p(){let t=new e;t.name=`skiff`;let a=new o({color:8159364,roughness:.58,metalness:.35,flatShading:!0}),l=new o({color:2237994,roughness:.5,metalness:.55,flatShading:!0}),p=new o({color:725269,roughness:.12,metalness:.4,emissive:16757850,emissiveIntensity:.12}),m=new o({color:11565610,roughness:.6,metalness:.2}),h=new o({color:1709586,emissive:16753226,emissiveIntensity:1.2,roughness:.4}),g=new o({color:2762272,emissive:16773848,emissiveIntensity:1.6}),_=new u(f([[-1.3,-.75],[.7,-.62],[1.45,-.2],[1.45,.2],[.7,.62],[-1.3,.75]],.36,.06),a);_.position.y=.24,t.add(_);for(let e of[-.69,.69]){let n=new u(new d(1.7,.06,.02),m);n.position.set(-.2,.06,e),n.rotation.y=e<0?.06:-.06,t.add(n)}let v=new o({color:2759692,emissive:16757850,emissiveIntensity:1.1});for(let e of[-1,1]){let n=new u(new d(1.9,.012,.03),v);n.position.set(-.3,.305,e*.64),n.rotation.y=e*Math.atan2(.13,2),t.add(n)}let y=new u(f([[-.35,-.34],[.35,-.28],[.72,0],[.35,.28],[-.35,.34]],.16,.04),p);y.position.set(.1,.46,0),t.add(y);for(let e of[-.86,.86]){let n=new u(new c(.19,.22,1.15,10).rotateZ(Math.PI/2),l);n.position.set(-.55,.02,e),t.add(n);let r=new u(new i(.15,14).rotateY(-Math.PI/2),h);r.position.set(-1.13,.02,e),t.add(r)}let b=new u(new d(.22,.1,.24),l);b.position.set(1.15,-.14,0),t.add(b);let x=new u(new i(.08,14).rotateX(Math.PI/2),g);x.position.set(1.15,-.195,0),t.add(x);let S=new s;S.position.set(1.15,-.2,0),t.add(S);let C=new e;for(let[e,t]of[[.85,0],[-.8,-.5],[-.8,.5]]){let n=new u(new d(.05,.34,.05),l);n.position.set(e,-.26,t);let r=new u(new c(.12,.14,.04,10),l);r.position.set(e,-.44,t),C.add(n,r)}t.add(C);let w=new r({uniforms:{uHeat:{value:0}},vertexShader:`
      varying float vRim;
      varying float vLead;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vRim = 1.0 - abs(dot(normalize(mat3(modelMatrix) * normal), normalize(cameraPosition - w.xyz)));
        vLead = clamp(position.x * 0.5 + 0.5 - position.y, 0.0, 1.0);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,fragmentShader:`
      uniform float uHeat;
      varying float vRim;
      varying float vLead;
      void main() {
        // Only the leading underside burns, brightest at the silhouette.
        float rim = max(vRim, 0.0);
        float lead = clamp(vLead, 0.0, 1.0);
        vec3 c = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.75, 0.4), rim) * rim * rim * lead * lead;
        gl_FragColor = vec4(c * uHeat * 1.4, 1.0);
      }
    `,transparent:!0,depthWrite:!1,blending:2}),T=new u(new n(1.6,24,12).scale(1.1,.45,.8),w);return T.position.set(.2,.05,0),t.add(T),{group:t,heat:w,lampAnchor:S,gear:C,thrusters:h}}export{p as t};