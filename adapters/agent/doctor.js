import fs from 'node:fs';
import path from 'node:path';
import {diagnoseMemory} from '../../src/diagnostics.js';
import {normalizeBinding} from './binding.js';
import {openAgentMemory,agentStoreLocation} from './store.js';
const known=new Set(['ERR_SQLITE_UNAVAILABLE','ERR_SQLITE_IDENTITY','ERR_SQLITE_SCHEMA','ERR_STORE_FILE','ERR_STORE_LOCKED','ERR_MEMORY_CAPACITY']);
export function doctorAgent(raw){
  const binding=normalizeBinding(raw),checks=[];
  let pm;
  try{pm=openAgentMemory(binding);}
  catch(error){
    const cause=error.cause??error,code=known.has(cause.code)?cause.code:'ERR_STORE_INVALID';
    return {ok:false,readOnly:true,runtime:process.version,platform:process.platform,backend:binding.backend??'json',
      checks:[{level:'error',code,action:code==='ERR_SQLITE_UNAVAILABLE'?'Use Node 22.13+ for SQLite or choose JSON.':'Inspect the configured store and a trusted backup; do not overwrite the original.'}],
      externalServicesContacted:false,repairsApplied:false,hostEndToEnd:false};
  }
  const report=diagnoseMemory(pm,{subjects:Object.values(binding.subjects)}),file=binding.backend==='sqlite'?agentStoreLocation(binding).file:pm._store.file;
  const exists=fs.existsSync(file);
  checks.push({level:'pass',code:exists?'STORE_VALIDATED':'STORE_NOT_CREATED'});
  if(exists){
    try{fs.accessSync(file,fs.constants.R_OK|fs.constants.W_OK);fs.accessSync(path.dirname(file),fs.constants.W_OK);checks.push({level:'pass',code:'ACCESS_CHECK_PASSED'});}
    catch{checks.push({level:'warning',code:'WRITE_ACCESS_NOT_CONFIRMED',action:'Check file and parent-directory permissions before writing.'});}
  }
  for(const warning of report.warnings)checks.push({level:'warning',code:warning});
  return {ok:true,readOnly:true,runtime:process.version,platform:process.platform,backend:binding.backend??'json',checks,report,
    retrieval:{configured:Boolean(binding.retrieval),contacted:false,qualityTested:false},hostEndToEnd:false,
    limits:'Permission inspection cannot guarantee a future write or free space. No host model session or credential was tested.'};
}
