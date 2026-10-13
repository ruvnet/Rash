import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/vendor-ruffle.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['scripts/vendor-three.mjs'],{stdio:'inherit'});
execFileSync(process.execPath,['web/mcp/build.mjs'],{stdio:'inherit'});
await fs.rm('dist',{recursive:true,force:true});
await fs.cp('web','dist',{recursive:true});
await fs.writeFile('dist/.nojekyll','');
console.log('Static application copied to dist. All dependencies are self hosted.');
