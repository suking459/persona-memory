import {assertMemoryFields as fields,memoryArray,memoryFingerprint,memoryIdentifier,normalizeSubject,sameSubject} from './records.js';
import {copySnapshotJSON} from './snapshot.js';
import {candidateConflict} from './candidates.js';
import {checkRevision,storageError} from './storage.js';
import {createTurnRunner} from './turns.js';

const sourceFields=new Set(['id','revision','fingerprint']);
const sourceOptions=new Set(['subject','sources']);
const batchOptions=new Set(['subject','sources','summaries','evidenceId','origin']);
const summaryFields=new Set(['key','text','sourceIds','reason']);
const bytes=32768;

async function requireCurrentStore(pm){
  if(!pm._store)return;
  if(pm._storeBusy)throw storageError('ERR_STORE_BUSY','memory store operation pending');
  const expected=pm._storeRevision,loaded=await pm._store.read();
  checkRevision(loaded.revision);
  if(!Object.hasOwn(loaded,'snapshot')||(loaded.snapshot===null)!==(loaded.revision===null))throw new TypeError('invalid store read result');
  if(pm._storeBusy||loaded.revision!==expected||pm._storeRevision!==expected){
    throw storageError('ERR_STORE_CONFLICT','memory store changed; reload and resolve before consolidating');
  }
}

function selectSources(pm,subject,inputs,requireFingerprint){
  const seen=new Set(),records=[],sources=[],now=pm._now();
  for(const input of memoryArray(inputs,'consolidation sources',32)){
    fields(input,sourceFields,'consolidation source');
    const id=memoryIdentifier(input.id),{revision,fingerprint}=input;
    if(seen.has(id)||!Number.isSafeInteger(revision)||revision<1)throw new TypeError('invalid or repeated consolidation source');
    seen.add(id);
    const record=pm.getMemory(id,{now});
    if(!record||!sameSubject(subject,record.subject)||record.revision!==revision)throw candidateConflict('consolidation source unavailable or changed');
    const actual=memoryFingerprint(record);
    if((requireFingerprint||fingerprint!==undefined)&&actual!==fingerprint)throw candidateConflict('consolidation source fingerprint changed');
    sources.push({id,revision,fingerprint:actual});
    records.push(record);
  }
  if(sources.length<2)throw new RangeError('provide at least two consolidation sources');
  return copySnapshotJSON({sources,records},bytes);
}

export async function readConsolidationSources(pm,options){
  fields(options,sourceOptions,'consolidation source options');
  const subject=normalizeSubject(options.subject),inputs=copySnapshotJSON(options.sources,bytes,{omitUndefined:true});
  await requireCurrentStore(pm);
  return selectSources(pm,subject,inputs,false);
}

function summaries(raw,sources){
  const allowed=new Map(sources.map(source=>[source.id,source])),keys=new Set();
  return memoryArray(copySnapshotJSON(raw,bytes),'consolidation summaries',16).map(item=>{
    fields(item,summaryFields,'consolidation summary');
    const key=memoryIdentifier(item.key,'summary key');
    if(!key.startsWith('summary/')||key.length===8||keys.has(key))throw new TypeError('use distinct nonempty summary/ keys');
    keys.add(key);
    const {text,reason}=item;
    if(typeof text!=='string'||!text.trim()||text.length>4000||typeof reason!=='string'||!reason.trim()||reason.length>1000)throw new TypeError('invalid summary text or reason');
    const sourceIds=memoryArray(item.sourceIds,'summary source IDs',16);
    if(sourceIds.length<2||new Set(sourceIds).size!==sourceIds.length||sourceIds.some(id=>!allowed.has(id)))throw new TypeError('summary needs two or more distinct selected sources');
    return {key,text,reason,sources:sourceIds.map(id=>allowed.get(id))};
  });
}

export async function proposeMemoryConsolidation(pm,options){
  fields(options,batchOptions,'consolidation batch');
  const batch=copySnapshotJSON(options,65536,{omitUndefined:true});
  const subject=normalizeSubject(batch.subject),evidenceId=memoryIdentifier(batch.evidenceId,'consolidation evidence');
  await requireCurrentStore(pm);
  const {sources}=selectSources(pm,subject,batch.sources,true);
  const proposals=summaries(batch.summaries,sources).map(summary=>({
    reason:summary.reason,
    memory:{subject,kind:'fact',key:summary.key,value:summary.text,source:'model',assertion:'inferred',evidenceId,
      derivedFrom:summary.sources,...(batch.origin===undefined?{}:{origin:batch.origin})},
  }));
  return {candidates:proposals.length?pm.proposeMemories(proposals).candidates:[],evidenceVerified:false};
}

export function createMemoryConsolidator(pm,options){
  fields(options,new Set(['subject','timeoutMs']),'consolidator options');
  const subject=normalizeSubject(options.subject);
  const run=createTurnRunner({limit:16,timeoutMs:options.timeoutMs??30000});
  return {
    async draft(input,summarize){
      fields(input,new Set(['evidenceId','sources']),'consolidation draft');
      const evidenceId=memoryIdentifier(input.evidenceId,'consolidation evidence');
      if(typeof summarize!=='function')throw new TypeError('summarizer callback required');
      const inputs=copySnapshotJSON(input.sources,bytes,{omitUndefined:true});
      await requireCurrentStore(pm);
      const {sources}=selectSources(pm,subject,inputs,false);
      const identity=JSON.stringify(sources);
      const draft=await run(evidenceId,identity,async state=>{
        state.checkActive();
        await requireCurrentStore(pm);
        state.checkActive();
        const {records}=selectSources(pm,subject,sources,true);
        const raw=await summarize(copySnapshotJSON({subject,records},65536),{signal:state.signal});
        state.checkActive();
        return summaries(raw,sources).map(({key,text,reason,sources:refs})=>({key,text,reason,sourceIds:refs.map(ref=>ref.id)}));
      });
      // Cached drafts are also checked against current source availability.
      await requireCurrentStore(pm);
      selectSources(pm,subject,sources,true);
      return copySnapshotJSON({subject,evidenceId,sources,summaries:draft},65536);
    },
  };
}
