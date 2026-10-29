// Portable current values only. Full version history remains in the validated snapshot format.
import {createHash} from 'node:crypto';
import {assertMemoryFields,normalizeSubject,sameSubject,memorySlot,prepareMemoryWrite,copyMemoryValue,isCurrentMemory,memoryIdentifier} from './records.js';
import {normalizeMemorySearch} from './retrieval.js';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const MAX_BYTES=4194304;
const ENTRY_FIELDS=new Set(['id','subject','kind','key','value','source','evidenceId','observedAt','validFrom','expiresAt']);
const portable=record=>Object.fromEntries([...ENTRY_FIELDS].filter(key=>record[key]!==undefined).map(key=>[key,record[key]]));
const validTime=value=>typeof value==='number' && Number.isFinite(value) && value>=0 && value<=8640000000000000;
function checkSize(value){if(Buffer.byteLength(JSON.stringify(value))>MAX_BYTES)throw new RangeError('memory transfer exceeds 4 MiB');}
export function exportMemoryBundle(records,options,now){
  assertMemoryFields(options,new Set(['subject','subjects','kinds','keys','sources']),'memory export options');
  const selected=normalizeMemorySearch(options),items=[];
  for(const record of Object.values(records)){
    if(!selected.subjects.some(subject=>sameSubject(subject,record.subject)) || !isCurrentMemory(record,now) ||
      (selected.kinds && !selected.kinds.includes(record.kind)) || (selected.keys && !selected.keys.includes(record.key)) ||
      (selected.sources && !selected.sources.includes(record.source)))continue;
    if(items.length>=1000)throw new RangeError('select fewer records; memory transfer limit is 1000');
    items.push(portable(record));
  }
  items.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  const bundle={format:'persona-memory/records',version:1,exportedAt:now,records:items};checkSize(bundle);return bundle;
}
export function prepareMemoryImport(records,bundle,options,now,config){
  assertMemoryFields(bundle,new Set(['format','version','exportedAt','records']),'memory bundle');
  if(bundle.format!=='persona-memory/records' || bundle.version!==1 || !validTime(bundle.exportedAt) ||
    !Array.isArray(bundle.records) || bundle.records.length>1000)throw new TypeError('invalid memory bundle');
  assertMemoryFields(options,new Set(['mappings']),'memory import options');
  if(!Array.isArray(options.mappings) || options.mappings.length>32)throw new RangeError('explicit subject mappings required, at most 32');
  const mappings=[];
  for(const raw of options.mappings){
    assertMemoryFields(raw,new Set(['from','to']),'memory mapping');
    const from=normalizeSubject(raw.from),to=normalizeSubject(raw.to);
    if(mappings.some(item=>sameSubject(item.from,from)))throw new TypeError('duplicate source subject mapping');
    mappings.push({from,to});
  }
  const heads=new Map(),fragments=new Set();
  for(const record of Object.values(records)){const slot=memorySlot(record);fragments.add(slot);if(record.status==='current')heads.set(slot,record);}
  if((Object.keys(records).length+bundle.records.length)*bundle.records.length>2000000)throw new RangeError('import work limit exceeded; use smaller batches');
  const incomingIds=new Set(),destinations=new Set(),entries=[],rows=[],counts={add:0,same:0,update:0,conflict:0};
  for(const raw of bundle.records){
    assertMemoryFields(raw,ENTRY_FIELDS,'portable memory');
    for(const name of ['id','subject','kind','key','value','source','observedAt','validFrom','expiresAt'])if(!Object.hasOwn(raw,name))throw new TypeError('incomplete portable memory');
    if(!validTime(raw.expiresAt) && raw.expiresAt!==null)throw new TypeError('invalid portable expiry');
    if(raw.expiresAt!==null && (raw.expiresAt<raw.validFrom || raw.expiresAt<raw.observedAt))throw new TypeError('invalid portable chronology');
    // Validate all fields before looking at application data; expiry is classified separately below.
    const normalized=prepareMemoryWrite({}, {...raw,expiresAt:null},now,config,()=>{throw new Error('portable id required');}).record;
    const incoming=portable({...normalized,expiresAt:raw.expiresAt});
    if(incomingIds.has(incoming.id))throw new TypeError('duplicate portable record id');
    incomingIds.add(incoming.id);
    const mapping=mappings.find(item=>sameSubject(item.from,incoming.subject));
    if(!mapping)throw new TypeError('every source subject requires an explicit mapping');
    const target=mapping.to,slot=memorySlot({...incoming,subject:target});
    const current=heads.get(slot);
    const id='transfer-'+hash([incoming,target]);
    const input={...incoming,id,subject:target,expectedRevision:current?.revision??0,
      ...(current?{replaceId:current.id}:{})};
    const content=record=>JSON.stringify([record.value,record.source,record.evidenceId??null,record.observedAt,record.validFrom,record.expiresAt]);
    let action='add',reason;
    if(destinations.has(slot)){action='conflict';reason='mapped-slot-collision';}
    else if(incoming.expiresAt!==null && incoming.expiresAt<=now){action='conflict';reason='expired-incoming';}
    else if(incoming.validFrom>now){action='conflict';reason='scheduled-incoming';}
    else if(current && current.validFrom>now){action='conflict';reason='scheduled-target';}
    else if(current && content(current)===content(incoming)){action='same';}
    else if(Object.hasOwn(records,id)){action='conflict';reason='previously-imported-version-changed';}
    else if(current && incoming.validFrom<current.validFrom){action='conflict';reason='older-effective-version';}
    else if(current){action='update';}
    else if(fragments.has(slot)){action='conflict';reason='incomplete-target-history';}
    destinations.add(slot);counts[action]++;
    entries.push({action,input});
    rows.push({incoming:copyMemoryValue(incoming.value),incomingId:incoming.id,target,kind:incoming.kind,key:incoming.key,action,
      ...(reason?{reason}:{}),...(current?{currentId:current.id,currentRevision:current.revision,current:copyMemoryValue(current.value)}:{})});
  }
  checkSize(bundle);
  return {entries,rows,counts};
}
export function stageMemoryImport(records,plan,options={},now,config,createId){
  assertMemoryFields(options,new Set(['allowUpdates']),'memory import apply options');
  const {allowUpdates=false}=options;
  if(typeof allowUpdates!=='boolean')throw new TypeError('allowUpdates must be boolean');
  if(plan.counts.conflict || (plan.counts.update && !allowUpdates))throw Object.assign(new Error('import has unresolved conflicts or updates need allowUpdates'),{code:'ERR_MEMORY_CONFLICT'});
  const next={...records},written=[],removed=new Set();
  for(const entry of plan.entries){
    if(entry.action==='same')continue;
    if(entry.input.expiresAt!==null && entry.input.expiresAt<=now)throw Object.assign(new Error('incoming memory expired after preview'),{code:'ERR_MEMORY_CONFLICT'});
    const change=prepareMemoryWrite(next,entry.input,now,config,createId);
    if(change.previous)next[change.previous.id]=change.previous;
    for(const id of change.removeIds??[]){delete next[id];removed.add(id);}
    next[change.record.id]=change.record;written.push(change.record);
  }
  return {next,written,removed};
}
