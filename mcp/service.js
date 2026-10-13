import { createProject, validateProject, templates, presets } from '../web/core/model.js';
import { sceneToSVG } from '../web/core/renderer.js';
import { animatedSVG } from '../web/export/svg.js';
import { embedCode } from '../web/export/export.js';

export const MAX_PROJECT_BYTES = 5_000_000;
export const MAX_OUTPUT_BYTES = 16_000_000;
export class RashError extends Error { constructor(code, message) { super(message); this.code = code; } }
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const id = { type: 'string', pattern: '^[a-f0-9-]{36}$' };
const revision = { type: 'integer', minimum: 1 };
const project = { type: 'object', description: 'Complete Rash v1 or v2 project. Shared Studio validation and complexity budgets apply.' };
const tool = (name, description, inputSchema, readOnlyHint = true, destructiveHint = false) => ({ name, description, inputSchema, annotations: { readOnlyHint, destructiveHint, idempotentHint: readOnlyHint, openWorldHint: false } });
export const TOOLS = [
 tool('rash_project_create', 'Create a durable project from a template or a complete validated project.', object({ template: {type:'string',enum:templates.map(t=>t.id)}, preset:{type:'string',enum:presets.map(p=>p.id)}, project }), false),
 tool('rash_project_list', 'List project identities, names and revisions in this local store.', object({})),
 tool('rash_project_get', 'Read the complete project and its current revision before editing.', object({id}, ['id'])),
 tool('rash_project_update', 'Replace a complete project only if expectedRevision matches. Read again after a conflict.', object({id, expectedRevision:revision, project}, ['id','expectedRevision','project']), false),
 tool('rash_project_delete', 'Permanently delete a project only if expectedRevision matches.', object({id, expectedRevision:revision}, ['id','expectedRevision']), false, true),
 tool('rash_render', 'Render one frame as script-free SVG from the stored revision.', object({id, revision, frame:{type:'integer',minimum:0,maximum:35999}}, ['id','revision'])),
 tool('rash_export', 'Export the stored revision as JSON, still SVG, animated SVG, or HTML embed. GIF, PDF and MP4 require the Studio browser.', object({id,revision,format:{type:'string',enum:['json','svg','animated-svg','embed']},frame:{type:'integer',minimum:0,maximum:35999}}, ['id','revision','format']))
];
export function validateArguments(value, schema, label='arguments') {
 if(schema.type==='object') {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new RashError('INVALID_ARGUMENT',`${label} must be an object`);
  for(const key of schema.required||[])if(!Object.hasOwn(value,key))throw new RashError('INVALID_ARGUMENT',`${label}.${key} is required`);
  if(schema.properties)for(const [key,item] of Object.entries(value)) {
   if(!Object.hasOwn(schema.properties,key))throw new RashError('INVALID_ARGUMENT',`Unknown ${label} property: ${key}`);
   validateArguments(item,schema.properties[key],`${label}.${key}`);
  }
 } else if(schema.type==='string'&&typeof value!=='string'||schema.type==='integer'&&!Number.isSafeInteger(value))throw new RashError('INVALID_ARGUMENT',`Invalid ${label}`);
 if(schema.enum&&!schema.enum.includes(value)||schema.pattern&&!new RegExp(schema.pattern).test(value)||schema.minimum!==undefined&&value<schema.minimum||schema.maximum!==undefined&&value>schema.maximum)throw new RashError('INVALID_ARGUMENT',`Invalid ${label}`);
}
export function checkedProject(input) {
 if(new TextEncoder().encode(JSON.stringify(input)).length>MAX_PROJECT_BYTES)throw new RashError('LIMIT','Project exceeds 5 MB');
 return validateProject(input);
}
export async function callTool(store, name, args={}) {
 const definition=TOOLS.find(t=>t.name===name);
 if(!definition)throw new RashError('UNKNOWN_TOOL','Unknown Rash tool');
 validateArguments(args,definition.inputSchema);
 if(name==='rash_project_list')return {projects:await store.list()};
 if(name==='rash_project_create') {
  if(args.project&&(args.template||args.preset))throw new RashError('INVALID_ARGUMENT','Use project or template/preset, not both');
  return store.create(checkedProject(args.project||createProject(args.template||'blank',args.preset||'web')));
 }
 if(name==='rash_project_get')return store.get(args.id);
 if(name==='rash_project_update')return store.update(args.id,args.expectedRevision,checkedProject(args.project));
 if(name==='rash_project_delete')return store.delete(args.id,args.expectedRevision);
 const record=await store.get(args.id);
 if(record.revision!==args.revision)throw new RashError('CONFLICT',`Revision conflict. Current revision is ${record.revision}`);
 const frame=args.frame??0;
 if(frame>=record.project.duration)throw new RashError('INVALID_ARGUMENT','Frame is outside the project timeline');
 const format=name==='rash_render'?'svg':args.format;
 const data=format==='json'?JSON.stringify(record.project,null,2):format==='svg'?sceneToSVG(record.project,frame):format==='animated-svg'?animatedSVG(record.project):embedCode(record.project,{baseURL:'https://ruvnet.github.io/Rash/'});
 if(new TextEncoder().encode(data).length>MAX_OUTPUT_BYTES)throw new RashError('LIMIT','Export exceeds 16 MB');
 return {id:record.id,revision:record.revision,frame,format,mimeType:format==='json'?'application/json':format==='embed'?'text/html':'image/svg+xml',data};
}
