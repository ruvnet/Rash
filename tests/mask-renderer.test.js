import test from 'node:test';
import assert from 'node:assert/strict';
import {createProject,normalizeNode,validateProject,evaluateNode,filterSceneBounds} from '../web/core/model.js';
import {sceneToSVG,maskId,maskReference,maskAttributes,maskMarkup} from '../web/core/renderer.js';
import {animatedSVG} from '../web/export/svg.js';

const scene=(extra={})=>{
 const project=createProject('blank');project.duration=11;
 project.nodes=[normalizeNode({id:'masked',type:'rect',width:100,height:80,maskType:'rect',maskWidth:0,maskHeight:80,keyframes:[{frame:10,maskWidth:100,easing:'linear'}],...extra})];
 return project;
};
const clip=svg=>svg.match(/<clipPath\b[\s\S]*?<\/clipPath>/)?.[0]||'';
const track=(svg,attribute)=>svg.match(new RegExp(`attributeName="${attribute}"(?: type="[^"]+")? values="([^"]+)"`))?.[1].split(';');

test('mask helpers expose bounded local rectangular and elliptical geometry with a shared pivot',()=>{
 const rect=normalizeNode({id:'r',width:100,height:80,maskType:'rect',maskX:10,maskY:20,maskWidth:60,maskHeight:40,maskRotation:35});
 assert.deepEqual(maskAttributes(rect),{x:10,y:20,width:60,height:40,transform:'rotate(35 40 40)'});
 assert.deepEqual(maskAttributes({...rect,maskType:'ellipse'}),{cx:40,cy:40,rx:30,ry:20,transform:'rotate(35 40 40)'});
 assert.match(maskMarkup(rect),/<clipPath id="rash-mask-r" clipPathUnits="userSpaceOnUse"><rect/);
 assert.match(maskMarkup({...rect,maskType:'ellipse'}),/<ellipse/);
 assert.equal(maskReference({...rect,maskType:'none'}),null);assert.equal(maskMarkup({...rect,maskType:'none'}),'');
});

