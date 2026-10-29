import {createHash} from 'node:crypto';
import {createTurnRunner} from '../../src/turns.js';
import {acknowledge} from '../../src/acknowledge.js';
import {normalizeMemoryContext} from '../../src/retrieval.js';

/** Model-agnostic bridge. The host supplies the actual model call and owns its credentials. */
export function createMemoryBridge(pm,options={}){
  const {timeoutMs=30000,...contextOptions}=options;
  const settings=normalizeMemoryContext(contextOptions,pm.config.maxChars),selection=settings.search;
  const base={subjects:selection.subjects,kinds:selection.kinds,keys:selection.keys,sources:selection.sources,
    observedAfter:selection.observedAfter,observedBefore:selection.observedBefore,
    maxCandidates:selection.maxCandidates,minScore:selection.minScore,now:selection.now,
    relevance:[...selection.relevance].map(([id,score])=>({id,score})),
    budget:settings.budget,maxRecords:settings.maxRecords,
    tokenBudget:settings.tokenBudget,countTokens:settings.countTokens};
  const run=createTurnRunner({timeoutMs});
  return {
    invoke(input,call){
      if(typeof call!=='function')return Promise.reject(new TypeError('call required'));
      if(!input || typeof input.text!=='string' || input.text.length>100000)return Promise.reject(new TypeError('text must be a string of at most 100000 characters'));
      const turnId=input.turnId,text=input.text,query=input.query===undefined?(contextOptions.query===undefined?text:selection.query):input.query;
      if(typeof query!=='string' || query.length>1024)return Promise.reject(new TypeError('query must be a string of at most 1024 characters'));
      // Same text with a different retrieval query is a different request.
      const identity=createHash('sha256').update(JSON.stringify([text,query])).digest('hex');
      return run(turnId,identity,async state=>{
        const check=state.checkActive;check();
        const context=state.context || pm.buildMemoryContext({...base,query});
        try{
          if(!state.hasResponse){
            await pm.persist();check();
            const controller=new AbortController(),abort=()=>controller.abort(state.signal.reason);
            state.signal.addEventListener('abort',abort,{once:true});
            try{
              const response=await call({text,memory:context.text},{signal:controller.signal});check();
              if(response && (typeof response[Symbol.asyncIterator]==='function' || typeof response.getReader==='function'))
                throw new TypeError('consume the model stream to completion inside the call callback');
              state.response=response;state.hasResponse=true;state.context=context;
            }catch(error){controller.abort(error);throw error;}
            finally{state.signal.removeEventListener('abort',abort);}
          }
          check();const usage=acknowledge(pm,state.context,turnId);
          return {response:state.response,context:state.context,usage};
        }finally{await pm.persist();}
      });
    },
  };
}
