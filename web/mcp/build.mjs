// Produce the self-contained resource read by MCP hosts. No runtime CDN requests.
import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
const base=new URL('./',import.meta.url);
const result=await build({entryPoints:[new URL('app.js',base).pathname],bundle:true,write:false,format:'iife',platform:'browser',target:'es2022',minify:true});
const css=await readFile(new URL('style.css',base),'utf8');
const html=(await readFile(new URL('index.html',base),'utf8')).replace('<link rel="stylesheet" href="./style.css">',()=>`<style>${css}</style>`).replace('<script type="module" src="./app.js"></script>',()=>`<script>${result.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
await writeFile(new URL('app.html',base),html);
console.log(`Built MCP App resource (${Buffer.byteLength(html)} bytes).`);
