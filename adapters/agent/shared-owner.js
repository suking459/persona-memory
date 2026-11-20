import {lockSharedBinding,assertSharedStore} from './shared-policy.js';
import {openAgentMemory} from './store.js';
import {readBackupJSON} from './backup.js';
import {inspectMemoryBackup} from '../../src/backup.js';
export async function withSharedOwnerCommand(binding,action,options,run){
 const lease=lockSharedBinding(binding);
 try{
  if(['review-apply','forget-apply','restore-apply','maintenance-preview','maintenance-apply'].includes(action)&&binding.access!=='review')throw new TypeError('shared review grant required');
  const pm=openAgentMemory(binding);await pm.reload({ifChanged:true});assertSharedStore(pm,lease);
  if(['restore-preview','restore-apply'].includes(action)){
   if(!options.backup)throw new TypeError('--backup required');
   const incoming=inspectMemoryBackup(readBackupJSON(options.backup),{config:pm.config});
   assertSharedStore({state:incoming.snapshot},lease);
  }
  return await run();
 }finally{lease?.release();}
}
