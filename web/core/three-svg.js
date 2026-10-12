// Three.js geometry and camera math, rasterizer independent SVG output.
// Meshes are depth sorted internally; SVG layer order governs separate meshes.
import {BoxGeometry,SphereGeometry,TorusGeometry,Vector3,Matrix4,Euler,PerspectiveCamera,Color} from '../vendor/three-vector.js';
import {safeColor,MESH_TRIANGLES} from './model.js';
export {MESH_TRIANGLES};
export const meshTriangleCount=primitive=>Object.hasOwn(MESH_TRIANGLES,primitive)?MESH_TRIANGLES[primitive]:MESH_TRIANGLES.box;

const geometries=new Map();
const rad=Math.PI/180;
const scaleMatrix=new Matrix4(),rotationMatrix=new Matrix4(),modelMatrix=new Matrix4();
const rotation=new Euler(),camera=new PerspectiveCamera(45,1,1,50000);
const a=new Vector3(),b=new Vector3(),c=new Vector3(),ab=new Vector3(),ac=new Vector3(),normal=new Vector3(),viewer=new Vector3();
const pa=new Vector3(),pb=new Vector3(),pc=new Vector3(),light=new Vector3(-.4,.65,1).normalize(),color=new Color();
const projectionScale=800*Math.tan(45*rad/2);
const finite=(v,fallback,min,max)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
const num=v=>Math.round(v*1000)/1000;
const namedColors={black:'000000',white:'ffffff',red:'ff0000',green:'008000',blue:'0000ff',yellow:'ffff00',cyan:'00ffff',magenta:'ff00ff',orange:'ffa500',purple:'800080',gray:'808080',grey:'808080'};

function geometryFaces(primitive){
 primitive=Object.hasOwn(MESH_TRIANGLES,primitive)?primitive:'box';
 if(geometries.has(primitive))return geometries.get(primitive);
 let faces=[];
 if(primitive==='pyramid'){
  const vertices=[[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5],[-.5,-.5,.5],[0,.5,0]];
  // Six outward facing triangles; no redundant center vertex on the base.
  faces=[[0,4,1],[1,4,2],[2,4,3],[3,4,0],[0,2,3],[0,1,2]].map(indices=>indices.flatMap(i=>vertices[i]));
 }else{
  const geometry=primitive==='sphere'?new SphereGeometry(.5,12,8):primitive==='torus'?new TorusGeometry(.35,.15,8,12):new BoxGeometry(1,1,1);
  const positions=geometry.getAttribute('position'),indices=geometry.index;
  const count=indices?indices.count:positions.count;
  for(let i=0;i<count;i+=3){const face=[];for(let j=0;j<3;j++){const index=indices?indices.getX(i+j):i+j;face.push(positions.getX(index),positions.getY(index),positions.getZ(index));}faces.push(face);}
  geometry.dispose();
 }
 geometries.set(primitive,faces);
 return faces;
}

function material(value){
 let safe=safeColor(value,'#ffffff').toLowerCase();
 if(safe==='none'||safe==='transparent')return {hex:'ffffff',alpha:0};
 if(namedColors[safe])safe='#'+namedColors[safe];
 let hex=safe.slice(1);if(hex.length===3||hex.length===4)hex=[...hex].map(c=>c+c).join('');
 return {hex:hex.slice(0,6),alpha:hex.length===8?parseInt(hex.slice(6),16)/255:1};
}

/** Bounded deterministic faces in local SVG coordinates, back to front. */
export function meshPaths(node,cameraOptions={}){
 const width=finite(node.width,160,1,10000),height=finite(node.height,100,1,10000);
 const yaw=finite(cameraOptions?.yaw,0,-180,180)*rad,pitch=finite(cameraOptions?.pitch,0,-180,180)*rad;
 const distance=finite(cameraOptions?.distance,800,500,2000);
 camera.fov=finite(cameraOptions?.fov,45,20,90);camera.updateProjectionMatrix();
 camera.position.set(Math.sin(yaw)*Math.cos(pitch)*distance,Math.sin(pitch)*distance,Math.cos(yaw)*Math.cos(pitch)*distance);
 camera.up.set(0,Math.cos(pitch)<0?-1:1,0);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
 rotation.set(finite(node.rotationX,0,-100000,100000)*rad,finite(node.rotationY,0,-100000,100000)*rad,0,'XYZ');
 rotationMatrix.makeRotationFromEuler(rotation);scaleMatrix.makeScale(width,height,Math.min(width,height));
 modelMatrix.multiplyMatrices(rotationMatrix,scaleMatrix);modelMatrix.setPosition(0,0,finite(node.z,0,-300,300));
 const fill=material(node.fill),stroke=safeColor(node.stroke,'none'),wireframe=node.wireframe===true;
 const faces=[];
 for(const [id,vertices] of geometryFaces(node.primitive).entries()){
  a.fromArray(vertices,0).applyMatrix4(modelMatrix);b.fromArray(vertices,3).applyMatrix4(modelMatrix);c.fromArray(vertices,6).applyMatrix4(modelMatrix);
  ab.subVectors(b,a);ac.subVectors(c,a);normal.crossVectors(ab,ac).normalize();viewer.subVectors(camera.position,a);
  if(normal.dot(viewer)<=0)continue;
  pa.copy(a).applyMatrix4(camera.matrixWorldInverse);pb.copy(b).applyMatrix4(camera.matrixWorldInverse);pc.copy(c).applyMatrix4(camera.matrixWorldInverse);
  // Cull near-plane crossings rather than projecting infinite geometry.
  if(pa.z>=-camera.near||pb.z>=-camera.near||pc.z>=-camera.near)continue;
  const depth=(pa.z+pb.z+pc.z)/3;
  pa.applyMatrix4(camera.projectionMatrix);pb.applyMatrix4(camera.projectionMatrix);pc.applyMatrix4(camera.projectionMatrix);
  const points=[pa,pb,pc].map(v=>[num(width/2+v.x*projectionScale),num(height/2-v.y*projectionScale)]);
  if(points.some(point=>point.some(v=>!Number.isFinite(v)||Math.abs(v)>100000)))continue;
  const shade=.3+.7*Math.max(0,normal.dot(light));color.setHex(parseInt(fill.hex,16)).multiplyScalar(shade);
  const shaded='#'+color.getHexString();
  faces.push({id:`face${id}`,d:`M${points.map(point=>point.join(' ')).join('L')}Z`,fill:wireframe?'none':shaded,fillOpacity:num(fill.alpha),stroke:wireframe?(stroke==='none'?safeColor(node.fill,'#ffffff'):stroke):stroke,strokeWidth:wireframe?Math.max(.75,finite(node.strokeWidth,1,0,100)):finite(node.strokeWidth,0,0,100),depth});
 }
 faces.sort((a,b)=>a.depth-b.depth||a.id.localeCompare(b.id));
 return faces.map(({depth,...face})=>face);
}
