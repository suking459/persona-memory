// Owner-facing previews reuse the full-snapshot CAS restore path for atomic persistence.
import {createHash} from 'node:crypto';
import {PersonaMemory} from './memory.js';
import {copySnapshotJSON} from './snapshot.js';
import {normalizeSubject,sameSubject,memoryIdentifier,assertMemoryFields as fields} from './records.js';
import {createMemoryBackup,previewMemoryRestore,restoreMemoryBackup} from './backup.js';
import {storageError} from './storage.js';
const TTL=600000,LIMIT=2097152;
function canonical(v){return Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);}
const digest=v=>createHash('sha256').update(canonical(v)).digest('hex');
const conflict=()=>storageError('ERR_MANAGEMENT_CHANGED','Memory changed after preview; inspect and preview again');
async function ready(pm){
  if(!(pm instanceof PersonaMemory))throw new TypeError('PersonaMemory required');
  if(pm._storeBusy)throw storageError('ERR_STORE_BUSY','another store operation is pending');
  if(pm._store&&pm._dirty)throw storageError('ERR_STORE_DIRTY','persist local changes before owner management');
  if(pm._store)await pm.reload({ifChanged:true});
}
function clock(pm){const now=Math.floor(pm._now());if(now>8640000000000000-TTL)throw new RangeError('preview time outside supported calendar');return now;}
function base(pm,kind,subject,now){return {format:'persona-memory-management-plan',version:1,kind,subject,createdAt:now,expiresAt:now+TTL,
  persona:pm.persona,scope:pm.scope,expectedRevision:pm._storeRevision,targetDigest:digest(pm.export()),configDigest:digest(pm.config)};}
