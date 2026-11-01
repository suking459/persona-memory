#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {openAgentMemory} from './store.js';
import {VERSION} from '../../src/version.js';
import {readBinding} from './binding.js';
import {createAgentSession} from './session.js';
import {serveStdio} from './stdio.js';
export function createAgentRpc(session){
  let initialized=false;
  return async message=>{
    const id=message?.id;
    const error=(code,text)=>({jsonrpc:'2.0',id:id??null,error:{code,message:text}});
    if(!message||Array.isArray(message)||message.jsonrpc!=='2.0'||typeof message.method!=='string'||
      (id!==undefined&&typeof id!=='string'&&!(typeof id==='number'&&Number.isSafeInteger(id))))return error(-32600,'Invalid Request');
    if(id===undefined)return null;
    const reply=result=>({jsonrpc:'2.0',id,result});
    if(message.method==='initialize'){
      initialized=true;
      const versions=['2025-11-25','2025-06-18','2025-03-26','2024-11-05'];
      return reply({protocolVersion:versions.includes(message.params?.protocolVersion)?message.params.protocolVersion:versions[0],
        capabilities:{tools:{},prompts:{}},serverInfo:{name:'persona-memory-agent',version:VERSION},instructions:session.instructions});
    }
    if(message.method==='ping')return reply({});
    if(!initialized)return error(-32000,'Initialize first');
    if(message.method==='tools/list')return reply({tools:session.tools});
    if(message.method==='prompts/list')return reply({prompts:[{name:'memory_workflow',description:'Scoped recall, evidence-backed proposals, owner review, correction and recovery.'}]});
    if(message.method==='prompts/get'){
      if(message.params?.name!=='memory_workflow')return error(-32602,'Unknown prompt');
      return reply({description:'Memory workflow',messages:[{role:'user',content:{type:'text',text:session.instructions}}]});
    }
    if(message.method!=='tools/call')return error(-32601,'Method not found');
    try{
      const result=await session.call(message.params?.name,message.params?.arguments);
      const text=JSON.stringify(result);
      if(Buffer.byteLength(text)>400000)throw new RangeError('result exceeds output budget; narrow the query');
      return reply({content:[{type:'text',text}],...(result&&typeof result==='object'&&!Array.isArray(result)?{structuredContent:result}:{})});
    }catch(error){
      return reply({isError:true,content:[{type:'text',text:JSON.stringify({code:error.code||'ERR_AGENT_INPUT',message:String(error.message).slice(0,1000)})}]});
    }
  };
}
export async function runAgentServer(file){
  const binding=readBinding(file);
  const pm=openAgentMemory(binding);
  const session=createAgentSession(pm,binding);
  await serveStdio(createAgentRpc(session));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const args=process.argv.slice(2);
  if(args.length!==2||args[0]!=='--binding'){process.stderr.write('Usage: persona-memory-agent --binding ABSOLUTE_BINDING_JSON\n');process.exitCode=2;}
  else await runAgentServer(args[1]).catch(error=>{process.stderr.write(String(error.message)+'\n');process.exitCode=1;});
}
