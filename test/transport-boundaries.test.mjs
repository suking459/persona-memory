import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory} from '../src/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fork,spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createMemoryServer} from '../adapters/http/server.js';
test('loopback HTTP refuses a rebinding Host before serving readable state',async t=>{
  const server=createMemoryServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const request=host=>new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:server.address().port,path:'/api/stats',headers:{host}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.on('error',reject);});
  assert.equal(await request('127.0.0.1:'+server.address().port),200);
  assert.equal(await request('attacker.invalid:'+server.address().port),403);
  assert.equal(await request('localhost:1'),403);
});
test('MCP stdio respects output backpressure before processing more requests',{timeout:10000},async t=>{
  const cli=fileURLToPath(new URL('../adapters/mcp/server.js',import.meta.url)),preload=fileURLToPath(new URL('./fixtures/stdio-backpressure.mjs',import.meta.url));
  const child=fork(cli,[],{execArgv:['--import',pathToFileURL(preload).href],windowsHide:true,stdio:['pipe','pipe','pipe','ipc'],env:{...process.env,PM_STORAGE:'',PM_PERSONA:'default',PM_SCOPE:''}});
  t.after(()=>child.kill());let writes=0;const first=new Promise((resolve,reject)=>{child.on('error',reject);child.once('exit',code=>reject(new Error('MCP child exited '+code)));child.on('message',message=>{if(message.event==='output'){writes++;resolve();}});});
  child.stdin.write([1,2,3].map(id=>JSON.stringify({jsonrpc:'2.0',id,method:'ping'})).join('\n')+'\n');
  await first;await new Promise(resolve=>setTimeout(resolve,80));assert.equal(writes,1);
});
test('MCP rejects invalid UTF-8 rather than executing a repaired request',()=>{
  const cli=fileURLToPath(new URL('../adapters/mcp/server.js',import.meta.url));
  const bytes=Buffer.concat([Buffer.from('{"jsonrpc":"2.0","id":1,"method":"pi'),Buffer.from([0x80]),Buffer.from('ng"}\n')]);
  const result=spawnSync(process.execPath,[cli],{input:bytes,encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,PM_STORAGE:'',PM_PERSONA:'default',PM_SCOPE:''}});
  assert.equal(result.error,undefined);const replies=result.stdout.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  assert.equal(replies[0]?.error?.code,-32700);
});

test('HTTP JSON decoding rejects invalid UTF-8 before a typed write',async t=>{
  const pm=new PersonaMemory(),server=createMemoryServer({pm,allowAdmin:true});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const before=pm.export(),data=Buffer.concat([Buffer.from('{"subject":{"type":"project","id":"x"},"kind":"fact","key":"x","value":"'),Buffer.from([0x80]),Buffer.from('"}')]);
  const result=await fetch('http://127.0.0.1:'+server.address().port+'/api/memory/put',{method:'POST',headers:{'content-type':'application/json'},body:data});
  assert.equal(result.status,400);assert.deepEqual(pm.export(),before);
});
test('review CLI cannot repair an invalid UTF-8 ID into a different valid candidate',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'pm-codec-'));t.after(()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('pm-codec-'));fs.rmSync(resolved,{recursive:true,force:true});});
  const pm=new PersonaMemory({storage:dir});pm.proposeMemory({id:'\ufffd',memory:{subject:{type:'project',id:'x'},kind:'fact',key:'x',value:'wrong target',evidenceId:'message'}});pm.flush();
  const file=path.join(dir,'default.json'),before=fs.readFileSync(file),bytes=Buffer.concat([Buffer.from('{"operation":"accept","id":"'),Buffer.from([0x80]),Buffer.from('","options":{"expectedRevision":1}}')]);
  const cli=fileURLToPath(new URL('../tools/review.mjs',import.meta.url)),result=spawnSync(process.execPath,[cli],{input:bytes,encoding:'utf8',windowsHide:true,timeout:10000,env:{...process.env,PM_STORAGE:dir,PM_PERSONA:'default',PM_SCOPE:''}});
  assert.equal(result.status,1);assert.deepEqual(fs.readFileSync(file),before);
});
