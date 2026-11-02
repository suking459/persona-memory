// Logical snapshot backups. Checksums detect accidental damage, not hostile authors.
import {createHash} from 'node:crypto';
import {PersonaMemory} from './memory.js';
import {copySnapshotJSON} from './snapshot.js';
import {assertMemoryFields as fields,normalizeSubject,memoryIdentifier} from './records.js';
import {normalizeLocale} from './locale.js';
import {storageError,checkRevision} from './storage.js';
const LIMIT=67108864,TTL=600000;
function canonical(value){
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
function timestamp(value){if(!Number.isSafeInteger(value)||value<0||value>8640000000000000-TTL)throw new TypeError('invalid backup timestamp');return value;}
function identity(raw,snapshot){
  const v=copySnapshotJSON(raw,8192);fields(v,new Set(['persona','namespace','subjects','locale']),'backup identity');
  if(memoryIdentifier(v.persona)!==snapshot.persona||memoryIdentifier(v.namespace)!==snapshot.scope)throw new TypeError('backup identity does not match snapshot');
  if(!v.subjects||typeof v.subjects!=='object'||Array.isArray(v.subjects))throw new TypeError('backup subjects required');
  const entries=Object.entries(v.subjects);if(entries.length<1||entries.length>8)throw new TypeError('invalid backup scopes');
  const subjects={};
  for(const [alias,subject] of entries){
    if(!/^[a-z][a-z0-9_-]{0,31}$/.test(alias)||['constructor','prototype'].includes(alias))throw new TypeError('invalid backup scope alias');
    subjects[alias]=normalizeSubject(subject);
  }
  return {persona:v.persona,namespace:v.namespace,subjects,locale:normalizeLocale(v.locale)??'en'};
}
function counts(s){
  return {memories:Object.keys(s.memories).length,candidates:Object.keys(s.candidates).length,
    relationshipProfiles:Object.values(s.sessions).reduce((n,p)=>n+Object.keys(p).length,0)};
}
function ready(pm){
  if(!(pm instanceof PersonaMemory))throw new TypeError('PersonaMemory required');
  if(pm._storeBusy)throw storageError('ERR_STORE_BUSY','another store operation is pending');
  if(pm._dirty&&pm._store)throw storageError('ERR_STORE_DIRTY','persist local changes before backup or restore');
}
export async function createMemoryBackup(pm,{identity:bindingIdentity,now=Date.now()}={}){
  timestamp(now);ready(pm);if(pm._store)await pm.reload({ifChanged:true});
  const snapshot=pm.export();pm._hydrate(snapshot);
  const payload={format:'persona-memory-backup',version:1,createdAt:now,snapshot,
    ...(bindingIdentity===undefined?{}:{identity:identity(bindingIdentity,snapshot)})};
  return {...payload,checksum:hash(payload)};
}
export function inspectMemoryBackup(raw,{config={}}={}){
  const value=copySnapshotJSON(raw,LIMIT+16384);
  fields(value,new Set(['format','version','createdAt','snapshot','identity','checksum']),'memory backup');
  if(value.format!=='persona-memory-backup'||value.version!==1||!/^[a-f0-9]{64}$/.test(value.checksum))throw new TypeError('unsupported memory backup');
  timestamp(value.createdAt);
  const {checksum,...payload}=value;
  if(hash(payload)!==checksum)throw storageError('ERR_BACKUP_CHECKSUM','Backup checksum mismatch; original preserved');
  if(!value.snapshot||typeof value.snapshot!=='object')throw new TypeError('backup snapshot required');
  const pm=new PersonaMemory({persona:value.snapshot.persona,scope:value.snapshot.scope,config});
  pm.import(value.snapshot);
  const snapshot=pm.export();
  return {checksum,createdAt:value.createdAt,snapshot,counts:counts(snapshot),
    ...(value.identity===undefined?{}:{identity:identity(value.identity,snapshot)})};
}
export async function previewMemoryRestore(pm,raw,{now=Date.now()}={}){
  timestamp(now);ready(pm);if(pm._store)await pm.reload({ifChanged:true});
  const incoming=inspectMemoryBackup(raw,{config:pm.config});
  // Same identity is required. Backups do not implicitly relabel scoped records.
  pm._hydrate(incoming.snapshot);
  const target=pm.export();
  const plan={format:'persona-memory-restore-plan',version:1,createdAt:now,expiresAt:now+TTL,
    persona:pm.persona,scope:pm.scope,expectedRevision:pm._storeRevision,targetDigest:hash(target),
    configDigest:hash(copySnapshotJSON(pm.config,LIMIT)),backupChecksum:incoming.checksum,
    replacing:counts(target),restoring:incoming.counts};
  return {...plan,checksum:hash(plan)};
}
export async function restoreMemoryBackup(pm,raw,rawPlan,{now=Date.now()}={}){
  timestamp(now);ready(pm);
  const plan=copySnapshotJSON(rawPlan,16384);
  fields(plan,new Set(['format','version','createdAt','expiresAt','persona','scope','expectedRevision','targetDigest','configDigest','backupChecksum','replacing','restoring','checksum']),'restore plan');
  const {checksum,...payload}=plan;
  if(plan.format!=='persona-memory-restore-plan'||plan.version!==1||hash(payload)!==checksum)throw new TypeError('invalid restore preview');
  timestamp(plan.createdAt);checkRevision(plan.expectedRevision);
  if(plan.expiresAt!==plan.createdAt+TTL||now<plan.createdAt||now>=plan.expiresAt)throw storageError('ERR_RESTORE_EXPIRED','Restore preview expired; preview again');
  if(plan.persona!==pm.persona||plan.scope!==pm.scope||hash(copySnapshotJSON(pm.config,LIMIT))!==plan.configDigest)throw storageError('ERR_RESTORE_TARGET','Restore target or configuration changed');
  const incoming=inspectMemoryBackup(raw,{config:pm.config});
  if(incoming.checksum!==plan.backupChecksum)throw storageError('ERR_RESTORE_CHANGED','Backup changed after preview');
  const snapshot=pm._hydrate(incoming.snapshot);
  if(pm._store)await pm.reload({ifChanged:true});
  if(pm._storeRevision!==plan.expectedRevision||hash(pm.export())!==plan.targetDigest)throw storageError('ERR_RESTORE_CHANGED','Restore target changed; preview again');
  if(!pm._store){pm.import(snapshot);return {committed:true,persistent:false,requiresReload:false,counts:incoming.counts};}
  const before=JSON.stringify(pm.state);pm._storeBusy=true;
  let saved;
  try{
    // CAS is the final guard; do not import into live state before the durable write.
    saved=await pm._store.write(snapshot,{expectedRevision:plan.expectedRevision});
    checkRevision(saved?.revision,{empty:false});
    if(pm._dirty||JSON.stringify(pm.state)!==before)return {committed:true,persistent:true,requiresReload:true,counts:incoming.counts};
    pm.import(snapshot);pm._storeRevision=saved.revision;pm._dirty=false;
    return {committed:true,persistent:true,requiresReload:false,counts:incoming.counts};
  }finally{pm._storeBusy=false;}
}
