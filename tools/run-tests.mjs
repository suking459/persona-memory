// Pass explicit paths: Node 20 on Windows does not expand CLI globs.
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=fs.readdirSync(new URL('../test/',import.meta.url)).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>'test/'+name);
if(!files.length)throw new Error('No source tests found; clone the repository to run its development suite');
const result=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit',windowsHide:true,timeout:120000});
if(result.error)console.error(result.error.message);
process.exitCode=result.status??1;