test('still exports apply evaluated mask timing to every renderable layer type',()=>{
 for(const type of ['rect','ellipse','text','path','mesh']){
  const project=scene({type,text:'Reveal',d:'M0 0L100 0L100 80Z',maskRotation:15,opacity:.2,keyframes:[{frame:10,maskWidth:100,opacity:1,easing:'linear',curves:{maskWidth:{easing:'easeOut'}}}]});
  const svg=sceneToSVG(project,5),geometry=maskAttributes(evaluateNode(project.nodes[0],5));
  for(const [attribute,value]of Object.entries(geometry))assert.ok(clip(svg).includes(`${attribute}="${value}"`),`${type}: ${attribute}`);
  assert.match(svg,/clip-path="url\(#rash-mask-masked\)"/);assert.ok(Math.abs(Number(svg.match(/ opacity="([^"]+)"/)[1])-.6)<1e-9);
  assert.equal(geometry.width,75);assert.equal(geometry.transform,'rotate(15 37.5 40)');
 }
});

test('animated SVG samples rectangle size, pivot, and independently eased opacity',()=>{
 const project=scene({opacity:.2,keyframes:[{frame:10,maskWidth:100,opacity:1,maskRotation:90,easing:'linear',curves:{maskWidth:{easing:'easeOut'}}}]});
 const svg=animatedSVG(project),definition=clip(svg);
 assert.equal(track(definition,'width')[5],'75');
 assert.equal(track(definition,'transform')[5],'45 37.5 40');
 assert.equal(track(svg,'opacity')[5],'0.6');
 assert.equal(track(definition,'width').length,project.duration+1);
 assert.match(svg,/<g clip-path="url\(#rash-export-mask-masked\)">/);
});

test('ellipse animation uses the same sampled center and radii as still output including zero area',()=>{
 const project=scene({maskType:'ellipse',maskX:50,maskY:40,maskWidth:0,maskHeight:0,keyframes:[{frame:10,maskX:0,maskY:0,maskWidth:100,maskHeight:80,maskRotation:45,easing:'linear'}]});
 const definition=clip(animatedSVG(project));assert.match(definition,/<ellipse cx="50" cy="40" rx="0" ry="0"/);
 for(const frame of [0,5,10]){
  const geometry=maskAttributes(evaluateNode(project.nodes[0],frame));
  for(const attribute of ['rx','ry'])assert.equal(Number(track(definition,attribute)[frame]),geometry[attribute]);
  assert.equal(track(definition,'transform')[frame],geometry.transform.slice(7,-1));
  assert.ok(clip(sceneToSVG(project,frame)).includes(`rx="${geometry.rx}"`));
 }
});

test('mask-only animation retains one static mesh geometry rather than sampling triangle frames',()=>{
 const project=scene({type:'mesh',primitive:'torus'});project.duration=1100;project.nodes[0].keyframes[0].frame=1099;
 const svg=animatedSVG(project);
 assert.doesNotMatch(svg,/data-mesh-frame/);assert.match(clip(svg),/attributeName="width"/);
 assert.ok((svg.match(/<path /g)||[]).length<=192);
 project.camera.keyframes=[{frame:1099,yaw:30,easing:'linear'}];
 assert.throws(()=>animatedSVG(project),/200,000 triangle-frame/);
});

test('effect clipping is outside the filtered body and does not reduce authored filter allocation',()=>{
 const project=scene({glow:4,maskWidth:0});
 const svg=animatedSVG(project);assert.match(svg,/<g clip-path="url\(#rash-export-mask-masked\)"><g filter="url\(#rash-export-effect-masked\)">/);
 const clean=validateProject(project),bounds=filterSceneBounds(clean.nodes[0],clean.camera);
 const filter=sceneToSVG(clean,5).match(/<filter\b[^>]*>/)[0];
 for(const [attribute,value]of Object.entries(bounds))assert.ok(filter.includes(`${attribute}="${value}"`));
 project.nodes[0].width=10000;project.nodes[0].height=10000;
 assert.throws(()=>sceneToSVG(project),/filter budget/);assert.throws(()=>animatedSVG(project),/filter budget/);
});

test('mask IDs, attributes, and untrusted imported references stay inert',()=>{
 const unsafe={id:'" onload="alert(1)',maskType:'rect',maskX:Infinity,maskY:NaN,maskWidth:-10,maskHeight:1e20,maskRotation:'" onload="x',mask:'url(https://evil.test)'};
 const markup=maskMarkup(unsafe,'prefix" onload="');
 assert.doesNotMatch(markup,/ onload=|Infinity|NaN|https:|javascript:/);
 assert.match(markup,/width="0" height="10000"/);assert.match(markup,/rotate\(0 0 5000\)/);
 assert.equal(maskId('a','one'), 'one-mask-a');assert.notEqual(maskId('a','one'),maskId('a','two'));
 assert.equal(maskMarkup({...unsafe,maskType:'url(https://evil.test)'}),'');
 const project=scene(unsafe),svg=animatedSVG(project);
 assert.doesNotMatch(svg,/onload=|https:\/\/evil|javascript:/);
});

test('clip tracks consume the SVG allocation budget before sample construction',()=>{
 const project=scene();project.duration=20000;
 project.nodes=[0,1].map(index=>normalizeNode({...project.nodes[0],id:`mask${index}`,keyframes:[{frame:19999,maskWidth:100,easing:'linear'}]}));
 assert.throws(()=>animatedSVG(project),/16 MB output budget/);
 for(const node of project.nodes)node.maskType='none';
 assert.doesNotThrow(()=>animatedSVG(project),'Same timeline without clip tracks remains under its smaller byte estimate');
});

test('static clips use still export without creating animation or changing disabled scenes',()=>{
 const project=scene({keyframes:[]});
 assert.equal(animatedSVG(project),sceneToSVG(project,0));assert.doesNotMatch(animatedSVG(project),/<animate/);
 project.nodes[0].maskType='none';assert.doesNotMatch(sceneToSVG(project),/clipPath|clip-path/);
});
