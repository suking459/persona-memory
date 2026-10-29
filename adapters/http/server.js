#!/usr/bin/env node
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../../src/index.js';
import {VERSION} from '../../src/version.js';
import {parse} from '../generic/index.js';
export function createMemoryServer({pm=new PersonaMemory(),token='',allowAdmin=false}={}) {
  const json=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));};
  return http.createServer(async(req,res)=>{
    try {
      if(token && req.headers.authorization!=='Bearer '+token) return json(res,401,{ok:false,error:'unauthorized'});
      let authority;
      try{authority=new URL('http://'+req.headers.host);}catch{return json(res,403,{ok:false,error:'invalid local host'});}
      const localPort=String(req.socket.localPort);
      if(!['127.0.0.1','localhost','[::1]'].includes(authority.hostname)||(authority.port||'80')!==localPort||
        authority.username||authority.password||authority.pathname!=='/'||authority.search||authority.hash)
        return json(res,403,{ok:false,error:'local host required'});
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET' && url.pathname==='/api/health') return json(res,200,{ok:true,version:VERSION});
      if(req.method==='GET' && url.pathname==='/api/stats') return json(res,200,{ok:true,stats:pm.diagnostics()});
      if(req.method==='GET' && url.pathname==='/api/profile') return json(res,200,{ok:true,profile:pm.getProfile(url.searchParams.get('chatId'),url.searchParams.get('userId'))});
      if(req.method!=='POST') return json(res,404,{ok:false,error:'not found'});
      if(!req.headers['content-type']?.startsWith('application/json')) return json(res,415,{ok:false,error:'application/json required'});
      if(req.headers.origin) {
        const origin=new URL(req.headers.origin),localPort=String(req.socket.localPort);
        if(origin.protocol!=='http:' || !['127.0.0.1','localhost','[::1]'].includes(origin.hostname) || (origin.port||'80')!==localPort) return json(res,403,{ok:false,error:'cross-origin request denied'});
      }
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>1048576)return json(res,413,{ok:false,error:'body too large'});chunks.push(chunk);}
      const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))||'{}');
      let result;
      switch(url.pathname){
        case '/api/ingest': {const msg=parse(body);if(!msg)throw new TypeError('chatId/userId required');result=pm.ingest(msg);break;}
        case '/api/context': {const context=pm.buildContext(body);result={block:context.text,context};break;}
        case '/api/confirm': result=pm.confirmContext(body.contextId,{turnId:body.turnId});break;
        case '/api/confirm-contexts': result=pm.confirmContexts(body.contextIds,{turnId:body.turnId});break;
        case '/api/memory/search': result=pm.searchMemories(body);break;
        case '/api/memory/context': {const context=pm.buildMemoryContext(body);result={block:context.text,context};break;}
        case '/api/candidates/list': result={candidates:pm.listCandidates(body)};break;
        case '/api/candidates/get': result={candidate:pm.getCandidate(body.id,body.options)};break;
        case '/api/experiences/list': result={experiences:pm.listExperiences(body)};break;
        case '/api/candidates/propose':
        case '/api/candidates/propose-batch':
        case '/api/candidates/accept':
        case '/api/candidates/accept-batch':
        case '/api/candidates/reject':
        case '/api/candidates/revise':
        case '/api/candidates/forget':
        case '/api/experiences/record': {
          if(!allowAdmin)return json(res,403,{ok:false,error:'administration disabled'});
          switch(url.pathname){
            case '/api/candidates/propose':result={candidate:pm.proposeMemory(body)};break;
            case '/api/candidates/propose-batch':result=pm.proposeMemories(body.inputs,body.options);break;
            case '/api/candidates/accept':result=pm.acceptCandidate(body.id,body.options);break;
            case '/api/candidates/accept-batch':result={results:pm.acceptCandidates(body.requests)};break;
            case '/api/candidates/reject':result={candidate:pm.rejectCandidate(body.id,body.options)};break;
            case '/api/candidates/revise':result={candidate:pm.reviseCandidate(body.id,body.options)};break;
            case '/api/candidates/forget':result=pm.forgetCandidate(body.id);break;
            case '/api/experiences/record':result={experience:pm.recordExperience(body)};break;
          }break;
        }
        case '/api/memory/at': result={memory:pm.getMemoryAt(body)};break;
        case '/api/memory/get': result={memory:pm.getMemory(body.id,{includeInactive:body.includeInactive,now:body.now})};break;
        case '/api/memory/export':
        case '/api/memory/import-preview':
        case '/api/memory/import-apply':
          if(!allowAdmin)return json(res,403,{ok:false,error:'administration disabled'});
          result=url.pathname==='/api/memory/export'?{bundle:pm.exportMemories(body)}:
            url.pathname==='/api/memory/import-preview'?pm.previewMemoryImport(body.bundle,body.options):pm.applyMemoryImport(body.planId,body.options);break;
        case '/api/memory/put':
        case '/api/memory/forget':
        case '/api/memory/delete-subject':
          if(!allowAdmin)return json(res,403,{ok:false,error:'administration disabled'});
          result=url.pathname==='/api/memory/put'?{memory:pm.putMemory(body)}:
            url.pathname==='/api/memory/forget'?pm.forgetMemory(body.id):pm.deleteSubject(body.subject);break;
        case '/api/maintain': result=pm.maintain();break;
        case '/api/tags':
        case '/api/remove-tag':
        case '/api/delete-user':
          if(!allowAdmin)return json(res,403,{ok:false,error:'administration disabled'});
          result=url.pathname==='/api/tags'?pm.setTag(body):url.pathname==='/api/remove-tag'?{removed:pm.removeTag(body)}:pm.deleteUser(body.userId,{chatId:body.chatId});break;
        default:return json(res,404,{ok:false,error:'not found'});
      }
      await pm.persist();return json(res,200,{ok:true,...result});
    }catch(error){
      const conflict=['ERR_CANDIDATE_CONFLICT','ERR_MEMORY_CONFLICT','ERR_MEMORY_CAPACITY','ERR_STORE_CONFLICT','ERR_STORE_BUSY','ERR_STORE_LOCKED'].includes(error.code);
      const invalid=error instanceof TypeError || error instanceof RangeError || error instanceof SyntaxError;
      json(res,conflict?409:invalid?400:500,{ok:false,error:conflict || invalid?error.message:'memory operation failed; inspect local diagnostics',...(conflict?{code:error.code}:{})});
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const pm=new PersonaMemory({storage:process.env.PM_STORAGE||null,persona:process.env.PM_PERSONA||'assistant',scope:process.env.PM_SCOPE||''});
  const server=createMemoryServer({pm,token:process.env.PM_TOKEN||'',allowAdmin:process.env.PM_ALLOW_ADMIN==='1'});
  server.listen(Number(process.env.PM_PORT)||8791,'127.0.0.1',()=>console.log('persona-memory '+VERSION+' listening on loopback'));
  const timer=setInterval(()=>{try{pm.maintain();}catch(e){console.error(e.message);}},600000);timer.unref();
  const stop=()=>{clearInterval(timer);try{pm.flush();}finally{server.close();}};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
}
