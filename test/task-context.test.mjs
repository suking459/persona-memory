import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';

const subject={type:'project',id:'research'};
const other={type:'project',id:'foreign'};
const input=(id,key,extra={})=>({id,subject,kind:'fact',key,value:'Synthetic value',...extra});
const selected=context=>context.records.map(hit=>hit.record.id);
const rendered=context=>context.text.split('\n').slice(1).map(line=>JSON.parse(line.slice(2)).id);

test('standing and query evidence use the same validity, dependency, scope and explicit filters',()=>{
  let now=1000;
  const pm=new PersonaMemory({clock:()=>now});
  pm.putMemory(input('policy','release-policy',{kind:'constraint',source:'user'}));
  const old=pm.putMemory(input('old','provider'));
  pm.putMemory(input('derived','legacy-policy',{kind:'constraint',derivedFrom:[{id:old.id,revision:1}]}));
  pm.putMemory(input('expired','temporary-policy',{kind:'constraint',expiresAt:2000}));
  pm.putMemory(input('foreign','release-policy',{subject:other,kind:'constraint'}));
  pm.proposeMemory({memory:{subject,key:'pending-policy',kind:'constraint',value:'Pending data',evidenceId:'candidate'}});
  now=2000;
  pm.putMemory(input('new-provider','provider',{replaceId:old.id}));
  pm.putMemory(input('scheduled','release-policy',{kind:'constraint',replaceId:'policy',validFrom:3000}));
  pm.putMemory(input('pagination','pagination'));
  const options={subject,query:'pagination',includeStanding:true,budget:4000};
  const snapshot=pm.export();
  const context=pm.buildTaskMemoryContext(options);
  assert.deepEqual(selected(context),['policy','pagination']);
  assert.deepEqual(rendered(context),selected(context));
  assert.deepEqual(pm.export(),snapshot);
  assert.deepEqual(selected(pm.buildTaskMemoryContext({...options,sources:['user']})),['policy']);
  assert.deepEqual(selected(pm.buildTaskMemoryContext({...options,keys:['pagination']})),['pagination']);
  assert.deepEqual(selected(pm.buildTaskMemoryContext({...options,kinds:['fact']})),['pagination']);
  now=3000;
  assert.deepEqual(selected(pm.buildTaskMemoryContext(options)),['scheduled','pagination']);
});

test('facets share one budget and interleave evidence without duplicate records',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  pm.putMemory(input('standing','policy',{kind:'constraint',value:'Use French.'}));
  pm.putMemory(input('storage','storage'));
  pm.putMemory(input('owner','owner'));
  const options={subject,query:'storage',facets:['owner','STORAGE','policy'],includeStanding:true,budget:4000};
  const context=pm.buildTaskMemoryContext(options);
  assert.deepEqual(rendered(context),['standing','storage','owner']);
  assert.equal(context.taskSelection.facets.length,3);
  assert.equal(context.taskSelection.duplicates,1);
  assert.ok(context.records[0].reasons.includes('standing-constraint'));
  assert.ok(context.records[0].reasons.includes('exact-key'));
  const limited=pm.buildTaskMemoryContext({...options,maxRecords:2});
  assert.deepEqual(rendered(limited),['standing','storage']);
  assert.deepEqual(limited.omitted,[{id:'owner',reason:'record-limit'}]);
  const encoded=pm.buildTaskMemoryContext({...options,tokenBudget:0,countTokens:line=>line.length});
  assert.equal(encoded.text,'');
  assert.equal(encoded.omittedCount,3);
  assert.ok(encoded.omitted.every(x=>x.reason==='token-budget'));
});

test('task context exposes each pass limit and the bounded union',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  const facets=['apricot','bronze','cactus','drift'];
  for(const word of facets)for(let i=0;i<17;i++)pm.putMemory(input(`${word}-${i}`,`${word}-${i}`));
  for(let i=0;i<9;i++)pm.putMemory(input(`policy-${i}`,`policy-${i}`,{kind:'constraint'}));
  const context=pm.buildTaskMemoryContext({subject,facets,includeStanding:true,budget:100000,maxRecords:64});
  assert.equal(context.records.length,64);
  assert.equal(context.taskSelection.standingIds.length,8);
  assert.equal(context.taskSelection.unionOmitted,8);
  for(const pass of [...context.taskSelection.facets,context.taskSelection.standing])assert.equal(pass.omitted.resultLimit,1);
});

test('invalid task input is rejected and a callback changing memory invalidates the context',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  const options={subject,query:'policy',budget:4000};
  assert.throws(()=>pm.buildTaskMemoryContext({...options,query:' '}),/one to four/);
  assert.throws(()=>pm.buildTaskMemoryContext({...options,facets:['b','c','d','e']}),/one to four/);
  assert.throws(()=>pm.buildTaskMemoryContext({...options,facets:['x'.repeat(1025)]}),/invalid task query facet/);
  assert.throws(()=>pm.buildTaskMemoryContext({...options,subjects:[other]}),/field/);
  assert.throws(()=>pm.buildTaskMemoryContext({...options,includeStanding:1}),/boolean/);
  pm.putMemory(input('policy','policy',{kind:'constraint'}));
  let mutated=false;
  assert.throws(()=>pm.buildTaskMemoryContext({...options,tokenBudget:4000,countTokens(text){
    if(!mutated){mutated=true;pm.forgetMemory('policy');}
    return text.length;
  }}),/memory changed/);
  assert.equal(pm.getMemory('policy'),null);
});
