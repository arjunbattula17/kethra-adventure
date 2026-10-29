import{$ as e,B as t,C as n,D as r,Dt as i,Et as a,Gt as o,Kt as s,L as c,Ot as l,Ut as u,V as d,Wt as f,at as p,b as m,d as h,et as g,ht as _,it as v,mt as y,ot as b,qt as x,st as S,u as C,v as w,wt as ee,x as te,xt as T,yt as ne}from"./three-D-4sCFw3.js";import{n as re,t as ie}from"./perfMarks-B6nwIo-H.js";import{t as ae}from"./motion-CwbhnEYq.js";import{C as oe,S as se,T as ce,_ as le,a as ue,c as de,i as fe,o as E,s as D,v as pe}from"./boot-BYZiNFp_.js";import{n as me,r as he,t as ge}from"./planetShader-BRAi0q9d.js";import{n as _e,t as ve}from"./bake-YSKtNCWX.js";import{n as ye,t as be}from"./heroPlanet-fy8TCUBT.js";import{a as xe,c as Se,i as Ce,l as we,t as Te}from"./skyFx-95dTXtYr.js";var O=0,k=1,Ee=2,A=3,De=4,j=5,Oe=6,ke=7,Ae=-5.45,je=64,Me=.3,Ne=.4,M=(e,t,n)=>new o(e,t,n),N=M(0,1,0),P=M(-1,0,0);function F(e){let t=new o;for(let n of e)t.add(n);return t.divideScalar(e.length)}function I(e,t){if(t<=e[0][0])return e[0].slice(1);for(let n=0;n<e.length-1;n++){let r=e[n],i=e[n+1];if(t<=i[0]){let e=(t-r[0])/(i[0]-r[0]);return r.slice(1).map((t,n)=>t+(i[n+1]-t)*e)}}return e[e.length-1].slice(1)}var Pe=new o,Fe=new o,Ie=new o,Le=new o,Re=new o,ze=class{pos=[];mat=[];uv;kind=O;tint=1;seed=0;xf=null;flip=!1;uvs=null;rand;constructor(e,t=!1){this.rand=e,this.uv=t?[]:null}get triangles(){return this.pos.length/9}use(e,t=1){return this.kind=e,this.tint=t,this.seed=this.rand(),this}place(e){return this.xf=e,this.flip=!!e&&e.determinant()<0,this}triN(e,t,n,r,i=this.tint){if(Pe.subVectors(t,e),Fe.subVectors(n,e),Ie.crossVectors(Pe,Fe),Ie.lengthSq()<1e-14)return;let a=Ie.dot(r)>=0;this.flip&&(a=!a);let o=this.uvs;this.push(e,i,o?.[0]),a?(this.push(t,i,o?.[1]),this.push(n,i,o?.[2])):(this.push(n,i,o?.[2]),this.push(t,i,o?.[1]))}push(e,t,n){let r=this.xf?Le.copy(e).applyMatrix4(this.xf):e;this.pos.push(r.x,r.y,r.z),this.mat.push(this.kind,t,this.seed),this.uv&&this.uv.push(n?n[0]:0,n?n[1]:0)}tri(e,t,n,r,i=!1,a=this.tint){let o=Re.copy(e).add(t).add(n).divideScalar(3).sub(r);i&&o.negate(),this.triN(e,t,n,o,a)}quadN(e,t,n,r,i,a=this.tint){this.triN(e,t,n,i,a),this.triN(e,n,r,i,a)}quad(e,t,n,r,i,a=!1){this.tri(e,t,n,i,a),this.tri(e,n,r,i,a)}quadUv(e,t,n,r,i,a,o=this.tint){this.uvs=[a[0],a[1],a[2]],this.triN(e,t,n,i,o),this.uvs=[a[0],a[2],a[3]],this.triN(e,n,r,i,o),this.uvs=null}loft(e,t=[!0,!0],n=!1){let r=e[0].length,i=e.map(F);for(let t=0;t<e.length-1;t++){let a=e[t],o=e[t+1],s=i[t].clone().add(i[t+1]).multiplyScalar(.5);for(let e=0;e<r;e++){let t=(e+1)%r;this.quad(a[e],a[t],o[t],o[e],s,n)}}let a=i.reduce((e,t)=>e.add(t),new o).divideScalar(i.length),s=t=>{let n=e[t],o=i[t].clone().sub(a);for(let e=0;e<r;e++)this.triN(i[t],n[e],n[(e+1)%r],o)};t[0]&&s(0),t[1]&&s(e.length-1)}},L=(e,t)=>t.map(([t,n])=>M(e,t,n));function Be(e,t,n,r,i){let a=Math.max(1e-4,Math.min(i,n*.45,r*.45));return[[e+n,t+r-a],[e+n,t-r+a],[e+n-a,t-r],[e-n+a,t-r],[e-n,t-r+a],[e-n,t+r-a],[e-n+a,t+r],[e+n-a,t+r]]}function Ve(e,t,n=.03,r=[!0,!0]){let i=t.map(([e,t,r,i,a=0])=>L(e,Be((t+r)/2,a,(r-t)/2,i,n)));return e.loft(i,r),i}function R(e,t,n,r,i,a,o,s=0,c=.03){let l=Math.min(c,(n-t)*.3,(i-r)*.3),u=(e,t)=>Be((r+i)/2,s,(i-r)/2-t,a+(o-a)*e-t,c),d=n-t;e.loft([L(t,u(0,l)),L(t+l,u(l/d,0)),L(n-l,u(1-l/d,0)),L(n,u(1,l))])}function z(e,t,n,r){let i=r/Math.cos(Math.PI/8),a=[];for(let r=0;r<8;r++){let o=(r+.5)*Math.PI/4;a.push(M(e,t+Math.sin(o)*i,n+Math.cos(o)*i))}return a}function B(e,t,n,r,i=6){let a=n.clone().sub(t).normalize(),s=Math.abs(a.y)<.9?new o().crossVectors(a,N).normalize():new o().crossVectors(a,P).normalize(),c=new o().crossVectors(a,s),l=e=>{let t=[];for(let n=0;n<i;n++){let a=(n+.5)/i*Math.PI*2;t.push(e.clone().addScaledVector(s,Math.cos(a)*r).addScaledVector(c,Math.sin(a)*r))}return t};e.loft([l(t),l(n)])}function He(e,t){let n=e.length,r=[];for(let i=0;i<n;i++){let a=e[i],o=e[(i+n-1)%n],s=e[(i+1)%n],c=a[0]-o[0],l=a[1]-o[1],u=Math.hypot(c,l)||1;c/=u,l/=u;let d=s[0]-a[0],f=s[1]-a[1],p=Math.hypot(d,f)||1;d/=p,f/=p;let m=t/Math.max(.3,1+(-l*-f+c*d));r.push([a[0]+(-l-f)*m,a[1]+(c+d)*m])}return r}var Ue=e=>e.reduce((t,n,r)=>t+n[0]*e[(r+1)%e.length][1]-e[(r+1)%e.length][0]*n[1],0);function V(e,t,n,r,i,a=.02,o=.03){let s=Ue(t)<0?[...t].reverse():t,c=Math.min(a,i*.5),l=c>0?He(s,c):s,u=s.map(([e,t])=>n(e,t).addScaledVector(r,-o)),d=s.map(([e,t])=>n(e,t).addScaledVector(r,i-c)),f=l.map(([e,t])=>n(e,t).addScaledVector(r,i)),p=F(d),m=F(f),h=s.length;for(let t=0;t<h;t++){let n=(t+1)%h,i=d[t].clone().add(d[n]).multiplyScalar(.5).sub(p);e.quadN(u[t],u[n],d[n],d[t],i),c>0&&e.quadN(d[t],d[n],f[n],f[t],i.normalize().add(r)),e.triN(m,f[t],f[n],r)}return f}var H=(e,t,n)=>(r,i)=>e.clone().addScaledVector(t,r).addScaledVector(n,i);function U(e,t,n,r,i=.006){let a=n.clone().normalize(),o=t.map(e=>e.clone().addScaledVector(a,i));e.use(j,r),e.quadN(o[0],o[1],o[2],o[3],a)}var We=1024,Ge=512,Ke={number:[0,0,256,160],code:[256,0,384,88],emblem:[656,0,176,176],warn:[848,0,128,112],hazard:[0,176,512,48],nostep:[512,176,256,56],maint:[0,240,448,44],serial:[0,296,640,40],vent:[512,240,256,44],arrows:[768,176,224,56]};function W(e,t,n,r,i){let[a,s,c,l]=Ke[i.cell],u=F(t),d=t[1].clone().sub(t[0]),f=t[3].clone().sub(t[0]),p=i.right??(Math.abs(n.y)<.7?new o().crossVectors(N,n).normalize():M(0,0,1)),m=Math.abs(d.dot(p))/d.length()>=Math.abs(f.dot(p))/f.length(),h=(m?d:f).clone(),g=h.length();h.normalize(),h.dot(p)<0&&h.negate();let _=(m?f:d).length(),v=new o().crossVectors(n,h).normalize(),y=i.fill??.8,b=c/l*(i.stretch??1),x=g*y/2,S=x/b;S*2>_*y&&(S=_*y/2,x=S*b);let C=u.clone().addScaledVector(v,(i.offset??0)*_).addScaledVector(n,.004),w=(e,t)=>C.clone().addScaledVector(h,e*x).addScaledVector(v,t*S),ee=a/We,te=(a+c)/We,T=1-(s+l)/Ge,ne=1-s/Ge;e.use(r,i.paint),e.quadUv(w(-1,-1),w(1,-1),w(1,1),w(-1,1),n,[[ee,T],[te,T],[te,ne],[ee,ne]])}async function qe(){await ce();let e=document.createElement(`canvas`);e.width=We,e.height=Ge;let t=e.getContext(`2d`);t.fillStyle=`#fff`,t.strokeStyle=`#fff`,t.textAlign=`center`,t.textBaseline=`middle`;let r=(e,n,r,i=0)=>{let[a,o,s,c]=Ke[e];t.font=r,t.letterSpacing=`${i}px`,t.fillText(n,a+s/2+i/2,o+c/2+2,s-8)};r(`number`,`07`,`700 168px Rajdhani, "Segoe UI", sans-serif`,4),r(`code`,`AR-07`,`700 80px Rajdhani, "Segoe UI", sans-serif`,10),r(`serial`,`ARK LTD  ·  HULL 2291-07  ·  KESSIC SURVEY`,`600 30px Rajdhani, "Segoe UI", sans-serif`,4),r(`maint`,`MAINT ACCESS 14`,`700 36px Rajdhani, "Segoe UI", sans-serif`,6),r(`vent`,`COOLANT VENT`,`700 34px Rajdhani, "Segoe UI", sans-serif`,5);{let[e,n,i,a]=Ke.nostep;t.lineWidth=4,t.strokeRect(e+4,n+4,i-8,a-8),r(`nostep`,`NO STEP`,`700 34px Rajdhani, "Segoe UI", sans-serif`,6)}{let[e,n,r]=Ke.emblem,i=e+r/2,a=n+r/2,o=r/176;t.beginPath(),t.moveTo(i,a-34*o),t.lineTo(i+20*o,a-6*o),t.lineTo(i,a+22*o),t.lineTo(i-20*o,a-6*o),t.closePath(),t.fill();for(let e of[-1,1])t.beginPath(),t.moveTo(i+e*26*o,a-10*o),t.lineTo(i+e*84*o,a-40*o),t.lineTo(i+e*70*o,a-18*o),t.lineTo(i+e*30*o,a+6*o),t.closePath(),t.fill(),t.beginPath(),t.moveTo(i+e*30*o,a+12*o),t.lineTo(i+e*66*o,a-6*o),t.lineTo(i+e*56*o,a+10*o),t.lineTo(i+e*30*o,a+24*o),t.closePath(),t.fill();t.lineWidth=9*o,t.beginPath(),t.moveTo(i-40*o,a+44*o),t.lineTo(i,a+66*o),t.lineTo(i+40*o,a+44*o),t.stroke()}{let[e,n,r,i]=Ke.warn;t.lineWidth=8,t.beginPath(),t.moveTo(e+r/2,n+8),t.lineTo(e+r-8,n+i-8),t.lineTo(e+8,n+i-8),t.closePath(),t.stroke(),t.fillRect(e+r/2-5,n+40,10,34),t.fillRect(e+r/2-5,n+82,10,10)}{let[e,n,r,i]=Ke.hazard;t.save(),t.beginPath(),t.rect(e,n,r,i),t.clip(),t.fillStyle=`#1b1c1e`,t.fillRect(e,n,r,i),t.fillStyle=`#b09662`;for(let a=e-i;a<e+r+i;a+=48)t.beginPath(),t.moveTo(a,n+i),t.lineTo(a+24,n+i),t.lineTo(a+24+i,n),t.lineTo(a+i,n),t.closePath(),t.fill();t.restore()}{let[e,n,,r]=Ke.arrows;t.lineWidth=7;for(let i=0;i<4;i++){let a=e+24+i*50;t.beginPath(),t.moveTo(a,n+10),t.lineTo(a+22,n+r/2),t.lineTo(a,n+r-10),t.stroke()}}let i=new n(e);return i.colorSpace=a,i.anisotropy=8,i.minFilter=g,i.name=`title-ship-markings`,i}var Je=.026;function Ye(e,t){return e.map((n,r)=>{let i=e[(r+1)%4],a=e[(r+3)%4];return n.clone().addScaledVector(i.clone().sub(n).normalize(),t[(r+3)%4]).addScaledVector(a.clone().sub(n).normalize(),t[r])})}function Xe(e,t,n,r){let i=Math.min(.016,r*.4),a=t.map(e=>e.clone().addScaledVector(n,-.012)),o=t.map(e=>e.clone().addScaledVector(n,r-i)),s=Ye(t,[i,i,i,i]).map(e=>e.addScaledVector(n,r)),c=F(o);for(let t=0;t<4;t++){let r=(t+1)%4,i=o[t].clone().add(o[r]).multiplyScalar(.5).sub(c);e.quadN(a[t],a[r],o[r],o[t],i),e.quadN(o[t],o[r],s[r],s[t],i.normalize().add(n))}return e.quadN(s[0],s[1],s[2],s[3],n),s}function Ze(e,t,n,r){let{hull:i,rand:a}=e,o=t[1].clone().sub(t[0]),s=o.length();o.divideScalar(s);let c=t[3].clone().sub(t[0]),l=c.length();c.divideScalar(l);let u=H(t[0],o,c),d=2+Math.floor(a()*3);for(let e=0;e<d;e++){let e=a()*.55*s,t=Math.min(s*.96,e+(.25+a()*.5)*s),o=a()*.6*l,c=Math.min(l*.95,o+(.2+a()*.4)*l),d=r*(.35+a()*.55);if(a()<.35){let r=Math.min(.028,(c-o)*.4),s=(o+c)/2;i.use(A,.7+a()*.4),B(i,u(e,s).addScaledVector(n,r),u(t,s).addScaledVector(n,r),r,6)}else i.use(a()<.5?A:De,.6+a()*.5),V(i,[[e,o],[t,o],[t,c],[e,c]],u,n,d,d*.3,.01)}if(a()<.2){let e=(.2+a()*.6)*s,t=(.2+a()*.6)*l;i.use(j,.5),V(i,[[e,t],[e+.035,t],[e+.035,t+.035],[e,t+.035]],u,n,r*.5,0,.01)}}function Qe(e,t,n,r){let i=e.hull,a=t[1].clone().sub(t[0]),o=t[3].clone().sub(t[0]),s=a.length()>=o.length(),c=s?a:o,l=s?o:a,u=c.length(),d=l.length(),f=c.clone().normalize(),p=l.clone().normalize(),m=H(t[0],f,p),h=Math.min(14,Math.floor(u/.05)),g=u/h;i.use(A,.55);for(let e=0;e<h;e++){let t=(e+.3)*g;V(i,[[t,d*.06],[t+g*.45,d*.06],[t+g*.45,d*.94],[t,d*.94]],m,n,r*.7,0,.01)}}function $e(e,t,n,r){if(r.style===`skip`)return;let i=e.hull,a=[0,1,2,3].map(()=>e.rand()<.18?Je*2.6:Je);r.lamp!==void 0&&(a[r.lamp]=Je*2.2);let o=Ye(t,a);if(r.lamp!==void 0){let e=r.lamp,a=(e+1)%4;U(i,[t[e].clone().lerp(t[a],.06).lerp(o[e].clone().lerp(o[a],.06),.25),t[e].clone().lerp(t[a],.94).lerp(o[e].clone().lerp(o[a],.94),.25),t[e].clone().lerp(t[a],.94).lerp(o[e].clone().lerp(o[a],.94),.75),t[e].clone().lerp(t[a],.06).lerp(o[e].clone().lerp(o[a],.06),.75)],n,r.lampTint??.6,.004)}if(r.style===`bay`){Ze(e,o,n,r.h);return}if(r.style===`vent`){Qe(e,o,n,r.h);return}i.use(r.kind,r.tint);let s=Xe(i,o,n,r.h);if(r.style===`double`){let t=s[1].distanceTo(s[0]),a=s[3].distanceTo(s[0]),o=t*(.12+e.rand()*.1),c=a*(.14+e.rand()*.1),l=Ye(s,[c,o,c,o]);i.use(r.kind,r.tint*(r.kind===k?.94:1.12)),s=Xe(i,l,n,r.h*.6)}r.decal&&W(e.decals,s,n,r.kind,r.decal)}function G(e,t,n){let{hull:r,rand:i}=e;r.use(n.base??Ee,1),r.loft(t,n.caps??[!1,!1]);let a=t[0].length,s=t.length-1,c=t.map(F);for(let r=0;r<s;r++){let l=t[r],u=t[r+1],d=c[r].clone().add(c[r+1]).multiplyScalar(.5);for(let t=0;t<a;t++){let c=(t+1)%a,f=(l[t].distanceTo(u[t])+l[c].distanceTo(u[c]))/2,p=(l[t].distanceTo(l[c])+u[t].distanceTo(u[c]))/2;if(f<.05||p<.05)continue;let m=Math.max(1,Math.round(f/n.along)),h=Math.max(1,Math.ceil(p/n.across-.2)),g=e=>{let t=[0];for(let n=1;n<e;n++)t.push((n+(i()-.5)*.45)/e);return t.push(1),t},_=g(m),v=g(h),y=(e,n)=>l[t].clone().lerp(l[c],n).lerp(u[t].clone().lerp(u[c],n),e);for(let i=0;i<m;i++)for(let a=0;a<h;a++){let c=[y(_[i],v[a]),y(_[i+1],v[a]),y(_[i+1],v[a+1]),y(_[i],v[a+1])],l=F(c),u=new o().crossVectors(c[2].clone().sub(c[0]),c[3].clone().sub(c[1])).normalize();u.dot(l.clone().sub(d))<0&&u.negate(),$e(e,c,u,n.paint({c:l,n:u,t:(r+(_[i]+_[i+1])/2)/s,u:(v[a]+v[a+1])/2,span:r,edge:t,len:f*(_[i+1]-_[i]),wid:p*(v[a+1]-v[a])}))}}}}function K(e,t,n={}){let r=e(),i=n.lamps??.07,a=t.len>.28&&e()<i?e()<.5?0:2:void 0,o=t.n.y;if(o>.45){let t=e()<(n.light??.78);return{style:r<.15?`double`:r<.15+(n.bays??.05)?`bay`:`plate`,kind:t?k:O,tint:t?e()<.12?.62:.8+e()*.22:.9+e()*.3,h:.045+e()*.02,lamp:a}}if(o>-.45){let t=e()<(n.light??.2);return{style:r<.16?`double`:r<.16+(n.bays??.09)?`bay`:r<.3?`vent`:`plate`,kind:t?k:O,tint:t?.72+e()*.16:.85+e()*.35,h:.04+e()*.025,lamp:a}}return{style:r<.1?`double`:r<.1+(n.bays??.14)?`bay`:r<.32?`vent`:`plate`,kind:O,tint:.8+e()*.35,h:.04+e()*.02,lamp:a!==void 0&&e()<.2?a:void 0}}var et=(e,t,n,r,i)=>e.x>t&&e.x<n&&Math.abs(e.z)>r&&Math.abs(e.z)<i;function tt(e,t,n,r,i,a){let o=i*1.7;e.use(De,.95),e.loft([z(a,n,r,i*1.28),z(t+.06,n,r,i*1.28),z(t,n,r,i*1.2)],[!1,!1]);let s=z(t,n,r,i*1.2),c=z(t,n,r,i*1.04);e.use(A,.85);for(let t=0;t<8;t++)e.quadN(s[t],s[(t+1)%8],c[(t+1)%8],c[t],P);let l=[[0,1.04,.05],[.3,.98,.22],[.62,.9,.5],[1,.84,.95]];e.use(Oe);for(let a=0;a<l.length-1;a++){let[s,c,u]=l[a],[d,f,p]=l[a+1],m=z(t+o*s,n,r,i*c),h=z(t+o*d,n,r,i*f),g=M(t+o*(s+d)*.5,n,r);for(let t=0;t<8;t++){let n=(t+1)%8;e.tri(m[t],m[n],h[n],g,!0,u),e.tri(m[t],h[n],h[t],g,!0,(u+p)/2)}}e.use(A,.45);for(let[a,s]of[[.3,.98],[.62,.9]]){let c=t+o*a,l=z(c,n,r,i*s),u=z(c,n,r,i*(s-.13));for(let t=0;t<8;t++)e.quadN(l[t],l[(t+1)%8],u[(t+1)%8],u[t],P)}let u=t+o,d=z(u,n,r,i*.84),f=z(u,n,r,i*.42);e.use(Oe);for(let t=0;t<8;t++)e.quadN(d[t],d[(t+1)%8],f[(t+1)%8],f[t],P,1);e.use(ke);let p=M(u,n,r);for(let t=0;t<8;t++)e.triN(p,f[t],f[(t+1)%8],P);return{at:M(t,n,r),r:i}}function nt(e,t,n,r=.07){let i=n.clone().normalize(),a=Math.abs(i.y)<.9?new o().crossVectors(i,N).normalize():M(1,0,0),s=new o().crossVectors(i,a);e.use(De,.9);let c=F(V(e,[[-r,-r*.6],[r,-r*.6],[r,r*.6],[-r,r*.6]],H(t,a,s),i,r*.6,r*.15,.04));for(let t of[-1,1]){let n=c.clone().addScaledVector(a,t*r*.45),o=(e,t)=>n.clone().addScaledVector(a,e*r*.26).addScaledVector(s,t*r*.3);U(e,[o(-1,-1),o(1,-1),o(1,1),o(-1,1)],i,.25,.003)}}function rt(e,t,n){e.use(A,.7),V(e,(e=>z(0,0,0,e).map(e=>[e.y,e.z]))(n),H(t,M(1,0,0),M(0,0,1)),N,n*.3,n*.1,.03),e.use(O,1.25);let r=t.y+n*.25;Ve(e,[[t.x-n*.9,r,r+n*.75,n*.7,t.z],[t.x+n*.45,r,r+n*.75,n*.7,t.z],[t.x+n*.95,r,r+n*.4,n*.5,t.z]],n*.12),e.use(A,1);for(let i of[-.28,.28]){let a=r+n*.42;B(e,M(t.x+n*.8,a,t.z+i*n),M(t.x+n*3.2,a,t.z+i*n),n*.09,6)}e.use(j,.5),R(e,t.x+n*.46,t.x+n*.62,r+n*.52,r+n*.62,n*.5,n*.4,t.z,.004)}var it=[[-5.45,.84,-.88,.98,.52,.56,.3,.26],[-5.05,.88,-.92,1,.52,.58,.31,.26],[-3.2,1,-1,1.06,.54,.62,.34,.28],[-.6,1.04,-1.02,1.08,.54,.62,.34,.28],[1.6,1.06,-1.02,1.08,.52,.62,.36,.28],[2.7,1.08,-1.04,1.08,.46,.62,.4,.3],[3.8,1.04,-1.04,1.06,.34,.6,.46,.32],[4.9,.88,-1,1,.26,.54,.46,.34],[5.6,.68,-.92,.9,.2,.46,.4,.34],[6.1,.46,-.8,.78,.16,.38,.3,.3]],q=e=>I(it,e),at=e=>q(e)[0];function ot(e){let[t,n,r,i,a,o,s]=q(e);return L(e,[[t,i],[t,-i],[t-o,-r],[n+s,-r],[n,-a],[n,a],[n+s,r],[t-o,r]])}var st=[[-3.9,.8,1.5,.76,.48],[-3.5,.8,1.86,.82,.54],[-.3,.8,1.96,.86,.58],[.8,.8,1.88,.82,.52],[1.5,.8,1.36,.68,.4]],J=e=>I(st,e);function ct(e){let[t,n,r,i]=J(e);return L(e,[[n,i],[n,-i],[n-.2,-r],[t,-r],[t,r],[n-.2,r]])}var lt=[[-5.35,.6,2.86,.92,-.92],[-4.95,.6,2.94,.98,-.98],[-4.4,.6,3,1,-1.02],[-2.4,.6,3.06,1.02,-1.04],[-.4,.6,3.04,1.02,-1.04],[1.2,.6,2.86,.98,-1],[2.1,.6,2.3,.88,-.9],[2.75,.6,1.24,.66,-.66]],ut=e=>I(lt,e);function dt(e,t,n){let[r,i,a,o]=ut(e),s=n??r,c=Math.min(.44,(i-r)*.3),l=Math.min(.38,(i-r)*.26),u=1-Math.SQRT1_2;return L(e,[[a,t*s],[a,t*(i-c)],[a-c*u,t*(i-c*u)],[a-c,t*i],[o+l,t*i],[o+l*u,t*(i-l*u)],[o,t*(i-l)],[o,t*s]])}function ft(e,t,n,r,i,a){let o=[M(0,1,0),M(0,.924,.383*t),M(0,.707,.707*t),M(0,.383,.924*t),M(0,0,t)],s=[0,.15,.4,.62,1],c=(e,n)=>{let r=dt(e,t);return n===0?r[0].clone().lerp(r[1],.9):n===4?r[3].clone().lerp(r[4],.5):r[n].clone()},l=(e,t,i)=>c(n+(r-n)*e-a*s[t],t).addScaledVector(o[t],i),u=Math.max(1,Math.ceil((r-n)/.5)),d=.035/(r-n),f=Array.from({length:u+1},(e,t)=>t/u),p=f.map((e,t)=>t===0?d:t===u?1-d:e);for(let n=0;n<u;n++){for(let t=0;t<4;t++)e.quadN(l(p[n],t,i),l(p[n+1],t,i),l(p[n+1],t+1,i),l(p[n],t+1,i),o[t].clone().add(o[t+1]));e.quadN(l(f[n],0,-.01),l(f[n+1],0,-.01),l(p[n+1],0,i),l(p[n],0,i),M(0,.3,-t)),e.quadN(l(f[n],4,-.01),l(f[n+1],4,-.01),l(p[n+1],4,i),l(p[n],4,i),M(0,-1,.3*t))}for(let[t,n,r]of[[1,1-d,M(1,0,0)],[0,d,M(-1,0,0)]])for(let a=0;a<4;a++)e.quadN(l(t,a,-.01),l(t,a+1,-.01),l(n,a+1,i),l(n,a,i),r);let m=(e,t)=>l(e,3,i+.004).lerp(l(e,4,i+.004),t);U(e,[m(.06,.86),m(.94,.86),m(.94,.95),m(.06,.95)],o[3].clone().add(o[4]),.8,0)}var pt=[[-4.3,.95,2.5,1.2],[-1.1,.95,2.64,1.24],[.6,.95,2.4,1.18],[1.5,.95,1.7,1.06]],mt=e=>I(pt,e);function ht(e,t){let[n,r,i]=mt(e);return L(e,[[i,t*(n+.1)],[i,t*(r-.14)],[i-.12,t*r],[.92,t*(r+.04)],[.92,t*n],[i-.1,t*n]])}var gt=[[2.85,-1,-4.65,-.02,.62],[3.85,-2.2,-5.1,.02,.54],[4.6,-3.2,-5.55,.06,.46]];function _t(e,t,n=1){let[r,i,a,o]=I(gt,e),s=o*n,c=r-i;return[M(r,a+s*.15,t*e),M(r-.08*c,a+s/2,t*e),M(i+.05*c,a+s/2,t*e),M(i,a+s*.2,t*e),M(i+.04*c,a-s/2,t*e),M(r-.1*c,a-s/2,t*e)]}var vt=[[-5.2,-.78,-1.2,.4],[-3.8,-.84,-1.32,.54],[1.4,-.86,-1.36,.56],[3.4,-.86,-1.3,.52],[4.8,-.82,-1.22,.46],[5.75,-.68,-1.06,.38]];function yt(e){let[t,n,r]=I(vt,e);return L(e,[[t,r],[t,-r],[n+.08,-r],[n,-r+.1],[n,r-.1],[n+.08,r]])}var Y={style:`skip`,kind:0,tint:0,h:0};function bt(e,t){let n=new w().setFromPoints(e),r=n.getCenter(new o),i=n.getSize(new o).multiplyScalar(.5),a=(i.y-t)/i.y,s=(i.z-t)/i.z;return e.map(e=>M(e.x,r.y+(e.y-r.y)*a,r.z+(e.z-r.z)*s))}function xt(e,t,n,r,i){let a=e.hull;G(e,[t,n],{along:.5,across:.6,paint:i});let o=bt(t,r).map(e=>e.setX(e.x+.02)),s=bt(n,r);a.use(Ee,.22),a.loft([o,s],[!1,!1],!0),a.use(A,.8);let c=n.length;for(let e=0;e<c;e++)a.quadN(n[e],n[(e+1)%c],s[(e+1)%c],s[e],P);return[n,s]}function St(e,t,n,r,i,a,o=.85){let{hull:s,rand:c}=e,l=(e,t)=>M(e,a(e),t);for(let e of[1,-1]){let u=t;for(;u<n-.2;){let t=Math.min(n,u+.45+c()*.4),d=c()<o;s.use(d?k:O,d?c()<.12?.64:.8+c()*.2:1.1);let f=Math.min(i(u),i(t))-.03,p=(u+t)/2,m=M(-(a(p+.05)-a(p-.05))/.1,1,0).normalize(),h=V(s,[[u,e*r],[t,e*r],[t,e*f],[u,e*f]],l,m,.05,.016);c()<.25&&(s.use(d?k:O,d?.84:1.2),Xe(s,Ye(h,[.05,.08,.05,.08]),m,.03)),u=t+.045}}}function Ct(e,t,n,r,i,a){let s=n.clone().sub(t),c=s.length();s.divideScalar(c);let l=new o().crossVectors(r,s).normalize();V(e,[[-i*.3,-i/2],[c+i*.3,-i/2],[c+i*.3,i/2],[-i*.3,i/2]],H(t,s,l),r,a,Math.min(.012,a*.3),.01)}function wt(e,t,n,r,i,a,o){let s=e=>z(0,0,0,a*e).map(e=>[e.y,e.z]);for(let a of t){let t=H(a,n,r);e.use(A,.95),V(e,s(1),t,i,.022,.008,.01),e.use(Ee,1),V(e,s(.78),t,i,.025,0,.004),e.use(Oe,o),V(e,s(.45),t,i,.027,0,.002)}}async function Tt(e,t){let n=new ze(e),r=new ze(e,!0),i={hull:n,decals:r,rand:e},a=[],s=[1,-1];G(i,[-4.9,-3.2,-.6,1.6,2.7].map(ot),{along:.8,across:.6,caps:[!0,!1],paint:t=>{let n=t.edge;return t.c.x<1.6||n===0||n===2||n===4||n===6?Y:n===3||n===5?{...K(e,t),style:`plate`}:K(e,t,{lamps:.08,light:.8})}});let[l,u]=xt(i,ot(-4.9),ot(-5.45),.08,t=>t.edge===0||t.edge===2||t.edge===6?Y:K(e,t,{lamps:.1,light:.8}));W(r,[l[0],l[1],u[1],u[0]],P,A,{cell:`hazard`,paint:1,right:M(0,0,1),fill:.86,stretch:1.3}),G(i,[2.7,3.8,4.9,5.6,6.1].map(ot),{along:.75,across:.5,caps:[!1,!0],paint:t=>{let n=t.edge;return n===0||n===1||n===7||n===2||n===6?Y:{...K(e,t,{bays:.06}),style:e()<.2?`vent`:`plate`}}}),await t(),n.use(A,.8),n.loft([2.6,3.2,3.8,4.35,4.9,5.25,5.6,6.02].map(e=>L(e,Be(at(e)+.05,0,.09,Math.min(.07,q(e)[3]*.45),.016))));for(let e of s){let t=t=>M(t,q(t)[0],e*q(t)[3]),i=t=>M(t,q(t)[0]-q(t)[5],e*q(t)[2]),a=(e,n)=>t(e).lerp(i(e),n),s=e=>{let n=i(e).sub(t(e)),r=new o().crossVectors(n,M(1,0,0)).normalize();return r.y<0?r.negate():r},c=.34;[[2.76,3.68,.11,1],[3.74,4.56,.095,.92],[4.62,5.36,.08,.98],[5.42,6.12,.065,.9]].forEach(([e,t,r,i],o)=>{n.use(o===2?O:k,o===2?1.25:i);let l=V(n,[[e,.05],[t,.05],[t-c,1.07],[e-c,1.07]],a,s((e+t)/2-c/2),r,.03,.05);(o===0||o===1)&&(n.use(k,.82),Xe(n,Ye(l,[.08,.12,.12,.12]),s((e+t)/2),.04)),U(n,[a(e+.03,.012),a(t-.03,.012),a(t-.03,.036),a(e+.03,.036)],s((e+t)/2),.9,.012)});for(let e of[3.71,5.39]){let t=s(e-c/2);U(n,[a(e-.014,.12),a(e+.014,.12),a(e+.014-c*.76,.88),a(e-.014-c*.76,.88)],t,.75,.012)}let l=e=>q(e)[2],u=e=>q(e)[1]+q(e)[6]+.035,d=e=>q(e)[0]-q(e)[5]-.035,f=(t,n)=>M(t,n,e*l(t)),p=t=>M(-(l(t+.05)-l(t-.05))/.1,0,e).normalize();[[2.78,3.6],[3.7,4.45],[4.55,5.2],[5.3,6.02]].forEach(([t,i],a)=>{let o=p((t+i)/2),s=a===1||a===3;n.use(s?O:k,s?1.25:.88+a*.03);let c=a===1?[[t,u(t)],[i,u(i)],[i,d(i)],[t,d(t)]]:[[t,u(t)],[i,u(i)],[i,d(i)-.16],[i-.16,d(i)],[t,d(t)]],l=V(n,c,f,o,a===1?.075:.09,.024);a===1&&(W(r,l,o,O,{cell:`number`,paint:.8,right:M(e,0,0),fill:.62,offset:.08}),W(r,l,o,O,{cell:`code`,paint:.7,right:M(e,0,0),fill:.5,offset:-.3}))});for(let e of[3.65,4.5,5.25]){let t=p(e);U(n,[f(e-.016,u(e)+.07),f(e+.016,u(e)+.07),f(e+.016,d(e)-.07),f(e-.016,d(e)-.07)],t,.8,.01)}let m=(e,t)=>M(6.1+(.75-Math.abs(e))*.12,t,e);n.use(O,1.3);let h=V(n,[[e*.16,-.54],[e*.72,-.54],[e*.72,.1],[e*.16,.2]],m,M(1,0,e*.12).normalize(),.06,.02,.1);n.use(O,1.1),Xe(n,Ye(h,[.07,.07,.07,.07]),M(1,0,e*.12).normalize(),.03),U(n,[M(6.1,-.5,e*.1),M(6.1,-.5,e*.135),M(6.1,.3,e*.135),M(6.1,.3,e*.1)],M(1,0,0),.95,.012),U(n,[M(6.06,-.87,e*.16),M(6.06,-.87,e*.36),M(6.06,-.84,e*.36),M(6.06,-.84,e*.16)],M(1,0,0),.7,.006),nt(n,M(5.2,-1.12,e*.47),M(0,-.4,e),.05)}n.use(k,.95),V(n,[[-.08,-.66],[.08,-.66],[.08,.38],[0,.44],[-.08,.38]],(e,t)=>M(6.1,t,e),M(1,0,0),.2,.03,.05),n.use(O,1.15),R(n,5.5,6.06,-.98,-.72,.5,.44,0,.04),await t(),G(i,[-3.9,-3.5,-.3,.8,1.5].map(ct),{along:.75,across:.5,caps:[!0,!0],paint:t=>{let n=t.edge;if(n===0||n===3)return Y;if(n===1||n===5)return{style:e()<.2?`double`:`plate`,kind:k,tint:.86+e()*.12,h:.045,lamp:e()<.12?0:void 0};if(t.c.x>-3.45&&t.c.x<.62)return Y;let r=K(e,t,{light:.3,bays:.12});return r.style===`plate`&&e()<.2&&(r.lamp=e()<.5?1:3,r.lampTint=.7),r}});for(let e of s){let t=e=>J(e)[2],i=(n,r)=>M(n,r,e*t(n)),a=n=>M(-(t(n+.05)-t(n-.05))/.1,0,e).normalize(),o=e=>J(e)[1]-.23;[[-3.4,-2.2],[-2.1,-.62],[-.52,.58]].forEach(([t,s],c)=>{let l=a((t+s)/2);n.use(k,c===1?.88:.8);let u=V(n,[[t,1.04],[s,1.04],[s,o(s)],[t,o(t)]],i,l,.06,.02);c===1&&W(r,u,l,k,{cell:`number`,paint:.85,right:M(e,0,0),fill:.6,offset:.12}),c===0&&W(r,u,l,k,{cell:`emblem`,paint:.8,right:M(e,0,0),fill:.5,offset:.12})});for(let e of[-2.15,-.57]){let t=a(e);U(n,[i(e-.016,1.12),i(e+.016,1.12),i(e+.016,o(e)-.06),i(e-.016,o(e)-.06)],t,.8,.008)}}await t(),St(i,-3.86,-.5,.1,e=>J(e)[3],e=>J(e)[1]);for(let e=-3.4;e<-.7;e+=.55){let t=J(e)[1],r=J(e+.32)[1];U(n,[M(e,t,-.02),M(e+.32,r,-.02),M(e+.32,r,.02),M(e,t,.02)],N,.65,.004)}n.use(O,1.25);let d=Ve(n,[[-.45,1.88,2.14,.46],[.85,1.82,2.18,.44],[1.45,1.38,1.86,.28]],.04);{let e=d[1],t=d[2],r=(e,t,r,i,a,s,c,l)=>{let u=(r+1)%e.length,d=(n,i)=>e[r].clone().lerp(e[u],i).lerp(t[r].clone().lerp(t[u],i),n),f=[d(i,s),d(a,s),d(a,c),d(i,c)],p=new o().crossVectors(f[2].clone().sub(f[0]),f[3].clone().sub(f[1])).normalize();p.dot(F(f).sub(F(e).add(F(t)).multiplyScalar(.5)))<0&&p.negate(),U(n,f,p,l,.004)};r(e,t,0,.42,.68,.06,.94,.3),r(e,t,2,.05,.75,.55,.72,.26),r(e,t,6,.05,.75,.28,.45,.26),r(d[0],e,2,.5,.95,.55,.72,.26),r(d[0],e,6,.5,.95,.28,.45,.26)}n.use(k,.95),R(n,-.4,.66,2.12,2.23,.32,.27,0,.03),n.use(A,.9),R(n,-.15,.4,2.21,2.33,.15,.13,0,.03),n.use(A,1.1),B(n,M(.15,2.31,0),M(.15,2.72,0),.02,6),B(n,M(-.05,2.31,.09),M(-.05,2.54,.09),.012,5),B(n,M(-.05,2.31,-.09),M(-.05,2.48,-.09),.012,5),n.use(j,1.6),R(n,.12,.18,2.72,2.76,.03,.03,0,.008),n.use(A,.85),V(n,z(0,0,0,.1).map(e=>[e.y,e.z]),H(M(.5,2.27,-.2),M(.3,.95,0).normalize(),M(0,0,1)),M(.95,-.3,0).normalize(),.03,.01,.02);for(let e of s){let t=(t,n)=>M(t,n,e*.5);n.use(k,.9),V(n,[[-.05,1.86],[-.84,1.86],[-1.04,2.6],[-.58,2.66]],t,M(0,0,1),.05,.02,.05),n.use(O,1.3),V(n,[[-.28,2],[-.74,2],[-.88,2.44],[-.62,2.47]],t,M(0,0,1),.068,.01,.068);for(let t of[1,-1]){let r=(n,r)=>M(-.05+(-.58+.05)*n-r,1.86+.8*n,e*.5+t*.051);U(n,[r(.2,.05),r(.9,.05),r(.9,.085),r(.2,.085)],M(0,0,t),.75,.002)}n.use(j,1.05),R(n,-.76,-.62,2.62,2.68,.035,.035,e*.5,.008)}St(i,1.54,2.7,.05,e=>q(e)[3],at);{let e=2.05,t=at(e)+.05;n.use(A,.75),V(n,z(0,0,0,.24).map(e=>[e.y,e.z]),H(M(e,t,0),M(1,0,0),M(0,0,1)),N,.06,.02,.02),n.use(O,1.2),Ve(n,[[1.8299999999999998,t+.05,t+.2,.18],[2.19,t+.05,t+.2,.18],[2.3499999999999996,t+.05,t+.12,.12]],.03),n.use(A,1);for(let e of[-.07,.07])B(n,M(2.25,t+.14,e),M(2.9099999999999997,t+.14,e),.024,6),B(n,M(2.83,t+.14,e),M(2.9299999999999997,t+.14,e),.032,6)}G(i,[[-5.52,.8,1.34,.56],[-5.38,.8,1.42,.6],[-4.2,.8,1.42,.6],[-3.92,.8,1.3,.52]].map(([e,t,n,r])=>L(e,Be((t+n)/2,0,(n-t)/2,r,.08))),{along:.6,across:.45,caps:[!0,!0],paint:t=>{let n=t.edge;return n===4?Y:n===0?{style:e()<.25?`double`:`plate`,kind:k,tint:.9+e()*.2,h:.045,lamp:e()<.15?0:void 0}:K(e,t,{light:.25,lamps:.12})}});{let e=(e,t)=>M(-5.52,t,e);n.use(k,1.6),W(r,V(n,[[-.48,.86],[.48,.86],[.48,1.26],[-.48,1.26]],e,P,.05,.016,.03),P,k,{cell:`number`,paint:.12,right:M(0,0,1),fill:.62}),U(n,[e(-.44,1.29),e(.44,1.29),e(.44,1.315),e(-.44,1.315)],P,.9,.006)}{let e=[[-3.62,1.72],[-4.08,1.36],[-5.3,1.36],[-5.52,2.95],[-4.76,3.02]],t=(e,t)=>M(e,t,0);n.use(O,1.1),V(n,e,t,M(0,0,1),.085,.03,.085),n.use(k,1.1),V(n,[[-4.25,1.6],[-5.2,1.52],[-5.36,2.6],[-4.72,2.64]],t,M(0,0,1),.11,.02,.11);for(let e of s){let t=(t,n)=>M(-3.62+(-4.76+3.62)*t-n,1.72+1.3*t,e*.086);U(n,[t(.08,.06),t(.92,.06),t(.92,.1),t(.08,.1)],M(0,0,e),.9,.003)}n.use(j,1.6),R(n,-5.22,-5,2.96,3.02,.04,.04,0,.01)}await t();for(let a of s){let s=t=>{let n=t.edge,r=t.c;if(n===7||n===0&&r.x<1.5||n===3&&r.x>-2.85&&r.x<-.8||(n===1||n===2)&&r.x>-4.4&&r.x<.9||n===3&&r.y>-.05&&r.x>-4.7&&r.x<.6)return Y;let i=K(e,t,{lamps:.08,light:n<=2||n===3&&r.y>.25?.85:.06,bays:.08});return t.n.x>.35&&r.y<.3&&i.kind===k&&(i.kind=O,i.tint=1+e()*.25),n===3&&i.style===`plate`&&t.len>.35&&e()<.08&&(i.decal={cell:e()<.5?`maint`:`vent`,paint:.75,fill:.7}),n===3&&i.style===`plate`&&e()<.15&&(i.lamp=e()<.5?1:3,i.lampTint=.7),i};G(i,[-4.8,-4.4,-2.4,-.4,1.2,2.1,2.75].map(e=>dt(e,a)),{along:.8,across:.6,caps:[!0,!0],paint:s});let[c,l]=xt(i,dt(-4.8,a,.985),dt(-5.35,a,.985),.07,e=>e.edge===7?Y:e.edge===0?{style:`plate`,kind:k,tint:.88,h:.05}:s(e));W(r,[c[0],c[1],l[1],l[0]],P,A,{cell:`hazard`,paint:1,right:M(0,0,1),fill:.86,stretch:1.3}),await t();{let e=e=>ut(e)[1],t=(t,n)=>M(t,n,a*e(t)),i=M(-(e(-1.75)-e(-1.85))/.1,0,a).normalize();n.use(k,.82);let o=V(n,[[-2.8,-.6],[-.85,-.6],[-.85,-.1],[-2.8,-.1]],t,i,.055,.018);W(r,o,i,k,{cell:`code`,paint:.85,right:M(a,0,0),fill:.5,offset:.1}),W(r,o,i,k,{cell:`serial`,paint:.7,right:M(a,0,0),fill:.86,offset:-.32})}{[[-4.3,-2.7,.92],[-2.6,-.95,.8],[-.85,.85,.9]].forEach(([e,t,r])=>{n.use(k,r),ft(n,a,e,t,.075,.35)});let e=(e,t)=>dt(-.9-.35*[0,.15,.4,.62,1][e]+t,a)[e].clone().addScaledVector([M(0,1,0),M(0,.924,.383*a),M(0,.707,.707*a),M(0,.383,.924*a)][e],.012);for(let t of[1,2])U(n,[e(t,-.016),e(t,.016),e(t+1,.016),e(t+1,-.016)],M(0,.6,.6*a),.85,0)}{let e=M(.8,.05,a*.6).normalize(),t=new o().crossVectors(N,e).normalize(),r=new o().crossVectors(e,t).normalize(),i=M(2.4,0,a*1.86);n.use(O,1.3),V(n,[[-.56,-.5],[.56,-.5],[.56,.4],[-.56,.4]],H(i,t,r),e,.14,.04,.26);let s=H(i.clone().addScaledVector(e,.14),t,r),c=[];for(let e of[-.36,-.12,.12,.36])for(let t of[.2,-.07])c.push(s(e,t));wt(n,c,t,r,e,.098,1),U(n,[s(-.46,-.4),s(.46,-.4),s(.46,-.35),s(-.46,-.35)],e,.9,.006)}G(i,[-4.3,-1.1,.6,1.5].map(e=>ht(e,a)),{along:.8,across:.55,caps:[!0,!0],paint:t=>{let n=t.edge,r=t.c;return n===3||n===0&&(et(r,-3.15,-1.8,1.15,2.1)||et(r,-1.35,-.4,1.1,2.15))?Y:n===0?{style:e()<.22?`double`:`plate`,kind:k,tint:.86+e()*.14,h:.05,lamp:e()<.1?0:void 0}:K(e,t,{light:n===4?.1:.5,lamps:.1})}});{let e=e=>mt(e)[2],t=(t,n)=>M(t,e(t),a*n),i=M(-(e(-2.3)-e(-2.5))/.2,1,0).normalize();n.use(k,.95),W(r,V(n,[[-3.1,1.2],[-1.85,1.2],[-1.85,2.05],[-3.1,2.05]],t,i,.05,.016),i,k,{cell:`emblem`,paint:.8,right:M(0,0,1),fill:.82}),n.use(A,.65),V(n,[[-1.3,1.15],[-.45,1.15],[-.45,2.1],[-1.3,2.1]],t,i,.04,.015);let o=[];for(let e of[-1.08,-.67])for(let n of[1.31,1.52,1.73,1.94])o.push(t(e,n).addScaledVector(i,.04));wt(n,o,M(1,0,0),M(0,0,a),i,.085,.85)}n.use(A,.8);for(let e=0;e<9;e++){let t=-4.78+e*.062;R(n,t,t+.026,.94,1.16,.72,.72,a*1.7,.006)}n.use(O,1.1);for(let e of[.98,2.42])R(n,-4.8,-4.24,.94,1.19,.035,.035,a*e,.012);G(i,[[-4.3,-1.08,.36],[-3.9,-1.2,.5],[-.5,-1.2,.5],[-.1,-1.08,.36]].map(([e,t,n])=>L(e,Be((t-.98)/2,a*1.85,(-.98-t)/2,n,.05))),{along:.75,across:.45,caps:[!0,!0],paint:t=>t.edge===0?Y:K(e,t,{lamps:.05})});for(let[e,t]of[[-3.45,-2.55],[-1.75,-.85]]){let r=(e,t)=>M(e,-1.2,a*t),i=M(0,-1,0);n.use(Ee,1),V(n,[[e,1.55],[t,1.55],[t,2.15],[e,2.15]],r,i,.012,.004,.01),n.use(Oe,.5),n.quadN(r(e+.05,1.6).setY(-1.215),r(t-.05,1.6).setY(-1.215),r(t-.05,2.1).setY(-1.215),r(e+.05,2.1).setY(-1.215),i),n.use(A,.7);for(let r=e+.08;r<t-.05;r+=.11)R(n,r,r+.03,-1.25,-1.2,.25,.25,a*1.85,.004)}nt(n,M(.4,ut(.4)[3]-.01,a*1.6),M(0,-1,0),.06),nt(n,M(-4.55,ut(-4.55)[3]-.01,a*2.45),M(0,-1,0),.06),await t()}for(let t of s){let r=t>0?0:1;G(i,[2.85,3.85,4.6].map(e=>_t(e,t)),{along:.65,across:.6,caps:[!1,!1],paint:t=>{let n=t.edge;if(n===1){let n=e(),i={style:n<.28?`double`:n<.34?`bay`:`plate`,kind:e()<.82?k:O,tint:e()<.15?.64:.8+e()*.2,h:.05};return t.span===0&&t.u>.5&&t.u<.85&&!Et[r]&&(Et[r]=!0,i.style=`plate`,i.kind=k,i.decal={cell:`nostep`,paint:.75,right:M(0,0,1),fill:.5}),i}return n===2?{style:`plate`,kind:O,tint:1.05,h:.035,lamp:t.span===1||e()<.5?0:void 0,lampTint:.6}:K(e,t,{lamps:.04})}});let s=[1.25,1.45,1.45,1.25];G(i,[4.5,4.58,5.1,5.18].map((e,n)=>{let r=_t(4.6,t,s[n]).map(n=>n.setZ(t*e));return r[0].x+=.25,r[1].x+=.16,r[3].x-=.2,r}),{along:.6,across:.4,caps:[!0,!0],base:O,paint:t=>t.span===1?{...K(e,t,{lamps:0,bays:0}),style:`plate`}:Y});{let e=.26,r=M(0,Math.cos(e),t*Math.sin(e)),i=new o().crossVectors(M(1,0,0),r),a=H(M(0,.36,t*4.84),M(1,0,0),r);n.use(O,1.15),V(n,[[-4.15,0],[-5.45,0],[-5.74,.82],[-5.22,.86]],a,i,.035,.012,.035),n.use(k,.88),V(n,[[-4.6,.1],[-5.36,.1],[-5.52,.62],[-5.18,.64]],a,i,.05,.01,.05);for(let e of[1,-1]){let t=(t,n)=>a(-4.15+(-5.22+4.15)*t-n,.86*t).addScaledVector(i,e*.036);U(n,[t(.15,.04),t(.9,.04),t(.9,.07),t(.15,.07)],i.clone().multiplyScalar(e),.75,.002)}n.use(j,1),V(n,[[-5.48,.84],[-5.34,.85],[-5.34,.9],[-5.48,.89]],a,i,.02,0,.02)}U(n,[M(-5.3,-.04,t*5.185),M(-4,-.04,t*5.185),M(-4,-.01,t*5.185),M(-5.3,-.01,t*5.185)],M(0,0,t),.6,.004),nt(n,M(-2.96,0,t*4.84),M(1,0,0),.05);for(let e of[4.72,4.96])a.push(tt(n,-5.8,.05,t*e,.05,-5.5))}await t(),G(i,[-5.2,-3.8,-1.2,1.4,3.4,4.8,5.75].map(yt),{along:.8,across:.55,caps:[!0,!0],paint:t=>{let n=t.edge;if(n===0||n===3&&t.c.x>-3.15&&t.c.x<.75)return Y;let r=K(e,t,{lamps:.03});return(n===1||n===5)&&r.style===`plate`&&t.len>.4&&e()<.12&&(r.decal={cell:e()<.5?`warn`:`arrows`,paint:.75,fill:.5}),r}}),G(i,[[-3.5,-1.42,.28],[-3.1,-1.52,.4],[.7,-1.52,.4],[1.1,-1.42,.28]].map(([e,t,n])=>L(e,Be((t-1.3)/2,0,(-1.3-t)/2,n,.05))),{along:.75,across:.45,caps:[!0,!0],paint:t=>t.edge===0||t.edge===4&&t.c.x>-2.75&&t.c.x<-.35?Y:K(e,t,{lamps:.04})});{let e=(e,t)=>M(e,-1.52,t),t=M(0,-1,0);n.use(O,1.25);let i=V(n,[[-2.7,-.32],[-.4,-.32],[-.4,.32],[-2.7,.32]],e,t,.03,.012);for(let e of[-.26,.26])W(r,[M(-2.62,0,e-.03),M(-.48,0,e-.03),M(-.48,0,e+.03),M(-2.62,0,e+.03)].map(e=>e.setY(i[0].y)),t,O,{cell:`hazard`,paint:1,right:M(1,0,0),fill:1,stretch:2.2});for(let[e,t]of[[-2.6,-.22],[-2.6,.22],[-.5,-.22],[-.5,.22]])n.use(j,.6),R(n,e-.02,e+.02,i[0].y-.012,i[0].y+.003,.02,.02,t,.004);let a=e=>I(vt,e)[1];for(let e of s)for(let t=-4.6;t<4.4;t+=1.8){if(t>-3.4&&t<1)continue;let r=a(t)+.04,i=e*(I(vt,t)[2]+.002);U(n,[M(t,r-.012,i),M(t+.5,r-.012,i),M(t+.5,r+.012,i),M(t,r+.012,i)],M(0,0,e),.45,.002)}}await t();{let e=bt(ot(-5.45),.13).map(e=>[e.z,e.y]);n.use(O,.95),V(n,e,(e,t)=>M(-5.28,t,e),P,.05,.025,.25);let t=(e,t)=>M(-5.33,t,e);n.use(O,1.25);for(let e of[.5,-.48])V(n,[[-.62,e],[.62,e],[.62,e+.05],[-.62,e+.05]],t,P,.025,.008,.01);W(r,[t(-.4,-.32),t(.4,-.32),t(.4,.4),t(-.4,.4)],P,O,{cell:`emblem`,paint:.85,right:M(0,0,1),fill:.92}),W(r,[t(-.42,-.68),t(.42,-.68),t(.42,-.6),t(-.42,-.6)],P,O,{cell:`hazard`,paint:1,right:M(0,0,1),fill:1,stretch:1.6}),n.use(A,.9);for(let e of[-.56,.56])V(n,[[e-.06,-.64],[e+.06,-.64],[e+.06,-.52],[e-.06,-.52]],t,P,.07,.015,.01);for(let e of s)U(n,[M(-5.31,-.5,e*.862),M(-5.31,-.5,e*.888),M(-5.31,.42,e*.888),M(-5.31,.42,e*.862)],P,.95,0),n.use(j,1.2),V(n,[[e*.28,.6],[e*.34,.6],[e*.34,.64],[e*.28,.64]],t,P,.01,0,.005);U(n,[M(-5.31,.722,-.4),M(-5.31,.722,.4),M(-5.31,.746,.4),M(-5.31,.746,-.4)],P,.95,0)}for(let e of s){let t=bt(dt(-5.35,e,.985),.072).map(e=>[e.z,e.y]);n.use(O,.9),V(n,t,(e,t)=>M(-4.95,t,e),P,.03,.01,.1);let i=(e,t)=>M(-4.98,t,e),o=[[1.38,.24],[1.52,.1],[2.32,.1],[2.46,.24],[2.46,.52],[2.32,.66],[1.52,.66],[1.38,.52]];n.use(A,.9),o.forEach(([t,r],a)=>{let[s,c]=o[(a+1)%o.length];Ct(n,i(e*t,r),i(e*s,c),P,.05,.22)}),n.use(Ee,1),V(n,o.map(([t,n])=>[e*t,n]),i,P,.004,0,.004);for(let t of[.25,.51])for(let r of[1.56,1.8,2.04,2.28])a.push(tt(n,-5.17,t,e*r,.07,-4.96));n.use(O,1.3),W(r,V(n,[[e*1.36,-.62],[e*2.48,-.62],[e*2.48,-.04],[e*1.36,-.04]],i,P,.06,.016,.01),P,O,{cell:`emblem`,paint:.8,right:M(0,0,1),fill:.78});for(let t of[1.3,2.54])U(n,[i(e*(t-.013),-.55),i(e*(t+.013),-.55),i(e*(t+.013),-.12),i(e*(t-.013),-.12)],P,.9,.004)}for(let e of[-.15,.15])tt(n,-5.34,-1,e,.07,-5.15);for(let e of s){let t=e=>mt(e)[2];for(let[r,i]of[[-3.62,1.62],[-.05,1.5]])rt(n,M(r,t(r)+.05,e*i),.17);n.use(A,.85);let r=t=>e*(I(vt,t)[2]+.035);B(n,M(-3.7,-1.1,r(-3.7)),M(1.3,-1.1,r(1.3)),.03,6),B(n,M(-3.5,-1.2,r(-3.5)),M(.9,-1.2,r(.9)),.022,6);let i=t=>e*(J(t)[2]+.035);B(n,M(-3.3,1.05,i(-3.3)),M(.6,1.05,i(.6)),.026,6),n.use(De,1.1);for(let t=-3.4;t<1.2;t+=.62)R(n,t,t+.06,-1.24,-1.04,.035,.035,r(t)+e*.005,.01);for(let e=-3.1;e<.5;e+=.7)R(n,e,e+.06,1,1.09,.035,.035,i(e),.01);n.use(O,1.2),Ve(n,[[-4.5,-.42,.36,.1,e*3.1],[-1.4,-.36,.3,.1,e*3.07],[-1.05,-.18,.12,.06,e*3.05]],.03),n.use(k,.85);for(let t of[-4.1,-3.15,-2.2])R(n,t,t+.55,-.3,.26,.05,.05,e*3.18,.012);n.use(A,1);for(let t of[.66,.94])B(n,M(-3,.08,e*(4.18+t)),M(-2.4,.08,e*(4.18+t)),.011,5)}{let e=I(vt,4.9)[1];n.use(A,.9),V(n,z(0,0,0,.15).map(e=>[e.y,e.z]),H(M(4.95,e,0),M(1,0,0),M(0,0,1)),M(0,-1,0),.05,.02,.02),n.use(Ee,1),V(n,z(0,0,0,.1).map(e=>[e.y,e.z]),H(M(4.95,e-.05,0),M(1,0,0),M(0,0,1)),M(0,-1,0),.04,.02,.01),n.use(j,.5),V(n,z(0,0,0,.035).map(e=>[e.y,e.z]),H(M(4.95,e-.09,0),M(1,0,0),M(0,0,1)),M(0,-1,0),.006,0,.004)}let f=e=>{let t=new te;return t.setAttribute(`position`,new c(e.pos,3)),t.setAttribute(`aMat`,new c(e.mat,3)),e.uv&&t.setAttribute(`aUv`,new c(e.uv,2)),t.computeBoundingSphere(),t};return{hull:f(n),decals:f(r),engines:a}}var Et=[!1,!1],Dt=`
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
`;async function Ot(t,n){let r=new x(512,512,{type:u,wrapS:ee,wrapT:ee,minFilter:g,magFilter:e,generateMipmaps:!0,depthBuffer:!1,anisotropy:4});return r.texture.name=`title-ship-panels`,await _e(t,r,Dt,{uLoop:{value:5}},{strips:2,pace:n}),r}var kt=`
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
`,At=`
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
      float graze = 1.0 - clamp(dot(hn, -r), 0.0, 1.0);
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

    float NdV = clamp(dot(n, V), 1e-3, 1.0);
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
    vec3 F = F0 + (1.0 - F0) * pow(1.0 - clamp(dot(H, V), 0.0, 1.0), 5.0);
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
`,jt=`
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
`,Mt=`
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
      // Clamped here, not trusted from the vertices: MSAA samples the varying past its ends, and pow() of
      // a negative is NaN, which High's bloom spread over the whole title.
      float along = clamp(vShape.x, 0.0, 1.0);
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
`;function Nt(e){let t=[],n=[],r=[],i=0;for(let a of e){for(let e=0;e<=10;e++){let r=e/10;for(let e of[-1,1])t.push(a.at.x,a.at.y,a.at.z),n.push(r,e,a.r,0)}for(let e=0;e<10;e++){let t=i+e*2;r.push(t,t+1,t+3,t,t+3,t+2)}i+=22;for(let[e,r]of[[-1,-1],[1,-1],[1,1],[-1,1]])t.push(a.at.x,a.at.y,a.at.z),n.push(e,r,a.r,1);r.push(i,i+1,i+2,i,i+2,i+3),i+=4}let a=new te;return a.setAttribute(`position`,new c(Array(t.length).fill(0),3)),a.setAttribute(`aNozzle`,new c(t,3)),a.setAttribute(`aShape`,new c(n,4)),a.setIndex(r),a}async function Pt(e,n){let i=()=>n.pace?.()??Promise.resolve(),[a,o]=await Promise.all([Ot(e,n.pace),qe()]);e.initTexture(o),Et[0]=Et[1]=!1;let s=await Tt(le(373239),i),{engines:c}=s,u=new r(.1,.38,1),d={value:1},f={value:1},p={value:je},m={value:0},h={uPanel:{value:a.texture},uMarks:{value:o},uKeyDir:{value:n.keyDir},uKeyColor:{value:new r(1,.9,.78).multiplyScalar(2.8)},uFillDir:{value:n.fillDir},uFillColor:{value:new r(.36,.5,.7)},uSunDir:{value:n.sunDir},uSunColor:{value:new r(1,.86,.7).multiplyScalar(2.2)},uBounceDir:{value:n.bounceDir},uBounceColor:{value:new r(.24,.46,.5)},uPlanetCenter:{value:n.planetCenter},uPlanetRadius:{value:n.planetRadius},uPlanetLight:{value:n.planetLight},uEngineA:{value:M(-5.5,.38,-1.92)},uEngineB:{value:M(-5.5,.38,1.92)},uEngineC:{value:M(-5.6,-.95,0)},uEngineColor:{value:u},uLampColor:{value:new r(.3,.72,1)},uPower:d,uBump:{value:.013},uDetailScale:{value:.42},uFade:m},g=new l({vertexShader:kt,fragmentShader:At,uniforms:h}),_=new S(s.hull,g);_.name=`title-ship-hull`,_.frustumCulled=!1;let v=new l({vertexShader:kt,fragmentShader:At,uniforms:h,defines:{DECAL:1},transparent:!0,depthWrite:!1,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),y=new S(s.decals,v);y.name=`title-ship-markings`,y.frustumCulled=!1,y.renderOrder=1;let b={value:0},x=new S(Nt(c),new l({vertexShader:jt,fragmentShader:Mt,uniforms:{uLength:p,uPower:f,uTime:b,uColor:{value:u},uFade:m},transparent:!0,depthWrite:!1,blending:2}));x.name=`title-ship-plumes`,x.frustumCulled=!1,x.renderOrder=5;let C=new t;C.add(_,y,x);let w=new t;return w.name=`title-ship`,w.add(C),{group:w,update(e,t){let n=e,r=1-t;C.position.set(Math.sin(n*.21)*.1*r,(Math.sin(n*.29+1.1)*.07+Math.sin(n*.11)*.05)*r,Math.sin(n*.17+2)*.12*r),C.rotation.set(Math.sin(n*.19+.4)*.022*r,Math.sin(n*.13+1.3)*.012*r,Math.sin(n*.23+2.2)*.01*r),b.value=e;let i=1+.035*Math.sin(n*11.3)+.025*Math.sin(n*17.9+1);d.value=(Ne+.6*t)*i,f.value=t*i,p.value=je*(Me+.7*t)},setFade(e){m.value=e},dispose(){a.dispose(),o.dispose(),s.hull.dispose(),s.decals.dispose(),g.dispose(),v.dispose(),x.geometry.dispose(),x.material.dispose()}}}var Ft=`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`,It=`
  precision highp float;
  uniform sampler2D tDiffuse;
  uniform vec2 uTan;
  uniform vec3 uBH;
  uniform float uRs;
  uniform float uFar;
  uniform float uReach;
  uniform vec3 uDiskX;
  uniform vec3 uDiskN;
  uniform vec3 uDiskZ;
  uniform float uDiskIn;
  uniform float uDiskOut;
  uniform float uDiskGain;
  uniform float uDiskHeat;
  uniform float uTime;
  uniform int uSteps;
  uniform vec2 uBhUv;
  uniform vec3 uShock;
  uniform vec3 uImplode;
  uniform float uFlash;
  uniform float uSwirl;
  uniform float uCA;
  uniform float uRing;
  uniform float uShift;
  uniform float uEat;
  uniform float uHaze;
  varying vec2 vUv;

  // Sine-free hash and value noise (a sine hash bands on some GPUs).
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash12(i);
    float b = hash12(i + vec2(1.0, 0.0));
    float c = hash12(i + vec2(0.0, 1.0));
    float d = hash12(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  // The scene as the sky at infinity: mirrored past its edges, so a bent ray that leaves the frame
  // still finds sky, continuous with what is beside it.
  vec3 sky(vec2 uv) {
    uv = 1.0 - abs(1.0 - mod(uv, 2.0));
    return texture2D(tDiffuse, uv).rgb;
  }

  // Ember red through gold and white to blue-white: the disk's colour by (shifted) temperature.
  vec3 heat(float t) {
    vec3 c = mix(vec3(0.5, 0.05, 0.01), vec3(1.0, 0.32, 0.05), smoothstep(0.0, 0.35, t));
    c = mix(c, vec3(1.0, 0.7, 0.3), smoothstep(0.3, 0.7, t));
    c = mix(c, vec3(1.0, 0.94, 0.84), smoothstep(0.65, 1.05, t));
    c = mix(c, vec3(0.7, 0.83, 1.0), smoothstep(1.05, 1.7, t));
    return c;
  }

  // The disk's light where a ray crosses its plane at hit (r from the centre, Rs units), the ray
  // travelling along vel (away from the camera; the light comes the other way).
  vec4 disk(vec3 hit, float r, vec3 vel) {
    float x = dot(hit, uDiskX);
    float z = dot(hit, uDiskZ);
    float ang = atan(z, x);
    // Keplerian shear: inner rings lap the outer ones, so streaks wind into spirals.
    float rot = ang + uTime * 5.0 * pow(r, -1.5);
    float lr = log(r);
    float streak = 0.5 + 0.5 * sin(rot * 3.0 + lr * 9.0);
    streak *= 0.62 + 0.38 * sin(rot * 7.0 - lr * 16.0 + 1.7);
    vec2 q = vec2(cos(rot), sin(rot)) * r;
    float n = vnoise(q * 1.6) * 0.6 + vnoise(q * 4.3 + 7.3) * 0.4;
    float dens = mix(0.15, 1.0, streak) * mix(0.35, 1.5, n);
    float edge = smoothstep(uDiskIn, uDiskIn * 1.3, r) * (1.0 - smoothstep(uDiskOut * 0.5, uDiskOut, r));
    // Thin-disk temperature, normalised: 1 just outside the inner edge, falling as r^-3/4.
    float xr = uDiskIn / r;
    float temp = pow(xr, 0.75) * pow(max(1.0 - sqrt(xr * 0.97), 0.0), 0.25) * 2.0;
    // Orbital speed (fraction of c) and the Doppler factor toward the camera, with the climb out of the well.
    float beta = clamp(sqrt(0.5 / max(r - 1.0, 0.25)), 0.0, 0.7);
    vec3 orbit = normalize(cross(uDiskN, hit));
    float cosT = dot(orbit, -normalize(vel));
    float dop = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT);
    float g = dop * sqrt(max(1.0 - 1.0 / r, 0.0));
    // Beaming as g^3, eased so the receding side still glows.
    float boost = mix(1.0, g * g * g, 0.72);
    vec3 col = heat(temp * mix(1.0, g, 0.85) * uDiskHeat) * (0.25 + 2.2 * temp * temp) * boost;
    float a = clamp(dens * edge * 1.4, 0.0, 1.0);
    return vec4(col * dens * uDiskGain * 2.0, a);
  }

  // The far-field bending, faded beyond uReach.
  float farBend(float b) {
    return (2.0 / b + 2.945 / (b * b)) / (1.0 + b * b / (uReach * uReach));
  }

  void main() {
    float aspect = uTan.x / uTan.y;
    vec2 toAspect = vec2(aspect, 1.0);
    vec2 dS = (vUv - uBhUv) * toAspect;
    float rS = length(dS);
    vec2 nS = rS > 1e-5 ? dS / rS : vec2(0.0);

    // Screen-space bends first: they change which way the pixel looks.
    vec2 uv = vUv;
    // The shockwave after the birth: a refracting ring running outward.
    float sw = (rS - uShock.x) / uShock.z;
    uv -= nS / toAspect * uShock.y * sw * exp(-sw * sw);
    // The light-ring that converges on the point before it opens.
    float iw = (rS - uImplode.x) / uImplode.z;
    float implodeRing = exp(-iw * iw);
    uv += nS / toAspect * uImplode.y * 0.015 * iw * implodeRing;
    // Frame dragging, stylised: the picture turns about the hole, faster near it.
    vec2 rel = (uv - uBhUv) * toAspect;
    float sa = uSwirl / (1.0 + dot(rel, rel) * 14.0);
    float cs = cos(sa);
    float sn = sin(sa);
    rel = vec2(rel.x * cs - rel.y * sn, rel.x * sn + rel.y * cs);
    // Heat shimmer around the point before the birth.
    rel += uHaze * 0.004 * vec2(vnoise(vUv * 38.0 + uTime * 3.1) - 0.5, vnoise(vUv * 38.0 - uTime * 2.7 + 9.1) - 0.5) / (0.05 + rS * 6.0);
    uv = uBhUv + rel / toAspect;

    vec2 ndc = uv * 2.0 - 1.0;
    vec3 dir = normalize(vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));
    vec3 outDir = dir;
    vec4 glow = vec4(0.0);
    bool lost = false;
    float b = 1e6;

    if (uRs > 1e-6) {
      vec3 pos = -uBH / uRs;
      float along = dot(-pos, dir);
      vec3 closest = pos + dir * along;
      b = length(closest);
      vec3 toward = b > 1e-6 ? -closest / b : vec3(0.0);
      if (along > 0.0 && b < uFar) {
        float R = uFar + 1.0;
        float S = sqrt(max(R * R - b * b, 0.0));
        vec3 p = pos + dir * max(along - S, 0.0);
        vec3 v = dir;
        float h2 = b * b;
        float r = length(p);
        vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
        for (int i = 0; i < uSteps; i++) {
          r = length(p);
          if (r < 1.0) {
            lost = true;
            break;
          }
          if (r > R && dot(p, v) > 0.0) break;
          float dt = clamp((r - 0.92) * 0.24, 0.015, 1.2);
          vec3 prev = p;
          v += 0.5 * acc * dt;
          p += v * dt;
          float r2 = dot(p, p);
          acc = -1.5 * h2 * p / (r2 * r2 * sqrt(r2));
          v += 0.5 * acc * dt;
          float y0 = dot(prev, uDiskN);
          float y1 = dot(p, uDiskN);
          if (y0 * y1 < 0.0 && glow.a < 0.985) {
            vec3 hit = mix(prev, p, y0 / (y0 - y1));
            float rh = length(hit);
            if (rh > uDiskIn && rh < uDiskOut) {
              vec4 c = disk(hit, rh, v);
              glow.rgb += (1.0 - glow.a) * c.rgb * c.a;
              glow.a += (1.0 - glow.a) * c.a;
            }
          }
        }
        // Out of steps close in: it was circling the photon sphere, as good as lost.
        if (!lost && r < 2.0) lost = true;
        // The bending the march leaves out, beyond its sphere at both ends: for this force the part
        // inside a chord of half-length S is S (2 S^2 + 3 b^2) / (2 R^3) of the whole.
        float inside = S * (2.0 * S * S + 3.0 * b * b) / (2.0 * R * R * R);
        outDir = normalize(normalize(v) + toward * farBend(max(b, 1e-3)) * (1.0 - inside));
        outDir = normalize(mix(outDir, normalize(dir + toward * farBend(b)), smoothstep(uFar - 1.5, uFar, b)));
      } else if (along > 0.0) {
        outDir = normalize(dir + toward * farBend(b));
      }
    }

    vec3 col = vec3(0.0);
    if (!lost) {
      vec3 d = outDir;
      // Bent past 90 degrees: look the mirrored way, dimmer.
      float back = smoothstep(-0.2, 0.3, d.z);
      d.z = min(-abs(d.z), -0.06);
      vec2 suv = vec2(d.x / (-d.z) / uTan.x, d.y / (-d.z) / uTan.y) * 0.5 + 0.5;
      // The colour split follows the bending, capped at a few pixels: uncapped, the Einstein ring's huge
      // bends split into rainbow bands.
      vec2 split = (suv - uv) * uCA;
      split *= min(1.0, 0.005 / max(length(split), 1e-6));
      col.r = sky(suv + split).r;
      col.g = sky(suv).g;
      col.b = sky(suv - split).b;
      col *= 1.0 - 0.55 * back;
    }
    // Rays grazing the photon sphere circle it a different number of times from one pixel to the next,
    // which reads as glitter: just outside the shadow they fade into the photon ring's glow.
    float graze = smoothstep(2.62, 3.15, b);
    col *= graze;
    col = col * (1.0 - glow.a) + glow.rgb * mix(0.55, 1.0, graze);
    float ring = (b - 2.68) * 3.2;
    col += vec3(1.0, 0.86, 0.66) * exp(-ring * ring) * uRing;
    col += vec3(0.6, 0.78, 1.0) * implodeRing * uImplode.y * 1.1;
    col += vec3(1.0, 0.93, 0.85) * uFlash * (exp(-rS * rS * 160.0) * 4.0 + exp(-rS * rS * 7.0) * 0.12);
    col *= mix(vec3(1.0), vec3(0.62, 0.86, 1.55), uShift);
    col *= 1.0 - uEat;
    gl_FragColor = vec4(col, 1.0);
  }
`,Lt=class extends h{uniforms={tDiffuse:{value:null},uTan:{value:new f(1,1)},uBH:{value:new o(0,0,-50)},uRs:{value:0},uFar:{value:12},uReach:{value:40},uDiskX:{value:new o(1,0,0)},uDiskN:{value:new o(0,1,0)},uDiskZ:{value:new o(0,0,1)},uDiskIn:{value:3},uDiskOut:{value:10},uDiskGain:{value:0},uDiskHeat:{value:1},uTime:{value:0},uSteps:{value:72},uBhUv:{value:new f(.5,.5)},uShock:{value:new o(-1,0,.05)},uImplode:{value:new o(-1,0,.03)},uFlash:{value:0},uSwirl:{value:0},uCA:{value:0},uRing:{value:0},uShift:{value:0},uEat:{value:0},uHaze:{value:0}};material=new l({vertexShader:Ft,fragmentShader:It,uniforms:this.uniforms,depthTest:!1,depthWrite:!1});quad=new C(this.material);constructor(){super(),this.needsSwap=!0}render(e,t,n){this.uniforms.tDiffuse.value=n.texture,e.setRenderTarget(this.renderToScreen?null:t),this.quad.render(e)}compile(e){let t=this.quad._mesh,n=new y(-1,1,1,-1,0,1),r=e.getRenderTarget(),i=new x(4,4,{type:d});e.setRenderTarget(i);let a;try{a=e.compileAsync(t,n)}finally{e.setRenderTarget(r)}return a.finally(()=>i.dispose())}dispose(){this.material.dispose(),this.quad.dispose()}},Rt=`
  uniform vec3 uWellPos;
  uniform vec3 uWellAxis;
  uniform vec3 uWellPosV;
  uniform vec3 uWellAxisV;
  uniform vec4 uWell;
  vec3 bhFall(vec3 p, vec3 c, vec3 ax) {
    vec3 d = p - c;
    float r = length(d);
    float rn = pow(max(r * sqrt(r) - uWell.x, 0.0), 2.0 / 3.0);
    float k = r > 1e-4 ? rn / r : 0.0;
    float h = dot(d, ax);
    vec3 pl = (d - ax * h) * k;
    float a = uWell.y * pow(uWell.w / (rn + uWell.w), 1.5);
    pl = pl * cos(a) + cross(ax, pl) * sin(a);
    return c + pl + ax * (h * k * mix(1.0, k, uWell.z));
  }
  vec4 bhWell(vec4 w) {
    if (uWell.x <= 0.0 && uWell.y == 0.0) return w;
    return vec4(bhFall(w.xyz / w.w, uWellPos, uWellAxis), 1.0);
  }
  vec4 bhWellView(vec4 mv) {
    if (uWell.x <= 0.0 && uWell.y == 0.0) return mv;
    return vec4(bhFall(mv.xyz / mv.w, uWellPosV, uWellAxisV), 1.0);
  }
`,zt=/gl_Position\s*=\s*projectionMatrix\s*\*\s*viewMatrix\s*\*\s*([^;]+);/g,Bt=/gl_Position\s*=\s*projectionMatrix\s*\*\s*(mv)\s*;/g;function Vt(){let e={uWellPos:{value:new o},uWellAxis:{value:new o(0,1,0)},uWellPosV:{value:new o},uWellAxisV:{value:new o(0,1,0)},uWell:{value:new s(0,0,0,4)}},t=new p,n=new o,r=new o,i=new o,a=new o;return{uniforms:e,patch(t){let n=0,r=new Set;return t.traverse(t=>{let i=t,a=Array.isArray(i.material)?i.material:i.material?[i.material]:[];for(let t of a){if(r.has(t)||!t.isShaderMaterial)continue;r.add(t);let i=t;if(i.vertexShader.includes(`bhWell`))continue;let a=i.vertexShader.replace(zt,`gl_Position = projectionMatrix * viewMatrix * bhWell($1);`).replace(Bt,`gl_Position = projectionMatrix * bhWellView($1);`);if(a===i.vertexShader)continue;let o=a.indexOf(`void main`);i.vertexShader=a.slice(0,o)+Rt+a.slice(o),Object.assign(i.uniforms,e),i.needsUpdate=!0,n++}a.some(e=>r.has(e))&&(t.frustumCulled=!1)}),n},sync(n){n.updateMatrixWorld(),e.uWellPosV.value.copy(e.uWellPos.value).applyMatrix4(n.matrixWorldInverse),t.setFromMatrix4(n.matrixWorldInverse),e.uWellAxisV.value.copy(e.uWellAxis.value).applyMatrix3(t).normalize()},displace(t,o){let s=e.uWell.value;if(s.x<=0&&s.y===0)return o.copy(t);let c=e.uWellPos.value;r.copy(e.uWellAxis.value),n.subVectors(t,c);let l=n.length(),u=Math.max(l*Math.sqrt(l)-s.x,0)**(2/3),d=l>1e-4?u/l:0,f=n.dot(r);i.copy(n).addScaledVector(r,-f).multiplyScalar(d);let p=s.y*(s.w/(u+s.w))**1.5;return a.crossVectors(r,i),i.multiplyScalar(Math.cos(p)).addScaledVector(a,Math.sin(p)),o.copy(c).add(i).addScaledVector(r,f*d*(1+(d-1)*s.z))}}}var Ht=`
  attribute float aSeed;
  uniform float uPixelRatio;
  uniform float uTime;
  uniform vec3 uCentre;
  varying float vHeat;
  varying float vSeed;
  void main() {
    vec3 world = position;
    float r = length(position - uCentre);
    vHeat = clamp(1.0 - r / 60.0, 0.0, 1.0);
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
    // Size by distance; a little twinkle so streams shimmer rather than slide.
    float tw = 0.75 + 0.25 * sin(uTime * (6.0 + aSeed * 9.0) + aSeed * 40.0);
    gl_PointSize = clamp((26.0 + 30.0 * aSeed) / max(gl_Position.w, 0.5), 1.0, 9.0) * uPixelRatio * tw;
  }
`,Ut=`
  uniform float uGlow;
  varying float vHeat;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord * 2.0 - 1.0;
    float d = dot(c, c);
    if (d > 1.0) discard;
    float core = exp(-d * 5.0);
    vec3 cool = vec3(1.0, 0.36, 0.08);
    vec3 hot = vec3(1.0, 0.86, 0.62);
    vec3 col = mix(cool, hot, vHeat) * (0.6 + 1.6 * vHeat) * (0.5 + vSeed);
    gl_FragColor = vec4(col * core * uGlow, 1.0);
  }
`;function Wt(e,t,n){let r=le(727748),i=new Float32Array(n*3),a=new Float32Array(n),s=new o().crossVectors(t,new o(0,0,1)).normalize();s.lengthSq()<.5&&s.set(1,0,0);let c=new o().crossVectors(t,s).normalize(),u=new o;for(let o=0;o<n;o++){let n=5*14**r(),l=(r()<.5?0:Math.PI)+Math.log(n)*2.2+(r()-.5)*1.6,d=(r()-.5)*n*.32;u.copy(e).addScaledVector(s,Math.cos(l)*n).addScaledVector(c,Math.sin(l)*n).addScaledVector(t,d),i.set([u.x,u.y,u.z],o*3),a[o]=r()}let d=new te;d.setAttribute(`position`,new m(i,3)),d.setAttribute(`aSeed`,new m(a,1));let f={value:0},p={value:0},h=new l({vertexShader:Ht,fragmentShader:Ut,uniforms:{uGlow:f,uTime:p,uCentre:{value:e.clone()},uPixelRatio:{value:Math.min(window.devicePixelRatio,2)}},transparent:!0,depthWrite:!1,blending:2}),g=new ne(d,h);return g.name=`singularity-embers`,g.frustumCulled=!1,g.renderOrder=6,g.visible=!1,{points:g,set(e,t){f.value=e,p.value=t,g.visible=e>.001},dispose(){d.dispose(),h.dispose()}}}var Gt=e=>{let t=ue(e)-1;return 1+2.9*t*t*t+1.9*t*t},Kt=new o(1,0,0),qt=.3,Jt=3,Yt=.35,Xt=1.8,Zt=class{lens=new Lt;well=Vt();shipWell=Vt();embers;active=!1;t=0;speed=1;gentle=!1;hooks=null;resolveDone=null;cuesFired=new Set;centre;axis;diskX=new o;diskZ=new o;lowTier;grade={...se.title,cool:[...se.title.cool],warm:[...se.title.warm]};gradeHot={exposure:.86,knee:.66,shoulder:.85,gamma:1.06,toe:0,cool:[.86,.93,1.12],warm:[1.22,.96,.78],vignette:.52};diskTime=0;swirlPhase=0;shipSwirl=0;rs=0;shake=new f;shakeAmp=0;lookBlend=0;fall=0;fovExtra=0;roll=0;eat=0;shockR=-1;shockA=0;pull=0;shipStart=null;tumbleAxis=new o(.3,.8,-.5).normalize();v3=new o;v3b=new o;q=new T;q2=new T;m3=new p;holeView=new o;frameOut={t:0,x:0,y:0,horizon:0,shockRadius:0,shockAmp:0,shakeX:0,shakeY:0,pull:0,eat:0};constructor(e){this.centre=e.centre.clone(),this.axis=e.axis.clone().normalize(),this.lowTier=e.lowTier,this.diskX.crossVectors(this.axis,new o(0,0,1)).normalize(),this.diskX.lengthSq()<.5&&this.diskX.set(1,0,0),this.diskZ.crossVectors(this.diskX,this.axis).normalize();for(let e of[this.well,this.shipWell])e.uniforms.uWellPos.value.copy(this.centre),e.uniforms.uWellAxis.value.copy(this.axis),e.uniforms.uWell.value.set(0,0,0,6);this.embers=Wt(this.centre,this.axis,e.lowTier?900:1600),this.lens.uniforms.uSteps.value=e.lowTier?64:90}prepare(e,t){for(let t of e)this.well.patch(t);this.well.patch(this.embers.points),this.shipWell.patch(t)}lensReady=!1;linking=null;prelink(e){if(this.linking)return;let t=()=>new Promise(e=>window.setTimeout(e,Yt*1e3));this.linking=this.lens.compile(e).then(t,t)}held=0;start(e,t,n){return this.hooks=e,this.gentle=n,this.speed=n?Xt:1,this.active=!0,this.t=0,this.lens.enabled=!1,e.setScreenEffect(this.lens),this.prelink(t),this.linking.then(()=>this.lensReady=!0),new Promise(e=>this.resolveDone=e)}hurry(){this.active&&this.t>fe.birth+.3&&(this.speed=Math.max(this.speed,3))}advance(e){if(!this.active)return;!this.lensReady&&this.t>=qt&&this.held<Jt&&(this.held+=e,e=0),this.lens.enabled=this.lensReady||this.held>=Jt;let t=e*this.speed;this.t+=t;let n=this.t,r=fe,i=this.gentle;for(let e of Object.keys(r))n>=r[e]&&!this.cuesFired.has(e)&&(this.cuesFired.add(e),this.hooks?.onCue?.(e));let a=E(n,r.haze,r.birth),o=n-r.birth,s=o>=0,c=E(n,r.birth,r.plunge),l=E(n,r.plunge,r.horizon),u=this.lens.uniforms;this.rs=s?(.035+.5*Gt(o/.34)+.8*D(c))*(1+4.2*l**2.1):.002+.035*a*a,u.uRs.value=this.rs,u.uDiskGain.value=s?D(o/1.5)*(1-.35*l):0,u.uDiskOut.value=4+9*D(o/2.6),u.uDiskHeat.value=.75+.2*c+.25*l,this.diskTime+=t*(.5+1.6*c+7*l),u.uTime.value=this.diskTime,u.uFar.value=Math.max(u.uDiskOut.value+2,9),u.uReach.value=Math.max(3*u.uFar.value,18+60*c*c+400*l);let d=this.lowTier?64:90;u.uSteps.value=Math.round(d*(1-.35*l)),u.uRing.value=s?.85+2.2*Math.exp(-o*5):0;let f=E(n,r.implode,r.birth);u.uHaze.value=i?0:s?.35*Math.exp(-o*.8):a,u.uImplode.value.set(1.25*(1-f)**1.7,f>0&&!s?D(f*1.4):0,.004+.018*(1-f)),u.uFlash.value=s?Math.exp(-o*12):0,this.shockR=s&&!i&&o<2.2?o*1.55:-1,this.shockA=this.shockR>=0?.05*Math.exp(-o*1.5):0,u.uShock.value.set(this.shockR,this.shockA,.045+.07*Math.max(o,0)),u.uSwirl.value=i||!s?0:(.55*D(c)+2.4*l**1.5)*D(o/.5),u.uCA.value=s?.006+.012*c+.05*l+.04*u.uFlash.value:0,u.uShift.value=.6*l**1.5,this.eat=n>=r.horizon?1:E(n,r.horizon-.34,r.horizon)**1.4,u.uEat.value=this.eat;let p=s?1+38*D((o-.15)/(r.plunge-r.birth))**1.5+90*l*l:0;this.swirlPhase+=t*(s?.6+3.5*c+10*l:0),this.well.uniforms.uWell.value.set(p**1.5,this.swirlPhase,s?.85*D(o/3):0,6);let m=E(n,r.shipLost,r.shipLost+1.5),h=34*m**1.6+90*l*l;this.shipSwirl+=t*(m>0?1+4*m:0),this.shipWell.uniforms.uWell.value.set(h**1.5,this.shipSwirl,.6*m,6),this.embers.set(s?D(o/.9)*(1+.8*l)*(1-this.eat):0,this.diskTime),this.pull=D(E(n,r.birth+.4,r.plunge));let g=s?Math.exp(-o*3.2)*.32:0;this.shakeAmp=i?0:g+(s?.015+.07*c+.16*l:a*.006)*(1-this.eat);let _=n;this.shake.set((Math.sin(_*23.1)*.5+Math.sin(_*37.7+1.3)*.3+Math.sin(_*6.3+.4)*.6)*this.shakeAmp,(Math.sin(_*19.7+2.1)*.5+Math.sin(_*41.3+.7)*.3+Math.sin(_*5.1+2.7)*.6)*this.shakeAmp),this.lookBlend=i?0:D(E(n,r.capture,r.capture+1.5)),this.fall=i?0:l**2.2*.6,this.fovExtra=i?0:38*D(l),this.roll=i?0:.12*this.lookBlend+.7*l**1.6+Math.sin(n*7.3)*this.shakeAmp*.08,oe(se.title,this.gradeHot,D(E(n,r.birth,r.capture)),this.grade),this.grade.exposure+=.4*u.uFlash.value,this.hooks?.setGrade(this.grade),n>=r.end&&this.finish()}driveShip(e,t){if(!this.active||this.gentle)return t;let n=this.t,r=fe;if(n<r.fight)return t;if(!this.shipStart){let t=e.position.clone().sub(this.centre).normalize(),n=new o(0,1,0).addScaledVector(t,-t.y).normalize(),r=new o().crossVectors(t,n),i=new T().setFromRotationMatrix(new b().makeBasis(t,n,r));this.shipStart={p:e.position.clone(),q:e.quaternion.clone(),away:i,awayDir:t}}let i=this.shipStart,a=D(E(n,r.fight,r.fight+1.15));this.q.copy(i.q).slerp(i.away,a),this.q2.setFromAxisAngle(Kt,Math.sin(a*Math.PI)*.55),this.q.multiply(this.q2);let s=2.4*D(E(n,r.fight,r.fight+1.7)),c=Math.max(n-(r.fight+1.2),0),l=3.5*c*c;e.position.copy(i.p).addScaledVector(i.awayDir,s-l);let u=E(n,r.fight,r.shipLost)*.06;e.position.x+=Math.sin(n*47)*u,e.position.y+=Math.sin(n*53+1)*u;let d=Math.max(n-r.shipLost,0);if(d>0&&(this.q2.setFromAxisAngle(this.tumbleAxis,2.25*d*d),this.q.premultiply(this.q2)),e.quaternion.copy(this.q),n<r.shipLost)return Math.min(1,E(n,r.fight,r.fight+.18))*(.92+.08*Math.sin(n*61));let f=E(n,r.shipLost,r.shipLost+.6),p=Math.sin(n*38)*Math.sin(n*23+1.7)>.05?1:.15;return(1-f)*p}applyCamera(e,t,n){this.active&&(this.fall>0&&(this.v3.copy(this.centre).sub(e.position),e.position.addScaledVector(this.v3,this.fall)),this.v3b.copy(t).lerp(this.centre,this.lookBlend),e.up.set(0,1,0),e.lookAt(this.v3b),e.translateX(this.shake.x*.25),e.translateY(this.shake.y*.25),e.rotateZ(this.roll),e.rotateX(this.shake.y*.012),e.rotateY(this.shake.x*.012),e.fov=n+this.fovExtra,e.updateProjectionMatrix(),e.updateMatrixWorld())}sync(e){if(!this.active)return;let t=this.lens.uniforms;this.well.sync(e),this.shipWell.sync(e);let n=e.matrixWorldInverse;this.holeView.copy(this.centre).applyMatrix4(n),t.uBH.value.copy(this.holeView),this.m3.setFromMatrix4(n),t.uDiskN.value.copy(this.axis).applyMatrix3(this.m3).normalize(),t.uDiskX.value.copy(this.diskX).applyMatrix3(this.m3).normalize(),t.uDiskZ.value.copy(this.diskZ).applyMatrix3(this.m3).normalize();let r=Math.tan(v.degToRad(e.fov/2)),i=r*e.aspect;t.uTan.value.set(i,r);let a=Math.min(this.holeView.z,-.001),o=this.holeView.x/-a/i,s=this.holeView.y/-a/r;t.uBhUv.value.set(o*.5+.5,s*.5+.5);let c=window.innerWidth,l=window.innerHeight,u=this.holeView.length(),d=Math.atan(Math.min(2.598*this.rs/Math.max(u,.001),50)),f=this.frameOut;f.t=this.t,f.x=(o*.5+.5)*c,f.y=(.5-s*.5)*l,f.horizon=Math.tan(Math.min(d,1.5))/r*l*.5,f.shockRadius=this.shockR>=0?this.shockR*l:0,f.shockAmp=this.shockA*l,f.shakeX=this.shake.x*26,f.shakeY=this.shake.y*26,f.pull=this.pull,f.eat=this.eat,this.hooks?.onFrame?.(f)}finish(){if(!this.resolveDone)return;let e=this.resolveDone;this.resolveDone=null,e()}dispose(){this.active&&this.hooks?.setScreenEffect(null),this.active=!1,this.finish(),this.lens.dispose(),this.embers.dispose()}},Qt=40,$t=Math.tan(v.degToRad(Qt/2)),en=16/9*$t,X=Math.PI/180,tn=new o(1,0,0);function Z(e,t,n=new o){return n.set((2*e-1)*en,(1-2*t)*$t,-1).normalize()}function nn(e,t){return new f((2*e-1)*en,(1-2*t)*$t)}var Q={planetRadius:6e3,limb:[[.32,.74],[.62,.37],[1,.14]],sunAt:[.635,.355],sunLift:.9,lightTowardCamera:.42,isilthe:{at:[.89,.15],distance:17e3,angularRadius:6.2},moon:{at:[.425,.43],distance:9e3,angularRadius:1.45},band:{from:[.42,-.08],to:[1.02,.6],knot:[.7,.2]},dustDrift:[.25,-.12,1]},rn={nose:[.585,.53],noseDistance:30,stern:[.8,.66],sternDistance:20,roll:-8},$={delay:2,distance:34,speed:60,tau:.15,drift:.2,driftTau:120,composedAt:3,turn:16,turnDistance:26,bank:10,plumeHold:.35,plumeFade:.6,clearance:8},an={at:[.555,.3],distance:55,tilt:9,roll:-13},on=!1,sn={pool:[[2.3,`chunky`,5],[1.8,`angular`,5],[1.5,`elongated`,4],[1.2,`chunky`,4],[1,`angular`,4],[.85,`elongated`,4],[.7,`chunky`,3],[.6,`angular`,3],[.5,`elongated`,3],[.42,`chunky`,3],[.35,`angular`,2],[.3,`chunky`,2]],distance:[11,70],bandTop:.8,bandDepth:.12,crossing:[26,60],sink:[-.02,.1],approach:[0,.12],spin:[.04,.1],seed:42366},cn={area:[-.7,.78,-.05,.9],heading:[Math.PI+.08,Math.PI+.22],first:5,every:[8,10.5],seconds:1.1,travel:.85,length:[.55,.75],width:.022,brightness:9},ln={count:11,countLow:9,distance:[7,70],size:[.0072,.0155],drift:[.008,.016],driftAt:25,parallax:.35,spin:[.15,.7],seed:912146},un=[[`kethra_day.jpg`,!0],[`kethra_night.jpg`,!0],[`clouds.jpg`,!1],[`isilthe_day.jpg`,!0],[`isilthe_night.jpg`,!0],[`isilthe_ring.png`,!0]];function dn(){for(let[e,t]of un)me(e,t);Se()}var fn=.6,pn=e=>e<0?0:e>1?1:e,mn=e=>e*e*(3-2*e),hn=class{kind=`TitleScene`;usesAO=!1;grade=se.title;needsEnvironment=!1;governed=!1;scene=new i;camera=new _(Qt,window.innerWidth/window.innerHeight,.5,4e4);onFirstFrame=null;detail=null;sky;hero;worlds=[];moon;rocks;debris;ship;fx;singularity=null;baseFov=Qt;sunSeen=new o;light=new o;elapsed=0;firstFrame=!0;disposed=!1;yaw=0;leaveT=-1;onLeft=null;lowTier=!1;shipScale=1;pose={position:new o,quaternion:new T,forward:new o,up:new o,side:new o};flightClock=-$.delay;thrust=1;turnQ=new T;bankQ=new T;offset=new o;scratchW=new o;lookTarget=new o;async init(e){let t=pe();if(!t)throw Error(`TitleScene needs the engine`);let n=t.renderer;this.lowTier=t.getQualityTier()===`low`,this.scene.background=new r(330002);let[i,a,s]=Q.limb.map(([e,t])=>Z(e,t)),c=new o().crossVectors(a.clone().sub(i),s.clone().sub(i)).normalize();c.dot(Z(1,1))<0&&c.negate();let l=Math.acos(v.clamp(i.dot(c),-1,1)),u=Q.planetRadius,d=c.clone().multiplyScalar(u/Math.sin(l)),f=Z(...Q.sunAt),p=f.clone().sub(c.clone().multiplyScalar(f.dot(c))).normalize(),m=l+Q.sunLift*X;this.sunSeen.copy(c).multiplyScalar(Math.cos(m)).addScaledVector(p,Math.sin(m)).normalize(),this.light.copy(this.sunSeen).lerp(c.clone().negate(),Q.lightTowardCamera).normalize();let h=Z(.85,.95),g=Z(...an.at).multiplyScalar(an.distance),_=g.clone().normalize(),y=new o(0,1,0).addScaledVector(_,-_.y).normalize().multiplyScalar(Math.cos(an.tilt*X)).addScaledVector(_,-Math.sin(an.tilt*X)).applyAxisAngle(_,an.roll*X).normalize();this.singularity=new Zt({centre:g,axis:y,lowTier:this.lowTier});let b=()=>e?.breathe()??Promise.resolve(),x=performance.now(),S=e=>{re(`title:${e}`,x),x=performance.now()},C=Q.band,w=ve(n,b),ee=we(n,w.then(e=>e.texture),{from:nn(...C.from),to:nn(...C.to),core:nn(...C.knot)},{stars:this.lowTier?4200:8e3,pace:b}),te=this.sunSeen.clone().add(new o(0,.6,0)).normalize(),T=new o(-.45,.35,.82).normalize(),ne=Pt(n,{keyDir:te,sunDir:this.sunSeen,bounceDir:h,fillDir:T,planetCenter:d,planetRadius:u,planetLight:this.light,pace:b}),[ie,oe]=await Promise.all([w,ee]);this.detail=ie,this.sky=oe,this.scene.add(this.sky.group),S(`bakes`),await e?.tick(),this.hero=be({radius:u,center:d,sunDir:this.light,glareDir:this.sunSeen,day:me(`kethra_day.jpg`,!0),night:me(`kethra_night.jpg`,!0),clouds:me(`clouds.jpg`,!1),detail:ie.texture,segments:this.lowTier?160:224}),this.scene.add(this.hero.group);let se=this.light.clone().multiplyScalar(1e7),ce=Q.isilthe,le=de.find(e=>e.id===`isilthe`),ue=Z(...ce.at).multiplyScalar(ce.distance),fe=ge({...le,radius:ce.distance*Math.sin(ce.angularRadius*X)},ue,se,this.camera);fe.group.rotation.set(0,0,Math.PI+.06),this.scene.add(fe.group),this.worlds.push(fe);let E=Q.moon;this.moon=ye({position:Z(...E.at).multiplyScalar(E.distance),radius:E.distance*Math.sin(E.angularRadius*X),light:this.light,detail:ie.texture}),this.scene.add(this.moon.mesh),S(`planets`),await e?.tick(),(on||ae.reduced)&&(this.flightClock=$.composedAt),this.solveShip();let D={tanH:en,tanV:$t},_e={sunDir:this.light,rimDir:this.sunSeen,bounceDir:h},Se=sn;this.rocks=await Ce({...Se,..._e,pool:Se.pool.map(([e,t,n])=>[e,t,this.lowTier?Math.min(n,4):n]),avoid:{points:this.flightPath(2),clearance:$.clearance},view:D,pace:()=>e?.tick()??Promise.resolve()}),this.scene.add(this.rocks.mesh),this.debris=xe({...ln,..._e,count:this.lowTier?ln.countLow:ln.count,view:D}),this.scene.add(this.debris.group),S(`rocks`),await e?.tick(),this.ship=await ne,this.flyShip(this.flightClock),this.scene.add(this.ship.group),S(`ship`);let O=new o(...Q.dustDrift).normalize().multiplyScalar(1.1);this.fx=Te({sunDir:this.sunSeen,coreDistance:3e4,dust:{count:this.lowTier?110:240,boxMin:new o(-16,-11,-42),boxSize:new o(40,22,38),stream:O},meteors:cn}),this.fx.setMeteors(!ae.reduced),this.scene.add(this.fx.group),this.scene.add(this.singularity.embers.points),this.singularity.prepare([this.rocks.mesh,this.debris.group,this.fx.group],this.ship.group),S(`singularity`),this.sky.setReveal(1,1),this.hero.setReveal(1,1);for(let e of this.worlds)e.setFade(1);this.moon.setFade(1),this.rocks.setFade(1),this.debris.setFade(1),this.ship.setFade(1),this.fx.setGlare(1),this.fx.setDust(.9),this.frame(window.innerWidth/window.innerHeight),this.placeCamera(0),S(`fx`),await he(),S(`maps`)}solveShip(){let e=Z(...rn.nose).multiplyScalar(rn.noseDistance),t=Z(...rn.stern).multiplyScalar(rn.sternDistance),n=e.sub(t);this.shipScale=n.length()/(6-Ae),n.normalize();let r=new o(0,1,0).addScaledVector(n,-n.y).normalize().applyAxisAngle(n,rn.roll*X),i=new o().crossVectors(n,r),a=this.pose;a.quaternion.setFromRotationMatrix(new b().makeBasis(n,r,i)),a.position.copy(t).addScaledVector(n,-Ae*this.shipScale),a.forward.copy(n),a.up.copy(r),a.side.crossVectors(r,n)}travelled(e){if(e<=0)return 0;let t=$,n=t.distance/t.speed-t.tau,r=e<=n?t.speed*e:t.speed*n+t.speed*t.tau*(1-Math.exp(-(e-n)/t.tau));return t.drift*t.driftTau*(1-Math.exp(-e/t.driftTau))+r}pathOffset(e,t){let{forward:n,side:r}=this.pose;if(e<=0)return t.copy(n).multiplyScalar(-e),0;let i=$.turn*X,a=$.turnDistance,o=i/a,s=Math.min(e,a);return t.copy(n).multiplyScalar(-Math.sin(o*s)/o).addScaledVector(r,-(1-Math.cos(o*s))/o),e>a&&t.addScaledVector(n,-Math.cos(i)*(e-a)).addScaledVector(r,-Math.sin(i)*(e-a)),s/a*i}flightPath(e){let t=[],n=this.travelled($.composedAt)-this.travelled(Math.max(this.flightClock,0));for(let r=n;r>-e;r-=e)this.pathOffset(Math.max(r,0),this.offset),t.push(this.pose.position.clone().add(this.offset));return t}flyShip(e){let t=Math.max(e,0),n=this.pathOffset(this.travelled($.composedAt)-this.travelled(t),this.offset),r=this.ship.group;r.position.copy(this.pose.position).add(this.offset),this.turnQ.setFromAxisAngle(this.pose.up,n),this.bankQ.setFromAxisAngle(tn,$.bank*X*(n/($.turn*X))),r.quaternion.copy(this.turnQ).multiply(this.pose.quaternion).multiply(this.bankQ),r.scale.setScalar(this.shipScale);let i=$.distance/$.speed-$.tau;this.thrust=1-mn(pn((t-i-$.plumeHold)/$.plumeFade))}onEnter(){ie(`title:backdrop`),on=!0}leave(){return new Promise(e=>{if(this.disposed){e();return}let t=this.onLeft;this.onLeft=()=>{t?.(),e()},this.leaveT<0&&(this.leaveT=0)})}collapse(e){let t=pe();return!this.singularity||this.disposed||!t?Promise.resolve():(this.fx.setMeteors(!1),this.singularity.start({setScreenEffect:e=>t.setScreenEffect(e),setGrade:e=>t.setGrade(e),onFrame:e.onFrame,onCue:e.onCue},t.renderer,ae.reduced))}prelink(){let e=pe();e&&!this.disposed&&this.singularity?.prelink(e.renderer)}hurry(){this.singularity?.hurry()}update(e){this.elapsed+=e;let t=this.elapsed;for(let n of this.worlds)n.update(t,e);this.hero.update(t),this.rocks.update(e),this.debris.update(t);let n=this.singularity?.active?this.singularity:null;n?.advance(e),this.flyShip(t+this.flightClock),this.ship.update(t,n?n.driveShip(this.ship.group,this.thrust):this.thrust),n&&this.fx.setDust(.9+.8*pn((n.t-1.2)/2.5));let r=0;if(this.leaveT>=0){this.leaveT+=e;let t=pn(this.leaveT/(ae.reduced?.35:fn));if(this.fx.setVeil(mn(t)),r=ae.reduced?0:t*t*2.4,t>=1&&this.onLeft){let e=this.onLeft;this.onLeft=null,e()}}this.placeCamera(r),n?.applyCamera(this.camera,this.lookTarget,this.baseFov),this.fx.update(this.camera,e,t),this.sky.update(this.camera),n?.sync(this.camera),this.firstFrame&&(this.firstFrame=!1,this.onFirstFrame?.())}placeCamera(e){let t=+!ae.reduced,n=this.elapsed;this.camera.position.set(Math.sin(n*.11)*.22*t,Math.sin(n*.083+1.3)*.12*t,Math.sin(n*.061+.6)*.3*t),this.lookTarget.set(Math.sin(this.yaw)*120,0,-Math.cos(this.yaw)*120),e>0&&(this.scratchW.copy(this.lookTarget).sub(this.camera.position).normalize(),this.camera.position.addScaledVector(this.scratchW,e)),this.camera.lookAt(this.lookTarget)}frame(e){let t=Math.max($t,.36/e);this.camera.fov=2*Math.atan(t)/X,this.baseFov=this.camera.fov,this.camera.aspect=e,this.camera.updateProjectionMatrix(),this.yaw=Math.max(0,Math.atan(en)-Math.atan(t*e)),this.rocks?.setView(t*e,t),this.debris?.setView(t*e,t)}onResize(e,t){this.frame(e/t)}dispose(){this.disposed=!0;let e=this.onLeft;this.onLeft=null,e?.(),this.singularity?.dispose(),this.detail?.dispose(),this.sky?.dispose(),this.hero?.dispose(),this.moon?.dispose(),this.rocks?.dispose(),this.debris?.dispose(),this.ship?.dispose(),this.fx?.dispose();for(let e of this.worlds)gn(e.group)}};function gn(e){e.traverse(e=>{let t=e;t.geometry?.dispose();let n=Array.isArray(t.material)?t.material:t.material?[t.material]:[];for(let e of n)e.dispose()})}export{hn as KethraTitleScene,dn as preloadKethraTitle};