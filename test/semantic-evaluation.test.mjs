import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {evaluateSemantic,oracleEmbeddingFixture,semanticEvaluationCommand} from '../tools/evaluate-semantic.mjs';
test('oracle evaluation is explicitly labeled as orchestration, not model quality',async()=>{
  const report=await evaluateSemantic({embed:oracleEmbeddingFixture(),mode:'oracle-fixture'});
  assert.equal(report.cases,13);assert.equal(report.passed,13);assert.equal(report.fallbacks,0);assert.match(report.limits,/Not measured model quality/);
});
test('provider failures are recorded separately from any lexical answers and never claimed as successful semantic evaluation',async()=>{
  const report=await evaluateSemantic({embed:()=>{throw null;}});
  assert.equal(report.fallbacks,13);assert.equal(report.results.every(x=>x.mode==='fallback'),true);assert.match(report.limits,/Small synthetic/);
});
test('evaluation requires an explicit fixture or service, and an existing output is refused before provider work',async t=>{
  await assert.rejects(semanticEvaluationCommand([]),/explicitly set/);await assert.rejects(semanticEvaluationCommand(['--fixture','--provider','ollama']),/choose fixture/);
  const base=fileURLToPath(new URL('../.artifacts/',import.meta.url));fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'semantic-eval-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});
  const file=path.join(dir,'existing.json');fs.writeFileSync(file,'keep');await assert.rejects(semanticEvaluationCommand(['--fixture','--out',file]),{code:'EEXIST'});assert.equal(fs.readFileSync(file,'utf8'),'keep');
  const report=await semanticEvaluationCommand(['--fixture','--out',path.join(dir,'new.json')]);assert.equal(report.mode,'oracle-fixture');assert.equal(report.passed,13);
});
