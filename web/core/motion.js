import { cloneProject, evaluateNode, validateProject, ANIMATED_PROPERTIES, setKeyframeTiming } from './model.js';

export const motionPresets = Object.freeze([
  {id:'fadeIn',name:'Fade in',description:'A clean opacity entrance.'},
  {id:'slideUp',name:'Rise',description:'Lift into place with a smooth fade.'},
  {id:'pop',name:'Pop',description:'Scale through a small overshoot and settle.'},
  {id:'spin3d',name:'3D revolution',description:'A full rotation around the vertical axis.',meshOnly:true},
  {id:'float',name:'Float',description:'A gentle looping rise and fall.'},
  {id:'blurReveal',name:'Focus reveal',description:'Resolve from a soft blur into sharp detail.'}
]);

function sequenceFor(node, preset) {
  const opacity=node.opacity,scale=node.scale;
  switch(preset) {
    case 'fadeIn':return [{at:0,opacity:0},{at:1,opacity,easing:'easeOut'}];
    case 'slideUp':return [{at:0,y:node.y+Math.max(30,Math.min(120,node.height*.4)),opacity:0},{at:1,y:node.y,opacity,easing:'bezier',bezier:[.16,1,.3,1]}];
    case 'pop':return [{at:0,scale:scale*.25,opacity:0},{at:.7,scale:scale*1.12,opacity,easing:'easeOut'},{at:1,scale,opacity,easing:'easeInOut'}];
    case 'spin3d':return [{at:0,rotationY:node.rotationY},{at:1,rotationY:node.rotationY+360,easing:'linear'}];
    case 'float':return [{at:0,y:node.y},{at:.5,y:node.y-Math.max(12,Math.min(45,node.height*.15)),easing:'easeInOut'},{at:1,y:node.y,easing:'easeInOut'}];
    case 'blurReveal':return [{at:0,blur:Math.max(18,node.blur),opacity:0},{at:1,blur:node.blur,opacity,easing:'easeOut'}];
  }
}

// Preserve the legacy default and unrelated overrides, then author the preset's
// own sparse timing on every property that it controls.
function mergeKey(existing,incoming,properties){
  for(const property of properties)if(Number.isFinite(incoming[property])){existing[property]=incoming[property];setKeyframeTiming(existing,property,incoming);}
  return existing;
}

/** Author actual keys and independent timing without changing unrelated tracks. */
export function applyMotionPreset(project, ids, preset, {startFrame=0,durationFrames=30,stagger=0}={}) {
  const spec=motionPresets.find(p=>p.id===preset);
  if(!spec)throw new Error('Unknown motion preset');
  const selected=[...new Set(Array.isArray(ids)?ids:[ids])];
  if(!selected.length)throw new Error('Select a layer to apply motion');
  if(!Number.isFinite(startFrame)||!Number.isFinite(durationFrames)||!Number.isFinite(stagger)||startFrame<0||durationFrames<1||stagger<0)throw new Error('Motion timing must use nonnegative frames and a positive duration');
  const candidate=cloneProject(project);
  selected.forEach((id,index)=>{
    const node=candidate.nodes.find(n=>n.id===id);
    if(!node)throw new Error('The selected layer no longer exists');
    if(node.locked)throw new Error(`Unlock ${node.name} before applying motion`);
    if(spec.meshOnly&&node.type!=='mesh')throw new Error('3D revolution requires a 3D layer');
    const start=Math.round(startFrame+index*stagger),end=start+Math.round(durationFrames);
    if(end>=candidate.duration)throw new Error('Motion exceeds the timeline. Shorten the preset or extend the composition duration.');
    if(end<=start)throw new Error('Leave at least two frames for a motion preset');
    const sequence=sequenceFor(evaluateNode(node,start),preset);
    const properties=Object.keys(sequence[0]).filter(key=>ANIMATED_PROPERTIES.includes(key));
    for(const key of node.keyframes)if(key.frame>=start&&key.frame<=end)for(const property of properties){delete key[property];if(key.curves)delete key.curves[property];}
    node.keyframes=node.keyframes.filter(key=>ANIMATED_PROPERTIES.some(property=>Number.isFinite(key[property])));
    // An entrance with no preceding track holds its initial pose until its staggered start.
    if(start>0&&!node.keyframes.some(key=>key.frame<start&&properties.some(property=>key[property]!==undefined))){
      const initial={...sequence[0],frame:0,easing:'linear'};delete initial.at;
      let key=node.keyframes.find(key=>key.frame===0);if(key)mergeKey(key,initial,properties);else node.keyframes.push(mergeKey(initial,initial,properties));
    }
    for(const sample of sequence){
      const key={...sample,frame:Math.round(start+(end-start)*sample.at),easing:sample.easing||'easeInOut'};delete key.at;
      const existing=node.keyframes.find(k=>k.frame===key.frame);
      if(existing)mergeKey(existing,key,properties);else node.keyframes.push(mergeKey(key,key,properties));
    }
    node.keyframes.sort((a,b)=>a.frame-b.frame);
    if(node.keyframes.length>1000)throw new Error('A motion preset would exceed the 1,000 keyframe layer limit. Remove unused keys first.');
  });
  const validated=validateProject(candidate);
  project.nodes=validated.nodes;
  return selected;
}
