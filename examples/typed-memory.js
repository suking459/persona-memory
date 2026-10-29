import assert from 'node:assert/strict';
import {PersonaMemory} from '../src/index.js';

let now=Date.UTC(2026,0,1);
const pm=new PersonaMemory({scope:'example',clock:()=>now});
const owner={type:'user',id:'owner'};
const project={type:'project',id:'example-project'};
const lesson={type:'task',id:'fractions-lesson'};

pm.putMemory({subject:owner,kind:'preference',key:'reply-format',
  value:{language:'zh',length:'short'},source:'user',evidenceId:'explicit-preference'});
const release=pm.putMemory({id:'release-instruction-1',subject:project,kind:'constraint',key:'release',
  value:{target:'1.0',requires:['tests','migration']},source:'user'});
pm.putMemory({subject:lesson,kind:'decision',key:'next-step',
  value:{practice:'fractions',then:'equations'},source:'host'});
const fatigue=pm.putMemory({subject:owner,kind:'state',key:'energy',value:'tired',source:'user'});

// A stable caller ID can safely retry the same write.
assert.equal(pm.putMemory({id:release.id,subject:project,kind:'constraint',key:'release',
  value:{target:'1.0',requires:['tests','migration']},source:'user'}).id,release.id);

// Explicitly refer to the old record when a requirement really changes.
now++;
const revised=pm.putMemory({subject:project,kind:'constraint',key:'release',replaceId:release.id,
  value:{target:'1.0',requires:['tests','migration','clean-install']},source:'user'});

const restored=new PersonaMemory({scope:'example',clock:()=>now});
restored.import(pm.export());
now+=3*86400000;
assert.equal(restored.getMemory(fatigue.id),null);
assert.ok(restored.getMemory(revised.id));
assert.equal(restored.listMemories({subject:owner,kind:'preference'}).length,1);
assert.equal(restored.listMemories({subject:lesson}).length,1);
assert.equal(restored.diagnostics().profiles,0);

console.log(JSON.stringify({
  projectRequirements:restored.listMemories({subject:project}),
  userPreferences:restored.listMemories({subject:owner,kind:'preference'}),
  learningPlan:restored.listMemories({subject:lesson}),
  expiredTemporaryState:restored.getMemory(fatigue.id)===null,
  socialProfilesCreated:restored.diagnostics().profiles,
},null,2));
