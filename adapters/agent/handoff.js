import fs from 'node:fs';
import path from 'node:path';
import {createTaskHandoff,openTaskHandoff} from '../../src/handoff.js';
import {readBackupJSON} from './backup.js';
import {normalizeBinding} from './binding.js';
import {openAgentMemory} from './store.js';
import {assertMemoryFields} from '../../src/records.js';
import {assertOwnerOutput} from './output.js';
export async function agentHandoffCommand(action,raw,options){
 const binding=normalizeBinding(raw),subject=binding.subjects[options.scope];
 if(!subject)throw new TypeError('scope is not granted');
 const pm=openAgentMemory(binding);await pm.reload({ifChanged:true});
 if(action==='handoff-open'){
  if(!options.file)throw new TypeError('--file required');
  return openTaskHandoff(pm,readBackupJSON(options.file,32768),{subject});
 }
 if(action!=='handoff-export'||!options.notes||!options.out)throw new TypeError('--notes and --out required');
 const notes=readBackupJSON(options.notes,32768);
 assertMemoryFields(notes,new Set(['checkpoint','references','ttlHours']),'handoff notes');
 const bundle=createTaskHandoff(pm,{...notes,subject}),text=JSON.stringify(bundle)+'\n';
 if(Buffer.byteLength(text)>32768)throw new RangeError('handoff file exceeds byte limit');
 const output=assertOwnerOutput(options.out,binding.storage);
 const fd=fs.openSync(output,'wx',0o600);
 try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 return {exported:true,file:path.resolve(options.out),checksum:bundle.checksum,taskExecuted:false};
}