const seal=payload=>({...payload,checksum:digest(payload)});
function draftOf(pm,now){const draft=new PersonaMemory({persona:pm.persona,scope:pm.scope,config:pm.config,clock:()=>now});draft.import(pm.export());return draft;}
function requestsFor(pm,subject,raw){
  const requests=copySnapshotJSON(raw,16384);
  if(!Array.isArray(requests)||requests.length<1||requests.length>32)throw new RangeError('review 1..32 candidates');
  const seen=new Set();
  for(const request of requests){
    fields(request,new Set(['id','expectedRevision']),'review request');request.id=memoryIdentifier(request.id);
    if(!Number.isSafeInteger(request.expectedRevision)||request.expectedRevision<1||seen.has(request.id))throw new TypeError('invalid or duplicate review revision');
    seen.add(request.id);const candidate=pm.getCandidate(request.id,{includeExpired:true});
    if(!candidate||!sameSubject(candidate.memory.subject,subject))throw new TypeError('candidate is unavailable in this scope');
  }
  return requests;
}
function decide(draft,requests,decision,reason){
  return decision==='accept'?draft.acceptCandidates(requests):requests.map(r=>draft.rejectCandidate(r.id,{expectedRevision:r.expectedRevision,...(reason===undefined?{}:{reason})}));
}
function optionsOf(raw){
  const options=copySnapshotJSON(raw,32768);fields(options,new Set(['subject','requests','decision','reason']),'review preview');
  const subject=normalizeSubject(options.subject);
  if(!['accept','reject'].includes(options.decision))throw new TypeError('decision must be accept or reject');
  if(options.reason!==undefined&&(typeof options.reason!=='string'||options.reason.length>1000))throw new TypeError('invalid review reason');
  return {...options,subject};
}
export async function previewCandidateReview(pm,raw){
  const options=optionsOf(raw);await ready(pm);const now=clock(pm),requests=requestsFor(pm,options.subject,options.requests);
  const rows=requests.map(r=>{
    const c=pm.getCandidate(r.id,{includeExpired:true}),quality=pm.inspectCandidate(r.id,{limit:4});
    const current=quality.current?pm.getMemory(quality.current.id,{includeInactive:true}):null;
    return {id:c.id,revision:c.revision,status:c.status,kind:c.memory.kind,key:c.memory.key,
      proposedValue:c.memory.value,before:current?{id:current.id,revision:current.revision,value:current.value,validFrom:current.validFrom,expiresAt:current.expiresAt}:null,
      evidenceId:c.memory.evidenceId,reason:c.reason,source:c.memory.source,assertion:c.memory.assertion??'unspecified',quality};
  });
  let allowed=true,denial;
  try{decide(draftOf(pm,now),requests,options.decision,options.reason);}
  catch(error){allowed=false;denial={code:error.code==='ERR_CANDIDATE_CONFLICT'?'ERR_CANDIDATE_CONFLICT':'ERR_REVIEW_PRECONDITION',message:'The full batch cannot currently be applied; inspect revisions, expiry, competing fields, dependencies and limits.'};}
  return seal({...base(pm,'review',options.subject,now),decision:options.decision,requests,...(options.reason===undefined?{}:{reason:options.reason}),allowed,...(denial?{denial}:{}),rows,evidenceVerified:false});
}
function currentFor(pm,subject,id,revision){
  memoryIdentifier(id);const record=pm.getMemory(id,{includeInactive:true});
  if(!record||!sameSubject(record.subject,subject)||record.status!=='current')throw new TypeError('current memory is unavailable in this scope');
  if(!Number.isSafeInteger(revision)||revision!==record.revision)throw conflict();
  return record;
}
export async function previewMemoryForget(pm,raw){
  const options=copySnapshotJSON(raw,4096);fields(options,new Set(['subject','id','expectedRevision']),'forget preview');const subject=normalizeSubject(options.subject);
  await ready(pm);const now=clock(pm),record=currentFor(pm,subject,options.id,options.expectedRevision),id=record.id;
  const impact=pm.previewForgetMemory(id);
  return seal({...base(pm,'forget',subject,now),id,expectedMemoryRevision:options.expectedRevision,allowed:true,
    impact:{memories:impact.recordIds.length,candidates:impact.candidateIds.length,recordIds:impact.recordIds.slice(0,16),candidateIds:impact.candidateIds.slice(0,16),truncated:impact.recordIds.length>16||impact.candidateIds.length>16}});
}
async function validatePlan(pm,raw,kind){
  const plan=copySnapshotJSON(raw,LIMIT),common=['format','version','kind','subject','createdAt','expiresAt','persona','scope','expectedRevision','targetDigest','configDigest','allowed','checksum'];
  fields(plan,new Set([...common,...(kind==='forget'?['id','expectedMemoryRevision','impact']:['decision','requests','reason','rows','evidenceVerified','denial'])]),'management plan');
  const {checksum,...body}=plan;
  if(plan.format!=='persona-memory-management-plan'||plan.version!==1||plan.kind!==kind||digest(body)!==checksum)throw new TypeError('invalid management preview');
  await ready(pm);const now=clock(pm);
  if(!Number.isSafeInteger(plan.createdAt)||plan.createdAt<0||plan.expiresAt!==plan.createdAt+TTL||now<plan.createdAt||now>=plan.expiresAt)throw storageError('ERR_MANAGEMENT_EXPIRED','Management preview expired; preview again');
  if(plan.persona!==pm.persona||plan.scope!==pm.scope||plan.expectedRevision!==pm._storeRevision||plan.targetDigest!==digest(pm.export())||plan.configDigest!==digest(pm.config))throw conflict();
  if(plan.allowed!==true)throw storageError('ERR_REVIEW_PRECONDITION','Preview did not allow the batch');
  plan.subject=normalizeSubject(plan.subject);return {plan,now};
}
async function commit(pm,draft,plan,now){
  const backup=await createMemoryBackup(draft,{now}),restore=await previewMemoryRestore(pm,backup,{now});
  if(restore.expectedRevision!==plan.expectedRevision||restore.targetDigest!==plan.targetDigest||restore.configDigest!==plan.configDigest)throw conflict();
  return restoreMemoryBackup(pm,backup,restore,{now});
}
export async function applyCandidateReview(pm,rawPlan){
  const {plan,now}=await validatePlan(pm,rawPlan,'review');
  const options=optionsOf({subject:plan.subject,requests:plan.requests,decision:plan.decision,...(plan.reason===undefined?{}:{reason:plan.reason})});
  const requests=requestsFor(pm,options.subject,options.requests),draft=draftOf(pm,now),results=decide(draft,requests,options.decision,options.reason);
  const saved=await commit(pm,draft,plan,now);
  return {...saved,decision:options.decision,reviewed:requests.length,results:results.map((r,i)=>({candidateId:requests[i].id,...(r.record?{recordId:r.record.id}:{}),status:options.decision==='accept'?'accepted':'rejected'}))};
}
export async function applyMemoryForget(pm,rawPlan){
  const {plan,now}=await validatePlan(pm,rawPlan,'forget');currentFor(pm,plan.subject,plan.id,plan.expectedMemoryRevision);
  const draft=draftOf(pm,now),removed=draft.forgetMemory(plan.id).removed;
  return {...await commit(pm,draft,plan,now),removed};
}
