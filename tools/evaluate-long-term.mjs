// Independent synthetic lifecycle evaluation, informed by the cited research categories.
// No external benchmark data, model judge, embedding oracle or provider call is used.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {PersonaMemory,MemorySnapshotStore} from '../src/index.js';
import {memoryHeader} from '../src/locale.js';
import {VERSION} from '../src/version.js';

const fixtureURL=new URL('./fixtures/long-term-cases.json',import.meta.url);
const clone=value=>JSON.parse(JSON.stringify(value));
function ids(values,label){
  if(!Array.isArray(values)||values.length>64||values.some(x=>typeof x!=='string'||!x||x.length>256)||new Set(values).size!==values.length)throw new TypeError('invalid '+label);
  return values;
}
export function scoreEvidence(expected,actual,forbidden=[]){
  const gold=new Set(ids(expected,'expected ids')),found=new Set(ids(actual,'actual ids'));ids(forbidden,'forbidden ids');
  if(forbidden.some(id=>gold.has(id)))throw new TypeError('expected and forbidden evidence overlap');
  const truePositive=[...found].filter(id=>gold.has(id)).length;
  const falsePositive=found.size-truePositive,falseNegative=gold.size-truePositive;
  return {truePositive,falsePositive,falseNegative,precision:found.size?truePositive/found.size:null,
    recall:gold.size?truePositive/gold.size:null,complete:gold.size?falseNegative===0:null,
    exact:falsePositive===0&&falseNegative===0,abstained:found.size===0,
    forbiddenHits:[...found].filter(id=>forbidden.includes(id))};
}
function renderedIds(text,locale){
  if(typeof text!=='string'||Array.from(text).length>16000)throw new TypeError('invalid rendered context');
  if(!text)return [];
  const lines=text.split('\n');
  if(lines[0]!==memoryHeader(locale))throw new TypeError('missing data-only context header');
  return ids(lines.slice(1).map(line=>{
    if(!line.startsWith('- '))throw new TypeError('invalid rendered record');
    return JSON.parse(line.slice(2)).id;
  }),'rendered ids');
}
function retrieve({pm,options,budget,task}){
  const {limit,...contextOptions}=options;
  const settings={...contextOptions,budget,maxRecords:limit??8};
  const context=task?pm.buildTaskMemoryContext({...settings,...task}):pm.buildMemoryContext(settings);
  const fromText=renderedIds(context.text,options.locale),references=context.records.map(hit=>hit.record.id);
  if(JSON.stringify(fromText)!==JSON.stringify(references))throw new Error('rendered evidence differs from context references');
  const searchIds=task?context.taskSelection.candidateIds:pm.searchMemories(options).matches.map(hit=>hit.record.id);
  return {searchIds,text:context.text};
}
function aggregate(rows,key){
  const values=rows.map(row=>row[key]),sum=k=>values.reduce((n,v)=>n+v[k],0),positive=values.filter(v=>v.complete!==null),empty=values.filter(v=>v.recall===null);
  const tp=sum('truePositive'),fp=sum('falsePositive'),fn=sum('falseNegative');
  return {truePositive:tp,falsePositive:fp,falseNegative:fn,precision:tp+fp?tp/(tp+fp):null,recall:tp+fn?tp/(tp+fn):null,
    evidenceSetComplete:positive.filter(v=>v.complete).length,evidenceSetQuestions:positive.length,
    evidenceSetRate:positive.length?positive.filter(v=>v.complete).length/positive.length:null,
    emptyGoldQuestions:empty.length,correctAbstentions:empty.filter(v=>v.abstained).length,
    forbiddenHits:values.reduce((n,v)=>n+v.forbiddenHits.length,0)};
}
export async function evaluateLongTermMemory({fixture=JSON.parse(fs.readFileSync(fixtureURL,'utf8')),reader=retrieve,taskAware=false}={}){
  if(typeof reader!=='function'||!Array.isArray(fixture.scenarios)||fixture.scenarios.length>32)throw new TypeError('invalid evaluation fixture');
  const results=[],names=new Set();let totalSteps=0;
  for(const scenario of fixture.scenarios){
    if(!Array.isArray(scenario.steps)||scenario.steps.length>128||!Number.isSafeInteger(scenario.now)||scenario.now<0)throw new TypeError('invalid scenario');
    let now=scenario.now,pm=new PersonaMemory({clock:()=>now});const aliases=new Map();
    const resolve=id=>{
      if(typeof id!=='string'||!id.startsWith('@'))return id;
      if(!aliases.has(id.slice(1)))throw new Error('unknown fixture alias');
      return aliases.get(id.slice(1));
    };
    for(const step of scenario.steps){
      if(++totalSteps>512)throw new RangeError('evaluation step limit');
      if(step.op==='time'){if(!Number.isSafeInteger(step.now)||step.now<now)throw new TypeError('invalid scenario time');now=step.now;}
      else if(step.op==='put'){
        const record=clone(step.record);
        if(record.replaceId!==undefined)record.replaceId=resolve(record.replaceId);
        if(record.derivedFrom)record.derivedFrom=record.derivedFrom.map(ref=>({...ref,id:resolve(ref.id)}));
        pm.putMemory(record);
      }else if(step.op==='propose')pm.proposeMemory(clone(step.proposal));
      else if(step.op==='accept'){
        const c=pm.getCandidate(step.id);if(!c)throw new Error('missing fixture candidate');
        const r=pm.acceptCandidate(c.id,{expectedRevision:c.revision}).record;
        if(step.as)aliases.set(step.as,r.id);
      }else if(step.op==='forget')pm.forgetMemory(resolve(step.id));
      else if(step.op==='restart'){
        const store=new MemorySnapshotStore({snapshot:clone(pm.export())});
        pm=await PersonaMemory.open({store,clock:()=>now});
      }else if(step.op==='check'){
        if(results.length>=128||typeof step.name!=='string'||names.has(step.name))throw new TypeError('invalid or duplicate evaluation question');names.add(step.name);
        if(step.tier!==undefined&&!['required','challenge'].includes(step.tier))throw new TypeError('invalid evaluation tier');
        const expected=ids(step.expected.map(resolve),'expected ids'),forbidden=ids((step.forbidden??[]).map(resolve),'forbidden ids'),budget=step.budget??4000;
        if(!Number.isSafeInteger(budget)||budget<0||budget>16000)throw new RangeError('invalid context budget');
        // The reader receives query options and live memory, never answer labels.
        const before=JSON.stringify(pm.export());
        const task=taskAware&&step.task?clone(step.task):undefined;
        const answer=await reader({pm,options:clone(step.options),budget,...(task?{task}:{})});
        const actual=ids(answer.searchIds,'search ids'),shown=renderedIds(answer.text,step.options.locale),search=scoreEvidence(expected,actual,forbidden),context=scoreEvidence(expected,shown,forbidden);
        const characters=Array.from(answer.text).length,withinBudget=characters<=budget,readOnly=before===JSON.stringify(pm.export());
        const passed=search.exact&&context.exact&&!search.forbiddenHits.length&&!context.forbiddenHits.length&&withinBudget&&readOnly;
        results.push({name:step.name,category:step.category,tier:step.tier??'required',expected,actual,rendered:shown,search,context,characters,budget,withinBudget,readOnly,passed});
      }else throw new TypeError('unknown evaluation step');
    }
  }
  const required=results.filter(r=>r.tier==='required'),challenges=results.filter(r=>r.tier!=='required');
  return {dataset:fixture.name,fixtureDigest:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),fixtureDigestFormat:'SHA-256 of JSON.stringify(parsed fixture)',packageVersion:VERSION,
    mode:taskAware?'opt-in-task-context':'lexical-baseline',synthetic:true,scenarios:fixture.scenarios.length,questions:results.length,passed:results.filter(r=>r.passed).length,
    required:{questions:required.length,passed:required.filter(r=>r.passed).length,failures:required.filter(r=>!r.passed).map(r=>r.name)},
    challenges:{questions:challenges.length,passed:challenges.filter(r=>r.passed).length,failures:challenges.filter(r=>!r.passed).map(r=>r.name)},
    search:aggregate(results,'search'),context:aggregate(results,'context'),results,environment:{node:process.version,platform:process.platform},
    modelCalls:0,answerQualityMeasured:false,externalBenchmark:false,
    limits:'Original synthetic API-level sessions and lexical retrieval only. Scripted capture is not measured natural-language extraction. Complete evidence sets and rendered payloads are scored; answers, reasoning, real-host behavior, semantic quality and prompt-injection resistance are not evaluated. Required and challenge results are both retained; no LongMemEval/LoCoMo or production-accuracy score is claimed.'};
}
export async function longTermEvaluationCommand(args){
  const taskAware=args[0]==='--task-aware';
  const output=taskAware?args.slice(1):args;
  if(output.length!==0&&(output.length!==2||output[0]!=='--out'||!output[1]))throw new TypeError('usage: evaluate-long-term.mjs [--task-aware] [--out NEW_REPORT.json]');
  const file=output.length?path.resolve(output[1]):null;
  if(file&&fs.existsSync(file))throw Object.assign(new Error('report exists'),{code:'EEXIST'});
  const report=await evaluateLongTermMemory({taskAware});
  if(file){const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(report,null,2)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=await longTermEvaluationCommand(process.argv.slice(2));console.log(JSON.stringify(report,null,2));if(report.required.failures.length)process.exitCode=1;
}
