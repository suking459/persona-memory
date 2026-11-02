import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {normalizeBinding} from './binding.js';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {assertMemoryFields as fields} from '../../src/records.js';
import {displayLanguage} from '../../src/locale.js';
import {agentWorkflow,bundleReadme} from './workflow.js';
import {VERSION} from '../../src/version.js';
import {ownerEntry,operationsGuide} from './operations.js';
import {HOST_PROFILES,hostConfiguration} from './profiles.js';
export function prepareAgentBundle({host,out,project,userId,access='capture',storage,locale='en',retrieval,backend,identity:restoredIdentity}={}){
  if(restoredIdentity!==undefined){
    restoredIdentity=copySnapshotJSON(restoredIdentity,8192);fields(restoredIdentity,new Set(['persona','namespace','subjects','locale']),'restored identity');
    if(!restoredIdentity.persona||!restoredIdentity.namespace||!restoredIdentity.subjects)throw new TypeError('incomplete restored identity');
    if(userId!==undefined)throw new TypeError('choose restored identity or a new user scope');
  }
  if(!Object.hasOwn(HOST_PROFILES,host))throw new TypeError('unknown host');
  for(const [label,value] of Object.entries({out,project})){
    if(typeof value!=='string'||!path.isAbsolute(value)||value.includes('${')||/[\u0000-\u001f]/.test(value))throw new TypeError('absolute '+label+' path without interpolation required');
  }
  const output=path.resolve(out),workspace=path.resolve(project);
  if(!fs.statSync(workspace).isDirectory())throw new TypeError('project must be an existing directory');
  const canonical=fs.realpathSync(workspace);
  const identity=process.platform==='win32'?canonical.toLowerCase():canonical;
  const projectId='project-'+createHash('sha256').update(identity).digest('hex').slice(0,32);
  const binding=normalizeBinding({version:1,host,...(backend===undefined?{}:{backend}),storage:storage??path.join(output,'data'),persona:restoredIdentity?.persona??'agent-memory',
    namespace:restoredIdentity?.namespace??host+'-'+projectId,access,locale:restoredIdentity?.locale??locale,...(retrieval===undefined?{}:{retrieval}),subjects:restoredIdentity?.subjects??{project:{type:'project',id:projectId},...(userId===undefined?{}:{personal:{type:'user',id:userId}})}});
  const file=path.join(output,'binding.json'),server=fileURLToPath(new URL('./server.js',import.meta.url));
  const configuration=hostConfiguration(host,{command:process.execPath,args:[server,'--binding',file]});
  const workflow=agentWorkflow(binding.locale);
  const operator={host,locale:binding.locale,bindingFile:file,bundle:output,project:workspace,cli:fileURLToPath(new URL('../../tools/connect.mjs',import.meta.url))};
  const manifest={host,profile:HOST_PROFILES[host],configuration:configuration.filename,binding:'binding.json',workflow:'WORKFLOW.md',operations:'OPERATIONS.md',owner:'owner.mjs',
    entry:{command:process.execPath,args:[server,'--binding',file]},verification:{configuration:'generated',protocol:'not-run',hostEndToEnd:false}};
  // Exclusive directory creation prevents overwriting an existing project or host setup.
  fs.mkdirSync(output,{recursive:false});
  const write=(name,body)=>fs.writeFileSync(path.join(output,name),body,{flag:'wx',mode:0o600});
  write('binding.json',JSON.stringify(binding,null,2)+'\n');write(configuration.filename,configuration.text);
  write('WORKFLOW.md',workflow);write('owner.mjs',ownerEntry(operator));write('OPERATIONS.md',operationsGuide(operator));write('manifest.json',JSON.stringify(manifest,null,2)+'\n');
  write('README.md',bundleReadme(HOST_PROFILES[host],binding.locale)+(binding.retrieval?(displayLanguage(binding.locale)==='zh'?'\n可选语义检索已配置：查询及选定的正式记忆会发送到指定嵌入服务；凭据只按环境变量名引用。服务失败会回退本地检索；不会自动安装模型。\n':'\nOptional semantic retrieval is configured: queries and selected approved values go to the chosen embedding service. Credentials are referenced by environment variable name only. Service errors fall back to local search; no model is installed automatically.\n'):''));
  if(host==='workbuddy'){
    write('connector-meta.json',JSON.stringify({name:displayLanguage(binding.locale)==='zh'?'项目记忆':'Persona Memory',name_zh:'项目记忆',name_en:'Persona Memory',description:'Scoped approved memory and reviewed proposals.',source:'persona-memory-local',type:'mcp',version:VERSION},null,2)+'\n');
    write('icon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#244f85"/><path d="M17 46V18h13q13 0 13 10T30 38h-5v8m0-20v4h5q5 0 5-2t-5-2z" fill="white"/></svg>\n');
    fs.mkdirSync(path.join(output,'skills'));fs.mkdirSync(path.join(output,'skills','persona-memory'));
    write('skills/persona-memory/SKILL.md','---\nname: persona-memory\ndescription: Use scoped persistent memory for user requirements, project decisions and task continuity.\n---\n\n'+workflow);
  }
  if(host==='dsh')write('package.json',JSON.stringify({name:'@local/dsh-persona-memory',version:VERSION,private:true,type:'module',dsh:{bundle:{patch:'./cordis.patch.yml'}}},null,2)+'\n');
  return {directory:output,manifest,binding};
}
