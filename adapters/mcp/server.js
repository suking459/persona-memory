#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../../src/index.js';
import {VERSION} from '../../src/version.js';
const tool=(name,description,properties,required=[])=>({name,description,inputSchema:{type:'object',properties,required}});
const string={type:'string'};
export const TOOLS=[
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
      case 'memory_context': result=pm.buildContext(a);break;
      case 'memory_confirm': result=pm.confirmContext(a.contextId,{turnId:a.turnId});break;
      case 'memory_profile': result=pm.getProfile(a.chatId,a.userId);break;
      case 'memory_record': result=pm.ingest(a);break;
      default:return error(-32602,'Unknown tool');
    }
    pm.flush();return reply({content:[{type:'text',text:JSON.stringify(result)}]});
  }catch(e){return reply({isError:true,content:[{type:'text',text:e.message}]});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const pm=new PersonaMemory({storage:process.env.PM_STORAGE||null,persona:process.env.PM_PERSONA||'assistant',scope:process.env.PM_SCOPE||''});
  let buffer='',queue=Promise.resolve();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data',chunk=>{
    buffer+=chunk;
    if(Buffer.byteLength(buffer)>1048576){process.stderr.write('Input exceeds 1 MiB\n');process.exitCode=1;process.stdin.destroy();return;}
    let end;
    while((end=buffer.indexOf('\n'))>=0){
      const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1);if(!line)continue;
      queue=queue.then(async()=>{
        let result;
        try{result=await handleMcp(JSON.parse(line),pm);}catch{result={jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}};}
        if(result)process.stdout.write(JSON.stringify(result)+'\n');
      });
    }
  });
  process.stdin.on('end',()=>{queue.then(()=>pm.flush()).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});});
}
