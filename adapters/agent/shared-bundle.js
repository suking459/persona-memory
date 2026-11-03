import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {assertMemoryFields as fields} from '../../src/records.js';
import {agentWorkflow} from './workflow.js';
import {VERSION} from '../../src/version.js';
import {HOST_PROFILES,hostConfiguration} from './profiles.js';
import {grantSharedAgent,revokeSharedAgent} from './sharing.js';
export function prepareSharedAgentBundle(options){
 const o=copySnapshotJSON(options,8192);fields(o,new Set(['policy','host','contributor','access','expiresAt','locale','out']),'shared bundle options');
 if(!Object.hasOwn(HOST_PROFILES,o.host)||typeof o.out!=='string'||!path.isAbsolute(o.out)||o.out.includes('${')||/[\u0000-\u001f]/.test(o.out))throw new TypeError('known host and new absolute output directory required');
 const out=path.resolve(o.out);fs.mkdirSync(out,{recursive:false,mode:0o700});let granted;
 try{
  const {out:ignored,...grant}=o;granted=grantSharedAgent(grant);const bindingFile=path.join(out,'binding.json'),binding=granted.binding;
  const server=fileURLToPath(new URL('./server.js',import.meta.url)),cli=pathToFileURL(fileURLToPath(new URL('../../tools/connect.mjs',import.meta.url))).href;
  const space=binding.namespace.slice(7),serverName='persona_shared_'+space.replaceAll('-','').slice(0,16);
  const configuration=hostConfiguration(o.host,{command:process.execPath,args:[server,'--binding',bindingFile],serverName});
  const write=(name,value)=>fs.writeFileSync(path.join(out,name),value,{flag:'wx',mode:0o600});
  const workflow=agentWorkflow(binding.locale).replaceAll('persona_memory',serverName);
  write('WORKFLOW.md',workflow);
  if(o.host==='workbuddy'){
   write('connector-meta.json',JSON.stringify({name:'Shared project memory',name_zh:'共享项目记忆',name_en:'Shared project memory',description:'Owner-granted shared project records.',source:'persona-memory-shared-local',type:'mcp',version:VERSION}));
   write('icon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="4" y="4" width="56" height="56" rx="12" fill="#244f85"/><circle cx="22" cy="25" r="7" fill="white"/><circle cx="42" cy="25" r="7" fill="white"/><path d="M16 43h32" stroke="white" stroke-width="5"/></svg>');
   fs.mkdirSync(path.join(out,'skills'));fs.mkdirSync(path.join(out,'skills','shared-memory'));
   write('skills/shared-memory/SKILL.md','---\nname: shared-memory\ndescription: Use approved project knowledge only in the owner-granted shared space.\n---\n\n'+workflow);
  }
  write('binding.json',JSON.stringify(binding,null,2)+'\n');write(configuration.filename,configuration.text);
  write('owner.mjs',"import {connectCommand,printableJSON} from "+JSON.stringify(cli)+";\nconst binding="+JSON.stringify(bindingFile)+";\nconst allowed=new Set(['doctor','inspect','review','explain','backup','restore-preview','restore-apply','review-preview','review-apply','forget-preview','forget-apply','handoff-export','handoff-open','experience-reuse','experience-propose','experience-feedback','experience-retire']);\ntry{const [action,...args]=process.argv.slice(2);if(!action||action==='help'){console.log('Shared owner operations: use --scope shared; see README.md.');}else{if(!allowed.has(action)||args.includes('--binding'))throw Error('Unsupported action or binding override');console.log(printableJSON(await connectCommand([action,...args,'--binding',binding])));}}catch(e){console.error(e.message);process.exitCode=1;}\n");
  write('README.md','# Shared memory / 显式共享\n\nOnly scope alias: shared. Keep private memory enabled separately. This bundle never applies host settings. Manually add this independently named service using the official reference: '+HOST_PROFILES[o.host].source+'\n\n专用共享空间不从个人库复制内容。read 仅读取；capture 只提案；review 可审阅。请另建所有者 review 绑定，capture 的 owner 命令不会提升共享权限。\n\nnode owner.mjs doctor\nnode owner.mjs inspect --scope shared\nnode owner.mjs review --scope shared --candidate ACTUAL_ID --revision 1 --decision accept\nnode owner.mjs backup --out shared-backup.json\n\n宿主先检索正式记录；新内容用 memory_propose 提案，独立审阅后再用。交接使用 --scope shared，并重新检查当前引用。贡献来源由所有者分配的本地绑定附加，不是远程身份认证。\n\nLocal trusted-filesystem boundary: tool permissions do not sandbox an Agent that already has arbitrary filesystem access. No remote authentication or cloud synchronization is provided. Active operations serialize with policy changes: a busy revocation is refused, not reported successful. A crashed process may leave policy.json.operation-lock; inspect the recorded process and preserve the file until explicit owner recovery. Never automatically steal a lock.\n\nThe configuration is generated and protocol-testable; no new host-model acceptance is claimed. Preserve Node/library paths. Regenerate explicitly after moving files. Existing persona_memory service is retained; do not replace it with this shared service.\n');
  write('manifest.json',JSON.stringify({format:'persona-memory/shared-bundle',version:1,serverName,host:o.host,grantId:granted.grantId,binding:'binding.json',configuration:configuration.filename,hostEndToEnd:false},null,2)+'\n');
  return{directory:out,grantId:granted.grantId,binding,serverName,configuration:configuration.filename,hostEndToEnd:false};
 }catch(e){if(granted)try{revokeSharedAgent({policy:o.policy,grantId:granted.grantId});}catch{throw new Error('Shared bundle incomplete; inspect and revoke grant '+granted.grantId+' before reuse');}throw e;}
}
