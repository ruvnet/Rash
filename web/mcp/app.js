import {validateProject,safeColor} from '../core/model.js';
import {sceneToSVG} from '../core/renderer.js';
const $=id=>document.getElementById(id);
let sequence=0,hostOrigin=null,ready=false,record=null,draft=null,dirty=false,playing=false,frame=0,startTime=0,startFrame=0,raf=0,blobURL=null,busy=false;
const pending=new Map();
let lastHeight=0;
const sizing=new ResizeObserver(()=>{const height=document.documentElement.scrollHeight;if(ready&&height!==lastHeight){lastHeight=height;send({method:'ui/notifications/size-changed',params:{height}});}});
sizing.observe(document.body);
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function send(message){window.parent.postMessage({jsonrpc:'2.0',...message},hostOrigin&&hostOrigin!=='null'?hostOrigin:'*');}
function request(method,params){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(Error('The host did not respond. Try refreshing.'));},20000);pending.set(id,{resolve,reject,timer});send({id,method,params});});}
async function tool(name,args={}){const result=await request('tools/call',{name,arguments:args});const data=result.structuredContent||JSON.parse(result.content?.find(item=>item.type==='text')?.text||'{}');if(result.isError||data.error)throw Error(data.error?.message||'The tool could not complete this request.');return data;}
window.addEventListener('message',event=>{
 if(event.source!==window.parent||window.parent===window)return;
 if(hostOrigin!==null&&event.origin!==hostOrigin)return;
 const msg=event.data;if(!msg||msg.jsonrpc!=='2.0')return;
 if(Object.hasOwn(msg,'id')&&pending.has(msg.id)){
  const item=pending.get(msg.id);pending.delete(msg.id);clearTimeout(item.timer);
  if(hostOrigin===null)hostOrigin=event.origin;
  if(msg.error)item.reject(Error(msg.error.message||'Host error'));else item.resolve(msg.result);return;
 }
 if(msg.method==='ui/notifications/tool-result'&&ready){const data=msg.params?.structuredContent;if(data?.project&&!dirty&&!busy)openRecord(data);else if(dirty)status('A host update arrived. Save or discard your changes, then refresh.');}
 if(msg.method==='ui/resource-teardown'){stop();sizing.disconnect();if(blobURL)URL.revokeObjectURL(blobURL);send({id:msg.id,result:{}});}
});
function enable(){const active=!!draft&&!busy;for(const id of ['name','nodes','play','frame','export','delete'])$(id).disabled=!active;for(const id of ['save','discard'])$(id).disabled=!active||!dirty;for(const id of ['create','refresh','projects'])$(id).disabled=!ready||busy;const node=draft?.nodes.find(n=>n.id===$('nodes').value);for(const id of ['x','y','fill'])$(id).disabled=!active||!node;}
async function action(fn){if(busy)return;busy=true;enable();try{await fn();}catch(error){status(error.message,true);}finally{busy=false;enable();}}
function stop(){playing=false;cancelAnimationFrame(raf);$('play').textContent='Play';}
function render(){if(!draft)return;const next=URL.createObjectURL(new Blob([sceneToSVG(draft,frame)],{type:'image/svg+xml'}));$('art').src=next;if(blobURL)URL.revokeObjectURL(blobURL);blobURL=next;$('art').hidden=false;$('empty').hidden=true;$('frame').value=frame;$('time').textContent=`${frame+1} / ${draft.duration}`;}
function tick(time){if(!playing||!draft)return;const next=(startFrame+Math.floor((time-startTime)*draft.fps/1000))%draft.duration;if(next!==frame){frame=next;render();}raf=requestAnimationFrame(tick);}
function change(){dirty=true;$('revision').textContent=`Revision ${record.revision} · Unsaved changes`;enable();render();}
function layers(){const selected=$('nodes').value;$('nodes').replaceChildren(...draft.nodes.map(node=>new Option(node.name||node.type,node.id)));if(draft.nodes.some(n=>n.id===selected))$('nodes').value=selected;nodeFields();}
function nodeFields(){const n=draft?.nodes.find(n=>n.id===$('nodes').value);$('x').value=n?.x??'';$('y').value=n?.y??'';$('fill').value=n?.fill??'';enable();}
function openRecord(value){const checked=validateProject(value.project);stop();record={...value,project:checked};draft=structuredClone(checked);dirty=false;frame=0;$('name').value=draft.name;$('revision').textContent=`Revision ${record.revision} · ${draft.width} × ${draft.height} · ${draft.fps} fps`;$('frame').max=draft.duration-1;layers();render();enable();status('Saved project loaded.');}
async function refresh(select=record?.id){const data=await tool('rash_project_list');$('projects').replaceChildren(new Option('Choose a project',''),...data.projects.map(p=>new Option(p.name,p.id)));$('projects').value=select||'';}
$('refresh').onclick=()=>action(async()=>{if(dirty)throw Error('Save or discard your changes before refreshing.');await refresh();if(record)openRecord(await tool('rash_project_get',{id:record.id}));status('Projects refreshed.');});
$('projects').onchange=()=>action(async()=>{if(dirty){$('projects').value=record.id;throw Error('Save or discard your changes before opening another project.');}if($('projects').value)openRecord(await tool('rash_project_get',{id:$('projects').value}));});
$('create').onclick=()=>action(async()=>{if(dirty)throw Error('Save or discard your changes before creating a project.');openRecord(await tool('rash_project_create',{template:$('template').value,preset:'web'}));await refresh(record.id);status('Animation created.');});
$('name').oninput=()=>{draft.name=$('name').value;change();};$('nodes').onchange=nodeFields;
for(const property of ['x','y','fill'])$(property).onchange=()=>{const node=draft.nodes.find(n=>n.id===$('nodes').value);if(!node)return;let value=$(property).value;if(property==='fill'){if(safeColor(value,'INVALID')==='INVALID'){status('Use a hex color or a supported named color.',true);$(property).value=node.fill;return;}}else{value=Number(value);if(!Number.isFinite(value)||Math.abs(value)>100000){status('Position must be between −100000 and 100000.',true);$(property).value=node[property];return;}}node[property]=value;change();};
$('play').onclick=()=>{if(playing){stop();return;}playing=true;startFrame=frame;startTime=performance.now();$('play').textContent='Pause';raf=requestAnimationFrame(tick);};
$('frame').oninput=()=>{stop();frame=Number($('frame').value);render();};
$('save').onclick=()=>action(async()=>{const saved=await tool('rash_project_update',{id:record.id,expectedRevision:record.revision,project:draft});openRecord(saved);await refresh(record.id);status(`Saved revision ${record.revision}.`);});
$('discard').onclick=()=>action(async()=>{openRecord(await tool('rash_project_get',{id:record.id}));status('Unsaved changes discarded. Latest revision loaded.');});
$('export').onclick=()=>action(async()=>{if(dirty)throw Error('Save your changes before exporting the stored revision.');const data=await tool('rash_export',{id:record.id,revision:record.revision,format:$('format').value,frame});const url=URL.createObjectURL(new Blob([data.data],{type:data.mimeType}));const a=document.createElement('a');a.href=url;a.download=`rash-${record.id}.${data.format==='json'?'json':'svg'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status(`Exported revision ${record.revision}.`);});
$('delete').onclick=()=>$('delete-dialog').showModal();$('cancel-delete').onclick=()=>$('delete-dialog').close();
$('confirm-delete').onclick=()=>action(async()=>{await tool('rash_project_delete',{id:record.id,expectedRevision:record.revision});$('delete-dialog').close();stop();record=null;draft=null;dirty=false;if(blobURL){URL.revokeObjectURL(blobURL);blobURL=null;}$('art').removeAttribute('src');$('art').hidden=true;$('empty').hidden=false;$('name').value='';$('nodes').replaceChildren();$('revision').textContent='No project selected';$('time').textContent='0 / 0';await refresh();status('Project deleted.');});
async function init(){enable();if(window.parent===window){$('connection').textContent='Host required';status('Open this workspace through an MCP Apps host. The standalone page has no project access.');return;}try{const result=await request('ui/initialize',{appInfo:{name:'Rash Animation Workspace',version:'0.6.0'},appCapabilities:{},protocolVersion:'2026-01-26'});if(!result)throw Error('Invalid host initialization.');ready=true;send({method:'ui/notifications/initialized',params:{}});$('connection').textContent='Connected';await refresh();status('Choose a project or create an animation.');enable();send({method:'ui/notifications/size-changed',params:{height:document.documentElement.scrollHeight}});}catch(error){$('connection').textContent='Unavailable';status(error.message,true);}}
init();
