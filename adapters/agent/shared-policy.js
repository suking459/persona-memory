import fs from 'node:fs';
import path from 'node:path';
import {JsonFileStore} from '../../src/storage.js';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {assertMemoryFields as fields,normalizeSubject,memoryIdentifier,sameSubject} from '../../src/records.js';
const error=(code,message)=>Object.assign(new Error(message),{code});
export function normalizeSharing(raw){
 const v=copySnapshotJSON(raw,2048);fields(v,new Set(['policy','grantId']),'sharing binding');
 if(typeof v.policy!=='string'||!path.isAbsolute(v.policy)||v.policy.includes('\0'))throw new TypeError('absolute shared policy required');
 return Object.freeze({policy:path.resolve(v.policy),grantId:memoryIdentifier(v.grantId,'shared grant')});
}
export function readSharedPolicy(file){
 if(typeof file!=='string'||!path.isAbsolute(file))throw new TypeError('absolute shared policy required');
 const store=new JsonFileStore({file,maxBytes:32768}),read=store.readSync(),v=copySnapshotJSON(read.snapshot,32768);
 fields(v,new Set(['format','version','space','persona','namespace','storage','subject','grants']),'shared policy');
 if(v.format!=='persona-memory/shared-space'||v.version!==1)throw new TypeError('unsupported shared policy');
 const space=memoryIdentifier(v.space,'shared space'),subject=normalizeSubject(v.subject);
 if(subject.type==='user'||v.persona!=='shared-memory'||v.namespace!=='shared-'+space||v.storage!==path.join(path.dirname(path.resolve(file)),'data'))throw new TypeError('invalid shared identity or storage');
 if(!Array.isArray(v.grants)||v.grants.length>32)throw new RangeError('shared grant limit');
 const seen=new Set(),grants=v.grants.map(raw=>{
  fields(raw,new Set(['id','host','contributor','access','enabled','expiresAt']),'shared grant');
  const id=memoryIdentifier(raw.id),host=memoryIdentifier(raw.host),contributor=memoryIdentifier(raw.contributor);
  if(seen.has(id)||!['read','capture','review'].includes(raw.access)||typeof raw.enabled!=='boolean'||raw.expiresAt!==null&&(typeof raw.expiresAt!=='number'||!Number.isFinite(raw.expiresAt)||raw.expiresAt<0||raw.expiresAt>8640000000000000))throw new TypeError('invalid shared grant');
  seen.add(id);return{id,host,contributor,access:raw.access,enabled:raw.enabled,expiresAt:raw.expiresAt};
 });
 return{store,revision:read.revision,policy:{format:v.format,version:1,space,persona:v.persona,namespace:v.namespace,storage:v.storage,subject,grants}};
}
// All shared calls and policy changes use this lease. Busy returns immediately, never spins.
// A crashed process may leave a lock: inspect the owner process before explicit recovery.
export function lockSharedPolicy(file){
 const target=path.resolve(file)+'.operation-lock';let fd;
 try{fd=fs.openSync(target,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw error('ERR_SHARED_BUSY','shared space is busy; retry explicitly after the active operation ends');throw e;}
 const own=fs.fstatSync(fd);let released=false;
 const release=()=>{if(released)return;released=true;fs.closeSync(fd);const current=fs.lstatSync(target);if(current.isSymbolicLink()||current.ino!==own.ino||current.dev!==own.dev)throw error('ERR_SHARED_LOCK','shared operation lock changed; inspect before recovery');fs.unlinkSync(target);};
 try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,createdAt:Date.now()}));return{release};}catch(e){release();throw e;}
}
export function lockSharedBinding(binding){
 if(!binding.sharing)return null;
 const lease=lockSharedPolicy(binding.sharing.policy);
 try{
  const {policy}=readSharedPolicy(binding.sharing.policy),g=policy.grants.find(x=>x.id===binding.sharing.grantId);
  if(!g||!g.enabled||g.expiresAt!==null&&g.expiresAt<=Date.now()||g.host!==binding.host||g.access!==binding.access)throw error('ERR_SHARED_DENIED','shared grant is unavailable');
  const entries=Object.entries(binding.subjects);
  if(binding.persona!==policy.persona||binding.namespace!==policy.namespace||binding.storage!==policy.storage||binding.backend&&binding.backend!=='json'||entries.length!==1||entries[0][0]!=='shared'||!sameSubject(entries[0][1],policy.subject))throw error('ERR_SHARED_DENIED','shared binding does not match the granted space');
  return{...lease,policy,origin:{space:policy.space,contributor:g.contributor,host:g.host}};
 }catch(e){lease.release();throw e;}
}
export function assertSharedStore(pm,lease){
 if(!lease)return;
 const subject=lease.policy.subject,state=pm.state;
 if(Object.values(state.memories).some(x=>!sameSubject(x.subject,subject))||Object.values(state.candidates).some(x=>!sameSubject(x.memory.subject,subject))||['sessions','tags','visitors','seen'].some(k=>Object.keys(state[k]??{}).length)||state.history?.some(r=>r.subject?!sameSubject(r.subject,subject):r.userId!==undefined||r.chatId!==undefined)||state.uses?.some(r=>r.userIds?.length||r.chatId!==undefined||r.memorySubjects?.some(s=>!sameSubject(s,subject))))throw error('ERR_SHARED_SCOPE','shared storage contains unrelated or personal state; inspect separately');
}
