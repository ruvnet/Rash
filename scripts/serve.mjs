import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(process.env.RASH_ROOT||'web');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{
 let file;
 try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)&&file!==root)throw 0;if(fs.existsSync(file)&&fs.statSync(file).isDirectory())file=path.join(file,'index.html');}catch{res.writeHead(400).end();return;}
 fs.readFile(file,(err,data)=>{if(err){res.writeHead(404).end('Not found');return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':'no-cache'});res.end(data);});
}).listen(Number(process.env.PORT||4173),'0.0.0.0',()=>console.log(`Rash at http://localhost:${process.env.PORT||4173}`));
