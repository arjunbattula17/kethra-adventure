import{$ as e,C as t,D as n,L as r,Mt as i,P as a,nt as o,rt as s,v as c,vt as l,xt as u,yt as d}from"./three-UYgi6TLI.js";function f(e,t,n){let r=new d(e.map(([e,t])=>new i(e,t)));return new a(r,{depth:t,bevelEnabled:!0,bevelSize:n,bevelThickness:n,bevelSegments:1}).rotateX(Math.PI/2)}function p(){let i=new r;i.name=`skiff`;let a=new o({color:8159364,roughness:.58,metalness:.35,flatShading:!0}),d=new o({color:2237994,roughness:.5,metalness:.55,flatShading:!0}),p=new o({color:725269,roughness:.12,metalness:.4,emissive:16757850,emissiveIntensity:.12}),m=new o({color:11565610,roughness:.6,metalness:.2}),h=new o({color:1709586,emissive:16753226,emissiveIntensity:1.2,roughness:.4}),g=new o({color:2762272,emissive:16773848,emissiveIntensity:1.6}),_=new e(f([[-1.3,-.75],[.7,-.62],[1.45,-.2],[1.45,.2],[.7,.62],[-1.3,.75]],.36,.06),a);_.position.y=.24,i.add(_);for(let t of[-.69,.69]){let n=new e(new c(1.7,.06,.02),m);n.position.set(-.2,.06,t),n.rotation.y=t<0?.06:-.06,i.add(n)}let v=new e(f([[-.35,-.34],[.35,-.28],[.72,0],[.35,.28],[-.35,.34]],.16,.04),p);v.position.set(.1,.46,0),i.add(v);for(let r of[-.86,.86]){let a=new e(new n(.19,.22,1.15,10).rotateZ(Math.PI/2),d);a.position.set(-.55,.02,r),i.add(a);let o=new e(new t(.15,14).rotateY(-Math.PI/2),h);o.position.set(-1.13,.02,r),i.add(o)}let y=new e(new c(.22,.1,.24),d);y.position.set(1.15,-.14,0),i.add(y);let b=new e(new t(.08,14).rotateX(Math.PI/2),g);b.position.set(1.15,-.195,0),i.add(b);let x=new s;x.position.set(1.15,-.2,0),i.add(x);let S=new r;for(let[t,r]of[[.85,0],[-.8,-.5],[-.8,.5]]){let i=new e(new c(.05,.34,.05),d);i.position.set(t,-.26,r);let a=new e(new n(.12,.14,.04,10),d);a.position.set(t,-.44,r),S.add(i,a)}i.add(S);let C=new l({uniforms:{uHeat:{value:0}},vertexShader:`
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
    `,transparent:!0,depthWrite:!1,blending:2}),w=new e(new u(1.6,24,12).scale(1.1,.45,.8),C);return w.position.set(.2,.05,0),i.add(w),{group:i,heat:C,lampAnchor:x,gear:S,thrusters:h}}export{p as t};