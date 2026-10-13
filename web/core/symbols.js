import {cloneProject,normalizeNode,uid,validateProject} from './model.js';

function candidateFor(project){
 const candidate=cloneProject(project);
 candidate.version=2;candidate.symbols??=[];
 return candidate;
}
function scopeFor(project,scopeId){
 if(scopeId===undefined||scopeId===null)return project;
 const scope=project.symbols.find(symbol=>symbol.id===scopeId);
 if(!scope)throw new Error('The symbol editing scope no longer exists');
 return scope;
}
function symbolId(project){
 let id;do{id=`s${uid()}`;}while(project.symbols.some(symbol=>symbol.id===id));return id;
}
function publish(project,candidate){Object.assign(project,validateProject(candidate));}
function requireSize(value,fallback){
 if(value===undefined)return fallback;
 if(!Number.isFinite(value)||value<1||value>10000)throw new Error('Symbol dimensions must be between 1 and 10,000 pixels');
 return value;
}
/** Create an empty reusable graphic; the caller decides whether to place an instance. */
export function createSymbol(project,name='Symbol',{width,height,duration}={}){
 const candidate=candidateFor(project),id=symbolId(candidate);
 if(duration!==undefined&&(!Number.isInteger(duration)||duration<1||duration>36000))throw new Error('Symbol duration must be an integer between 1 and 36,000 frames');
 candidate.symbols.push({id,name,width:requireSize(width,project.width),height:requireSize(height,project.height),duration:duration??project.duration,camera:cloneProject(project.camera),nodes:[]});
 publish(project,candidate);return id;
}
/** All edits are transactional: invalid references or budgets leave the input untouched. */
export function addSymbolInstance(project,id,{scopeId,x,y}={}){
 const candidate=candidateFor(project),definition=candidate.symbols.find(symbol=>symbol.id===id);
 if(!definition)throw new Error('The symbol definition no longer exists');
 const scope=scopeFor(candidate,scopeId);
 for(const value of [x,y])if(value!==undefined&&(!Number.isFinite(value)||Math.abs(value)>100000))throw new Error('Instance coordinates must be finite and within 100,000 pixels');
 const instance=normalizeNode({id:uid(),name:definition.name,type:'symbol',symbolId:id,playback:'loop',firstFrame:0,startFrame:0,width:definition.width,height:definition.height,x:x??(scope.width-definition.width)/2,y:y??(scope.height-definition.height)/2});
 scope.nodes.push(instance);publish(project,candidate);return instance.id;
}
/**
 * Reparent contiguous layers without changing their local geometry or clock.
 * Animated positions translate with their base positions; masks stay local.
 * Nonadjacent layers cannot be grouped without changing compositing order.
 */
export function convertNodesToSymbol(project,nodeIds,name='Symbol',{scopeId}={}){
 if(!Array.isArray(nodeIds)||!nodeIds.length)throw new Error('Select at least one layer to convert to a symbol');
 if(new Set(nodeIds).size!==nodeIds.length)throw new Error('Selected layer IDs must be unique');
 const candidate=candidateFor(project),scope=scopeFor(candidate,scopeId),ids=new Set(nodeIds);
 const selected=scope.nodes.filter(node=>ids.has(node.id));
 if(selected.length!==ids.size)throw new Error('A selected layer no longer exists');
 if(selected.some(node=>node.locked))throw new Error('Unlock selected layers before converting them to a symbol');
 const first=scope.nodes.findIndex(node=>ids.has(node.id));
 if(scope.nodes.slice(first,first+selected.length).some(node=>!ids.has(node.id)))throw new Error('Select adjacent layers to preserve compositing order when converting to a symbol');
 const x=Math.min(...selected.map(node=>node.x)),y=Math.min(...selected.map(node=>node.y));
 const width=Math.max(...selected.map(node=>node.x+node.width))-x,height=Math.max(...selected.map(node=>node.y+node.height))-y;
 requireSize(width,1);requireSize(height,1);
 for(const node of selected){
  for(const [property,offset] of [['x',x],['y',y]]){
   node[property]-=offset;
   if(!Number.isFinite(node[property])||Math.abs(node[property])>100000)throw new Error('Conversion would exceed local coordinate bounds');
   for(const key of node.keyframes)if(key[property]!==undefined){
    key[property]-=offset;
    if(!Number.isFinite(key[property])||Math.abs(key[property])>100000)throw new Error('Conversion would exceed animated local coordinate bounds');
   }
  }
 }
 const id=symbolId(candidate);
 candidate.symbols.push({id,name,width,height,duration:scope.duration,camera:cloneProject(scope.camera),nodes:selected});
 const instance=normalizeNode({id:uid(),name,type:'symbol',symbolId:id,x,y,width,height,playback:'loop',firstFrame:0,startFrame:0});
 scope.nodes.splice(first,selected.length,instance);
 publish(project,candidate);return {symbolId:id,instanceId:instance.id};
}
/** References in unused definitions also prevent deletion. */
export function removeSymbolDefinition(project,id){
 const candidate=candidateFor(project),index=candidate.symbols.findIndex(symbol=>symbol.id===id);
 if(index<0)throw new Error('The symbol definition no longer exists');
 for(const scope of [candidate,...candidate.symbols])if(scope.nodes.some(node=>node.type==='symbol'&&node.symbolId===id))throw new Error('This symbol is in use. Remove its instances before deleting the definition.');
 candidate.symbols.splice(index,1);publish(project,candidate);return id;
}
