import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateLongTermMemory,scoreEvidence,longTermEvaluationCommand} from '../tools/evaluate-long-term.mjs';
import {memoryHeader} from '../src/locale.js';

test('partial evidence is not complete, duplicates cannot inflate recall, and empty gold is separate',()=>{
  const partial=scoreEvidence(['a','b'],['a']);assert.equal(partial.recall,0.5);assert.equal(partial.complete,false);assert.equal(partial.exact,false);
  assert.throws(()=>scoreEvidence(['a'],['a','a']),/actual ids/);
  assert.throws(()=>scoreEvidence(['a'],['a'],['a']),/overlap/);
  const empty=scoreEvidence([],[]);assert.equal(empty.precision,null);assert.equal(empty.complete,null);assert.equal(empty.abstained,true);
  assert.deepEqual(scoreEvidence(['a'],['a','private'],['private']).forbiddenHits,['private']);
});
test('the baseline retains required and unsolved challenge results without claiming model quality',async()=>{
  const r=await evaluateLongTermMemory();assert.equal(r.questions,22);assert.equal(r.required.questions,17);assert.deepEqual(r.required.failures,[]);
  assert.equal(r.challenges.questions,5);assert.ok(r.challenges.failures.includes('cross-language meaning needs a separately measured retriever'));
  assert.equal(r.passed,r.required.passed+r.challenges.passed);assert.ok(r.passed<r.questions);
  assert.equal(r.search.emptyGoldQuestions,5);assert.equal(r.search.correctAbstentions,5);assert.equal(r.context.forbiddenHits,0);
  assert.ok(r.context.evidenceSetRate<1);assert.ok(r.context.evidenceSetQuestions<r.questions);assert.equal(r.modelCalls,0);assert.equal(r.answerQualityMeasured,false);assert.equal(r.externalBenchmark,false);
  const task=await evaluateLongTermMemory({taskAware:true});
  assert.equal(task.required.passed,17);assert.equal(task.challenges.passed,1);
  assert.equal(task.context.forbiddenHits,0);assert.equal(task.context.evidenceSetComplete,r.context.evidenceSetComplete+1);
  const subject={type:'project',id:'zh'},localized=await evaluateLongTermMemory({fixture:{name:'localized',scenarios:[{now:0,steps:[
    {op:'put',record:{id:'a',subject,kind:'fact',key:'region',value:'北京'}},
    {op:'check',name:'zh',category:'locale',options:{subject,query:'北京',locale:'zh-CN'},expected:['a']}
  ]}]}});assert.equal(localized.passed,1);
});
test('a reader returning everything fails leakage checks and receives no gold labels',async()=>{
  const r=await evaluateLongTermMemory({reader:({pm,options,budget,...extra})=>{
    assert.deepEqual(extra,{});assert.equal(Object.hasOwn(options,'expected'),false);assert.equal(Object.hasOwn(options,'forbidden'),false);
    // Deliberately bypass the scoped reader to model an unsafe implementation.
    const rows=Object.values(pm.export().memories);
    return {searchIds:rows.map(x=>x.id),text:rows.length?memoryHeader(options.locale)+'\n'+rows.map(x=>'- '+JSON.stringify({id:x.id})).join('\n'):''};
  }});
  assert.ok(r.required.failures.length>0);assert.ok(r.context.forbiddenHits>0);assert.ok(r.search.falsePositive>0);
});
test('budget violations and read-side writes fail independently of an exact answer',async()=>{
  const subject={type:'project',id:'fixture'},fixture={name:'negative-controls',scenarios:[{now:1000,steps:[
    {op:'put',record:{id:'a',subject,kind:'fact',key:'x',value:'value'}},
    {op:'check',name:'negative',category:'negative',expected:['a'],options:{subject,query:'x'},budget:80}
  ]}]};
  const r=await evaluateLongTermMemory({fixture,reader:({pm})=>{
    pm.putMemory({id:'hidden-write',subject,kind:'fact',key:'side-effect',value:'mutation'});
    return {searchIds:['a'],text:memoryHeader()+'\n- '+JSON.stringify({id:'a',value:'x'.repeat(200)})};
  }});
  assert.equal(r.results[0].search.exact,true);assert.equal(r.results[0].context.exact,true);
  assert.equal(r.results[0].withinBudget,false);assert.equal(r.results[0].readOnly,false);assert.equal(r.required.failures.length,1);
});
test('invalid tiers, duplicate questions and excessive work reject instead of hiding failures',async()=>{
  const check={op:'check',name:'q',expected:[],options:{subject:{type:'project',id:'p'},query:'missing'}};
  await assert.rejects(evaluateLongTermMemory({fixture:{scenarios:[{now:0,steps:[{...check,tier:'reqiured'}]}]}}),/tier/);
  await assert.rejects(evaluateLongTermMemory({fixture:{scenarios:[{now:0,steps:[check,check]}]}}),/duplicate/);
  await assert.rejects(evaluateLongTermMemory({fixture:{scenarios:Array(33).fill({now:0,steps:[]})}}),/fixture/);
  await assert.rejects(evaluateLongTermMemory({fixture:{scenarios:[{now:0,steps:[{op:'execute-script'}]}]}}),/step/);
});
test('report output is exclusive and uses only explicit CLI arguments',async t=>{
  const base=fileURLToPath(new URL('../.artifacts/',import.meta.url));fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'long-term-eval-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const file=path.join(dir,'report.json');fs.writeFileSync(file,'preserve');await assert.rejects(longTermEvaluationCommand(['--out',file]),{code:'EEXIST'});assert.equal(fs.readFileSync(file,'utf8'),'preserve');
  await assert.rejects(longTermEvaluationCommand(['--provider','cloud']),/usage/);
  const out=path.join(dir,'new.json'),r=await longTermEvaluationCommand(['--out',out]);assert.equal(JSON.parse(fs.readFileSync(out)).questions,r.questions);
});
