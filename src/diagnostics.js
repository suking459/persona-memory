// Read-only diagnostics. No maintenance, provider calls, evidence fetches or repairs.
import {PersonaMemory} from './memory.js';
import {normalizeSubject,sameSubject,memoryIdentifier,assertMemoryFields as fields} from './records.js';
import {normalizeMemorySearch} from './retrieval.js';
import {copySnapshotJSON} from './snapshot.js';
export function diagnoseMemory(pm,raw={}){
  if(!(pm instanceof PersonaMemory))throw new TypeError('PersonaMemory required');
  const options=copySnapshotJSON(raw,16384);fields(options,new Set(['subjects','maxRecords']),'doctor options');
  const subjects=options.subjects===undefined?undefined:options.subjects.map(normalizeSubject);
  if(subjects&&(!subjects.length||subjects.length>32))throw new RangeError('doctor requires 1..32 subjects');
  const max=options.maxRecords??256;if(!Number.isSafeInteger(max)||max<1||max>1000)throw new RangeError('doctor record limit must be 1..1000');
  const included=s=>subjects===undefined||subjects.some(subject=>sameSubject(subject,s)),now=pm._now();
  const snapshot=pm.export();pm._hydrate(snapshot);
  const records=Object.values(snapshot.memories).filter(r=>included(r.subject)),candidates=Object.values(snapshot.candidates).filter(c=>included(c.memory.subject));
  const current=records.filter(r=>r.status==='current'),sample=current.slice(0,max),issues=[];let unusable=0;
  const reasons={};
  for(const record of sample){
    const status=pm.memoryStatus(record.id,{now});
    if(!status.usable){unusable++;reasons[status.reason]=(reasons[status.reason]??0)+1;if(issues.length<16)issues.push({id:record.id,reason:status.reason});}
  }
  const pending=candidates.filter(c=>c.status==='pending'),expired=pending.filter(c=>c.expiresAt<=now).length;
  const warnings=[];
  if(pm._dirty)warnings.push('local-unpersisted-changes');
  if(pending.length)warnings.push('pending-owner-review');
  if(expired)warnings.push('expired-pending-candidates');
  if(unusable)warnings.push('unusable-current-records');
  if(current.length>sample.length)warnings.push('record-inspection-limited');
  return {ok:true,readOnly:true,schemaVersion:6,persistent:Boolean(pm._store),dirty:pm._dirty,
    counts:{records:records.length,currentHeads:current.length,candidates:candidates.length,pending:pending.length,expiredPending:expired},
    sourceCheck:{inspected:sample.length,unusable,reasons,samples:issues,truncated:current.length>sample.length},
    warnings,evidenceVerified:false,externalServicesContacted:false,repairsApplied:false,
    limits:'Bounded stored-data consistency checks; not evidence authentication, exhaustive bug detection or a performance benchmark.'};
}
export function explainMemoryRecall(pm,raw){
  if(!(pm instanceof PersonaMemory))throw new TypeError('PersonaMemory required');
  const options=copySnapshotJSON(raw,32768);fields(options,new Set(['subject','query','locale','limit','id']),'recall explanation');
  const subject=normalizeSubject(options.subject);
  if(options.id!==undefined)options.id=memoryIdentifier(options.id);
  const {id,...search}=options;const normalized=normalizeMemorySearch(search);
  const result=pm.searchMemories(search);
  let inspected;
  if(id!==undefined){
    const record=pm.getMemory(id,{includeInactive:true});
    if(!record||!sameSubject(record.subject,subject))inspected={available:false,reason:'unavailable-in-scope'};
    else{
      const validity=pm.memoryStatus(id),match=result.matches.find(m=>m.record.id===id);
      inspected={available:true,id,validity,selected:Boolean(match),reason:match?'selected':!validity.usable?validity.reason:'not-selected-within-search-budgets'};
    }
  }
  return {mode:'local-lexical-diagnostic',semanticConsulted:false,subject,result,...(inspected===undefined?{}:{inspected}),
    explanation:{ranking:'key terms 3, value terms 1; exact key +6, key phrase +2, value phrase +1; recency then ID break ties',
      candidatePolicy:'Approved current records in the explicit subject; inactive, expired, future and stale derived records are filtered first',
      budgets:{candidateLimit:1000,textCharacters:1000000,resultLimit:normalized.limit},
      scoreIsConfidence:false,evidenceVerified:false,omissionCounts:result.omitted},
    limits:'Explains the local lexical path only. Optional semantic recall may choose differently; absence is not proof of a false fact.'};
}
