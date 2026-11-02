// Explicit, reversible configuration application. Never run automatically at package install.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {HOST_PROFILES} from './profiles.js';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
function read(file,max=2097152){
  try{
    const entry=fs.lstatSync(file);if(!entry.isFile()||entry.size>max)throw new TypeError('configuration must be a bounded regular file');
    const bytes=fs.readFileSync(file);if(bytes.length>max)throw new RangeError('configuration too large');
    return bytes;
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
}
function atomic(file,bytes){
  fs.mkdirSync(path.dirname(file),{recursive:true});
  const temp=file+'.'+randomUUID()+'.tmp';let owned=false;
  try{const fd=fs.openSync(temp,'wx',0o600);owned=true;try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);owned=false;}
  finally{if(owned)try{fs.unlinkSync(temp);}catch{}}
}
export function applyAgentBundle({bundle,target}){
  if(!path.isAbsolute(bundle)||!path.isAbsolute(target))throw new TypeError('absolute bundle and target required');
  const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read(path.join(bundle,'manifest.json'),32768)));
  if(!Object.hasOwn(HOST_PROFILES,manifest.host))throw new TypeError('unknown host');
  const profile=HOST_PROFILES[manifest.host];
  if(['cordis','workbuddy'].includes(profile.format))throw new TypeError('this host uses bundle import; follow its generated instructions');
  if(path.basename(target)!==path.basename(profile.target))throw new TypeError('target filename does not match host configuration');
  const configName=profile.format==='toml'?'config.toml':'host-config.json';
  const generated=read(path.join(bundle,configName),32768);
  if(!generated)throw new TypeError('generated configuration missing');
  const stateFile=path.join(bundle,'installation.json');
  if(fs.existsSync(stateFile))throw new Error('this bundle already has an installation record');
  const before=read(target);let next;
  if(profile.format==='toml'){
    const previous=before===null?'':new TextDecoder('utf-8',{fatal:true}).decode(before);
    // Conservative detection: an existing section or inline declaration requires manual review.
    if(/persona_memory/.test(previous))throw new Error('persona_memory is already mentioned; refusing to append a second declaration');
    next=Buffer.from(previous+(previous.endsWith('\n')||!previous?'':'\n')+'\n'+generated.toString('utf8'));
  }else{
    const root=profile.format==='vscode'?'servers':'mcpServers';
    const source=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(generated));
    const previous=before===null?{}:JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(before));
    if(!plain(previous)||(previous[root]!==undefined&&!plain(previous[root])))throw new TypeError('invalid existing configuration map');
    if(Object.hasOwn(previous[root]||{},'persona_memory'))throw new Error('persona_memory already configured; refusing replacement');
    next=Buffer.from(JSON.stringify({...previous,[root]:{...previous[root],persona_memory:source[root].persona_memory}},null,2)+'\n');
  }
  const state={target,host:manifest.host,before:before===null?null:before.toString('base64'),afterHash:digest(next)};
  // Persist the recovery record before touching the host file. Check for external changes again.
  fs.writeFileSync(stateFile,JSON.stringify(state,null,2)+'\n',{flag:'wx',mode:0o600});
  const latest=read(target);
  if((before===null)!==(latest===null)||(before!==null&&!before.equals(latest)))throw new Error('target changed during preparation; configuration not applied');
  atomic(target,next);
  return {applied:true,target,recoveryRecord:stateFile};
}
export function undoAgentBundle({bundle}){
  if(!path.isAbsolute(bundle))throw new TypeError('absolute bundle required');
  if(fs.existsSync(path.join(bundle,'uninstalled.json')))throw new Error('bundle already uninstalled');
  const stateFile=path.join(bundle,'installation.json'),state=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(read(stateFile)));
  if(typeof state.target!=='string'||!path.isAbsolute(state.target)||typeof state.afterHash!=='string')throw new TypeError('invalid installation record');
  const current=read(state.target);
  if(!current||digest(current)!==state.afterHash)throw new Error('configuration changed since installation; refusing to overwrite later edits');
  if(state.before===null)fs.unlinkSync(state.target);else atomic(state.target,Buffer.from(state.before,'base64'));
  fs.writeFileSync(path.join(bundle,'uninstalled.json'),JSON.stringify({target:state.target,restored:true})+'\n',{flag:'wx',mode:0o600});
  return {restored:true,target:state.target};
}
