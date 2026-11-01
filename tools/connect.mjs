#!/usr/bin/env node
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {HOST_PROFILES} from '../adapters/agent/profiles.js';
import {prepareAgentBundle} from '../adapters/agent/bundle.js';
import {readBinding} from '../adapters/agent/binding.js';
import {inspectAgentCandidates} from '../adapters/agent/review.js';
import {createAgentSession} from '../adapters/agent/session.js';
import {applyAgentBundle,undoAgentBundle} from '../adapters/agent/install.js';
export async function connectCommand(args){
  const [action,...rest]=args,options={};
  for(let i=0;i<rest.length;i+=2){
    if(!/^--[a-z-]+$/.test(rest[i])||rest[i+1]===undefined||Object.hasOwn(options,rest[i].slice(2)))throw new TypeError('expected unique --name value options');
    options[rest[i].slice(2)]=rest[i+1];
  }
  const allowed={list:[],prepare:['host','out','project','user','access','storage','locale'],apply:['bundle','target'],undo:['bundle'],inspect:['binding','scope','candidate','status','limit','after'],review:['binding','scope','candidate','revision','decision','reason']};
  if(!Object.hasOwn(allowed,action)||Object.keys(options).some(k=>!allowed[action].includes(k)))throw new TypeError('usage: persona-memory-connect list | prepare | apply | undo | inspect | review (see docs/agent-integration.md)');
  if(action==='list')return HOST_PROFILES;
  if(action==='prepare')return prepareAgentBundle({host:options.host,out:options.out===undefined?undefined:path.resolve(options.out),project:options.project===undefined?undefined:path.resolve(options.project),
    userId:options.user,access:options.access,locale:options.locale,...(options.storage===undefined?{}:{storage:path.resolve(options.storage)})});
  if(action==='apply'){
    if(!options.bundle||!options.target)throw new TypeError('--bundle and --target required');
    return applyAgentBundle({bundle:path.resolve(options.bundle),target:path.resolve(options.target)});
  }
  if(action==='undo'){
    if(!options.bundle)throw new TypeError('--bundle required');
    return undoAgentBundle({bundle:path.resolve(options.bundle)});
  }
  if(!options.binding)throw new TypeError('--binding required');
  if(!options.scope)throw new TypeError('--scope required');
  const binding=readBinding(path.resolve(options.binding));
  if(action==='inspect')return inspectAgentCandidates(binding,{scope:options.scope,
    ...(options.candidate===undefined?{}:{candidateId:options.candidate}),
    ...(options.status===undefined?{}:{status:options.status}),
    ...(options.limit===undefined?{}:{limit:Number(options.limit)}),
    ...(options.after===undefined?{}:{after:options.after})});
  const pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  // This separate operator command explicitly grants review; capture MCP cannot invoke it.
  const owner=createAgentSession(pm,{...binding,access:'review'});
  return owner.call('memory_review',{scope:options.scope,candidateId:options.candidate,expectedRevision:Number(options.revision),decision:options.decision,...(options.reason===undefined?{}:{reason:options.reason})});
}
function printableJSON(value){
  return JSON.stringify(value,null,2).replace(/[\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,char=>'\\u'+char.charCodeAt(0).toString(16).padStart(4,'0'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{process.stdout.write(printableJSON(await connectCommand(process.argv.slice(2)))+'\n');}
  catch(error){process.stderr.write(String(error.message)+'\n');process.exitCode=1;}
}
