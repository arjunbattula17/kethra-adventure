import{Dt as e,I as t,T as n,Tt as r,at as i,ct as a,k as o,lt as s,wt as c,y as l,z as u,zt as d}from"./three-DrA6UbAx.js";function f(e,n,i){let a=new r(e.map(([e,t])=>new d(e,t)));return new t(a,{depth:n,bevelEnabled:!0,bevelSize:i,bevelThickness:i,bevelSegments:1}).rotateX(Math.PI/2)}function p(){let t=new u;t.name=`skiff`;let r=new a({color:8159364,roughness:.58,metalness:.35,flatShading:!0}),d=new a({color:2237994,roughness:.5,metalness:.55,flatShading:!0}),p=new a({color:725269,roughness:.12,metalness:.4,emissive:16757850,emissiveIntensity:.12}),m=new a({color:11565610,roughness:.6,metalness:.2}),h=new a({color:1709586,emissive:16753226,emissiveIntensity:1.2,roughness:.4}),g=new a({color:2762272,emissive:16773848,emissiveIntensity:1.6}),_=new i(f([[-1.3,-.75],[.7,-.62],[1.45,-.2],[1.45,.2],[.7,.62],[-1.3,.75]],.36,.06),r);_.position.y=.24,t.add(_);for(let e of[-.69,.69]){let n=new i(new l(1.7,.06,.02),m);n.position.set(-.2,.06,e),n.rotation.y=e<0?.06:-.06,t.add(n)}let v=new i(f([[-.35,-.34],[.35,-.28],[.72,0],[.35,.28],[-.35,.34]],.16,.04),p);v.position.set(.1,.46,0),t.add(v);for(let e of[-.86,.86]){let r=new i(new o(.19,.22,1.15,10).rotateZ(Math.PI/2),d);r.position.set(-.55,.02,e),t.add(r);let a=new i(new n(.15,14).rotateY(-Math.PI/2),h);a.position.set(-1.13,.02,e),t.add(a)}let y=new i(new l(.22,.1,.24),d);y.position.set(1.15,-.14,0),t.add(y);let b=new i(new n(.08,14).rotateX(Math.PI/2),g);b.position.set(1.15,-.195,0),t.add(b);let x=new s;x.position.set(1.15,-.2,0),t.add(x);let S=new u;for(let[e,t]of[[.85,0],[-.8,-.5],[-.8,.5]]){let n=new i(new l(.05,.34,.05),d);n.position.set(e,-.26,t);let r=new i(new o(.12,.14,.04,10),d);r.position.set(e,-.44,t),S.add(n,r)}t.add(S);let C=new c({uniforms:{uHeat:{value:0}},vertexShader:`
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
    `,transparent:!0,depthWrite:!1,blending:2}),w=new i(new e(1.6,24,12).scale(1.1,.45,.8),C);return w.position.set(.2,.05,0),t.add(w),{group:t,heat:C,lampAnchor:x,gear:S,thrusters:h}}export{p as t};