import{Ct as e,I as t,Lt as n,St as r,T as i,Tt as a,k as o,ot as s,rt as c,st as l,y as u,z as d}from"./three-CZsmadtC.js";function f(r,i,a){let o=new e(r.map(([e,t])=>new n(e,t)));return new t(o,{depth:i,bevelEnabled:!0,bevelSize:a,bevelThickness:a,bevelSegments:1}).rotateX(Math.PI/2)}function p(){let e=new d;e.name=`skiff`;let t=new s({color:8159364,roughness:.58,metalness:.35,flatShading:!0}),n=new s({color:2237994,roughness:.5,metalness:.55,flatShading:!0}),p=new s({color:725269,roughness:.12,metalness:.4,emissive:16757850,emissiveIntensity:.12}),m=new s({color:11565610,roughness:.6,metalness:.2}),h=new s({color:1709586,emissive:16753226,emissiveIntensity:1.2,roughness:.4}),g=new s({color:2762272,emissive:16773848,emissiveIntensity:1.6}),_=new c(f([[-1.3,-.75],[.7,-.62],[1.45,-.2],[1.45,.2],[.7,.62],[-1.3,.75]],.36,.06),t);_.position.y=.24,e.add(_);for(let t of[-.69,.69]){let n=new c(new u(1.7,.06,.02),m);n.position.set(-.2,.06,t),n.rotation.y=t<0?.06:-.06,e.add(n)}let v=new c(f([[-.35,-.34],[.35,-.28],[.72,0],[.35,.28],[-.35,.34]],.16,.04),p);v.position.set(.1,.46,0),e.add(v);for(let t of[-.86,.86]){let r=new c(new o(.19,.22,1.15,10).rotateZ(Math.PI/2),n);r.position.set(-.55,.02,t),e.add(r);let a=new c(new i(.15,14).rotateY(-Math.PI/2),h);a.position.set(-1.13,.02,t),e.add(a)}let y=new c(new u(.22,.1,.24),n);y.position.set(1.15,-.14,0),e.add(y);let b=new c(new i(.08,14).rotateX(Math.PI/2),g);b.position.set(1.15,-.195,0),e.add(b);let x=new l;x.position.set(1.15,-.2,0),e.add(x);let S=new d;for(let[e,t]of[[.85,0],[-.8,-.5],[-.8,.5]]){let r=new c(new u(.05,.34,.05),n);r.position.set(e,-.26,t);let i=new c(new o(.12,.14,.04,10),n);i.position.set(e,-.44,t),S.add(r,i)}e.add(S);let C=new r({uniforms:{uHeat:{value:0}},vertexShader:`
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
    `,transparent:!0,depthWrite:!1,blending:2}),w=new c(new a(1.6,24,12).scale(1.1,.45,.8),C);return w.position.set(.2,.05,0),e.add(w),{group:e,heat:C,lampAnchor:x,gear:S,thrusters:h}}export{p as t};