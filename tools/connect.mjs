#!/usr/bin/env node
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {openAgentMemory} from '../adapters/agent/store.js';
import {agentBackupCommand,identityFromBackup} from '../adapters/agent/backup.js';
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
  const allowed={list:[],prepare:['host','out','project','user','access','storage','locale','embedding-provider','embedding-model','embedding-endpoint','embedding-key-env','backend','identity-from'],backup:['binding','out'],'restore-preview':['binding','backup','out'],'restore-apply':['binding','backup','plan'],apply:['bundle','target'],undo:['bundle'],inspect:['binding','scope','candidate','status','limit','after'],review:['binding','scope','candidate','revision','decision','reason']};
  if(!Object.hasOwn(allowed,action)||Object.keys(options).some(k=>!allowed[action].includes(k)))throw new TypeError('usage: persona-memory-connect list | prepare | apply | undo | inspect | review (see docs/agent-integration.md)');
  if(action==='list')return HOST_PROFILES;
  if(action==='prepare'){
    let retrieval;
    if(['embedding-provider','embedding-model','embedding-endpoint','embedding-key-env'].some(key=>options[key]!==undefined)){
      const provider=options['embedding-provider'],model=options['embedding-model'];
      if(!provider||!model)throw new TypeError('--embedding-provider and --embedding-model required');
      const endpoint=options['embedding-endpoint']??(provider==='ollama'?'http://127.0.0.1:11434/api/embed':undefined);
      if(!endpoint)throw new TypeError('--embedding-endpoint required for this provider');
      retrieval={provider,model,endpoint,...(options['embedding-key-env']===undefined?{}:{apiKeyEnv:options['embedding-key-env']})};
    }
    return prepareAgentBundle({...(options.backend===undefined?{}:{backend:options.backend}),...(options['identity-from']===undefined?{}:{identity:identityFromBackup(options['identity-from'])}),...(retrieval===undefined?{}:{retrieval}),host:options.host,out:options.out===undefined?undefined:path.resolve(options.out),project:options.project===undefined?undefined:path.resolve(options.project),
    userId:options.user,access:options.access,locale:options.locale,...(options.storage===undefined?{}:{storage:path.resolve(options.storage)})});
  }
  if(action==='apply'){
    if(!options.bundle||!options.target)throw new TypeError('--bundle and --target required');
    return applyAgentBundle({bundle:path.resolve(options.bundle),target:path.resolve(options.target)});
  }
  if(action==='undo'){
    if(!options.bundle)throw new TypeError('--bundle required');
    return undoAgentBundle({bundle:path.resolve(options.bundle)});
  }
  if(!options.binding)throw new TypeError('--binding required');
  const binding=readBinding(path.resolve(options.binding));
  if(['backup','restore-preview','restore-apply'].includes(action)){
    if(action==='restore-apply'&&!options.plan)throw new TypeError('--plan required');
    return agentBackupCommand(action,binding,options);
  }
  if(!options.scope)throw new TypeError('--scope required');
  if(action==='inspect')return inspectAgentCandidates(binding,{scope:options.scope,
    ...(options.candidate===undefined?{}:{candidateId:options.candidate}),
    ...(options.status===undefined?{}:{status:options.status}),
    ...(options.limit===undefined?{}:{limit:Number(options.limit)}),
    ...(options.after===undefined?{}:{after:options.after})});
  const pm=openAgentMemory(binding);
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
