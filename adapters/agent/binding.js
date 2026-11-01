// Host-owned capabilities. Tool arguments cannot add subjects or raise access.
import {normalizeEmbeddingConfig} from '../semantic/http.js';
import {normalizeLocale} from '../../src/locale.js';
import fs from 'node:fs';
import path from 'node:path';
import {copySnapshotJSON} from '../../src/snapshot.js';
import {normalizeSubject,memoryIdentifier,sameSubject,assertMemoryFields as fields} from '../../src/records.js';
const names=new Set(['version','host','storage','persona','namespace','access','subjects','locale','retrieval']);
export function normalizeBinding(raw){
  const value=copySnapshotJSON(raw,16384);fields(value,names,'agent binding');
  if(value.version!==1)throw new TypeError('unsupported agent binding version');
  const host=memoryIdentifier(value.host,'host'),persona=memoryIdentifier(value.persona,'persona'),namespace=memoryIdentifier(value.namespace,'namespace');
  if(typeof value.storage!=='string'||!path.isAbsolute(value.storage)||value.storage.includes('\0'))throw new TypeError('absolute storage directory required');
  if(!['read','capture','review'].includes(value.access))throw new TypeError('access must be read, capture or review');
  if(!value.subjects||typeof value.subjects!=='object'||Array.isArray(value.subjects))throw new TypeError('subjects required');
  const entries=Object.entries(value.subjects);
  if(!entries.length||entries.length>8)throw new RangeError('bind 1..8 explicit scopes');
  const subjects={};
  for(const [alias,subject] of entries){
    if(!/^[a-z][a-z0-9_-]{0,31}$/.test(alias)||['constructor','prototype'].includes(alias))throw new TypeError('invalid scope alias');
    const normalized=normalizeSubject(subject);
    if(Object.values(subjects).some(previous=>sameSubject(previous,normalized)))throw new TypeError('duplicate bound subject');
    subjects[alias]=Object.freeze(normalized);
  }
  const retrieval=value.retrieval===undefined?undefined:normalizeEmbeddingConfig(value.retrieval);
  return Object.freeze({version:1,host,...(retrieval===undefined?{}:{retrieval}),locale:normalizeLocale(value.locale)??'en',storage:path.resolve(value.storage),persona,namespace,access:value.access,subjects:Object.freeze(subjects)});
}
export function readBinding(file){
  if(typeof file!=='string'||!path.isAbsolute(file))throw new TypeError('absolute binding path required');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NONBLOCK??0)|(fs.constants.O_NOFOLLOW??0));
  try{
    if(!fs.fstatSync(fd).isFile())throw new TypeError('binding must be a regular file');
    const buffer=Buffer.alloc(16385),size=fs.readSync(fd,buffer,0,buffer.length,0);
    if(size>16384)throw new RangeError('binding exceeds 16 KiB');
    return normalizeBinding(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,size))));
  }finally{fs.closeSync(fd);}
}
