#!/usr/bin/env node
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const args=process.argv.slice(2);
if(args[0]==='mcp'){
 await import('../mcp/server.mjs');
}else if(args.includes('--help')||args.includes('-h')){
 console.log(`Rash 0.6.0\n\nUsage:\n  rash [studio] [--host 127.0.0.1] [--port 4173]\n  rash mcp\n\nThe Studio binds to localhost by default. Set an explicit host only for a trusted network.`);
}else{
 const option=name=>{const index=args.indexOf(name);return index<0?undefined:args[index+1];};
 const host=option('--host')||process.env.HOST||'127.0.0.1';
 const port=Number(option('--port')||process.env.PORT||4173);
 if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('Port must be an integer between 1 and 65,535');
 if(!/^(localhost|[a-z\d.:-]+)$/i.test(host))throw new Error('Host contains unsupported characters');
 const root=resolve(fileURLToPath(new URL('../web/',import.meta.url)));
 const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
 const server=http.createServer(async(request,response)=>{
  try{
   const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
   let file=resolve(root,'.'+pathname);
   if(file!==root&&!file.startsWith(root+sep))throw new Error('Outside package web root');
   if((await stat(file)).isDirectory())file=join(file,'index.html');
   const body=await readFile(file);
   response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}).end(body);
  }catch{response.writeHead(404,{'Content-Type':'text/plain; charset=utf-8','X-Content-Type-Options':'nosniff'}).end('Not found');}
 });
 server.listen(port,host,()=>console.log(`Rash Studio: http://${host.includes(':')?`[${host}]`:host}:${port}`));
}
