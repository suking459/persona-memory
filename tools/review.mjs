#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {assertMemoryFields} from '../src/records.js';
export function review(pm,request){
  assertMemoryFields(request,new Set(['operation','id','subject','options']),'review request');
  const options=request.options===undefined?{}:request.options;
  switch(request.operation){
    case 'list':return {candidates:pm.listCandidates({...options,subject:request.subject})};
    case 'get':return {candidate:pm.getCandidate(request.id,options)};
    case 'accept':return pm.acceptCandidate(request.id,options);
    case 'reject':return {candidate:pm.rejectCandidate(request.id,options)};
    case 'revise':return {candidate:pm.reviseCandidate(request.id,options)};
    case 'forget':return pm.forgetCandidate(request.id);
    case 'experiences':return {experiences:pm.listExperiences({...options,subject:request.subject})};
    default:throw new TypeError('operation must be list/get/accept/reject/revise/forget/experiences');
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(!process.env.PM_STORAGE)throw new TypeError('PM_STORAGE is required; review uses an explicit project data directory');
    let size=0;const chunks=[];
    for await(const chunk of process.stdin){size+=chunk.length;if(size>1048576)throw new RangeError('review request exceeds 1 MiB');chunks.push(chunk);}
    const request=JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/,''));
    const pm=new PersonaMemory({storage:process.env.PM_STORAGE,persona:process.env.PM_PERSONA||'default',scope:process.env.PM_SCOPE||''});
    const result=review(pm,request);pm.flush();process.stdout.write(JSON.stringify(result)+'\n');
  }catch(error){process.stderr.write(JSON.stringify({error:error.message,...(error.code?{code:error.code}:{})})+'\n');process.exitCode=1;}
}
