import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {sameSubject} from '../../src/records.js';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {previewCandidateReview,applyCandidateReview,previewMemoryForget,applyMemoryForget} from '../../src/management.js';
import {explainMemoryRecall} from '../../src/diagnostics.js';
import {openAgentMemory} from './store.js';
import {normalizeBinding} from './binding.js';
import {doctorAgent} from './doctor.js';
import {readBackupJSON} from './backup.js';
const digest=b=>createHash('sha256').update(JSON.stringify(b)).digest('hex');
function save(file,value){
  if(!file)throw new TypeError('--out required');const data=JSON.stringify(value)+'\n';
  if(Buffer.byteLength(data)>2097152)throw new RangeError('Management plan too large; use a smaller batch');
  const fd=fs.openSync(path.resolve(file),'wx',0o600);
  try{fs.writeFileSync(fd,data);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
export async function agentManagementCommand(action,raw,options){
  const binding=normalizeBinding(raw);
  if(action==='doctor')return doctorAgent(binding);
  const pm=openAgentMemory(binding);
  if(action.endsWith('-apply')){
    if(!options.plan)throw new TypeError('--plan required');
    const wrapper=copySnapshotJSON(readBackupJSON(options.plan,2097152),2097152);
    if(wrapper.format!=='persona-memory-agent-management'||wrapper.version!==1||wrapper.bindingDigest!==digest(binding)||!Object.hasOwn(binding.subjects,wrapper.scope)||!sameSubject(binding.subjects[wrapper.scope],wrapper.plan?.subject))throw new TypeError('Management plan belongs to a different binding or scope');
    return action==='review-apply'?applyCandidateReview(pm,wrapper.plan):applyMemoryForget(pm,wrapper.plan);
  }
  if(!options.scope||!Object.hasOwn(binding.subjects,options.scope))throw new TypeError('--scope must be granted');
  const subject=binding.subjects[options.scope];
  if(action==='explain')return explainMemoryRecall(pm,{subject,query:options.query??'',locale:options.locale??binding.locale,
    ...(options.memory===undefined?{}:{id:options.memory}),...(options.limit===undefined?{}:{limit:Number(options.limit)})});
  let plan;
  if(action==='review-preview'){
    if(!options.requests)throw new TypeError('--requests JSON file required');
    plan=await previewCandidateReview(pm,{subject,requests:readBackupJSON(options.requests,16384),decision:options.decision,...(options.reason===undefined?{}:{reason:options.reason})});
  }else plan=await previewMemoryForget(pm,{subject,id:options.memory,expectedRevision:Number(options.revision)});
  const wrapper={format:'persona-memory-agent-management',version:1,bindingDigest:digest(binding),scope:options.scope,plan};
  save(options.out,wrapper);return {previewOnly:true,file:path.resolve(options.out),...plan};
}
