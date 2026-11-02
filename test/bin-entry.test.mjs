import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath}from'node:url';
import {spawnSync}from'node:child_process';
import {prepareAgentBundle}from'../adapters/agent/index.js';
import {testTimeout}from'../tools/test-limits.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),base=path.join(root,'.artifacts');
function setup(t){
  fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'bin-link-')),alias=path.join(dir,'alias');
  fs.symlinkSync(root,alias,process.platform==='win32'?'junction':'dir');
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return {dir,alias};
}
test('CLI through a symbolic parent path executes rather than silently importing and exiting',t=>{
  const {alias}=setup(t),r=spawnSync(process.execPath,[path.join(alias,'tools/connect.mjs'),'list'],{encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.trim().startsWith('{'),'linked CLI did not execute');assert.ok(JSON.parse(r.stdout).workbuddy);
});
test('Agent command through a symbolic parent path answers actual stdio requests',t=>{
  const {dir,alias}=setup(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir});
  const input=[{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'memory_status',arguments:{}}}].map(x=>JSON.stringify(x)).join('\n')+'\n';
  const r=spawnSync(process.execPath,[path.join(alias,'adapters/agent/server.js'),'--binding',path.join(bundle.directory,'binding.json')],{input,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.trim(),'linked Agent command did not execute');const responses=r.stdout.trim().split('\n').map(x=>JSON.parse(x));assert.equal(responses[1].result.structuredContent.host,'codex');
});
test('legacy review command through a symbolic parent path runs its safety validation',t=>{
  const {alias}=setup(t),r=spawnSync(process.execPath,[path.join(alias,'tools/review.mjs')],{input:'{}',encoding:'utf8',env:{...process.env,PM_STORAGE:''},windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(r.status,1);assert.match(r.stderr,/PM_STORAGE is required/);
});
