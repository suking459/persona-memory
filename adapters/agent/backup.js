import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createMemoryBackup,inspectMemoryBackup,previewMemoryRestore,restoreMemoryBackup} from '../../src/index.js';
import {normalizeBinding} from './binding.js';
import {openAgentMemory} from './store.js';
const LIMIT=67125248;
export function readBackupJSON(file,maxBytes=LIMIT){
  const target=path.resolve(file),entry=fs.lstatSync(target);
  if(!entry.isFile()||entry.size>maxBytes)throw new TypeError('Backup/plan must be a bounded regular file');
  const fd=fs.openSync(target,fs.constants.O_RDONLY|(fs.constants.O_NONBLOCK??0)|(fs.constants.O_NOFOLLOW??0));
  try{
    if(!fs.fstatSync(fd).isFile())throw new TypeError('Backup/plan must be a regular file');
    const chunks=[];let size=0;
    for(;;){
      const chunk=Buffer.allocUnsafe(Math.min(65536,maxBytes+1-size)),n=fs.readSync(fd,chunk,0,chunk.length,null);
      if(!n)break;size+=n;if(size>maxBytes)throw new RangeError('Backup/plan exceeds byte limit');
      chunks.push(chunk.subarray(0,n));
    }
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,size)));
  }finally{fs.closeSync(fd);}
}
function writeJSON(file,value){
  const text=JSON.stringify(value)+'\n';if(Buffer.byteLength(text)>LIMIT)throw new RangeError('Backup exceeds byte limit');
  // Never overwrite a snapshot, prior backup, or existing plan.
  const fd=fs.openSync(path.resolve(file),'wx',0o600);
  try{fs.writeFileSync(fd,text);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
const bindingDigest=b=>createHash('sha256').update(JSON.stringify(b)).digest('hex');
export function identityFromBackup(file){
  const result=inspectMemoryBackup(readBackupJSON(file));
  if(!result.identity)throw new TypeError('Backup has no Agent identity; matching SDK restore is still available');
  return result.identity;
}
export async function agentBackupCommand(action,raw,options){
  const binding=normalizeBinding(raw),pm=openAgentMemory(binding);
  if(action==='backup'){
    if(!options.out)throw new TypeError('--out required');
    const {persona,namespace,subjects,locale}=binding;
    const backup=await createMemoryBackup(pm,{identity:{persona,namespace,subjects,locale}});
    writeJSON(options.out,backup);
    return {backedUp:true,file:path.resolve(options.out),checksum:backup.checksum,counts:inspectMemoryBackup(backup).counts};
  }
  if(!options.backup)throw new TypeError('--backup required');
  const backup=readBackupJSON(options.backup),inspected=inspectMemoryBackup(backup,{config:pm.config});
  if(inspected.identity&&JSON.stringify(inspected.identity)!==JSON.stringify({persona:binding.persona,namespace:binding.namespace,subjects:binding.subjects,locale:binding.locale}))throw new TypeError('Backup scopes do not match binding; prepare with --identity-from to preserve logical identity');
  if(action==='restore-preview'){
    if(!options.out)throw new TypeError('--out required');
    const preview=await previewMemoryRestore(pm,backup);
    writeJSON(options.out,{format:'persona-memory-agent-restore-plan',version:1,bindingDigest:bindingDigest(binding),preview});
    return {previewOnly:true,file:path.resolve(options.out),...preview};
  }
  const plan=readBackupJSON(options.plan,32768);
  if(plan.format!=='persona-memory-agent-restore-plan'||plan.version!==1||plan.bindingDigest!==bindingDigest(binding))throw new TypeError('Restore plan belongs to a different binding');
  return restoreMemoryBackup(pm,backup,plan.preview);
}
