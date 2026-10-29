import {PersonaMemory} from '../../src/index.js';
import {createMemoryLearner} from '../../adapters/learning/index.js';
const subject={type:'task',id:'bounded'},pm=new PersonaMemory({clock:()=>1000,config:{maxCandidates:64}}),
  learner=createMemoryLearner(pm,{subject,timeoutMs:15});
const input={eventId:'recursive',text:'data'};
let timedOut=false;
try{await learner.extract(input,()=>learner.extract(input,()=>[]));}catch(error){timedOut=error.code==='ERR_TURN_TIMEOUT';}
if(!timedOut||pm.diagnostics().candidates)throw new Error('recursive extraction escaped its deadline');
for(let i=0;i<64;i++)pm.proposeMemory({memory:{subject,kind:'fact',key:'k'+i,value:i,evidenceId:'e'+i}});
for(let i=0;i<500;i++)pm.proposeMemory({memory:{subject,kind:'fact',key:'k0',value:0,evidenceId:'e0'}});
let capacity=false;try{pm.proposeMemory({memory:{subject,kind:'fact',key:'overflow',value:1,evidenceId:'overflow'}});}catch(error){capacity=error.code==='ERR_MEMORY_CAPACITY';}
if(!capacity||pm.diagnostics().candidates!==64)throw new Error('candidate pool grew beyond capacity');
console.log(JSON.stringify({recursiveTimeout:true,boundedCandidates:64,pureRetries:500}));
