import {test} from 'node:test';
import assert from 'node:assert/strict';
import {addKeyframe,addNode,copyLayerFrame,createProject,evaluateNode,insertTimelineFrames,removeFrameLabel,removeTimelineFrames,setFrameLabel,setLayerExposure,validateProject} from '../web/core/model.js';
import {createSymbol} from '../web/core/symbols.js';

function fixture(){
 const project=createProject('blank');project.duration=12;
 const layer=addNode(project);layer.x=0;layer.keyframes=[{frame:2,x:20,easing:'linear'},{frame:6,x:60,easing:'easeOut'},{frame:10,x:100,easing:'linear'}];
 project.camera.keyframes=[{frame:2,yaw:2},{frame:10,yaw:10}];return {project,layer};
}

test('inserting frames shifts every track without changing authored poses',()=>{
 const {project}=fixture();insertTimelineFrames(project,6,3);const layer=project.nodes[0];
 assert.equal(project.duration,15);assert.deepEqual(layer.keyframes.map(key=>key.frame),[2,9,13]);assert.deepEqual(project.camera.keyframes.map(key=>key.frame),[2,13]);
 assert.equal(evaluateNode(layer,9).x,60);assert.deepEqual(validateProject(project),project);
});

test('removing frames drops covered keys, shifts later keys and keeps one frame',()=>{
 const {project}=fixture();removeTimelineFrames(project,4,4);const layer=project.nodes[0];
 assert.equal(project.duration,8);assert.deepEqual(layer.keyframes.map(key=>key.frame),[2,6]);assert.deepEqual(project.camera.keyframes.map(key=>key.frame),[2,6]);
 assert.throws(()=>removeTimelineFrames({...createProject('blank'),duration:1},0,1),/keep at least one frame/);
});

test('copying a frame materializes the evaluated pose and is atomic on failure',()=>{
 const {project,layer:original}=fixture(),expected=evaluateNode(original,4);copyLayerFrame(project,original.id,4,8);const layer=project.nodes[0];
 const copied=layer.keyframes.find(key=>key.frame===8);for(const property of ['x','y','rotation','opacity','scale'])assert.equal(copied[property],expected[property]);
 const expectedLater=evaluateNode(layer,7);copyLayerFrame(project,layer.id,7,4);assert.equal(project.nodes[0].keyframes.find(key=>key.frame===4).x,expectedLater.x,'An earlier destination must not affect source sampling');
 const before=JSON.stringify(project);assert.throws(()=>copyLayerFrame(project,layer.id,4,99),/Destination frame/);assert.equal(JSON.stringify(project),before);
 project.nodes[0].locked=true;assert.throws(()=>copyLayerFrame(project,layer.id,4,8),/Unlock/);
});

test('timeline edits reject overflow before mutating source',()=>{
 const project=createProject('blank');project.duration=36000;const before=JSON.stringify(project);
 assert.throws(()=>insertTimelineFrames(project,0,1),/at most 36,000/);assert.equal(JSON.stringify(project),before);
});

test('frame labels validate, retime with timeline edits and remain atomic',()=>{
 const project=createProject('blank');project.duration=12;
 setFrameLabel(project,2,'Intro');setFrameLabel(project,6,'Loop');setFrameLabel(project,10,'Exit');
 assert.deepEqual(project.frameLabels,[{frame:2,name:'Intro'},{frame:6,name:'Loop'},{frame:10,name:'Exit'}]);
 insertTimelineFrames(project,6,3);assert.deepEqual(project.frameLabels.map(label=>label.frame),[2,9,13]);
 removeTimelineFrames(project,8,3);assert.deepEqual(project.frameLabels,[{frame:2,name:'Intro'},{frame:10,name:'Exit'}],'Labels inside removed time are dropped and later labels shift');
 setFrameLabel(project,2,'Opening');assert.deepEqual(project.frameLabels[0],{frame:2,name:'Opening'});
 const before=JSON.stringify(project);assert.throws(()=>setFrameLabel(project,4,'Exit'),/unique/);assert.equal(JSON.stringify(project),before);
 removeFrameLabel(project,2);assert.deepEqual(project.frameLabels,[{frame:10,name:'Exit'}]);
 assert.throws(()=>validateProject({...project,frameLabels:[{frame:project.duration,name:'Past end'}]}),/within the composition timeline/);
});

test('symbol definitions retain independent frame labels',()=>{
 const project=createProject('blank'),symbolId=createSymbol(project,'Labeled clip',{duration:24}),definition=project.symbols.find(symbol=>symbol.id===symbolId);
 const scope={...project,name:definition.name,width:definition.width,height:definition.height,duration:definition.duration,frameLabels:definition.frameLabels||[],camera:definition.camera,nodes:definition.nodes};
 setFrameLabel(scope,4,'Start');insertTimelineFrames(scope,2,2);Object.assign(definition,{duration:scope.duration,frameLabels:scope.frameLabels,camera:scope.camera,nodes:scope.nodes});
 const validated=validateProject(project),saved=validated.symbols.find(symbol=>symbol.id===symbolId);
 assert.deepEqual(saved.frameLabels,[{frame:6,name:'Start'}]);assert.deepEqual(validated.frameLabels??[],[]);
});

test('blank keyframes hold exposure until a layer is explicitly exposed',()=>{
 const {project,layer}=fixture();setLayerExposure(project,layer.id,4,false);setLayerExposure(project,layer.id,8,true);
 assert.equal(evaluateNode(project.nodes[0],3).visible,true);assert.equal(evaluateNode(project.nodes[0],4).visible,false);assert.equal(evaluateNode(project.nodes[0],7).visible,false);assert.equal(evaluateNode(project.nodes[0],8).visible,true);
 assert.equal(project.nodes[0].keyframes.find(key=>key.frame===4).blank,true);assert.equal(project.nodes[0].keyframes.find(key=>key.frame===8).blank,false);
 const restored=addKeyframe(project,layer.id,5);assert.equal(restored.blank,false,'A normal keyframe restores layer exposure');assert.equal(evaluateNode(project.nodes[0],5).visible,true);
 assert.equal(validateProject(project).nodes[0].keyframes.find(key=>key.frame===4).blank,true);
});

test('frame edits and pose copies preserve discrete exposure state atomically',()=>{
 const {project,layer}=fixture();setLayerExposure(project,layer.id,4,false);insertTimelineFrames(project,2,2);
 assert.equal(project.nodes[0].keyframes.find(key=>key.frame===6).blank,true);copyLayerFrame(project,layer.id,6,9);
 assert.equal(project.nodes[0].keyframes.find(key=>key.frame===9).blank,true);assert.equal(evaluateNode(project.nodes[0],9).visible,false);
 removeTimelineFrames(project,5,2);assert.equal(project.nodes[0].keyframes.find(key=>key.frame===7).blank,true);
 project.nodes[0].locked=true;const before=JSON.stringify(project);assert.throws(()=>setLayerExposure(project,layer.id,3,true),/Unlock/);assert.equal(JSON.stringify(project),before);
});
