// The extractor is an offline fixture. Replace it with your host model/rule function if needed.
import {PersonaMemory} from '../src/index.js';
import {createMemoryLearner} from '../adapters/learning/index.js';
const pm=new PersonaMemory(),project={type:'project',id:'example'};
const learner=createMemoryLearner(pm,{subject:project,kinds:['constraint']});
const result=await learner.extract({eventId:'user-request-1',text:'Only release after all checks pass'},
  ()=>[{subject:project,kind:'constraint',key:'release',value:'after complete checks',reason:'Explicit host-provided request'}]);
console.log('Before review:',pm.searchMemories({subject:project}).matches.length);
const candidate=result.candidates[0];
console.log('Review:',candidate.id,candidate.memory.value,candidate.base);
const accepted=pm.acceptCandidate(candidate.id,{expectedRevision:candidate.revision});
console.log('Accepted:',accepted.record.value);
pm.recordExperience({subject:project,key:'offline-check',task:'Validate integration',attempt:'Run offline package replay',
  result:'Passed the synthetic cases in this run',conditions:['offline synthetic fixtures'],outcome:'success',verified:true,evidenceId:'synthetic-report'});
console.log('Applicable host reports:',pm.listExperiences({subject:project,verifiedOnly:true}).map(record=>record.value));
