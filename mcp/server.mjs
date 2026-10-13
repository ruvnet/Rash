#!/usr/bin/env node
import { once } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { LocalStore } from './store.js';
import { createMcpHandler } from './protocol.js';
const MAX_MESSAGE=5_100_000;
const uiPath=new URL('../web/mcp/app.html',import.meta.url);
const handle=createMcpHandler({store:new LocalStore(process.env.RASH_MCP_STORE||join(homedir(),'.rash','projects')), ...(existsSync(uiPath)?{readUI:()=>readFileSync(uiPath,'utf8')}: {})});
const send=async message=>{if(message&&!process.stdout.write(`${JSON.stringify(message)}\n`))await once(process.stdout,'drain');};
let pending=Buffer.alloc(0);
// Async iteration applies backpressure while each request finishes. No unbounded request queue.
for await(const chunk of process.stdin) {
 pending=Buffer.concat([pending,chunk]);
 let newline;
 while((newline=pending.indexOf(10))!==-1) {
  if(newline>MAX_MESSAGE){process.stderr.write('MCP message exceeds 5.1 MB limit\n');process.exitCode=1;process.stdin.destroy();break;}
  const line=pending.subarray(0,newline);pending=pending.subarray(newline+1);
  let message;
  try {message=JSON.parse(line.toString('utf8'));}catch {await send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}});continue;}
  await send(await handle(message));
 }
 if(process.exitCode)break;
 if(pending.length>MAX_MESSAGE){process.stderr.write('MCP message exceeds 5.1 MB limit\n');process.exitCode=1;process.stdin.destroy();break;}
}
if(pending.length&&!process.exitCode)await send({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Incomplete JSON-RPC message; newline required'}});
