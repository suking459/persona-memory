import {createHash} from 'node:crypto';
// Typed memory records are separate from social profiles and scoring.
import {capacityError} from './limits.js';

export const MEMORY_KINDS=Object.freeze(['preference','fact','constraint','decision','episode','state']);
const SUBJECT_TYPES=new Set(['user','project','task']);
const SOURCES=new Set(['manual','user','host','rule','model','import']);
const MAX_TIME=8640000000000000,HOUR=3600000,DAY=86400000;
const VALUE_LIMITS=Object.freeze({bytes:16384,nodes:1024,depth:8,entries:128,stringChars:8192});
const FORBIDDEN=new Set(['__proto__','constructor','prototype']);
const INPUT_FIELDS=new Set(['id','subject','kind','key','value','source','evidenceId','observedAt','expiresAt','validFrom','replaceId','expectedRevision','experience','derivedFrom','assertion']);
const RECORD_FIELDS=new Set(['id','subject','kind','key','value','source','evidenceId','observedAt','expiresAt','createdAt','updatedAt','revision','status','supersedes','supersededBy','validFrom','validUntil','experience','derivedFrom','assertion']);
const own=(object,key)=>Object.hasOwn(object,key);
function plain(value,label){
  if(!value || typeof value!=='object' || Array.isArray(value) ||
    ![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw new TypeError('invalid '+label);
}
function fields(value,allowed,label){
  plain(value,label);
  for(const key of Reflect.ownKeys(value)){
    const d=Object.getOwnPropertyDescriptor(value,key);
    if(typeof key!=='string' || !allowed.has(key) || !d.enumerable || !own(d,'value'))throw new TypeError('invalid '+label+' field');
  }
}
export function memoryIdentifier(value,label='memory id'){
  if(typeof value!=='string')throw new TypeError(label+' must be a string');
  const text=value.trim();
  if(!text || text.length>256 || FORBIDDEN.has(text) || /[\u0000-\u001f]/.test(text))throw new TypeError('invalid '+label);
  return text;
}
function timestamp(value,label){
  if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>MAX_TIME)throw new TypeError('invalid '+label);
  return value;
}
function kindOf(value){
  if(!MEMORY_KINDS.includes(value))throw new TypeError('invalid memory kind');
  return value;
}
export function normalizeSubject(value){
  fields(value,new Set(['type','id','chatId']),'memory subject');
  if(!SUBJECT_TYPES.has(value.type))throw new TypeError('invalid memory subject type');
  return {type:value.type,id:memoryIdentifier(value.id,'subject id'),
    ...(value.chatId===undefined?{}:{chatId:memoryIdentifier(value.chatId,'subject chatId')})};
}
export function sameSubject(a,b){
  return a.type===b.type && a.id===b.id && a.chatId===b.chatId;
}
export function memorySlot(record){
  return JSON.stringify([record.subject.type,record.subject.id,record.subject.chatId??null,record.kind,record.key]);
}
export function copyMemoryValue(value){
  let nodes=0;const ancestors=new Set();
  function copy(v,depth){
    if(++nodes>VALUE_LIMITS.nodes || depth>VALUE_LIMITS.depth)throw new RangeError('memory value exceeds structural limits');
    if(v===null || typeof v==='boolean')return v;
    if(typeof v==='number'){if(!Number.isFinite(v))throw new TypeError('memory value requires finite JSON numbers');return v;}
    if(typeof v==='string'){if(v.length>VALUE_LIMITS.stringChars)throw new RangeError('memory string too large');return v;}
    if(typeof v!=='object')throw new TypeError('memory value must be JSON');
    if(ancestors.has(v))throw new TypeError('cyclic memory value');
    ancestors.add(v);
    let result;
    if(Array.isArray(v)){
      if(v.length>VALUE_LIMITS.entries)throw new RangeError('memory array too large');
      const names=Reflect.ownKeys(v);
      if(names.length!==v.length+1)throw new TypeError('memory arrays must be dense JSON arrays');
      result=[];
      for(let i=0;i<v.length;i++){
        const d=Object.getOwnPropertyDescriptor(v,String(i));
        if(!d || !d.enumerable || !own(d,'value'))throw new TypeError('invalid memory array entry');
        result.push(copy(d.value,depth+1));
      }
    }else{
      plain(v,'memory value');
      const names=Reflect.ownKeys(v);
      if(names.length>VALUE_LIMITS.entries)throw new RangeError('memory object too large');
      result={};
      if(names.some(name=>typeof name!=='string'))throw new TypeError('invalid memory value field');
      // A binary string order distinguishes keys that locale collation treats as equal.
      for(const name of names.sort()){
        const d=Object.getOwnPropertyDescriptor(v,name);
        if(typeof name!=='string' || name.length>256 || FORBIDDEN.has(name) || !d.enumerable || !own(d,'value'))throw new TypeError('invalid memory value field');
        result[name]=copy(d.value,depth+1);
      }
    }
    ancestors.delete(v);return result;
  }
  const result=copy(value,0);
  if(Buffer.byteLength(JSON.stringify(result))>VALUE_LIMITS.bytes)throw new RangeError('memory value exceeds byte limit');
  return result;
}
// Content identity excludes mutable version links, preserving valid historical intervals.
export function memoryFingerprint(record){
  return createHash('sha256').update(JSON.stringify([record.id,record.subject,record.kind,record.key,record.value,record.source,
    record.evidenceId??null,record.observedAt,record.createdAt,record.revision,record.validFrom,record.expiresAt,
    record.experience??null,record.assertion??null,record.derivedFrom??null])).digest('hex');
}
export function normalizeDependencies(raw,{records={},subject,now,slot,saved=false}){
  if(raw===undefined)return undefined;
  const inputs=memoryArray(raw,'memory dependencies',16);if(!inputs.length)throw new RangeError('provide 1..16 memory dependencies');
  const seen=new Set(),refs=[];
  for(const input of inputs){
    fields(input,new Set(['id','revision','fingerprint','slotFingerprint']),'memory dependency');
    const id=memoryIdentifier(input.id,'dependency id'),revision=input.revision;
    if(!Number.isSafeInteger(revision)||revision<1||seen.has(id))throw new TypeError('invalid or repeated dependency revision');
    seen.add(id);
    if(input.fingerprint!==undefined&&(typeof input.fingerprint!=='string'||!/^[0-9a-f]{64}$/.test(input.fingerprint)))throw new TypeError('invalid dependency fingerprint');
    const source=own(records,id)?records[id]:null;
    if(source&&(!sameSubject(source.subject,subject)||memorySlot(source)===slot))throw new TypeError('dependency must use another field in the same subject');
    if(!saved&&(!source||source.revision!==revision||!dependencyStatus(source,records,now).usable))throw conflict('dependency is unavailable, inactive or changed');
    const fingerprint=saved?input.fingerprint:memoryFingerprint(source);
    if(typeof fingerprint!=='string')throw new TypeError('saved dependency fingerprint required');
    if(!saved&&input.fingerprint!==undefined&&input.fingerprint!==fingerprint)throw conflict('dependency content changed');
    const slotFingerprint=saved?input.slotFingerprint:createHash('sha256').update(memorySlot(source)).digest('hex');
    if(typeof slotFingerprint!=='string'||!/^[0-9a-f]{64}$/.test(slotFingerprint))throw new TypeError('saved dependency slot fingerprint required');
    if(source&&slotFingerprint!==createHash('sha256').update(memorySlot(source)).digest('hex'))throw new TypeError('dependency logical field changed');
    if(!saved&&input.slotFingerprint!==undefined&&input.slotFingerprint!==slotFingerprint)throw conflict('dependency logical field changed');
    refs.push({id,revision,fingerprint,slotFingerprint});
  }
  return refs.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
}
export function dependencyStatus(record,records,at,knownAt=at){
  if(!memoryAppliesAt(record,at,knownAt))return {usable:false,reason:'inactive'};
  const done=new Set(),active=new Set([record.id]),stack=[{record,index:0}],seen=new Set([record.id]);let steps=0;
  while(stack.length){
    if(++steps>4096)return {usable:false,reason:'dependency-work-limit'};
    const frame=stack.at(-1),refs=frame.record.derivedFrom??[];
    if(frame.index>=refs.length){active.delete(frame.record.id);done.add(frame.record.id);stack.pop();continue;}
    const ref=refs[frame.index++],source=own(records,ref.id)?records[ref.id]:null;
    const fail=reason=>({usable:false,reason,dependencyId:ref.id});
    if(!source)return fail('dependency-missing');
    if(!sameSubject(source.subject,record.subject))return fail('dependency-scope');
    if(source.revision!==ref.revision||memoryFingerprint(source)!==ref.fingerprint||createHash('sha256').update(memorySlot(source)).digest('hex')!==ref.slotFingerprint)return fail('dependency-changed');
    if(!memoryAppliesAt(source,at,knownAt))return fail('dependency-inactive');
    if(active.has(ref.id))return fail('dependency-cycle');
    if(done.has(ref.id))continue;
    seen.add(ref.id);if(seen.size>128||stack.length>8)return fail('dependency-work-limit');
    active.add(ref.id);stack.push({record:source,index:0});
  }
  return {usable:true,reason:'current'};
}
function assertDependencyGraph(records){
  const done=new Map(),active=new Set();
  for(const root of Object.values(records)){
    if(done.has(root.id))continue;
    const stack=[{record:root,index:0,height:0}];active.add(root.id);
    while(stack.length){
      const frame=stack.at(-1),refs=frame.record.derivedFrom??[];
      if(frame.index>=refs.length){
        if(frame.height>8)throw new RangeError('dependency graph exceeds depth limit');
        done.set(frame.record.id,frame.height);active.delete(frame.record.id);stack.pop();
        if(stack.length)stack.at(-1).height=Math.max(stack.at(-1).height,frame.height+1);
        continue;
      }
      const ref=refs[frame.index++],source=own(records,ref.id)?records[ref.id]:null;
      if(!source)continue; // Pruned sources remain stale, never treated as current.
      if(!sameSubject(source.subject,frame.record.subject)||memorySlot(source)===memorySlot(frame.record))throw new TypeError('invalid dependency scope or field');
      if(ref.slotFingerprint!==createHash('sha256').update(memorySlot(source)).digest('hex'))throw new TypeError('dependency logical field changed');
      if(active.has(source.id))throw new TypeError('cyclic memory dependencies');
      if(done.has(source.id)){frame.height=Math.max(frame.height,done.get(source.id)+1);continue;}
      if(stack.length>8)throw new RangeError('dependency graph exceeds depth limit');
      active.add(source.id);stack.push({record:source,index:0,height:0});
    }
  }
}
export function memoryForgetImpact(records,candidates,id){
  const reviewed=Object.values(candidates).find(candidate=>candidate.acceptedId===id);
  const initial=memorySlotForId(records,id)??(reviewed?memorySlot(reviewed.memory):null);
  if(initial===null)return {recordIds:[],candidateIds:[]};
  const groups=new Map(),reverse=new Map(),slots=new Set(),ids=new Set(),queue=[];
  const slotHash=slot=>createHash('sha256').update(slot).digest('hex');
  for(const record of Object.values(records)){
    const slot=memorySlot(record);if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push(record.id);
    for(const ref of record.derivedFrom??[]){if(!reverse.has(ref.slotFingerprint))reverse.set(ref.slotFingerprint,[]);reverse.get(ref.slotFingerprint).push(slot);}
  }
  const addSlot=slot=>{
    const fingerprint=slotHash(slot);if(slots.has(fingerprint))return;
    slots.add(fingerprint);queue.push(fingerprint);
    for(const key of groups.get(slot)??[])ids.add(key);
  };
  addSlot(initial);
  for(let index=0;index<queue.length;index++)for(const slot of reverse.get(queue[index])??[])addSlot(slot);
  return {recordIds:[...ids].sort(),
    candidateIds:Object.values(candidates).filter(candidate=>slots.has(slotHash(memorySlot(candidate.memory)))||
      candidate.memory.derivedFrom?.some(ref=>slots.has(ref.slotFingerprint))).map(candidate=>candidate.id).sort()};
}

function conflict(message){
  const error=new Error(message);error.code='ERR_MEMORY_CONFLICT';return error;
}
// A pruned record can still be identified by the retained ends of its chain.
// Reserve those IDs until the logical memory is forgotten; reusing one would rebind history.
export function memorySlotForId(records,id){
  let slot=own(records,id)?memorySlot(records[id]):null;
  for(const record of Object.values(records))if(record.supersedes===id || record.supersededBy===id){
    const referencedSlot=memorySlot(record);
    if(slot!==null && slot!==referencedSlot)throw conflict('memory id has ambiguous references');
    slot=referencedSlot;
  }
  return slot;
}
export function isCurrentMemory(record,now,records){
  return record.derivedFrom?!!records&&dependencyStatus(record,records,now).usable:memoryAppliesAt(record,now,now);
}
export function memoryAppliesAt(record,at,knownAt){
  return record.createdAt<=knownAt && record.validFrom<=at &&
    (record.validUntil===null || record.updatedAt>knownAt || record.validUntil>at) &&
    (record.expiresAt===null || record.expiresAt>knownAt);
}
export function memoryAt(records,options,now){
  fields(options,new Set(['subject','kind','key','at','knownAt']),'memory time query');
  const subject=normalizeSubject(options.subject),kind=kindOf(options.kind),key=memoryIdentifier(options.key,'memory key');
  const at=timestamp(options.at,'valid time'),knownAt=timestamp(options.knownAt===undefined?now:options.knownAt,'known time');
  if(knownAt>now)throw new RangeError('knownAt cannot exceed the current clock');
  const matches=Object.values(records).filter(record=>sameSubject(record.subject,subject) && record.kind===kind && record.key===key && dependencyStatus(record,records,at,knownAt).usable);
  if(matches.length>1)throw conflict('retained history is ambiguous at the requested time');
  return matches[0]??null;
}
export function memoryArray(value,label,max){
  if(!Array.isArray(value)||value.length>max)throw new RangeError('invalid or excessive '+label);
  if(Reflect.ownKeys(value).length!==value.length+1)throw new TypeError('invalid '+label+' fields');
  const result=[];
  for(let i=0;i<value.length;i++){
    const d=Object.getOwnPropertyDescriptor(value,String(i));
    if(!d||!d.enumerable||!own(d,'value'))throw new TypeError('invalid '+label+' entry');
    result.push(d.value);
  }
  return result;
}
export function normalizeExperienceValue(raw){
  fields(raw,new Set(['task','context','attempt','result','conditions']),'experience value');
  const text=(value,label,max)=>{if(typeof value!=='string'||!value.trim()||value.length>max)throw new TypeError('invalid experience '+label);return value.trim();};
  const conditions=memoryArray(raw.conditions,'experience conditions',16);
  return {task:text(raw.task,'task',2000),context:copyMemoryValue(raw.context),attempt:text(raw.attempt,'attempt',2000),
    result:text(raw.result,'result',4000),conditions:[...new Set(conditions.map(value=>text(value,'condition',256)))]};
}
function experienceOf(value,kind,source,evidenceId,payload){
  if(value===undefined)return undefined;
  fields(value,new Set(['outcome','verified']),'experience metadata');
  if(kind!=='episode'||source!=='host'||!['success','failure','mixed','unknown'].includes(value.outcome)||typeof value.verified!=='boolean')throw new TypeError('invalid host experience metadata');
  if(value.verified&&(!evidenceId||value.outcome==='unknown'))throw new TypeError('verified experience requires host evidence and a known outcome');
  normalizeExperienceValue(payload);return {outcome:value.outcome,verified:value.verified};
}
export function normalizeAssertion(value){
  if(value!==undefined&&!['explicit','observed','inferred','external'].includes(value))throw new TypeError('invalid memory assertion');return value;
}
export function prepareMemoryWrite(records,input,now,config,createId,{dependencyRecords=records,savedDependencies=false,validationOnly=false}={}){
  fields(input,INPUT_FIELDS,'memory input');timestamp(now,'memory time');
  const id=input.id===undefined?createId():memoryIdentifier(input.id);
  const subject=normalizeSubject(input.subject),kind=kindOf(input.kind),key=memoryIdentifier(input.key,'memory key');
  if(!own(input,'value'))throw new TypeError('memory value required');
  const value=copyMemoryValue(input.value),source=input.source===undefined?'manual':input.source;
  if(!SOURCES.has(source))throw new TypeError('invalid memory source');
  const evidenceId=input.evidenceId===undefined?undefined:memoryIdentifier(input.evidenceId,'memory evidenceId');
  const experience=experienceOf(input.experience,kind,source,evidenceId,value),assertion=normalizeAssertion(input.assertion);
  const replaceId=input.replaceId===undefined?undefined:memoryIdentifier(input.replaceId,'replaceId');
  const existing=own(records,id)?records[id]:null;
  if(existing?.derivedFrom&&input.derivedFrom===undefined)throw conflict('existing dependency metadata must be preserved in a retry');
  const derivedFrom=normalizeDependencies(input.derivedFrom,{records:dependencyRecords,subject,now,slot:memorySlot({subject,kind,key}),saved:savedDependencies});
  if(!existing && memorySlotForId(records,id)!==null)throw conflict('memory id is still referenced by retained versions; use a fresh id or forget the old memory');
  const observedAt=timestamp(input.observedAt===undefined?(existing?.observedAt??now):input.observedAt,'memory observedAt');
  if(observedAt>(existing?.createdAt??now))throw new RangeError('memory evidence cannot be observed in the future');
  const validFrom=timestamp(input.validFrom===undefined?(existing?.validFrom??now):input.validFrom,'memory validFrom');
  if(input.expectedRevision!==undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision<0))throw new TypeError('invalid expectedRevision');
  let expiresAt;
  if(input.expiresAt!==undefined)expiresAt=input.expiresAt;
  else if(existing)expiresAt=existing.expiresAt;
  else if(kind==='state')expiresAt=Math.min(MAX_TIME,Math.max(now,validFrom)+config.stateMemoryTtlHours*HOUR);
  else if(kind==='episode')expiresAt=Math.min(MAX_TIME,Math.max(now,validFrom)+config.episodeMemoryTtlDays*DAY);
  else expiresAt=null;
  if(derivedFrom&&!savedDependencies)for(const ref of derivedFrom){
    const expiry=dependencyRecords[ref.id].expiresAt;if(expiry!==null)expiresAt=expiresAt===null?expiry:Math.min(expiresAt,expiry);
  }
  if(expiresAt!==null){
    timestamp(expiresAt,'memory expiresAt');
    if(expiresAt<Math.max(existing?.createdAt??now,validFrom))throw new RangeError('memory expiry precedes creation');
  }
  const candidate={id,subject,kind,key,value,source,observedAt,expiresAt,validFrom,...(evidenceId===undefined?{}:{evidenceId}),...(experience===undefined?{}:{experience}),...(derivedFrom===undefined?{}:{derivedFrom}),...(assertion===undefined?{}:{assertion})};
  if(existing){
    if(existing.experience!==undefined&&experience===undefined)throw conflict('existing experience metadata must be preserved in a retry');
    const previous={};
    for(const name of Object.keys(candidate))previous[name]=existing[name];
    if(JSON.stringify(previous)!==JSON.stringify(candidate) ||
      (replaceId!==undefined && replaceId!==existing.supersedes) ||
      (input.expectedRevision!==undefined && input.expectedRevision!==existing.revision-1))throw conflict('memory id already belongs to different content');
    return {record:existing,duplicate:true};
  }
  const slot=memorySlot(candidate);
  let previous;
  if(replaceId!==undefined){
    previous=own(records,replaceId)?records[replaceId]:null;
    if(!previous || previous.status!=='current' || memorySlot(previous)!==slot)throw conflict('replaceId must identify the current record in the same memory slot');
  }else{
    previous=Object.values(records).find(record=>record.status==='current' && memorySlot(record)===slot);
    if(previous && (previous.expiresAt===null || previous.expiresAt>now))throw conflict('current memory exists; provide replaceId to change it explicitly');
  }
  if(input.expectedRevision!==undefined && input.expectedRevision!==(previous?.revision??0))throw conflict('memory revision changed');
  if(previous && validFrom<previous.validFrom)throw conflict('validFrom cannot move behind the latest version; correct the latest interval explicitly');
  if(previous && now<previous.updatedAt)throw conflict('out-of-order memory update');
  const versions=Object.values(records).filter(record=>memorySlot(record)===slot).sort((a,b)=>a.revision-b.revision);
  const excess=Math.max(0,versions.length+1-config.maxVersionsPerMemory);
  // Keep every version whose effective interval has not ended, including scheduled changes.
  const removable=versions.filter(record=>(record.id===previous?.id?validFrom:record.validUntil)!==null &&
    (record.id===previous?.id?validFrom:record.validUntil)<=now).slice(0,excess).map(record=>record.id);
  if(removable.length<excess)throw capacityError('scheduled memory version');
  if(Object.keys(records).length-removable.length>=config.maxMemories)throw capacityError('memory record');
  if(!previous && versions.length)throw conflict('memory head was pruned; forget retained history explicitly before restarting the slot');
  const revision=(previous?.revision??0)+1;
  if(!Number.isSafeInteger(revision))throw new RangeError('memory revision exhausted');
  const record={...candidate,createdAt:now,updatedAt:now,revision,status:'current',validUntil:null,
    ...(previous?{supersedes:previous.id}:{})};
  if(derivedFrom&&!validationOnly){
    const view={...dependencyRecords,...records,...(previous?{[previous.id]:{...previous,status:'superseded',supersededBy:id,updatedAt:now,validUntil:validFrom}}:{}),[id]:record};
    for(const removedId of removable)delete view[removedId];
    const status=dependencyStatus(record,view,Math.max(now,validFrom));
    if(!status.usable)throw conflict('new derived record would be stale: '+status.reason);
  }
  return {record,previous:previous?{...previous,status:'superseded',supersededBy:id,updatedAt:now,validUntil:validFrom}:null,removeIds:removable,duplicate:false};
}
function normalizeRecord(raw,{legacy=false,allowExperience=true,allowDerived=true}={}){
  fields(raw,RECORD_FIELDS,'memory record');
  if(legacy && (own(raw,'validFrom') || own(raw,'validUntil')))throw new TypeError('effective timestamps require schemaVersion=4');
  const id=memoryIdentifier(raw.id),subject=normalizeSubject(raw.subject),kind=kindOf(raw.kind),key=memoryIdentifier(raw.key,'memory key');
  const value=copyMemoryValue(raw.value);
  if(!SOURCES.has(raw.source) || !['current','superseded'].includes(raw.status))throw new TypeError('invalid memory source or status');
  const createdAt=timestamp(raw.createdAt,'memory createdAt'),updatedAt=timestamp(raw.updatedAt,'memory updatedAt');
  const observedAt=timestamp(raw.observedAt,'memory observedAt');
  if(updatedAt<createdAt || observedAt>createdAt)throw new TypeError('invalid memory chronology');
  const expiresAt=raw.expiresAt===null?null:timestamp(raw.expiresAt,'memory expiresAt');
  const validFrom=legacy?createdAt:timestamp(raw.validFrom,'memory validFrom');
  const validUntil=legacy?(raw.status==='superseded'?updatedAt:null):(raw.validUntil===null?null:timestamp(raw.validUntil,'memory validUntil'));
  if(validUntil!==null && validUntil<validFrom)throw new TypeError('invalid memory validity interval');
  if((raw.status==='current')!==(validUntil===null))throw new TypeError('invalid memory validity status');
  if(expiresAt!==null && expiresAt<Math.max(createdAt,validFrom))throw new TypeError('invalid memory expiry');
  if(!Number.isSafeInteger(raw.revision) || raw.revision<1)throw new TypeError('invalid memory revision');
  if(!allowExperience&&raw.experience!==undefined)throw new TypeError('experience metadata requires schemaVersion=5');
  const experience=experienceOf(raw.experience,kind,raw.source,raw.evidenceId,value);
  if(!allowDerived&&(raw.derivedFrom!==undefined||raw.assertion!==undefined))throw new TypeError('dependency metadata requires schemaVersion=6');
  const assertion=normalizeAssertion(raw.assertion);
  const derivedFrom=normalizeDependencies(raw.derivedFrom,{subject,slot:memorySlot({subject,kind,key}),saved:true});
  const record={id,subject,kind,key,value,source:raw.source,observedAt,expiresAt,createdAt,updatedAt,
    revision:raw.revision,status:raw.status,validFrom,validUntil,...(experience===undefined?{}:{experience}),...(derivedFrom===undefined?{}:{derivedFrom}),...(assertion===undefined?{}:{assertion})};
  for(const field of ['evidenceId','supersedes','supersededBy'])if(raw[field]!==undefined)record[field]=memoryIdentifier(raw[field],'memory '+field);
  if(record.supersedes===id || record.supersededBy===id ||
    (record.status==='current' && record.supersededBy!==undefined) ||
    (record.status==='superseded' && record.supersededBy===undefined))throw new TypeError('invalid memory replacement');
  if((record.revision===1 && record.supersedes!==undefined) ||
    (record.revision>1 && record.supersedes===undefined))throw new TypeError('invalid memory revision ancestry');
  return record;
}
export function hydrateMemories(raw,config,options={}){
  plain(raw,'memory collection');
  const ids=Reflect.ownKeys(raw);
  if(ids.length>config.maxMemories)throw capacityError('memory import');
  const next={},slots=new Set(),slotCounts=new Map();
  for(const id of ids){
    const descriptor=Object.getOwnPropertyDescriptor(raw,id);
    if(typeof id!=='string' || !descriptor.enumerable || !own(descriptor,'value'))throw new TypeError('invalid memory collection entry');
    if(memoryIdentifier(id)!==id)throw new TypeError('invalid memory collection key');
    const record=normalizeRecord(descriptor.value,options);
    if(id!==record.id)throw new TypeError('memory id mismatch');
    if(record.status==='current'){
      const slot=memorySlot(record);
      if(slots.has(slot))throw new TypeError('duplicate current memory slot');
      slots.add(slot);
    }
    const slot=memorySlot(record),count=(slotCounts.get(slot)??0)+1;
    if(count>config.maxVersionsPerMemory)throw capacityError('memory version import');
    slotCounts.set(slot,count);next[id]=record;
  }
  for(const record of Object.values(next)){
    const older=record.supersedes && own(next,record.supersedes)?next[record.supersedes]:null;
    const newer=record.supersededBy && own(next,record.supersededBy)?next[record.supersededBy]:null;
    if(older && (memorySlot(older)!==memorySlot(record) || older.supersededBy!==record.id || older.revision+1!==record.revision || older.updatedAt!==record.createdAt || older.validUntil!==record.validFrom || older.validFrom>record.validFrom))throw new TypeError('invalid memory predecessor');
    if(newer && (memorySlot(newer)!==memorySlot(record) || newer.supersedes!==record.id || record.revision+1!==newer.revision))throw new TypeError('invalid memory successor');
  }
  // Missing nodes are legitimate after expiry, but their surviving references must agree.
  const gaps=new Map(),gapIdentity=new Map();
  for(const record of Object.values(next)){
    const slot=memorySlot(record);
    for(const [id,revision,side] of [
      [record.supersedes,record.revision-1,'successor'],
      [record.supersededBy,record.revision+1,'predecessor'],
    ]){
      if(id===undefined || own(next,id))continue;
      if(!Number.isSafeInteger(revision) || revision<1)throw new TypeError('invalid missing memory revision');
      const identity=JSON.stringify([slot,revision]);
      if(gapIdentity.has(identity) && gapIdentity.get(identity)!==id)throw new TypeError('inconsistent missing memory identity');
      gapIdentity.set(identity,id);
      const gap=gaps.get(id)??{slot,revision};
      if(gap.slot!==slot || gap.revision!==revision || gap[side]!==undefined)throw new TypeError('ambiguous missing memory reference');
      gap[side]=record;gaps.set(id,gap);
    }
  }
  for(const gap of gaps.values())if(gap.predecessor && gap.successor &&
    (gap.predecessor.updatedAt>gap.successor.createdAt || gap.predecessor.validUntil>gap.successor.validFrom))throw new TypeError('invalid missing memory chronology');
  const groups=new Map();
  for(const record of Object.values(next)){
    const slot=memorySlot(record);if(!groups.has(slot))groups.set(slot,[]);groups.get(slot).push(record);
  }
  for(const group of groups.values()){
    group.sort((a,b)=>a.revision-b.revision);
    for(let i=1;i<group.length;i++){
      const a=group[i-1],b=group[i];
      if(a.revision===b.revision || a.createdAt>b.createdAt || a.updatedAt>b.createdAt ||
        a.validFrom>b.validFrom || a.validUntil===null || a.validUntil>b.validFrom)throw new TypeError('overlapping or inconsistent retained memory intervals');
    }
  }
  assertDependencyGraph(next);
  return next;
}
export function selectMemories(records,options={},now){
  fields(options,new Set(['subject','kind','key','limit','includeInactive','now']),'memory list options');
  let {subject,kind,key,limit=50,includeInactive=false}=options;
  subject=normalizeSubject(subject);
  if(kind!==undefined)kindOf(kind);
  if(key!==undefined)key=memoryIdentifier(key,'memory key');
  if(typeof includeInactive!=='boolean')throw new TypeError('includeInactive must be boolean');
  if(!Number.isSafeInteger(limit) || limit<0 || limit>1000)throw new RangeError('invalid memory list limit');
  return Object.values(records).filter(record=>sameSubject(record.subject,subject) &&
    (kind===undefined || record.kind===kind) && (key===undefined || record.key===key) &&
    (includeInactive || isCurrentMemory(record,now,records)))
    .sort((a,b)=>b.createdAt-a.createdAt || b.revision-a.revision || (a.id<b.id?-1:a.id>b.id?1:0)).slice(0,limit);
}

export {fields as assertMemoryFields};
