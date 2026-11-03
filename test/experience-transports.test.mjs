import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createAgentSession,prepareAgentBundle,openAgentMemory,createSharedSpace,prepareSharedAgentBundle,revokeSharedAgent} from '../adapters/agent/index.js';
import {testTimeout} from '../tools/test-limits.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),base=path.join(root,'.artifacts');
const input={key:'method',task:'检查发布 / release',attempt:'Run isolated tests',result:'Reported success',conditions:['Linux'],outcome:'success',evidenceId:'run-1',reason:'Synthetic'};
function directory(t){fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'experience-test-'));t.after(()=>{assert.ok(path.resolve(dir).startsWith(base+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;}
function setup(t){const dir=directory(t),b=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir});return {dir,b,session:createAgentSession(openAgentMemory(b.binding),b.binding)};}
const owner=b=>createAgentSession(openAgentMemory(b.binding),{...b.binding,access:'review'});
async function approve(session,candidate,scope='project'){return (await session.call('memory_review',{scope,candidateId:candidate.id,expectedRevision:candidate.revision,decision:'accept'})).record;}

test('Agent roles prevent model capture from attestation, verification and retirement',async t=>{
  const {b,session}=setup(t),review=owner(b);
  await assert.rejects(session.call('memory_experience_propose',{scope:'project',...input,verified:true}),/owner review/);
  const c=(await session.call('memory_experience_propose',{scope:'project',...input})).candidate;
  const record=await approve(review,c);
  const feedback={scope:'project',id:record.id,expectedRevision:1,trialId:'trial',outcome:'helped',evidenceId:'feedback',conditions:['Linux']};
  await assert.rejects(session.call('memory_experience_feedback',{...feedback,attest:true}),/owner review/);
  await assert.rejects(session.call('memory_experience_retire',{scope:'project',id:record.id,expectedRevision:1,evidenceId:'e',reason:'retire'}),/not granted/);
  const pending=(await session.call('memory_experience_feedback',feedback)).candidate;
  await approve(review,pending);assert.equal((await session.call('memory_experience_reuse',{scope:'project',conditions:['Linux']})).items[0].status,'needs-review');
  const attested=(await review.call('memory_experience_feedback',{...feedback,attest:true})).candidate;
  await approve(review,attested);
  const read=createAgentSession(openAgentMemory(b.binding),{...b.binding,access:'read'}),result=await read.call('memory_experience_reuse',{scope:'project',conditions:['Linux']});
  assert.equal(result.items[0].status,'eligible');assert.equal(result.evidenceVerified,false);
  await assert.rejects(read.call('memory_experience_propose',{scope:'project',...input}),/not granted/);
  await assert.rejects(review.call('memory_experience_feedback',{...feedback,scope:'user'}),/scope/);
});
test('real MCP subprocess persists proposals and exposes reuse without claiming model acceptance',async t=>{
  const {b}=setup(t),run=(name,args)=>{
    const messages=[{jsonrpc:'2.0',id:1,method:'initialize'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}}];
    const r=spawnSync(process.execPath,['adapters/agent/server.js','--binding',path.join(b.directory,'binding.json')],{cwd:root,encoding:'utf8',windowsHide:true,input:messages.map(x=>JSON.stringify(x)).join('\n')+'\n',timeout:testTimeout(10000)});
    assert.equal(r.status,0,r.stderr);const result=r.stdout.trim().split(/\r?\n/).map(JSON.parse).find(x=>x.id===2).result;
    assert.notEqual(result.isError,true,JSON.stringify(result));return JSON.parse(result.content[0].text);
  };
  const p=run('memory_experience_propose',{scope:'project',...input});assert.equal(p.candidate.status,'pending');
  await approve(owner(b),p.candidate);assert.equal(run('memory_experience_reuse',{scope:'project',conditions:['Linux']}).items[0].status,'needs-review');
});
test('fixed owner CLI supports proposal, feedback and retirement across independent restarts',t=>{
  const {dir,b}=setup(t),file=path.join(dir,'input.json');
  const run=(action,value)=>{fs.writeFileSync(file,JSON.stringify(value));return spawnSync(process.execPath,[path.join(b.directory,'owner.mjs'),action,'--scope','project','--input',file],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});};
  const review=c=>{const r=spawnSync(process.execPath,[path.join(b.directory,'owner.mjs'),'review','--scope','project','--candidate',c.id,'--revision',String(c.revision),'--decision','accept'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});assert.equal(r.status,0,r.stderr);return JSON.parse(r.stdout).record;};
  let r=run('experience-propose',input);assert.equal(r.status,0,r.stderr);const record=review(JSON.parse(r.stdout).candidate);
  r=run('experience-feedback',{id:record.id,expectedRevision:1,trialId:'run',evidenceId:'actual-report',outcome:'helped',conditions:['Linux'],attest:true});assert.equal(r.status,0,r.stderr);review(JSON.parse(r.stdout).candidate);
  r=run('experience-reuse',{conditions:['Linux']});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).items[0].status,'eligible');
  r=run('experience-retire',{id:record.id,expectedRevision:1,evidenceId:'owner-decision',reason:'Retire'});assert.equal(r.status,0,r.stderr);review(JSON.parse(r.stdout).candidate);
  r=run('experience-reuse',{conditions:['Linux']});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).items.length,0);
  assert.notEqual(run('experience-propose',{...input,subject:{type:'project',id:'override'}}).status,0);
});
test('shared experience CLI preserves policy roles, provenance and revocation',async t=>{
  const dir=directory(t),space=createSharedSpace({out:path.join(dir,'space'),subject:{type:'project',id:'shared'}}),
    writer=prepareSharedAgentBundle({policy:space.policy,host:'codex',contributor:'writer',out:path.join(dir,'writer')}),
    reviewer=prepareSharedAgentBundle({policy:space.policy,host:'dsh',contributor:'owner',access:'review',out:path.join(dir,'owner')}),file=path.join(dir,'input.json');
  const run=(b,action,value)=>{fs.writeFileSync(file,JSON.stringify(value));return spawnSync(process.execPath,[path.join(b.directory,'owner.mjs'),action,'--scope','shared','--input',file],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});};
  assert.notEqual(run(writer,'experience-propose',{...input,verified:true}).status,0);
  let r=run(writer,'experience-propose',input);assert.equal(r.status,0,r.stderr);const c=JSON.parse(r.stdout).candidate;assert.equal(c.memory.origin.contributor,'writer');
  const session=createAgentSession(openAgentMemory(reviewer.binding),reviewer.binding),record=await approve(session,c,'shared');
  const f={id:record.id,expectedRevision:1,trialId:'test',outcome:'helped',evidenceId:'run',conditions:['Linux'],attest:true};
  assert.notEqual(run(writer,'experience-feedback',f).status,0);r=run(reviewer,'experience-feedback',f);assert.equal(r.status,0,r.stderr);
  const feedback=JSON.parse(r.stdout).candidate;assert.equal(feedback.memory.origin.contributor,'owner');await approve(session,feedback,'shared');
  r=run(writer,'experience-reuse',{conditions:['Linux']});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).items[0].status,'eligible');
  revokeSharedAgent({policy:space.policy,grantId:writer.grantId});assert.notEqual(run(writer,'experience-reuse',{conditions:['Linux']}).status,0);
});
