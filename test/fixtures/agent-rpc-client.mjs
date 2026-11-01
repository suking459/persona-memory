import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {testTimeout} from '../../tools/test-limits.mjs';
export async function agentClient(t,file,{env}={}){
  const root=fileURLToPath(new URL('../../',import.meta.url));
  const child=spawn(process.execPath,['adapters/agent/server.js','--binding',file],{cwd:root,env:env??process.env,stdio:['pipe','pipe','pipe'],windowsHide:true});
  let next=0,buffer='',stderr='';const pending=new Map();
  child.stdout.setEncoding('utf8');child.stderr.on('data',data=>{if(stderr.length<16384)stderr+=data;});
  const fail=error=>{for(const item of pending.values())item.reject(error);pending.clear();};
  child.stdout.on('data',text=>{
    buffer+=text;if(Buffer.byteLength(buffer)>1048576){fail(Error('test client response budget exceeded'));child.kill();return;}
    let end;while((end=buffer.indexOf('\n'))>=0){let response;try{response=JSON.parse(buffer.slice(0,end));}catch(error){fail(error);child.kill();return;}buffer=buffer.slice(end+1);pending.get(response.id)?.resolve(response);pending.delete(response.id);}
  });
  child.on('error',fail);child.on('exit',code=>fail(Error('test server exit '+code+': '+stderr)));
  t.after(()=>{child.stdin.destroy();if(child.exitCode===null)child.kill();});
  const request=(method,params)=>new Promise((resolve,reject)=>{
    const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('test MCP deadline'));child.kill();},testTimeout(10000));
    pending.set(id,{resolve:response=>{clearTimeout(timer);resolve(response);},reject:error=>{clearTimeout(timer);reject(error);}});
    child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n');
  });
  await request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'isolated-test',version:'1'}});
  return {request,async call(name,args){const response=await request('tools/call',{name,arguments:args});if(response.result.isError)throw Error(JSON.stringify(response.result));return response.result.structuredContent;},
    async close(){const exited=once(child,'exit');child.stdin.end();await exited;assertExit();}};
  function assertExit(){if(child.exitCode!==0)throw Error('test server failed: '+stderr);}
}
