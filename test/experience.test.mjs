import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';
const subject={type:'task',id:'deploy'};
const input=(extra={})=>({subject,key:'method',task:'Validate release',context:{environment:'local'},
  attempt:'Run isolated replay',result:'No failure in the reported replay',conditions:['local synthetic data'],outcome:'success',...extra});
test('host reports preserve context, attempt, outcome and applicability without universalizing success',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),record=pm.recordExperience(input());
  assert.equal(record.kind,'episode');assert.equal(record.source,'host');assert.equal(record.experience.verified,false);
  assert.deepEqual(record.value.conditions,['local synthetic data']);assert.equal(pm.listExperiences({subject,verifiedOnly:true}).length,0);
  assert.equal(pm.listExperiences({subject,outcome:'success'})[0].id,record.id);
});
test('verified outcomes require explicit host assertion and evidence, and are shown in model context',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),before=pm.export();
  assert.throws(()=>pm.recordExperience(input({verified:true})));assert.deepEqual(pm.export(),before);
  const record=pm.recordExperience(input({verified:true,evidenceId:'run-report-1'}));
  assert.equal(pm.listExperiences({subject,verifiedOnly:true})[0].id,record.id);
  const context=pm.buildMemoryContext({subject,budget:5000});assert.ok(context.text.includes('"experience":{"outcome":"success","verified":true}'));
  const restored=new PersonaMemory({clock:()=>1000});restored.import(pm.export());assert.deepEqual(restored.listExperiences({subject}),pm.listExperiences({subject}));
});
test('arbitrary episode text claiming verification never acquires host metadata',()=>{
  const pm=new PersonaMemory({clock:()=>1000});
  const candidate=pm.proposeMemory({memory:{subject,kind:'episode',key:'claim',value:{verified:true,outcome:'success'},source:'model',evidenceId:'model-claim'}});
  pm.acceptCandidate(candidate.id,{expectedRevision:1});assert.deepEqual(pm.listExperiences({subject}),[]);
  assert.throws(()=>pm.putMemory({subject,kind:'episode',key:'forged',value:'claim',source:'model',experience:{verified:true,outcome:'success'}}));
});
test('host correction, current-value filtering and expiry apply to experiences like other typed records',()=>{
  let now=1000;const pm=new PersonaMemory({clock:()=>now}),old=pm.recordExperience(input({id:'old',verified:true,evidenceId:'first'}));
  now=2000;const revised=pm.recordExperience(input({id:'new',replaceId:old.id,expectedRevision:1,outcome:'failure',verified:true,evidenceId:'correction',result:'A later replay exposed a bug',expiresAt:3000}));
  assert.equal(pm.listExperiences({subject})[0].id,revised.id);assert.equal(pm.listExperiences({subject,outcome:'success'}).length,0);
  now=3000;assert.equal(pm.listExperiences({subject}).length,0);pm.maintain();pm.forgetMemory(old.id);assert.equal(pm.listExperiences({subject,includeInactive:true}).length,0);
});
test('portable transfer carries experience text without transferring host verification authority',()=>{
  const source=new PersonaMemory({clock:()=>1000}),record=source.recordExperience(input({verified:true,evidenceId:'report'}));
  const bundle=source.exportMemories({subject}),target=new PersonaMemory({clock:()=>1000});
  const plan=target.previewMemoryImport(bundle,{mappings:[{from:subject,to:subject}]});target.applyMemoryImport(plan.planId);
  assert.equal(target.listMemories({subject})[0].value.task,record.value.task);assert.deepEqual(target.listExperiences({subject,verifiedOnly:true}),[]);
});
test('malformed experience reports fail before any state change',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),before=pm.export();
  for(const extra of [{outcome:'unknown',verified:true,evidenceId:'run'},{conditions:new Array(17).fill('x')},{attempt:''},{task:'x'.repeat(2001)},{verified:'yes'}]){
    assert.throws(()=>pm.recordExperience(input(extra)));assert.deepEqual(pm.export(),before);
  }
});
