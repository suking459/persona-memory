import {readBackupJSON} from './backup.js';
import {openAgentMemory} from './store.js';
import {createAgentSession} from './session.js';
import {assertMemoryFields as fields} from '../../src/records.js';
const tools={'experience-reuse':'memory_experience_reuse','experience-propose':'memory_experience_propose',
  'experience-feedback':'memory_experience_feedback','experience-retire':'memory_experience_retire'};
export async function agentExperienceCommand(action,binding,options){
  if(!options.scope||!options.input)throw new TypeError('--scope and --input required');
  const pm=openAgentMemory(binding);
  // A separate local owner command grants private review only. Shared access stays policy-bound.
  const session=createAgentSession(pm,binding.sharing?binding:{...binding,access:'review'});
  const tool=session.tools.find(t=>t.name===tools[action]);
  if(!tool)throw new TypeError('experience operation is not granted');
  const input=readBackupJSON(options.input,65536);
  fields(input,new Set(Object.keys(tool.inputSchema.properties).filter(k=>k!=='scope')),'experience command input');
  return session.call(tool.name,{...input,scope:options.scope});
}
