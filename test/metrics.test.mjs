import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryMetrics,compareMemoryTrials} from '../src/index.js';
test('metrics ring bounds retention and preserves chronological detached scalars',()=>{
  const meter=createMemoryMetrics({capacity:2}),input={operation:'recall',durationMs:10,success:true,inputTokens:5};
  meter.record(input);input.durationMs=999;meter.record({operation:'context',durationMs:20,success:false});meter.record({operation:'recall',durationMs:30,success:true});
  assert.deepEqual(meter.samples().map(s=>s.durationMs),[20,30]);const copy=meter.samples();copy[0].durationMs=0;
  assert.equal(meter.summary().operations.context.durationMs.mean,20);assert.equal(meter.summary().dropped,1);assert.equal(meter.summary().total,3);
  meter.clear();assert.equal(meter.summary().retained,0);assert.equal(meter.summary().total,0);
});
test('metrics never estimates missing tokens or drops failed observations from timing',()=>{
  const meter=createMemoryMetrics();meter.record({operation:'task',durationMs:10,success:true,inputTokens:0,outputTokens:2});meter.record({operation:'task',durationMs:30,success:false,inputTokens:5});
  const report=meter.summary();assert.equal(report.evidenceVerified,false);assert.equal(report.operations.task.inputTokens,5);assert.equal(report.operations.task.outputTokens,null);
  assert.equal(report.operations.task.failed,1);assert.equal(report.operations.task.durationMs.mean,20);assert.equal(report.operations.task.durationMs.p95,30);assert.equal(report.operations.recall.durationMs.mean,null);
});
test('metrics rejects content, callbacks and invalid numeric data without mutation or getter execution',()=>{
  const meter=createMemoryMetrics(),before=meter.summary();let calls=0;
  for(const extra of [{query:'private body'},{error:'private error'},{durationMs:NaN},{durationMs:-1},{success:1},{inputTokens:1.1},{bytes:Infinity},{operation:'arbitrary'}]){
    assert.throws(()=>meter.record({operation:'recall',durationMs:1,success:true,...extra}));
  }
  // Preserve descriptors to verify that an actual accessor is rejected before reading.
  const raw={operation:'recall',durationMs:1,success:true};Object.defineProperty(raw,'inputTokens',{enumerable:true,get(){calls++;return 1;}});
  assert.throws(()=>meter.record(raw));assert.equal(calls,0);assert.deepEqual(meter.summary(),before);
  for(const capacity of [0,1025,1.5,NaN])assert.throws(()=>createMemoryMetrics({capacity}));
});
test('paired trials compare only matching case IDs and report unknown measurements',()=>{
  const report=compareMemoryTrials([
    {caseIndex:1,mode:'enabled',durationMs:15,success:true,inputTokens:10,outputTokens:5},
    {caseIndex:1,mode:'disabled',durationMs:20,success:false,inputTokens:20},
    {caseIndex:2,mode:'enabled',durationMs:1,success:true},
  ]);
  assert.equal(report.pairs.length,1);assert.equal(report.pairs[0].delta.durationMs,-5);assert.equal(report.pairs[0].delta.inputTokens,-10);assert.equal(report.pairs[0].delta.outputTokens,null);
  assert.deepEqual(report.unpaired,[{caseIndex:2,missing:'disabled'}]);assert.equal(report.summary.enabledSuccess,1);assert.equal(report.summary.disabledSuccess,0);assert.equal(report.evidenceVerified,false);
});
test('trial duplicates, bodies, accessor arrays and excessive rows fail rather than invent comparisons',()=>{
  const row={caseIndex:1,mode:'enabled',durationMs:1,success:true};
  assert.throws(()=>compareMemoryTrials([row,row]),/duplicate/);assert.throws(()=>compareMemoryTrials([{...row,task:'private'}]));
  assert.throws(()=>compareMemoryTrials(new Array(257).fill(row)));let calls=0;const rows=[];Object.defineProperty(rows,'0',{enumerable:true,get(){calls++;return row;}});
  assert.throws(()=>compareMemoryTrials(rows));assert.equal(calls,0);assert.equal(compareMemoryTrials([row]).summary.meanDurationDeltaMs,null);
});
