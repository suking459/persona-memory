import {createHash} from 'node:crypto';
import {createTurnRunner} from '../../src/turns.js';
import {normalizeMemorySearch} from '../../src/retrieval.js';
import {assertMemoryFields as fields,memoryIdentifier,sameSubject,normalizeSubject,memoryArray} from '../../src/records.js';
import {normalizeAutoAccept,candidateConflict} from '../../src/candidates.js';
const OUTPUT_FIELDS=new Set(['subject','kind','key','value','reason','confidence','observedAt','validFrom','expiresAt']);
/** The host supplies the extractor and credentials. No background calls or automatic learning by default. */
export function createMemoryLearner(pm,options={}){
  fields(options,new Set(['subject','subjects','kinds','source','maxCandidatesPerCall','timeoutMs','autoAccept']),'memory learner options');
  const selection={};for(const key of ['subject','subjects','kinds'])if(options[key]!==undefined)selection[key]=options[key];
  const selected=normalizeMemorySearch(selection),source=options.source===undefined?'model':options.source;
  if(!['model','rule'].includes(source))throw new TypeError('extractor source must be model or rule');
  const max=options.maxCandidatesPerCall===undefined?16:options.maxCandidatesPerCall;
  if(!Number.isSafeInteger(max)||max<1||max>32)throw new RangeError('extractor limit must be 1..32');
  const autoAccept=normalizeAutoAccept(options.autoAccept),run=createTurnRunner({timeoutMs:options.timeoutMs===undefined?30000:options.timeoutMs});
  return {
    extract(input,extractor){
      try{
        fields(input,new Set(['eventId','text']),'extraction input');
        if(typeof input.text!=='string'||input.text.length>100000)throw new RangeError('extraction text limit is 100000');
        if(typeof input.eventId!=='string'||input.eventId.length>256)throw new TypeError('bounded eventId required');
        const eventId=memoryIdentifier(input.eventId,'extraction eventId'),text=input.text;
        if(typeof extractor!=='function')throw new TypeError('extractor callback required');
        const identity=createHash('sha256').update(text).digest('hex');
        return run(eventId,identity,async state=>{
          const check=state.checkActive;check();
          if(!state.result){
            const recordEpoch=pm._recordEpoch,learningEpoch=pm._learningEpoch;
            const request={text,eventId,subjects:JSON.parse(JSON.stringify(selected.subjects)),kinds:selected.kinds?[...selected.kinds]:undefined};
            const raw=await extractor(request,{signal:state.signal});check();
            if(recordEpoch!==pm._recordEpoch||learningEpoch!==pm._learningEpoch)throw candidateConflict('memory changed during extraction; use fresh evidence');
            const outputs=memoryArray(raw,'extractor proposals',max);
            const inputs=[];
            for(const output of outputs){
              fields(output,OUTPUT_FIELDS,'extractor proposal');
              const normalizedSubject=normalizeSubject(output.subject);
              if(!selected.subjects.some(subject=>sameSubject(subject,normalizedSubject))||
                (selected.kinds&&!selected.kinds.includes(output.kind)))throw new TypeError('extractor proposal is outside the authorized subjects or kinds');
              const memory={subject:normalizedSubject,kind:output.kind,key:output.key,value:output.value,source,evidenceId:eventId};
              for(const key of ['observedAt','validFrom','expiresAt'])if(output[key]!==undefined)memory[key]=output[key];
              inputs.push({memory,...(output.reason===undefined?{}:{reason:output.reason}),...(output.confidence===undefined?{}:{confidence:output.confidence})});
            }
            const result=inputs.length?pm.proposeMemories(inputs,{autoAccept}):{candidates:[],accepted:[],omitted:[]};
            state.result={candidateIds:result.candidates.map(candidate=>candidate.id),accepted:result.accepted,omitted:result.omitted};
          }
          check();await pm.persist();check();return state.result;
        }).then(result=>{
          const candidates=[],unavailable=[];
          for(const id of result.candidateIds){const candidate=pm.getCandidate(id,{includeExpired:true});if(candidate)candidates.push(candidate);else unavailable.push(id);}
          return {candidates,accepted:[...result.accepted],omitted:result.omitted.map(item=>({...item})),unavailable};
        });
      }catch(error){return Promise.reject(error);}
    },
  };
}
