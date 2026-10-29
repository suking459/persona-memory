#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../../src/index.js';
import {VERSION} from '../../src/version.js';
const tool=(name,description,properties,required=[])=>({name,description,inputSchema:{type:'object',properties,required}});
const string={type:'string'};
const subject={type:'object',properties:{type:{type:'string',enum:['user','project','task']},id:string,chatId:string},required:['type','id'],additionalProperties:false};
const selection={subject,subjects:{type:'array',items:subject,minItems:1,maxItems:32},query:string,
  kinds:{type:'array',items:{type:'string',enum:['preference','fact','constraint','decision','episode','state']},maxItems:6},
  keys:{type:'array',items:string,maxItems:32},sources:{type:'array',items:{type:'string',enum:['manual','user','host','rule','model','import']},maxItems:6},
  observedAfter:{type:'number',minimum:0},observedBefore:{type:'number',minimum:0},
  maxCandidates:{type:'integer',minimum:0,maximum:10000},minScore:{type:'number',minimum:0,maximum:1024}};
const selectedTool=(name,description,extra)=>{
  const result=tool(name,description,{...selection,...extra});
  result.inputSchema.oneOf=[{required:['subject'],not:{required:['subjects']}},{required:['subjects'],not:{required:['subject']}}];
  return result;
};
export const TOOLS=[
  tool('memory_experiences','List retained host-reported task experiences; verified means asserted by the host, not a universal guarantee.',{subject,outcome:{type:'string',enum:['success','failure','mixed','unknown']},verifiedOnly:{type:'boolean'},limit:{type:'integer',minimum:0,maximum:1000}},['subject']),
  tool('memory_at','Read a retained effective value at a time, using facts known by knownAt; history may have been pruned.',{subject,kind:{type:'string',enum:['preference','fact','constraint','decision','episode','state']},key:string,at:{type:'number',minimum:0},knownAt:{type:'number',minimum:0}},['subject','kind','key','at']),
  selectedTool('memory_search_records','Search current typed memories within explicit subjects; empty results mean no literal match, not proof that no fact exists.',{limit:{type:'integer',minimum:0,maximum:1000}}),
  selectedTool('memory_records_context','Preview complete typed memory records under a character budget; does not confirm model use.',{budget:{type:'integer',minimum:0,maximum:100000},maxRecords:{type:'integer',minimum:0,maximum:64}}),
  tool('memory_get_record','Read one typed record by its ID; host controls authorization.',{id:string,includeInactive:{type:'boolean'}},['id']),
  tool('memory_confirm_contexts','Atomically confirm contexts used together in one successful model call.',{contextIds:{type:'array',items:string,minItems:1,maxItems:16},turnId:string},['contextIds','turnId']),
  tool('memory_context','Preview relationship context; does not count as model use.',{chatId:string,userIds:{type:'array',items:string},budget:{type:'integer',minimum:0}},['chatId','userIds']),
  tool('memory_confirm','Confirm a previously returned context was actually used, once per turn.',{contextId:string,turnId:string},['contextId','turnId']),
  tool('memory_profile','Read a person profile.',{chatId:string,userId:string},['chatId','userId']),
  tool('memory_record','Record one user message; host-driven recording is more reliable than optional model calls.',{chatId:string,userId:string,text:string,eventId:string,mentionsSelf:{type:'boolean'},replyToSelf:{type:'boolean'},directedToBot:{type:'boolean'}},['chatId','userId','text']),
];
export async function handleMcp(msg,pm){
  if(!msg || typeof msg!=='object' || msg.jsonrpc!=='2.0') return {jsonrpc:'2.0',id:msg?.id??null,error:{code:-32600,message:'Invalid Request'}};
  const {id,method,params}=msg;
  if(id===undefined) return null;
  const reply=result=>({jsonrpc:'2.0',id,result});
  const error=(code,message)=>({jsonrpc:'2.0',id,error:{code,message}});
  if(method==='initialize'){
    const versions=['2025-06-18','2025-03-26','2024-11-05'];
    return reply({protocolVersion:versions.includes(params?.protocolVersion)?params.protocolVersion:versions[0],capabilities:{tools:{}},serverInfo:{name:'persona-memory',version:VERSION}});
  }
  if(method==='ping')return reply({});
  if(method==='tools/list')return reply({tools:TOOLS});
  if(method!=='tools/call')return error(-32601,'Method not found');
  const a=params?.arguments||{};
  try{
    let result;
    switch(params?.name){
      case 'memory_experiences':result={experiences:pm.listExperiences(a)};break;
      case 'memory_at': result={memory:pm.getMemoryAt(a)};break;
      case 'memory_search_records': result=pm.searchMemories(a);break;
      case 'memory_records_context': result=pm.buildMemoryContext(a);break;
      case 'memory_get_record': result={memory:pm.getMemory(a.id,{includeInactive:a.includeInactive})};break;
      case 'memory_confirm_contexts': result=pm.confirmContexts(a.contextIds,{turnId:a.turnId});break;
      case 'memory_context': result=pm.buildContext(a);break;
      case 'memory_confirm': result=pm.confirmContext(a.contextId,{turnId:a.turnId});break;
      case 'memory_profile': result=pm.getProfile(a.chatId,a.userId);break;
      case 'memory_record': result=pm.ingest(a);break;
      default:return error(-32602,'Unknown tool');
    }
    await pm.persist();return reply({content:[{type:'text',text:JSON.stringify(result)}]});
  }catch(e){return reply({isError:true,content:[{type:'text',text:e.message}]});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const pm=new PersonaMemory({storage:process.env.PM_STORAGE||null,persona:process.env.PM_PERSONA||'assistant',scope:process.env.PM_SCOPE||''});
  const decoder=new TextDecoder('utf-8',{fatal:true});let buffer='';
  const write=async value=>{
    const {once}=await import('node:events');
    if(!process.stdout.write(JSON.stringify(value)+'\n'))await once(process.stdout,'drain');
  };
  const line=async text=>{
    if(!text.trim())return;
    let result;
    try{result=await handleMcp(JSON.parse(text),pm);}
    catch{result={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
    if(result)await write(result);
  };
  try{
    for await(const chunk of process.stdin){
      buffer+=decoder.decode(chunk,{stream:true});
      if(Buffer.byteLength(buffer)>1048576)throw new RangeError('Input exceeds 1 MiB');
      let end;
      while((end=buffer.indexOf('\n'))>=0){const current=buffer.slice(0,end);buffer=buffer.slice(end+1);await line(current);}
    }
    buffer+=decoder.decode();
    if(Buffer.byteLength(buffer)>1048576)throw new RangeError('Input exceeds 1 MiB');
    if(buffer.trim())await line(buffer);
    await pm.persist();
  }catch(error){
    if(error instanceof TypeError&&/encoded data|encoding/i.test(error.message)){
      await write({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid UTF-8'}});
    }else process.stderr.write(error.message+'\n');
    process.exitCode=1;
  }
}
