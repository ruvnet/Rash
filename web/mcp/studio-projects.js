import {validateProject} from '../core/model.js';
const PRIVATE_STUDIO='https://rash-svg-studio.ruv.chatgpt.site/studio/';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function createCloudProjects({getProject,openProject,showModal,closeModal,header,fetcher=fetch}) {
 let record=null,busy=false,sequence=0,view=0;
 const hosted=location.pathname.startsWith('/studio/');
 function detach(){record=null;}
 function getLink(){return record?{id:record.id,revision:record.revision,project:{name:record.project.name}}:null;}
 function restoreLink(link){if(record?.id!==link?.id)record=link?structuredClone(link):null;}
 async function call(name,args={}) {
  const response=await fetcher('/mcp',{method:'POST',credentials:'same-origin',redirect:'error',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++sequence,method:'tools/call',params:{name,arguments:args}}),signal:AbortSignal.timeout(20000)});
  if(response.status===401||response.status===403)throw Error('Sign in to the private workspace, then reopen cloud projects.');
  if(!response.ok)throw Error('Cloud request failed. Your local composition is unchanged.');
  const body=await response.json(),data=body.result?.structuredContent;
  if(body.error||body.result?.isError||!data)throw Error(data?.error?.message||body.error?.message||'Invalid cloud response.');
  return data;
 }
 function checked(value){if(!value||!/^[a-f0-9-]{36}$/.test(value.id)||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('Invalid cloud project record.');return {...value,project:validateProject(value.project)};}
 function show(){
  if(busy){showModal(`${header('Cloud request in progress','Wait for the current request to finish, then reopen Cloud projects.')}<div class="modal-footer"><button class="button" data-action="close-modal">Back to studio</button></div>`,'cloud');return;}
  const ticket=++view;
  showModal(`${header('Cloud projects','Use the same saved projects as your connected Rash MCP plugin.')}<div class="modal-body" id="cloud-projects">${hosted?`<p id="cloud-current">${record?`Linked to ${escape(record.project.name)} · revision ${record.revision}`:'This composition is not linked to a cloud project.'}</p><p>Device autosave stays local. Save explicitly to update the cloud revision. Download a backup before replacing your composition.</p><div class="form-row"><button class="button" data-cloud="refresh">Refresh list</button><button class="button" data-cloud="create">Save as new cloud project</button><button class="button primary" data-cloud="save" ${record?'':'disabled'}>Save linked revision</button></div><label class="form-label" for="cloud-list">SAVED PROJECTS</label><select id="cloud-list" class="text-input"><option value="">Choose a project</option></select><label class="replace-consent"><input type="checkbox" id="cloud-replace"> Replace the current composition with the selected cloud project.</label><div class="form-row"><button class="button" data-cloud="open">Open selected project</button><button class="button" data-cloud="delete">Delete selected project…</button></div><div id="cloud-delete" hidden><p id="cloud-delete-label"></p><button class="button" data-cloud="confirm-delete">Permanently delete</button><button class="button" data-cloud="cancel-delete">Cancel deletion</button></div><p id="cloud-status" role="status" aria-live="polite"></p>`:`<p>Open the authenticated Studio to browse, edit and save the same projects used by ChatGPT. This public Studio keeps its composition on this device.</p><p>To transfer this composition, download its JSON and open that file in the private Studio, then choose Save as new cloud project.</p><a class="button primary" href="${PRIVATE_STUDIO}" target="_blank" rel="noopener noreferrer">Open authenticated Studio ↗</a><button class="button" data-action="save">Download current composition</button>`}</div><div class="modal-footer"><button class="button" data-action="close-modal">Back to studio</button></div>`,'cloud');
  if(!hosted)return;
  const root=document.querySelector('#cloud-projects'),status=root.querySelector('#cloud-status'),list=root.querySelector('#cloud-list');let deletion=null;
  const current=()=>ticket===view&&root.isConnected&&root.closest('dialog')?.open;
  function message(text){if(current())status.textContent=text;}
  function linked(){if(current()){root.querySelector('#cloud-current').textContent=record?`Linked to ${record.project.name} · revision ${record.revision}`:'This composition is not linked to a cloud project.';}}
  async function refresh(){const data=await call('rash_project_list');if(!Array.isArray(data.projects)||data.projects.length>100)throw Error('Invalid cloud project list.');if(!current())return;const selected=list.value;list.replaceChildren(new Option('Choose a project',''),...data.projects.map(p=>new Option(`${p.name} · revision ${p.revision}`,p.id)));list.value=selected;}
  async function run(action){if(busy)return;busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);try{await action();}catch(error){message(error.message);}finally{busy=false;if(current()){root.querySelectorAll('button').forEach(b=>b.disabled=false);root.querySelector('[data-cloud="save"]').disabled=!record;}}}
  root.addEventListener('click',event=>{const button=event.target.closest('[data-cloud]');if(!button)return;event.stopPropagation();const action=button.dataset.cloud;if(action==='cancel-delete'){deletion=null;root.querySelector('#cloud-delete').hidden=true;return;}
   run(async()=>{
    if(action==='refresh'){await refresh();message('Project list refreshed.');}
    if(action==='create'||action==='save'){
     const project=validateProject(structuredClone(getProject())),previous=record;
     const saved=checked(await call(action==='create'?'rash_project_create':'rash_project_update',action==='create'?{project}:{id:previous.id,expectedRevision:previous.revision,project}));
     // Only link the response if the editor still represents the submitted document.
     if(JSON.stringify(getProject())===JSON.stringify(project)){record=saved;linked();message(`Saved cloud revision ${saved.revision}.`);}else message('Cloud snapshot saved. The editor changed during the request; reopen the saved project to link it.');
     await refresh();
    }
    if(action==='open'){
     if(!list.value)throw Error('Choose a cloud project first.');if(!root.querySelector('#cloud-replace').checked)throw Error('Confirm replacement of the current composition first.');
     const before=JSON.stringify(getProject()),saved=checked(await call('rash_project_get',{id:list.value}));
     if(!current())return;if(before!==JSON.stringify(getProject()))throw Error('The composition changed while loading. Try opening again.');
     openProject(saved.project);record=saved;closeModal();
    }
    if(action==='delete'){
     if(!list.value)throw Error('Choose a cloud project first.');const value=checked(await call('rash_project_get',{id:list.value}));if(!current())return;deletion=value;root.querySelector('#cloud-delete-label').textContent=`Permanently delete ${value.project.name}, revision ${value.revision}? Your device composition will remain available.`;root.querySelector('#cloud-delete').hidden=false;
    }
    if(action==='confirm-delete'){
     if(!deletion)throw Error('Select a project for deletion first.');await call('rash_project_delete',{id:deletion.id,expectedRevision:deletion.revision});if(record?.id===deletion.id)detach();deletion=null;if(current())root.querySelector('#cloud-delete').hidden=true;linked();await refresh();message('Cloud project deleted. Device composition preserved.');
    }
   });
  });
  run(refresh);
 }
 return {show,detach,getLink,restoreLink};
}
