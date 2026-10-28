import {acknowledge} from '../../src/acknowledge.js';
import {createTurnRunner} from '../../src/turns.js';
/** Legacy BaseMemory shape; modern Runnable sequences require explicit composition. */
export function createLangChainMemory(pm,{chatId,senders=[],budget=700,maxPeople=4,memoryKey='persona_memory',getText=(v)=>String(v?.input??v?.question??v?.human_input??'')}={}) {
  if(!chatId)throw new TypeError('chatId required');
  const ids=v=>senders.length?senders:[v?.userId??v?.sender??v?.user_id].filter(Boolean).map(String);
  return {memoryKeys:[memoryKey],
    async loadMemoryVariables(values={}){return {[memoryKey]:pm.buildBlock({chatId,userIds:ids(values),budget,maxPeople})};},
    async saveContext(input={}){
      const participants=ids(input),sender=input.userId??input.sender??input.user_id??(participants.length===1?participants[0]:null);
      if(!sender)throw new TypeError('one actual sender is required; do not attribute one message to every participant');
      pm.ingest({chatId,userId:String(sender),text:getText(input),directedToBot:true,eventId:input.turnId});pm.flush();
    },
  };
}
export function createLangChainBridge(pm,{chatId,userId,budget=700,memoryKey='persona_memory',timeoutMs=30000}={}) {
  if(!chatId || !userId)throw new TypeError('chatId and userId required');
  const run=createTurnRunner({timeoutMs});
  return {invoke(input,call){
    const {text=input.input??input.question??'',turnId}=input;
    if(typeof call!=='function')return Promise.reject(new TypeError('call required'));
    return run(turnId,text,async state=>{
      const check=state.checkActive,signal=state.signal;check();
      const ingested=pm.ingest({chatId,userId,text,eventId:turnId,directedToBot:true});
      if(ingested.ignored)throw new RangeError('out-of-order turn');
      const context=state.context || pm.buildContext({chatId,userIds:[userId],budget});
      try{
        if(!state.hasResponse){pm.flush();const response=await call({...input,[memoryKey]:context.text},{signal});check();state.response=response;state.hasResponse=true;state.context=context;}
        check();const usage=acknowledge(pm,state.context,turnId);
        return {response:state.response,context:state.context,usage};
      }finally{pm.flush();}
    });
  }};
}
export function createSimpleAdapter(pm,{chatId}={}) {
  if(!chatId)throw new TypeError('chatId required');
  return {context:(userIds,opts={})=>pm.buildBlock({chatId,userIds,...opts}),record:(userId,text,extra={})=>pm.ingest({chatId,userId,text,...extra})};
}
export default {createLangChainMemory,createSimpleAdapter,createLangChainBridge};
