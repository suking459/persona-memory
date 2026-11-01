import path from 'node:path';
import {createHash} from 'node:crypto';
import {PersonaMemory,SQLiteSnapshotStore} from '../../src/index.js';
import {normalizeBinding} from './binding.js';
export function agentStoreLocation(raw){
  const b=normalizeBinding(raw);
  return {file:path.join(b.storage,'persona-memory.sqlite'),namespace:createHash('sha256').update(JSON.stringify([b.persona,b.namespace])).digest('hex')};
}
export function openAgentMemory(raw){
  const b=normalizeBinding(raw);
  return new PersonaMemory({persona:b.persona,scope:b.namespace,...(b.backend==='sqlite'?{store:new SQLiteSnapshotStore(agentStoreLocation(b))}:{storage:b.storage})});
}
export function matchesAgentStore(pm,b){
  if(b.backend!=='sqlite')return pm.storage===b.storage;
  const expected=agentStoreLocation(b),store=pm._store;
  return store instanceof SQLiteSnapshotStore&&store.file===expected.file&&store.namespace===expected.namespace;
}
