import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {JsonFileStore} from '../../src/storage.js';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {assertMemoryFields as fields,normalizeSubject,memoryIdentifier} from '../../src/records.js';
import {normalizeBinding} from './binding.js';
import {readSharedPolicy,lockSharedPolicy} from './shared-policy.js';
export function createSharedSpace(options){
 const o=copySnapshotJSON(options,4096);fields(o,new Set(['out','subject']),'shared space options');const subject=normalizeSubject(o.subject);
 if(subject.type==='user'||typeof o.out!=='string'||!path.isAbsolute(o.out))throw new TypeError('new absolute directory and project/task subject required');
 const directory=path.resolve(o.out),file=path.join(directory,'policy.json'),space=randomUUID();
 fs.mkdirSync(directory,{recursive:false,mode:0o700});
 const policy={format:'persona-memory/shared-space',version:1,space,persona:'shared-memory',namespace:'shared-'+space,storage:path.join(directory,'data'),subject,grants:[]};
 new JsonFileStore({file,maxBytes:32768}).writeSync(policy,{expectedRevision:null});
 return {policy:file,space,subject};
}
export function grantSharedAgent(options){
 const o=copySnapshotJSON(options,4096);fields(o,new Set(['policy','host','contributor','access','expiresAt','locale']),'shared grant options');
 if(typeof o.policy!=='string'||!path.isAbsolute(o.policy))throw new TypeError('absolute shared policy required');
 const lease=lockSharedPolicy(o.policy);
 try{
  const read=readSharedPolicy(o.policy),p=read.policy;
  const active=p.grants.filter(g=>g.enabled&&(g.expiresAt===null||g.expiresAt>Date.now()));
  if(active.length>=32)throw new RangeError('shared active grant limit reached');
  const recent=p.grants.filter(g=>!active.includes(g)).slice(-(31-active.length)||p.grants.length);
  const expiresAt=o.expiresAt===undefined?null:o.expiresAt;
  if(expiresAt!==null&&(typeof expiresAt!=='number'||!Number.isFinite(expiresAt)||expiresAt<=Date.now()||expiresAt>8640000000000000))throw new RangeError('future shared grant expiry required');
  const g={id:randomUUID(),host:memoryIdentifier(o.host,'host'),contributor:memoryIdentifier(o.contributor,'contributor'),access:o.access??'capture',enabled:true,expiresAt};
  const binding=normalizeBinding({version:1,host:g.host,persona:p.persona,namespace:p.namespace,storage:p.storage,access:g.access,subjects:{shared:p.subject},locale:o.locale??'en',sharing:{policy:path.resolve(o.policy),grantId:g.id}});
  read.store.writeSync({...p,grants:[...active,...recent,g]},{expectedRevision:read.revision});
  return{grantId:g.id,binding};
 }finally{lease.release();}
}
export function revokeSharedAgent(options){
 const o=copySnapshotJSON(options,2048);fields(o,new Set(['policy','grantId']),'shared revocation');if(typeof o.policy!=='string'||!path.isAbsolute(o.policy))throw new TypeError('absolute shared policy required');const id=memoryIdentifier(o.grantId),lease=lockSharedPolicy(o.policy);
 try{const read=readSharedPolicy(o.policy),g=read.policy.grants.find(x=>x.id===id);if(!g)throw new TypeError('unknown shared grant');if(!g.enabled)return{revoked:true,alreadyRevoked:true};read.store.writeSync({...read.policy,grants:read.policy.grants.map(x=>x.id===id?{...x,enabled:false}:x)},{expectedRevision:read.revision});return{revoked:true,alreadyRevoked:false};}
 finally{lease.release();}
}
export function inspectSharedSpace(file){const {policy,revision}=readSharedPolicy(file);return{...policy,revision,authentication:'owner-assigned local labels; not remote identity authentication'};}
