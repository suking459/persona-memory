// Read-only owner inspection. Does not run host tools or modify a snapshot.
import {PersonaMemory} from '../../src/index.js';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {assertMemoryFields as fields,memoryIdentifier,sameSubject} from '../../src/records.js';
import {stageCandidateAcceptance} from '../../src/candidates.js';
import {normalizeBinding} from './binding.js';

export function inspectAgentCandidates(raw,request={}){
  const binding=normalizeBinding(raw),query=copySnapshotJSON(request,4096);
  fields(query,new Set(['scope','candidateId','status','limit','after']),'candidate inspection');
  if(typeof query.scope!=='string'||!Object.hasOwn(binding.subjects,query.scope))throw new TypeError('scope is not granted');
  const subject=binding.subjects[query.scope];
  if(query.candidateId!==undefined){
    memoryIdentifier(query.candidateId);
    if(['status','limit','after'].some(key=>query[key]!==undefined))throw new TypeError('candidate detail cannot be combined with list options');
  }else{
    if(query.status!==undefined&&!['pending','accepted','rejected','all'].includes(query.status))throw new TypeError('invalid candidate status');
    if(query.limit!==undefined&&(!Number.isSafeInteger(query.limit)||query.limit<1||query.limit>32))throw new RangeError('inspection limit must be 1..32');
    if(query.after!==undefined)memoryIdentifier(query.after);
  }
  // Always open the operator's current on-disk view, not an Agent's cached state.
  const pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace}),now=Date.now();
  if(query.candidateId!==undefined){
    const candidate=pm.getCandidate(query.candidateId,{includeExpired:true});
    if(!candidate||!sameSubject(candidate.memory.subject,subject))throw new TypeError('candidate is unavailable in this scope');
    const current=pm.listMemories({subject,kind:candidate.memory.kind,key:candidate.memory.key,includeInactive:true,limit:1000})
      .find(record=>record.status==='current')??null;
    let acceptance={allowed:false,code:'ERR_CANDIDATE_REVIEWED',message:'Candidate has already been reviewed.'};
    if(candidate.status==='pending'){
      const snapshot=pm.export();
      try{
        // Use the same bounded staging/precondition checks as an actual accept, without committing.
        stageCandidateAcceptance(snapshot.memories,snapshot.candidates,[{id:candidate.id,expectedRevision:candidate.revision}],now,pm.config);
        acceptance={allowed:true};
      }catch(error){acceptance={allowed:false,code:error.code??'ERR_CANDIDATE_INPUT',message:String(error.message).slice(0,1000)};}
    }
    return {mode:'candidate',scope:query.scope,checkedAt:now,candidate,current,effect:current?'replace':'create',acceptance,quality:pm.inspectCandidate(candidate.id),evidenceVerified:false};
  }
  const status=query.status??'pending',limit=query.limit??20;
  const candidates=pm.listCandidates({subject,...(status==='all'?{}:{status}),includeExpired:true,limit:1000});
  let start=0;
  if(query.after!==undefined){
    const index=candidates.findIndex(candidate=>candidate.id===query.after);
    if(index<0)throw new TypeError('cursor is unavailable; restart candidate listing');
    start=index+1;
  }
  const page=candidates.slice(start,start+limit);
  return {mode:'list',scope:query.scope,checkedAt:now,status,candidates:page.map(candidate=>({
    id:candidate.id,revision:candidate.revision,status:candidate.status,kind:candidate.memory.kind,key:candidate.memory.key,
    evidenceId:candidate.memory.evidenceId,source:candidate.memory.source,assertion:candidate.memory.assertion??'unspecified',createdAt:candidate.createdAt,expiresAt:candidate.expiresAt,
    expired:now>=candidate.expiresAt,
  })),nextAfter:start+page.length<candidates.length?page.at(-1).id:null,evidenceVerified:false};
}
