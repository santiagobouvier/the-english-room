import * as THREE from 'three';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {FontLoader} from './vendor/FontLoader.js';
import {TextGeometry} from './vendor/TextGeometry.js';

const mount=document.querySelector('#world');
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const mobile=matchMedia('(max-width:700px)');
const chapters=[...document.querySelectorAll('.chapter')];
const bar=document.querySelector('#progress-bar');
const label=document.querySelector('#progress-label');
let target=0,current=0,renderer,scene,camera,previous=performance.now(),pointer={x:0,y:0};
const turn=new THREE.Vector3(),look=new THREE.Vector3(),pos=new THREE.Vector3();
const floating=[];
const stations=[new THREE.Vector3(0,0,0),new THREE.Vector3(3,-1,-45),new THREE.Vector3(-3,1,-90),new THREE.Vector3(0,0,-135)];
// The content has four physical destinations. The scroll moves through their space.
const route=new THREE.CatmullRomCurve3([
 new THREE.Vector3(-3,1,18),stations[0].clone().add(new THREE.Vector3(-3,1,13)),
 new THREE.Vector3(5,3,-15),new THREE.Vector3(-4,-2,-29),stations[1].clone().add(new THREE.Vector3(-3,1,13)),
 new THREE.Vector3(-7,3,-61),new THREE.Vector3(5,-2,-73),stations[2].clone().add(new THREE.Vector3(-3,1,13)),
 new THREE.Vector3(5,3,-107),new THREE.Vector3(-4,-1,-121),stations[3].clone().add(new THREE.Vector3(0,1,15))
]);
const routeTimes=[0,.04,.13,.22,1/3,.45,.54,2/3,.78,.88,1];
function routeAt(p){let segment=0;while(segment<routeTimes.length-2&&p>routeTimes[segment+1])segment++;const a=routeTimes[segment],b=routeTimes[segment+1];return route.getPoint((segment+(p-a)/(b-a))/(routeTimes.length-1));}
function sync(){target=Math.min(1,Math.max(0,scrollY/(document.documentElement.scrollHeight-innerHeight)));bar.style.width=`${target*100}%`;}
addEventListener('scroll',sync,{passive:true});sync();
const destinations={start:0,courses:1/3,next:2/3,contact:1};
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',event=>{const id=a.getAttribute('href').slice(1);if(!(id in destinations))return;event.preventDefault();history.replaceState(null,'','#'+id);scrollTo({top:destinations[id]*(document.documentElement.scrollHeight-innerHeight),behavior:reduced.matches?'instant':'smooth'});}));
addEventListener('pointermove',e=>{pointer.x=e.clientX/innerWidth-.5;pointer.y=e.clientY/innerHeight-.5;},{passive:true});
function matte(color){return new THREE.MeshStandardMaterial({color,roughness:.42,metalness:.06});}
function tube(curve,radius,material,segments=400){const obj=new THREE.Mesh(new THREE.TubeGeometry(curve,segments,radius,12,false),material);scene.add(obj);return obj;}
function init(){
 renderer=new THREE.WebGLRenderer({alpha:false,antialias:devicePixelRatio<2,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,mobile.matches?1.5:1.75));renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.95;mount.replaceChildren(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color(0xfff5f3);scene.fog=new THREE.FogExp2(0xfff5f3,.026);
 camera=new THREE.PerspectiveCamera(54,innerWidth/innerHeight,.1,200);
 const pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();scene.environment=pmrem.fromScene(room,.025).texture;room.dispose();pmrem.dispose();
 scene.add(new THREE.HemisphereLight(0xffffff,0x366675,1.5));const key=new THREE.DirectionalLight(0xffeadb,3.2);key.position.set(-5,9,10);scene.add(key);const rim=new THREE.DirectionalLight(0x78ffed,2);rim.position.set(8,0,-10);scene.add(rim);
 const teal=new THREE.MeshPhysicalMaterial({color:0x26bcb9,metalness:.72,roughness:.19,clearcoat:1});
 const pink=new THREE.MeshPhysicalMaterial({color:0xf5a7b5,metalness:.38,roughness:.24,clearcoat:1});
 const dark=new THREE.MeshPhysicalMaterial({color:0x103741,metalness:.55,roughness:.21,clearcoat:1});
 const cream=matte(0xffe7e0);const pale=matte(0xf8eee7);
 // A silk-like ribbon, with genuine thickness and changing surface normals.
 for(let strand=0;strand<2;strand++){
  const points=[];for(let i=0;i<=400;i++){const t=i/400;const center=new THREE.Vector3(Math.sin(t*Math.PI*5)*3,Math.sin(t*Math.PI*4)*1.7,8-t*158);const a=t*Math.PI*13+strand*Math.PI;center.x+=Math.cos(a)*2.5;center.y+=Math.sin(a)*2.8;points.push(center);}
  const c=new THREE.CatmullRomCurve3(points);const frames=c.computeFrenetFrames(650,false);const verts=[],indices=[];
  for(let i=0;i<=650;i++){const t=i/650,p=c.getPointAt(t),normal=frames.normals[i],binormal=frames.binormals[i];const width=.4+.14*Math.sin(t*40);const angle=t*28+strand;const side=normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal,Math.sin(angle));const thick=side.clone().cross(frames.tangents[i]).normalize();for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,1]]){const v=p.clone().addScaledVector(side,a*width).addScaledVector(thick,b*.045);verts.push(v.x,v.y,v.z);}if(i<650){for(let j=0;j<4;j++){const a=i*4+j,b=i*4+(j+1)%4,d=(i+1)*4+j,e=(i+1)*4+(j+1)%4;indices.push(a,b,d,b,e,d);}}}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.setIndex(indices);geo.computeVertexNormals();const mesh=new THREE.Mesh(geo,strand?pink:teal);scene.add(mesh);
 }
 // Architecture sized to be entered: the camera passes through these arches.
 const portalGeo=new THREE.TorusGeometry(5.3,.065,8,100);
 for(let i=0;i<21;i++){const z=7-i*7.5;const arch=new THREE.Mesh(portalGeo,i%3===0?pink:teal);arch.position.set(Math.sin(i*.6)*2,Math.cos(i*.5)*1.3,z);arch.rotation.set(Math.sin(i*.5)*.2,Math.cos(i*.4)*.2,i*.13);scene.add(arch);}
 // Each station has an open doorway and a dimensional book / learning sculpture.
 stations.forEach((p,i)=>{
  const station=new THREE.Group();station.position.copy(p);scene.add(station);
  const base=new THREE.Mesh(new THREE.CylinderGeometry(3.1,3.1,.27,64),pale);base.position.set(1.4,-3.05,0);station.add(base);
  const doorway=new THREE.Group();doorway.position.set(1.3,-2.9,-1.8);doorway.rotation.z=-.08;
  const postGeo=new THREE.BoxGeometry(.32,7,.4);for(const x of [-2.4,2.4]){const post=new THREE.Mesh(postGeo,i%2?pink:teal);post.position.set(x,3.5,0);doorway.add(post);}const top=new THREE.Mesh(new THREE.BoxGeometry(5.1,.32,.4),i%2?pink:teal);top.position.y=7;doorway.add(top);station.add(doorway);
  const book=new THREE.Group();book.position.set(2.5,-.7,1);book.rotation.set(.2,-.48,-.15);const pageGeo=new THREE.BoxGeometry(1.5,2.1,.08);
  for(let j=0;j<11;j++){const page=new THREE.Mesh(pageGeo,j===0||j===10?(i%2?teal:pink):cream);page.rotation.y=(j-5)*.055;page.position.z=(j-5)*.065;book.add(page);}station.add(book);floating.push({obj:book,base:book.position.clone(),phase:i});
  const globe=new THREE.Mesh(new THREE.IcosahedronGeometry(.6,4),dark);globe.position.set(-.2,1.5,.5);station.add(globe);floating.push({obj:globe,base:globe.position.clone(),phase:i+2});
 });
 // Tiny luminous marks reveal parallax and the speed of travelling through space.
 const n=mobile.matches?650:1600,positions=new Float32Array(n*3),colors=new Float32Array(n*3);for(let i=0;i<n;i++){const a=i*2.39996,r=3+((Math.sin(i*23.27)+1)*.5)*7;positions[i*3]=Math.cos(a)*r;positions[i*3+1]=Math.sin(a)*r;positions[i*3+2]=10-i/n*160;const c=new THREE.Color(i%3?0x26bcb9:0xf5a7b5);colors.set([c.r,c.g,c.b],i*3);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));geo.setAttribute('color',new THREE.BufferAttribute(colors,3));scene.add(new THREE.Points(geo,new THREE.PointsMaterial({size:.045,vertexColors:true,transparent:true,opacity:.7})));
 // Suspended sheets move past the camera instead of decorating a flat page.
 for(let i=0;i<45;i++){const sheet=new THREE.Mesh(new THREE.BoxGeometry(.35,.45,.045),i%2?pink:cream);sheet.position.set(Math.cos(i*1.7)*4,Math.sin(i*1.4)*3,5-i*3.5);sheet.rotation.set(i*.2,i*.3,i*.4);scene.add(sheet);}
 fetch('./experiencia/vendor/helvetiker_regular.typeface.json').then(r=>{if(!r.ok)throw new Error('Font unavailable');return r.json();}).then(json=>{const font=new FontLoader().parse(json);stations.forEach((p,i)=>{const word=['hello.','A1','B2','beyond.'][i];const geometry=new TextGeometry(word,{font,size:i===0||i===3?1.25:2.4,depth:.24,curveSegments:8,bevelEnabled:true,bevelThickness:.025,bevelSize:.018,bevelSegments:3});geometry.computeBoundingBox();const w=geometry.boundingBox.max.x;geometry.translate(-w/2,0,0);const text=new THREE.Mesh(geometry,i%2?teal:dark);text.position.copy(p).add(new THREE.Vector3(1.3,-.7,2));text.rotation.y=-.15;scene.add(text);});}).catch(e=>console.warn('3D labels unavailable',e));
}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio,mobile.matches?1.5:1.75));}
addEventListener('resize',resize);
try{init();}catch(e){document.body.classList.add('no-webgl');console.warn('La escena 3D no está disponible.',e);}
function draw(now){requestAnimationFrame(draw);if(!renderer||document.hidden)return;const dt=Math.min((now-previous)/1000,.05);previous=now;current=reduced.matches?target:THREE.MathUtils.damp(current,target,4,dt);
 const closest=Math.min(3,Math.round(current*3));const distance=Math.abs(current-closest/3);const opacity=1-THREE.MathUtils.smoothstep(distance,.035,.13);
 chapters.forEach((el,i)=>{const active=i===closest&&opacity>.02;el.style.setProperty('--chapter-opacity',active?opacity:0);el.classList.toggle('is-active',active);el.inert=!active;});document.body.style.setProperty('--panel-opacity',opacity);label.textContent=`0${closest+1} / 04`;
 const p=routeAt(current);const ahead=routeAt(Math.min(1,current+.035));pos.copy(p);const final=stations[closest];const atStation=1-THREE.MathUtils.smoothstep(distance,.025,.13);look.copy(ahead).add(new THREE.Vector3(0,0,-8));turn.copy(final).add(new THREE.Vector3(mobile.matches?0:-1,0,-1));look.lerp(turn,atStation);
 if(mobile.matches){pos.x+=2;pos.y+=1.3;pos.z+=4;}
 if(!reduced.matches){pos.x+=pointer.x*.16;pos.y-=pointer.y*.12;}camera.position.copy(pos);camera.lookAt(look);if(!reduced.matches)camera.rotateZ(Math.sin(current*Math.PI*6)*.028*(1-atStation));
 const time=now*.0004;for(const f of floating){f.obj.position.y=f.base.y+(reduced.matches?0:Math.sin(time+f.phase)*.12);}
 renderer.render(scene,camera);
}
requestAnimationFrame(draw);
