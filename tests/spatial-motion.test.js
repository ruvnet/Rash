import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_SPATIAL_OFFSET,createProject,addNode,evaluateNode,parseProject,serializeProject,validateProject} from '../web/core/model.js';

function spatialProject(){
 const project=createProject('blank'),node=addNode(project);
 node.x=0;node.y=0;
 node.keyframes=[
  {frame:0,x:0,y:0,easing:'linear'},
  {frame:100,x:100,y:0,easing:'linear',spatial:{out:[0,100],in:[0,100]}}
 ];
 return {project,node};
}

test('spatial cubic handles normalize and roundtrip without changing their relative schema',()=>{
 const {project}=spatialProject(),normalized=validateProject(project);
 assert.deepEqual(normalized.nodes[0].keyframes[1].spatial,{out:[0,100],in:[0,100]});
 assert.deepEqual(parseProject(serializeProject(normalized)),normalized);
});

test('spatial auto-orient follows the cubic tangent through its exact destination',()=>{
 const {project}=spatialProject(),destination=project.nodes[0].keyframes[1];
 destination.spatial.orient=true;
 const normalized=validateProject(project),node=normalized.nodes[0];
 assert.deepEqual(node.keyframes[1].spatial,{out:[0,100],in:[0,100],orient:true});
 assert.equal(evaluateNode(node,50).rotation,0);
 assert.equal(evaluateNode(node,100).rotation,-90);
 assert.deepEqual(parseProject(serializeProject(normalized)),normalized);
});

test('disabled or omitted auto-orient preserves authored rotation timing',()=>{
 for(const orient of [undefined,false]){
  const {project}=spatialProject(),node=project.nodes[0],destination=node.keyframes[1];
  node.rotation=10;node.keyframes[0].rotation=10;destination.rotation=50;destination.curves={rotation:{easing:'linear'}};
  if(orient!==undefined)destination.spatial.orient=orient;
  const normalized=validateProject(project),evaluated=evaluateNode(normalized.nodes[0],50);
  assert.equal(evaluated.rotation,30);
  assert.equal(Object.hasOwn(normalized.nodes[0].keyframes[1].spatial,'orient'),false);
 }
});

test('auto-orient falls back deterministically when an endpoint derivative is zero',()=>{
 const {project}=spatialProject(),node=project.nodes[0],destination=node.keyframes[1];
 destination.spatial={out:[0,0],in:[0,0],orient:true};
 const normalized=validateProject(project).nodes[0];
 assert.equal(evaluateNode(normalized,0).rotation,0,'Nearby curve samples recover the start tangent');
 assert.equal(evaluateNode(normalized,100).rotation,0,'Nearby curve samples recover the destination tangent');
 node.x=5;node.y=5;node.rotation=37;node.keyframes=[{frame:0,x:5,y:5},{frame:10,x:5,y:5,spatial:{out:[0,0],in:[0,0],orient:true}}];
 const stationary=validateProject(project).nodes[0];
 assert.equal(evaluateNode(stationary,5).rotation,37,'A stationary path falls back to authored rotation');
});

test('spatial cubic follows one curved x/y path with exact endpoints',()=>{
 const {node}=spatialProject();
 node.opacity=0;node.keyframes[0].opacity=0;node.keyframes[1].opacity=1;
 node.keyframes[1].curves={opacity:{easing:'easeIn'}};
 const start=evaluateNode(node,0),middle=evaluateNode(node,50),end=evaluateNode(node,100);
 assert.deepEqual({x:start.x,y:start.y},{x:0,y:0});
 assert.deepEqual({x:end.x,y:end.y},{x:100,y:0});
 assert.equal(middle.x,50);
 assert.equal(middle.y,75,'The midpoint must deviate from the straight chord');
 assert.equal(middle.opacity,.25,'Non-position properties retain independent property timing');
});

test('spatial handles reject ambiguity and nonfinite offsets and clamp finite input',()=>{
 const {project}=spatialProject(),destination=project.nodes[0].keyframes[1];
 destination.spatial.out[0]=Infinity;
 assert.throws(()=>validateProject(project),/finite offsets/);
 destination.spatial.out[0]=MAX_SPATIAL_OFFSET*2;
 assert.equal(validateProject(project).nodes[0].keyframes[1].spatial.out[0],MAX_SPATIAL_OFFSET);
 destination.spatial={out:[0,1],in:[0]};
 assert.throws(()=>validateProject(project),/finite offsets/);
 destination.spatial={out:[0,1],in:[0,1]};delete destination.y;
 assert.throws(()=>validateProject(project),/destination must define finite x and y/);
 destination.y=0;project.nodes[0].keyframes.splice(1,0,{frame:50,x:25});
 assert.throws(()=>validateProject(project),/start at a keyframe with x and y/);
 destination.spatial.orient='true';
 assert.throws(()=>validateProject(project),/auto-orient must be a boolean/);
});

test('legacy x/y interpolation and serialized key shape remain unchanged without spatial handles',()=>{
 const project=createProject('blank'),node=addNode(project);
 node.x=0;node.y=20;node.keyframes=[{frame:0,x:0,y:20,easing:'linear'},{frame:100,x:100,y:120,easing:'linear'}];
 const normalized=validateProject(project),middle=evaluateNode(normalized.nodes[0],50);
 assert.deepEqual({x:middle.x,y:middle.y},{x:50,y:70});
 assert.equal(Object.hasOwn(normalized.nodes[0].keyframes[1],'spatial'),false);
 assert.equal(serializeProject(normalized).includes('"spatial"'),false);
});
