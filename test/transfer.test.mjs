import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
const from={type:'project',id:'source'},to={type:'project',id:'target'},other={type:'user',id:'private'};
const mapping={mappings:[{from,to}]};
const create=(config={})=>new PersonaMemory({clock:()=>2000,config});
const put=(pm,input={})=>pm.putMemory({id:'a',subject:from,kind:'constraint',key:'release',value:'after checks',...input});
function bundle(){const pm=create();put(pm);return pm.exportMemories({subject:from});}
test('portable export contains only explicitly selected effective values, without social state or history',()=>{
  const pm=create();put(pm);put(pm,{id:'p',subject:other,value:'private'});put(pm,{id:'future',validFrom:3000,value:'future',replaceId:'a'});
  const before=pm.export(),data=pm.exportMemories({subject:from,kinds:['constraint']});
  assert.equal(data.format,'persona-memory/records');assert.deepEqual(data.records.map(record=>record.id),['a']);
  assert.ok(!JSON.stringify(data).includes('private'));assert.ok(!Object.hasOwn(data.records[0],'supersededBy'));
  assert.deepEqual(pm.export(),before);data.records[0].value='mutated';assert.equal(pm.getMemory('a').value,'after checks');
});
test('preview requires exact explicit subject mapping and is pure until an atomic apply',()=>{
  const pm=create(),data=bundle(),before=pm.export();
  assert.throws(()=>pm.previewMemoryImport(data,{mappings:[]}));assert.deepEqual(pm.export(),before);
  const preview=pm.previewMemoryImport(data,mapping);assert.deepEqual(pm.export(),before);
  assert.deepEqual(preview.counts,{add:1,same:0,update:0,conflict:0});
  preview.rows[0].incoming='tamper';
  const result=pm.applyMemoryImport(preview.planId);assert.equal(result.added,1);
  assert.equal(pm.listMemories({subject:to})[0].value,'after checks');assert.equal(pm.listMemories({subject:from}).length,0);
});
test('an identical repeat is unchanged, and a replaced imported version cannot overwrite a later correction',()=>{
  const pm=create(),data=bundle();pm.applyMemoryImport(pm.previewMemoryImport(data,mapping).planId);
  const before=pm.export(),repeat=pm.previewMemoryImport(data,mapping);
  assert.equal(repeat.counts.same,1);assert.equal(pm.applyMemoryImport(repeat.planId).unchanged,1);assert.deepEqual(pm.export(),before);
  const old=pm.listMemories({subject:to})[0];put(pm,{id:'corrected',subject:to,value:'host correction',replaceId:old.id});
  const stale=pm.previewMemoryImport(data,mapping);assert.equal(stale.counts.conflict,1);
  assert.equal(stale.rows[0].reason,'previously-imported-version-changed');
  assert.throws(()=>pm.applyMemoryImport(stale.planId,{allowUpdates:true}),{code:'ERR_MEMORY_CONFLICT'});
  assert.equal(pm.getMemory('corrected').value,'host correction');
});
test('updates need an explicit apply option, and a failed apply can be reviewed and retried',()=>{
  const pm=create();put(pm,{id:'target-old',subject:to,value:'different'});
  const preview=pm.previewMemoryImport(bundle(),mapping),before=pm.export();
  assert.equal(preview.counts.update,1);assert.equal(preview.rows[0].current,'different');
  assert.throws(()=>pm.applyMemoryImport(preview.planId),{code:'ERR_MEMORY_CONFLICT'});assert.deepEqual(pm.export(),before);
  assert.equal(pm.applyMemoryImport(preview.planId,{allowUpdates:true}).updated,1);
  assert.equal(pm.listMemories({subject:to})[0].value,'after checks');
});
test('one conflicting mapped slot prevents unrelated additions in the same import',()=>{
  const source=create();put(source);put(source,{id:'b',subject:other,value:'other'});
  const data=source.exportMemories({subjects:[from,other]}),pm=create();
  const preview=pm.previewMemoryImport(data,{mappings:[{from,to},{from:other,to}]});
  assert.equal(preview.counts.conflict,1);const before=pm.export();
  assert.throws(()=>pm.applyMemoryImport(preview.planId,{allowUpdates:true}),{code:'ERR_MEMORY_CONFLICT'});assert.deepEqual(pm.export(),before);
});
test('capacity failure in a later row leaves earlier rows uncommitted',()=>{
  const source=create();put(source);put(source,{id:'b',key:'second'});
  const target=create({maxMemories:1}),preview=target.previewMemoryImport(source.exportMemories({subject:from}),mapping);
  const before=target.export();assert.throws(()=>target.applyMemoryImport(preview.planId),{code:'ERR_MEMORY_CAPACITY'});
  assert.deepEqual(target.export(),before);assert.equal(target.diagnostics().memories,0);
});
test('changed data, expired credentials and import/reset invalidate preview plans',()=>{
  let now=2000;const pm=new PersonaMemory({clock:()=>now});const data=bundle();
  let plan=pm.previewMemoryImport(data,mapping);put(pm,{id:'other',subject:other});
  assert.throws(()=>pm.applyMemoryImport(plan.planId),{code:'ERR_MEMORY_CONFLICT'});
  plan=pm.previewMemoryImport(data,mapping);now+=600001;
  assert.throws(()=>pm.applyMemoryImport(plan.planId),{code:'ERR_MEMORY_CONFLICT'});
  plan=pm.previewMemoryImport(data,mapping);pm.import(pm.export());
  assert.throws(()=>pm.applyMemoryImport(plan.planId),{code:'ERR_MEMORY_CONFLICT'});
});
test('expired or scheduled imports remain conflicts, and old effective values cannot overwrite a newer interval',()=>{
  const target=create();
  for(const data of [{...bundle(),records:bundle().records.map(record=>({...record,expiresAt:2000}))},
    {...bundle(),records:bundle().records.map(record=>({...record,validFrom:3000}))}]){
    const preview=target.previewMemoryImport(data,mapping);assert.equal(preview.counts.conflict,1);
    assert.throws(()=>target.applyMemoryImport(preview.planId,{allowUpdates:true}));
  }
  put(target,{subject:to,validFrom:2500});const preview=target.previewMemoryImport(bundle(),mapping);
  assert.equal(preview.rows[0].reason,'scheduled-target');
});
test('malformed bundles, unknown fields, repeated IDs, prototype subjects and missing metadata fail purely',()=>{
  const pm=create(),before=pm.export();
  const bads=[{...bundle(),version:2},{...bundle(),extra:true},
    {...bundle(),records:[...bundle().records,...bundle().records]},
    {...bundle(),records:bundle().records.map(record=>({...record,subject:{type:'project',id:'__proto__'}}))},
    {...bundle(),records:bundle().records.map(record=>{const next={...record};delete next.source;return next;})}];
  for(const bad of bads){assert.throws(()=>pm.previewMemoryImport(bad,mapping));assert.deepEqual(pm.export(),before);}
});
test('private import credentials stay bounded and deletion clears plans holding removed subject values',()=>{
  const pm=create(),data=bundle();for(let i=0;i<150;i++)pm.previewMemoryImport(data,mapping);
  assert.equal(pm._imports.size,128);pm.deleteSubject(to);assert.equal(pm._imports.size,0);
});
