import test from 'node:test';
import assert from 'node:assert/strict';
import {PersonaMemory,proposeExperience,proposeExperienceFeedback,proposeExperienceRetirement,reuseExperiences} from '../src/index.js';
const subject={type:'project',id:'経験'},other={type:'project',id:'private'};
const input=(extra={})=>({subject,key:'method',task:'检查发布 / release',attempt:'Run isolated tests',result:'Reported success',conditions:['Linux'],outcome:'success',evidenceId:'run-1',...extra});
const accept=(pm,c)=>pm.acceptCandidate(c.id,{expectedRevision:c.revision}).record;
const setup=(extra={})=>{let now=1000;const pm=new PersonaMemory({clock:()=>now});const record=pm.recordExperience(input(extra));return {pm,record,tick:()=>now+=1000};};
const feedback=(pm,record,extra={})=>accept(pm,proposeExperienceFeedback(pm,{subject,id:record.id,expectedRevision:record.revision,trialId:'trial-1',evidenceId:'evidence-1',outcome:'helped',conditions:['Linux'],...extra}));
const reuse=pm=>reuseExperiences(pm,{subject,conditions:['Linux']});

test('experience proposals remain pending and approval does not verify model reports',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),c=proposeExperience(pm,input());
  assert.equal(pm.listExperiences({subject}).length,0);const record=accept(pm,c);
  assert.equal(record.source,'model');assert.equal(record.experience.verified,false);
  assert.deepEqual(reuse(pm).items[0].reasons,['no-confirmed-success']);
  const restored=new PersonaMemory({clock:()=>1000});restored.import(pm.export());assert.deepEqual(reuse(restored),reuse(pm));
});
test('model verification is rejected atomically while explicit host evidence is allowed',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),before=pm.export();
  assert.throws(()=>proposeExperience(pm,input({verified:true})));assert.deepEqual(pm.export(),before);
  accept(pm,proposeExperience(pm,input({source:'host',verified:true})));
  assert.equal(reuse(pm).items[0].status,'eligible');assert.equal(reuse(pm).evidenceVerified,false);
});
test('revising verified candidate content removes its original verification assertion',()=>{
  const pm=new PersonaMemory({clock:()=>1000}),c=proposeExperience(pm,input({source:'host',verified:true}));
  const revised=pm.reviseCandidate(c.id,{expectedRevision:1,memory:{value:{...c.memory.value,result:'Different result'}}});
  assert.equal(accept(pm,revised).experience.verified,false);
});
test('reported feedback is not proof and owner attestation is exact-context only',()=>{
  const {pm,record}=setup();feedback(pm,record);
  assert.equal(reuse(pm).items[0].feedback.reported,1);assert.equal(reuse(pm).items[0].status,'needs-review');
  feedback(pm,record,{verification:'owner-attested'});
  const item=reuse(pm).items[0];assert.equal(item.feedback.helped,1);assert.equal(item.feedback.reported,0);assert.equal(item.status,'eligible');
  assert.equal(reuseExperiences(pm,{subject,conditions:['Linux','ARM']}).items[0].status,'needs-review');
  assert.equal(reuseExperiences(pm,{subject,conditions:['Windows']}).items[0].reasons.includes('conditions-missing'),true);
});
test('trial and evidence aliases cannot inflate feedback, including transitive collisions',()=>{
  const {pm,record}=setup();
  for(const [trialId,evidenceId] of [['a','one'],['b','one'],['b','two'],['c','two']])feedback(pm,record,{trialId,evidenceId,verification:'owner-attested'});
  assert.equal(reuse(pm).items[0].feedback.helped,1);
  const c=proposeExperienceFeedback(pm,{subject,id:record.id,expectedRevision:1,trialId:'a',evidenceId:'one',outcome:'helped',conditions:['Linux'],verification:'owner-attested'});
  assert.equal(c.status,'accepted');assert.equal(reuse(pm).items[0].feedback.helped,1);
});
test('conflicting attestation and independent negative evidence require contextual review',()=>{
  const {pm,record}=setup({verified:true});feedback(pm,record,{verification:'owner-attested'});
  feedback(pm,record,{verification:'owner-attested',trialId:'alias',outcome:'failed'});
  assert.equal(reuse(pm).items[0].feedback.conflicting,1);assert.equal(reuse(pm).items[0].status,'needs-review');
  feedback(pm,record,{verification:'owner-attested',trialId:'separate',evidenceId:'second',outcome:'not-helpful'});
  assert.equal(reuse(pm).items[0].feedback.negative,1);
  assert.equal(reuseExperiences(pm,{subject,conditions:['Linux','different']}).items[0].status,'eligible');
});
test('forged owner labels through generic model proposals do not become attestation',()=>{
  const {pm,record}=setup(),c=proposeExperienceFeedback(pm,{subject,id:record.id,expectedRevision:1,trialId:'forgery',outcome:'helped',evidenceId:'claim',conditions:['Linux'],verification:'owner-attested'});
  pm.rejectCandidate(c.id,{expectedRevision:1});
  const forged=pm.proposeMemory({memory:{...c.memory,source:'model'}});accept(pm,forged);
  const item=reuse(pm).items[0];assert.equal(item.feedback.helped,0);assert.equal(item.feedback.invalid,1);assert.equal(item.status,'needs-review');
});
test('feedback requires an available exact same-scope experience revision',()=>{
  const {pm,record}=setup(),before=pm.export();
  for(const extra of [{subject:other},{expectedRevision:2},{evidenceId:''},{outcome:'great'},{conditions:new Array(17).fill('x')}]){
    assert.throws(()=>proposeExperienceFeedback(pm,{subject,id:record.id,expectedRevision:1,trialId:'trial',evidenceId:'e',outcome:'helped',...extra}));assert.deepEqual(pm.export(),before);
  }
});
test('correction invalidates old success feedback and does not inherit verification',()=>{
  const {pm,record,tick}=setup();feedback(pm,record,{verification:'owner-attested'});tick();
  const replacement=pm.recordExperience(input({replaceId:record.id,expectedRevision:1,result:'Revised method'}));
  assert.equal(pm.getMemory(pm.listMemories({subject,includeInactive:true}).find(r=>r.value?.format==='persona-memory/experience-feedback').id),null);
  assert.equal(reuse(pm).items[0].experience.id,replacement.id);assert.equal(reuse(pm).items[0].feedback.helped,0);
});
test('retirement is pending until review, then disappears from generic recall and context',()=>{
  const {pm,record,tick}=setup({verified:true});feedback(pm,record,{verification:'owner-attested'});tick();
  const c=proposeExperienceRetirement(pm,{subject,id:record.id,expectedRevision:1,evidenceId:'retirement-decision',reason:'Needs redesign'});
  assert.equal(reuse(pm).items.length,1);const retired=accept(pm,c);
  assert.equal(retired.experience.retired,true);assert.equal(pm.listMemories({subject}).length,0);
  assert.equal(pm.searchMemories({subject,query:'release'}).matches.length,0);
  assert.equal(pm.buildMemoryContext({subject,budget:5000}).text.includes('Run isolated tests'),false);
  assert.equal(pm.listExperiences({subject,includeInactive:true}).length,2);
  const restored=new PersonaMemory({clock:()=>3000});restored.import(pm.export());assert.equal(reuse(restored).items.length,0);
  tick();const reinstated=accept(pm,proposeExperienceRetirement(pm,{subject,id:retired.id,expectedRevision:2,evidenceId:'reopen',reason:'New investigation',retired:false}));
  assert.equal(reinstated.experience.verified,false);assert.equal(reuse(pm).items[0].status,'needs-review');assert.equal(reuse(pm).items[0].feedback.helped,0);
});
test('retirement cannot change a stale head or silently revive an expired experience',()=>{
  const {pm,record,tick}=setup({expiresAt:2000});tick();const before=pm.export();
  assert.throws(()=>proposeExperienceRetirement(pm,{subject,id:record.id,expectedRevision:1,evidenceId:'e',reason:'late'}));assert.deepEqual(pm.export(),before);
});
test('schema headers cannot downgrade model experience, candidate metadata or lifecycle',()=>{
  for(const scenario of ['model','candidate','retired']){
    const {pm,record,tick}=setup();
    if(scenario==='model')accept(pm,proposeExperience(pm,input({key:'model'})));
    if(scenario==='candidate')proposeExperience(pm,input({key:'candidate'}));
    if(scenario==='retired'){tick();accept(pm,proposeExperienceRetirement(pm,{subject,id:record.id,expectedRevision:1,evidenceId:'e',reason:'obsolete'}));}
    const snapshot=pm.export();snapshot.schemaVersion=7;
    assert.throws(()=>new PersonaMemory({clock:()=>3000}).import(snapshot),/schemaVersion=8/);
  }
});
test('feedback dependencies survive backup-compatible reload and are refused by selective transfer',()=>{
  const {pm,record}=setup();feedback(pm,record,{verification:'owner-attested'});
  const restored=new PersonaMemory({clock:()=>1000});restored.import(pm.export());assert.deepEqual(reuse(restored),reuse(pm));
  assert.throws(()=>pm.exportMemories({subject}),/derived|dependen/i);
  pm.forgetMemory(record.id);assert.equal(pm.listMemories({subject,includeInactive:true}).length,0);
});
test('bounded candidate scan never claims success when experiences were omitted',()=>{
  const {pm}=setup({verified:true});for(let i=0;i<32;i++)pm.recordExperience(input({key:'extra-'+i,verified:true}));
  const result=reuse(pm);assert.equal(result.scanCapped,true);assert.ok(result.items.every(i=>i.status==='needs-review'));
  assert.deepEqual(reuseExperiences(pm,{subject,conditions:['Linux'],includeNeedsReview:false}).items,[]);
});
test('verified adverse host outcome is not overridden by a later positive feedback label',()=>{
  const {pm,record}=setup({outcome:'failure',verified:true});feedback(pm,record,{verification:'owner-attested'});
  assert.ok(reuse(pm).items[0].reasons.includes('verified-adverse-outcome'));
});
test('feedback expiry removes its support, read-only reuse does not mutate state',()=>{
  const {pm,record,tick}=setup({expiresAt:2000});feedback(pm,record,{verification:'owner-attested'});
  const before=pm.export();reuse(pm);assert.deepEqual(pm.export(),before);tick();assert.equal(reuse(pm).items.length,0);
});
test('a full feedback scan fails closed instead of missing omitted counterexamples',()=>{
  const {pm}=setup({verified:true});
  for(let i=0;i<999;i++)pm.putMemory({subject,kind:'episode',key:'noise-'+i,value:'synthetic',source:'model'});
  const result=reuse(pm);assert.equal(result.scanCapped,true);assert.equal(result.items[0].status,'needs-review');
});
test('retirement preserves past validity while preventing current selective export',()=>{
  const {pm,record,tick}=setup({verified:true});tick();accept(pm,proposeExperienceRetirement(pm,{subject,id:record.id,expectedRevision:1,evidenceId:'decision',reason:'Stop reuse'}));
  assert.equal(pm.getMemoryAt({subject,kind:'episode',key:'method',at:1500}).id,record.id);
  assert.equal(pm.exportMemories({subject}).records.length,0);
});
