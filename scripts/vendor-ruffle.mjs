// Restore large immutable runtime binaries without storing 29 MB in Git history.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),directory='web/vendor/ruffle';
const manifest=JSON.parse(await fs.readFile(`${directory}/provenance.json`,'utf8'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const wanted=[];
for(const [name,expected] of Object.entries(manifest.files)){
 if(!/^[\w.-]+$/.test(name))throw Error('Invalid vendor asset path');
 let bytes;try{bytes=await fs.readFile(`${directory}/${name}`);}catch{}
 if(!bytes||bytes.length!==expected.bytes||digest(bytes)!==expected.sha256)wanted.push(name);
}
if(!wanted.length){console.log('Pinned Ruffle assets verified.');process.exit(0);}
if(manifest.registry!=='https://registry.npmjs.org/@ruffle-rs/ruffle/-/ruffle-0.7.1.tgz')throw Error('Unexpected Ruffle package origin');
const response=await fetch(manifest.registry,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Ruffle download HTTP ${response.status}`);
const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>64*1024*1024)throw Error('Vendor archive is too large');chunks.push(chunk);}
const bytes=Buffer.concat(chunks);
if(`sha512-${createHash('sha512').update(bytes).digest('base64')}`!==manifest.npmIntegrity)throw Error('Vendor archive integrity mismatch');
const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'rash-vendor-'));
try{
 const archive=path.join(temporary,'ruffle.tgz');await fs.writeFile(archive,bytes);
 for(const name of wanted){
  const {stdout}=await run('tar',['-xOf',archive,`package/${name}`],{encoding:'buffer',maxBuffer:24*1024*1024});
  const expected=manifest.files[name];if(stdout.length!==expected.bytes||digest(stdout)!==expected.sha256)throw Error(`Vendor file integrity mismatch: ${name}`);
  await fs.writeFile(`${directory}/${name}`,stdout);
 }
}finally{await fs.rm(temporary,{recursive:true,force:true});}
console.log(`Restored and verified ${wanted.length} pinned Ruffle assets.`);
