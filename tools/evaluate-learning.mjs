// Synthetic continuity checks, not an extractor accuracy or live model benchmark.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {PersonaMemory} from '../src/index.js';
import {createMemoryLearner} from '../adapters/learning/index.js';
export async function evaluateLearning(){
  let checks=0;const cases=[];
  const check=(condition,label)=>{checks++;if(!condition)throw new Error(label);};
  const fails=(fn,code)=>{try{fn();return false;}catch(error){return error.code===code;}};
  const scenario=async(name,run)=>{await run();cases.push({name,passed:true});};
  await scenario('personal: propose, accept, restore, correct and reject stale update',async()=>{
    let now=1000;const subject={type:'user',id:'synthetic-user'},pm=new PersonaMemory({clock:()=>now});
    const result=await createMemoryLearner(pm,{subject,kinds:['preference']}).extract({eventId:'format-request',text:'synthetic input'},
      ()=>[{subject,kind:'preference',key:'format',value:'short',confidence:0.8}]);
    check(pm.searchMemories({subject}).matches.length===0,'unreviewed preference leaked');
    const accepted=pm.acceptCandidate(result.candidates[0].id,{expectedRevision:1});
    const restored=new PersonaMemory({clock:()=>now});restored.import(pm.export());
    check(restored.getMemory(accepted.record.id).value==='short','cross-session value lost');
    const stale=restored.proposeMemory({memory:{subject,kind:'preference',key:'format',value:'guess',evidenceId:'old-model'}});
    now=2000;restored.putMemory({subject,kind:'preference',key:'format',value:'detailed',source:'user',evidenceId:'correction',replaceId:accepted.record.id});
    check(fails(()=>restored.acceptCandidate(stale.id,{expectedRevision:1}),'ERR_CANDIDATE_CONFLICT'),'old candidate overwrote correction');
    check(restored.searchMemories({subject,query:'format'}).matches[0].record.value==='detailed','corrected preference missing');
    check(restored.searchMemories({subject:{type:'user',id:'other'},query:'format'}).matches.length===0,'user boundary crossed');
  });
  await scenario('project: scoped policy, rejected claim and unanswered query',async()=>{
    const subject={type:'project',id:'synthetic-project'},pm=new PersonaMemory({clock:()=>1000});
    const candidate=pm.proposeMemory({memory:{subject,kind:'constraint',key:'release',value:'after complete checks',evidenceId:'plan'}});
    check(pm.buildMemoryContext({subject,budget:4000}).text==='','candidate entered prompt');
    pm.rejectCandidate(candidate.id,{expectedRevision:1,reason:'host has not confirmed'});
    check(pm.proposeMemory({memory:candidate.memory}).status==='rejected','repeat bypassed rejection');
    check(pm.diagnostics().candidates===1,'repeat grew candidate pool');
    pm.putMemory({subject,kind:'constraint',key:'release',value:'1.0 after checks',source:'host'});
    check(pm.searchMemories({subject,query:'unicorn'}).matches.length===0,'unanswered query filled unrelated record');
    check(pm.searchMemories({subject:{...subject,id:'other'},query:'release'}).matches.length===0,'project boundary crossed');
  });
  await scenario('temporal: temporary evidence expires and scheduled values switch at the boundary',async()=>{
    let now=1000;const subject={type:'user',id:'temporary'},pm=new PersonaMemory({clock:()=>now,config:{stateMemoryTtlHours:1}});
    const candidate=pm.proposeMemory({memory:{subject,kind:'state',key:'mood',value:'tired',evidenceId:'observation'}});
    now=candidate.expiresAt;
    check(fails(()=>pm.acceptCandidate(candidate.id,{expectedRevision:1}),'ERR_CANDIDATE_CONFLICT'),'expired state accepted');
    check(pm.maintain().candidatesExpired===1,'expired candidate not removed');
    const old=pm.putMemory({id:'old',subject,kind:'fact',key:'channel',value:'preview'});
    pm.putMemory({id:'future',subject,kind:'fact',key:'channel',value:'stable',validFrom:now+1000,replaceId:old.id});
    check(pm.listMemories({subject})[0].id==='old','future value activated early');
    now+=1000;check(pm.listMemories({subject})[0].id==='future','scheduled value missed boundary');
  });
  await scenario('task experience: report, verify, correct and preserve applicability',async()=>{
    let now=1000;const subject={type:'task',id:'synthetic-task'},pm=new PersonaMemory({clock:()=>now});
    const common={subject,key:'method',task:'check package',attempt:'offline replay',result:'passed selected cases',outcome:'success',conditions:['synthetic local inputs']};
    const old=pm.recordExperience(common);
    check(pm.listExperiences({subject,verifiedOnly:true}).length===0,'reported outcome treated as verified');
    now=2000;const corrected=pm.recordExperience({...common,outcome:'failure',result:'later case exposed an error',verified:true,evidenceId:'host-report',replaceId:old.id});
    check(pm.listExperiences({subject,verifiedOnly:true,outcome:'failure'})[0].id===corrected.id,'verified correction missing');
    check(pm.listExperiences({subject,outcome:'success'}).length===0,'old experience revived');
    check(corrected.value.conditions[0]==='synthetic local inputs','applicability lost');
    const copy=new PersonaMemory({clock:()=>now});copy.import(pm.export());
    check(copy.listExperiences({subject})[0].experience.verified===true,'experience verification lost on restore');
  });
  return {dataset:'synthetic-learning-continuity-v1',scenarios:cases.length,passed:cases.filter(item=>item.passed).length,checks,cases,
    limits:'Deterministic synthetic host/extractor fixtures only. No live model extraction accuracy, general semantic understanding, production answer quality or LongMemEval score.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const result=await evaluateLearning(),dir=path.resolve('.artifacts');fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'learning-evaluation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
