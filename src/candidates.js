// Candidate review is an explicit state machine; proposals never participate in retrieval.
import {createHash} from 'node:crypto';
import {capacityError} from './limits.js';
import {assertMemoryFields as fields,normalizeSubject,memoryIdentifier,memorySlot,sameSubject,copyMemoryValue,prepareMemoryWrite,MEMORY_KINDS,memoryArray} from './records.js';
const HOUR=3600000,MAX_TIME=8640000000000000;
const own=(o,k)=>Object.hasOwn(o,k);
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const hash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const INPUT_FIELDS=new Set(['id','memory','reason','confidence','ttlHours']);
const MEMORY_FIELDS=new Set(['subject','kind','key','value','source','evidenceId','observedAt','validFrom','expiresAt']);
const RECORD_FIELDS=new Set(['id','memory','reason','confidence','base','createdAt','updatedAt','expiresAt','revision','status','reviewedAt','decisionReason','acceptedId']);
const STATUSES=['pending','accepted','rejected'];
export function candidateConflict(message){return Object.assign(new Error(message),{code:'ERR_CANDIDATE_CONFLICT'});}
function time(value,label){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>MAX_TIME)throw new TypeError('invalid '+label);return value;}
function text(value,label,max=2000){if(typeof value!=='string'||value.length>max)throw new TypeError('invalid '+label);return value;}
function confidence(value){if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>1)throw new TypeError('invalid candidate confidence');return value;}
function revision(value){if(!Number.isSafeInteger(value)||value<1)throw new TypeError('candidate expectedRevision required');return value;}
function indexRecords(records){
  const groups=new Map();for(const record of Object.values(records)){const slot=memorySlot(record);if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push(record);}return groups;
}
function baseOf(group=[]){
  const head=group.find(record=>record.status==='current');
  return {id:head?.id??null,revision:head?.revision??0,
    fingerprint:hash(head??group.map(record=>[record.id,record.revision,record.updatedAt]).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0))};
}
function memoryInput(raw,now,config,fallback){
  fields(raw,MEMORY_FIELDS,'candidate memory');
  const input={...raw,source:raw.source===undefined?'model':raw.source,evidenceId:memoryIdentifier(raw.evidenceId,'candidate evidenceId')};
  for(const field of ['observedAt','validFrom','expiresAt'])if(input[field]===undefined&&fallback)input[field]=fallback[field];
  const record=prepareMemoryWrite({},input,now,{...config,maxMemories:1},()=> 'candidate-validation').record;
  return Object.fromEntries([...MEMORY_FIELDS].map(key=>[key,record[key]]));
}
function pool(candidates,config){
  if(Object.keys(candidates).length>config.maxCandidates)throw capacityError('candidate');
  if((Object.keys(candidates).length?Buffer.byteLength(JSON.stringify(candidates)):0)>config.maxCandidateBytes)throw capacityError('candidate bytes');
}
export function normalizeAutoAccept(raw){
  if(raw===undefined)return undefined;
  fields(raw,new Set(['kinds','minConfidence','maxPerCall']),'candidate automatic policy');
  const kinds=memoryArray(raw.kinds,'automatic kinds',6);
  if(!kinds.length||kinds.some(kind=>!MEMORY_KINDS.includes(kind)))throw new TypeError('automatic policy needs explicit kinds');
  const minConfidence=confidence(raw.minConfidence),maxPerCall=raw.maxPerCall;
  if(!Number.isSafeInteger(maxPerCall)||maxPerCall<1||maxPerCall>8)throw new RangeError('automatic policy maxPerCall must be 1..8');
  return {kinds:[...new Set(kinds)],minConfidence,maxPerCall};
}
export function stageCandidateAcceptance(records,candidates,requests,now,config){
  requests=memoryArray(requests,'candidate acceptance batch',32);if(!requests.length)throw new RangeError('accept 1..32 candidates');
  if((Object.keys(records).length+requests.length)*requests.length>2000000)throw new RangeError('candidate review work limit exceeded');
  const nextRecords={...records},nextCandidates={...candidates},removed=new Set(),results=[],seen=new Set();
  for(const request of requests){
    fields(request,new Set(['id','expectedRevision']),'candidate acceptance');
    const id=memoryIdentifier(request.id),expected=revision(request.expectedRevision);
    if(seen.has(id))throw new TypeError('duplicate candidate acceptance');seen.add(id);
    const candidate=own(nextCandidates,id)?nextCandidates[id]:null;
    if(!candidate)throw candidateConflict('candidate is unavailable');
    if(candidate.status==='accepted'){
      if(expected!==candidate.revision&&expected!==candidate.revision-1)throw candidateConflict('candidate revision changed');
      results.push({candidate,record:nextRecords[candidate.acceptedId]??null,duplicate:true});continue;
    }
    if(candidate.status!=='pending'||candidate.revision!==expected)throw candidateConflict('candidate was reviewed or revised');
    if(now<candidate.updatedAt||now>=candidate.expiresAt)throw candidateConflict('candidate expired or clock moved backwards');
    const current=baseOf(indexRecords(nextRecords).get(memorySlot(candidate.memory)));
    if(hash(current)!==hash(candidate.base))throw candidateConflict('formal memory changed after proposal; create a fresh reviewed candidate');
    const acceptedId='accepted-'+hash(id);
    const change=prepareMemoryWrite(nextRecords,{...candidate.memory,id:acceptedId,expectedRevision:current.revision,
      ...(current.id===null?{}:{replaceId:current.id})},now,config,()=>acceptedId);
    if(change.previous)nextRecords[change.previous.id]=change.previous;
    for(const removedId of change.removeIds??[]){delete nextRecords[removedId];removed.add(removedId);}
    nextRecords[change.record.id]=change.record;
    const reviewed={...candidate,status:'accepted',revision:candidate.revision+1,reviewedAt:now,updatedAt:now,acceptedId};
    if(!Number.isSafeInteger(reviewed.revision))throw new RangeError('candidate revision exhausted');
    nextCandidates[id]=reviewed;results.push({candidate:reviewed,record:change.record,duplicate:false});
  }
  pool(nextCandidates,config);
  return {records:nextRecords,candidates:nextCandidates,removed,results};
}
export function stageCandidateProposals(records,candidates,inputs,options,now,config){
  fields(options,new Set(['autoAccept']),'candidate proposal options');
  const policy=normalizeAutoAccept(options.autoAccept);
  inputs=memoryArray(inputs,'candidate proposal batch',32);if(!inputs.length)throw new RangeError('propose 1..32 candidates');
  const next={...candidates},groups=indexRecords(records),ids=[],newIds=[];
  for(const input of inputs){
    fields(input,INPUT_FIELDS,'candidate proposal');fields(input.memory,MEMORY_FIELDS,'candidate memory');
    const identity={subject:normalizeSubject(input.memory.subject),kind:input.memory.kind,
      key:memoryIdentifier(input.memory.key,'candidate key'),value:copyMemoryValue(input.memory.value),
      source:input.memory.source===undefined?'model':input.memory.source,evidenceId:memoryIdentifier(input.memory.evidenceId,'candidate evidenceId')};
    const id=input.id===undefined?'proposal-'+hash(identity):memoryIdentifier(input.id,'candidate id');
    const existing=own(next,id)?next[id]:null;
    const memory=memoryInput(input.memory,existing?.createdAt??now,config,existing?.memory);
    const reason=input.reason===undefined?'':text(input.reason,'candidate reason');
    const certainty=input.confidence===undefined?undefined:confidence(input.confidence);
    const ttl=input.ttlHours===undefined?config.candidateTtlHours:input.ttlHours;
    if(typeof ttl!=='number'||!Number.isFinite(ttl)||ttl<0||ttl>720)throw new RangeError('candidate ttlHours must be 0..720');
    if(existing){
      if(hash(existing.memory)!==hash(memory))throw candidateConflict('candidate id belongs to different content');
    }else{
      const expiresAt=Math.min(MAX_TIME,now+ttl*HOUR,memory.expiresAt??MAX_TIME);
      next[id]={id,memory,reason,...(certainty===undefined?{}:{confidence:certainty}),base:baseOf(groups.get(memorySlot(memory))),
        createdAt:now,updatedAt:now,expiresAt,revision:1,status:'pending'};
      newIds.push(id);
    }
    if(!ids.includes(id))ids.push(id);
  }
  pool(next,config);
  const requests=[],omitted=[],slots=new Set();
  if(policy)for(const id of ids){
    const candidate=next[id],slot=memorySlot(candidate.memory);let reason;
    if(candidate.status!=='pending'||candidate.expiresAt<=now)reason='inactive';
    else if(!policy.kinds.includes(candidate.memory.kind))reason='policy-kind';
    else if(candidate.confidence===undefined||candidate.confidence<policy.minConfidence)reason='confidence';
    else if(candidate.base.id!==null||candidate.base.fingerprint!==hash([]))reason='existing-slot';
    else if(slots.has(slot))reason='duplicate-slot';
    else if(requests.length>=policy.maxPerCall)reason='limit';
    if(reason){omitted.push({id,reason});continue;}
    slots.add(slot);requests.push({id,expectedRevision:candidate.revision});
  }
  const accepted=requests.length?stageCandidateAcceptance(records,next,requests,now,config):
    {records,candidates:next,removed:new Set(),results:[]};
  return {...accepted,ids,newIds,omitted};
}
export function reviseCandidate(candidate,options,now,config){
  fields(options,new Set(['expectedRevision','memory','reason','confidence']),'candidate revision');
  if(candidate.status!=='pending'||revision(options.expectedRevision)!==candidate.revision||now<candidate.updatedAt||now>=candidate.expiresAt)throw candidateConflict('candidate cannot be revised');
  const patch=options.memory===undefined?{}:options.memory;
  fields(patch,new Set(['value','evidenceId','observedAt','validFrom','expiresAt']),'candidate memory correction');
  const memory=memoryInput({...candidate.memory,...patch},now,config);
  // A correction does not renew its review deadline or reset its original formal-memory precondition.
  const revised={...candidate,memory,reason:options.reason===undefined?candidate.reason:text(options.reason,'candidate reason'),
    updatedAt:now,revision:candidate.revision+1,expiresAt:Math.min(candidate.expiresAt,memory.expiresAt??MAX_TIME)};
  if(options.confidence!==undefined)revised.confidence=confidence(options.confidence);
  if(!Number.isSafeInteger(revised.revision))throw new RangeError('candidate revision exhausted');
  return revised;
}
export function rejectCandidate(candidate,options,now){
  fields(options,new Set(['expectedRevision','reason']),'candidate rejection');const expected=revision(options.expectedRevision);
  if(candidate.status==='rejected'&&(expected===candidate.revision||expected===candidate.revision-1))return candidate;
  if(candidate.status!=='pending'||expected!==candidate.revision||now<candidate.updatedAt||now>=candidate.expiresAt)throw candidateConflict('candidate cannot be rejected');
  const next={...candidate,status:'rejected',revision:candidate.revision+1,updatedAt:now,reviewedAt:now,
    decisionReason:options.reason===undefined?'':text(options.reason,'rejection reason',1000)};
  if(!Number.isSafeInteger(next.revision))throw new RangeError('candidate revision exhausted');return next;
}
export function selectCandidates(candidates,options,now){
  fields(options,new Set(['subject','status','limit','includeExpired']),'candidate list');
  const subject=normalizeSubject(options.subject),limit=options.limit===undefined?50:options.limit;
  if(!Number.isSafeInteger(limit)||limit<0||limit>1000)throw new RangeError('candidate list limit must be 0..1000');
  if(options.status!==undefined&&!STATUSES.includes(options.status))throw new TypeError('invalid candidate status');
  if(options.includeExpired!==undefined&&typeof options.includeExpired!=='boolean')throw new TypeError('invalid includeExpired');
  return Object.values(candidates).filter(candidate=>sameSubject(candidate.memory.subject,subject)&&
    (options.status===undefined||candidate.status===options.status)&&(options.includeExpired||candidate.expiresAt>now))
    .sort((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,limit);
}
export function hydrateCandidates(raw,config,records){
  if(!raw||typeof raw!=='object'||![Object.prototype,null].includes(Object.getPrototypeOf(raw)))throw new TypeError('invalid candidate collection');
  const keys=Reflect.ownKeys(raw);if(keys.length>config.maxCandidates)throw capacityError('candidate import');
  const next={};
  for(const id of keys){
    const descriptor=Object.getOwnPropertyDescriptor(raw,id);
    if(typeof id!=='string'||memoryIdentifier(id)!==id||!descriptor.enumerable||!own(descriptor,'value'))throw new TypeError('invalid candidate entry');
    const candidate=descriptor.value;fields(candidate,RECORD_FIELDS,'candidate record');
    if(candidate.id!==id||!STATUSES.includes(candidate.status))throw new TypeError('invalid candidate identity/status');
    const createdAt=time(candidate.createdAt,'candidate creation'),updatedAt=time(candidate.updatedAt,'candidate update'),expiresAt=time(candidate.expiresAt,'candidate expiry');
    if(updatedAt<createdAt||updatedAt>expiresAt||expiresAt<createdAt||expiresAt>Math.min(MAX_TIME,createdAt+720*HOUR))throw new TypeError('invalid candidate chronology');
    fields(candidate.memory,MEMORY_FIELDS,'candidate memory');
    for(const key of MEMORY_FIELDS)if(!own(candidate.memory,key))throw new TypeError('incomplete candidate memory');
    const memory=memoryInput(candidate.memory,updatedAt,config);
    if(memory.expiresAt!==null&&expiresAt>memory.expiresAt)throw new TypeError('candidate outlives evidence');
    fields(candidate.base,new Set(['id','revision','fingerprint']),'candidate base');
    const base=candidate.base;
    if(base.id!==null)memoryIdentifier(base.id);
    if(!Number.isSafeInteger(base.revision)||base.revision<0||(base.id===null)!==(base.revision===0)||typeof base.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(base.fingerprint))throw new TypeError('invalid candidate base');
    const record={id,memory,reason:text(candidate.reason,'candidate reason'),base:{...base},createdAt,updatedAt,expiresAt,
      revision:revision(candidate.revision),status:candidate.status};
    if(candidate.confidence!==undefined)record.confidence=confidence(candidate.confidence);
    if(candidate.status==='pending'){
      if(candidate.reviewedAt!==undefined||candidate.acceptedId!==undefined||candidate.decisionReason!==undefined)throw new TypeError('pending candidate has a decision');
    }else{
      record.reviewedAt=time(candidate.reviewedAt,'candidate review');
      if(record.reviewedAt!==updatedAt||record.reviewedAt>=expiresAt||record.revision<2)throw new TypeError('invalid candidate review');
      if(candidate.status==='accepted'){
        if(candidate.acceptedId!=='accepted-'+hash(id)||candidate.decisionReason!==undefined)throw new TypeError('invalid accepted candidate');
        record.acceptedId=candidate.acceptedId;
      }else{
        if(candidate.acceptedId!==undefined)throw new TypeError('rejected candidate has acceptedId');
        record.decisionReason=text(candidate.decisionReason,'rejection reason',1000);
      }
    }
    if(records&&record.status==='accepted'&&own(records,record.acceptedId)){
      const formal=records[record.acceptedId],payload=Object.fromEntries([...MEMORY_FIELDS].map(key=>[key,formal[key]]));
      if(hash(payload)!==hash(record.memory)||formal.createdAt!==record.reviewedAt||formal.revision!==record.base.revision+1||
        (formal.supersedes??null)!==record.base.id||formal.experience!==undefined)throw new TypeError('accepted candidate does not match retained formal memory');
    }
    next[id]=record;
  }
  pool(next,config);return next;
}
