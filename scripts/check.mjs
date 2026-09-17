import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../',import.meta.url));
function* sourceFiles(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const file=path.join(directory,entry.name);
    if (entry.isDirectory()) yield* sourceFiles(file);
    else if (/\.(mjs|js)$/.test(entry.name)) yield file;
  }
}
for (const dir of ['src','public','scripts','test']) {
  for (const file of sourceFiles(path.join(root,dir))) {
    const result = spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
    if(result.status !== 0){console.error(result.stderr);process.exit(1);}
  }
}
console.log('All JavaScript modules parsed successfully.');
