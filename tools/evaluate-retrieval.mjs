import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {PersonaMemory} from '../src/index.js';

export function evaluateRetrieval(){
  const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/retrieval-cases.json',import.meta.url),'utf8'));
  const categories={},failures=[];let passed=0,tp=0,fp=0,fn=0;
  for(const item of fixture.cases){
    const pm=new PersonaMemory({clock:()=>fixture.now});
    for(const record of fixture.records)pm.putMemory(record);
    const actual=pm.searchMemories(item.options).matches.map(hit=>hit.record.id),found=new Set(actual),expected=new Set(item.expected);
    const group=categories[item.category]??={passed:0,total:0};group.total++;
    for(const id of found)expected.has(id)?tp++:fp++;
    for(const id of expected)if(!found.has(id))fn++;
    const ok=found.size===expected.size && [...found].every(id=>expected.has(id));
    if(ok){passed++;group.passed++;}
    else failures.push({name:item.name,category:item.category,expected:[...expected],actual});
  }
  return {dataset:'synthetic-retrieval-v1',cases:fixture.cases.length,passed,categories,
    truePositive:tp,falsePositive:fp,falseNegative:fn,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),failures,
    limits:'Synthetic literal-retrieval policy cases only. Not a production accuracy measurement, semantic-understanding claim, LongMemEval score or model answer-quality comparison.'};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const report=evaluateRetrieval(),pm=new PersonaMemory({clock:()=>1000});
  for(let i=0;i<1000;i++)pm.putMemory({subject:{type:'project',id:'p'+i%20},kind:'fact',key:'feature-'+i,value:'release '+i});
  const samples=[];
  for(let i=0;i<100;i++){
    const started=performance.now();
    pm.searchMemories({subject:{type:'project',id:'p'+i%20},query:'release',limit:5});
    samples.push(performance.now()-started);
  }
  samples.sort((a,b)=>a-b);
  report.benchmark={records:1000,subjects:20,queries:100,p50Ms:samples[50],p95Ms:samples[95],node:process.version};
  const directory=new URL('../.artifacts/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
  const file=new URL('retrieval-evaluation.json',directory);fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));console.log('Report: '+fileURLToPath(file));
  if(report.failures.length)process.exitCode=1;
}
