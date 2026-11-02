// Exact structural hints only; values and source labels never establish truth automatically.
import {assertMemoryFields as fields,memoryIdentifier,memorySlot,dependencyStatus,memoryFingerprint} from './records.js';
export function candidateQuality(records,candidates,id,options={},now){
  fields(options,new Set(['limit']),'candidate quality options');
  const limit=options.limit===undefined?16:options.limit;if(!Number.isSafeInteger(limit)||limit<1||limit>32)throw new RangeError('quality limit must be 1..32');
  id=memoryIdentifier(id);const candidate=Object.hasOwn(candidates,id)?candidates[id]:null;
  if(!candidate)throw new TypeError('candidate is unavailable');
  const slot=memorySlot(candidate.memory),value=JSON.stringify(candidate.memory.value),similar=[],competing=[];
  let similarCount=0,competingCount=0;
  for(const item of Object.values(candidates)){
    if(item.id===id||item.status!=='pending'||item.expiresAt<=now||memorySlot(item.memory)!==slot)continue;
    const summary={id:item.id,revision:item.revision,evidenceId:item.memory.evidenceId,source:item.memory.source,assertion:item.memory.assertion??'unspecified'};
    if(JSON.stringify(item.memory.value)===value){similarCount++;if(similar.length<limit)similar.push(summary);}
    else{competingCount++;if(competing.length<limit)competing.push(summary);}
  }
  const head=Object.values(records).find(record=>record.status==='current'&&memorySlot(record)===slot);
  const warnings=['evidence-reference-unverified'];
  if(candidate.status!=='pending')warnings.push('already-reviewed');
  if(candidate.expiresAt<=now)warnings.push('expired');
  if(candidate.memory.assertion==='inferred')warnings.push('inference-needs-review');
  if(candidate.memory.assertion==='external')warnings.push('external-report-not-verified');
  if(similarCount)warnings.push('same-value-proposals');
  if(competingCount)warnings.push('competing-values');
  const current=head?{id:head.id,revision:head.revision,source:head.source,assertion:head.assertion??'unspecified',
    relation:JSON.stringify(head.value)===value?'same-value':'different-value',usable:dependencyStatus(head,records,now).usable}:null;
  if(current?.relation==='same-value')warnings.push('same-current-value');
  const sourceChanges=(candidate.memory.derivedFrom??[]).filter(ref=>{
    const source=Object.hasOwn(records,ref.id)?records[ref.id]:null;
    return !source||!dependencyStatus(source,records,now).usable||source.revision!==ref.revision||memoryFingerprint(source)!==ref.fingerprint;
  }).map(ref=>ref.id);
  if(sourceChanges.length)warnings.push('sources-unavailable');
  return {assertion:candidate.memory.assertion??'unspecified',evidenceVerified:false,warnings,current,
    similar,competing,similarCount,competingCount,sourceChanges,truncated:similarCount>similar.length||competingCount>competing.length,
    limits:'Exact same-field value comparison only; not semantic contradiction detection, source authentication or approval.'};
}
