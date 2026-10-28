import {acknowledge} from '../../src/acknowledge.js';
import {createTurnRunner} from '../../src/turns.js';
/** Explicit bridge for the tested LlamaIndex TS Memory.add/get interface. */
export function createLlamaIndexBridge(pm,{memory,chatId,userId,budget=700,timeoutMs=30000}={}) {
  if(!memory || typeof memory.add!=='function' || typeof memory.get!=='function') throw new TypeError('LlamaIndex Memory.add/get required');
  if(!chatId || !userId) throw new TypeError('chatId and userId required');
  const run=createTurnRunner({timeoutMs});
  return {
    invoke({text,turnId,call}={}) {
      if(typeof call!=='function')return Promise.reject(new TypeError('call required'));
      return run(turnId,text,async state=>{
      const check=state.checkActive,signal=state.signal;check();
        if(!state.inputAdded){
          const ingested=pm.ingest({chatId,userId,text,eventId:turnId,directedToBot:true});
          if(ingested.ignored)throw new RangeError('out-of-order turn');
          pm.flush();await memory.add({role:'user',content:text});state.inputAdded=true;check();
        }
        const context=state.context || pm.buildContext({chatId,userIds:[userId],budget});
        try{
          if(!state.hasResponse){
            const history=await memory.get({type:'llamaindex'});
            const messages=context.text?[{role:'system',content:context.text},...history]:history;
            const response=await call(messages,{signal});check();state.response=response;state.hasResponse=true;state.context=context;
          }
          check();const usage=acknowledge(pm,state.context,turnId);
          const output=typeof state.response==='string'?state.response:state.response?.message?.content;
          if(!state.outputAdded && typeof output==='string'){await memory.add({role:'assistant',content:output});state.outputAdded=true;check();}
          return {response:state.response,context:state.context,usage};
        }finally{pm.flush();}
      });
    },
    context(){return pm.buildContext({chatId,userIds:[userId],budget});},
  };
}
