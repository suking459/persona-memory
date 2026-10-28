import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {PersonaMemory,matchTags} from '../src/index.js';
const cases=JSON.parse(fs.readFileSync(new URL('./fixtures/tag-cases.json',import.meta.url),'utf8'));
let tp=0,fp=0,fn=0;const failures=[];
for(const [index,c] of cases.entries()){
  const found=new Set(matchTags(c.text).map(t=>t.tag)),expected=new Set(c.expected);
  for(const tag of found)expected.has(tag)?tp++:fp++;
  for(const tag of expected)if(!found.has(tag))fn++;
  if([...found].some(t=>!expected.has(t)) || [...expected].some(t=>!found.has(t)))failures.push({case:index,expected:[...expected],actual:[...found]});
}
let now=Date.UTC(2026,0,1);const pm=new PersonaMemory({clock:()=>now});const latencies=[];
const heapBefore=process.memoryUsage().heapUsed;
for(let i=0;i<2000;i++){now++;const t=performance.now();pm.ingest({chatId:'synthetic',userId:'u'+i%100,text:i%3?'你好':'今天好累',directedToBot:true,eventId:'m'+i});latencies.push(performance.now()-t);}
latencies.sort((a,b)=>a-b);
const report={dataset:'synthetic-tag-cases-v1',cases:cases.length,precision:tp/(tp+fp||1),recall:tp/(tp+fn||1),truePositive:tp,falsePositive:fp,falseNegative:fn,failures,
benchmark:{messages:2000,users:100,p50Ms:latencies[1000],p95Ms:latencies[1900],heapDeltaBytes:process.memoryUsage().heapUsed-heapBefore,...pm.diagnostics()},
limits:'Synthetic rule tests, not production quality or LLM response improvement. Timing and heap depend on runtime and garbage collection.'};
const directory=new URL('../.artifacts/',import.meta.url);fs.mkdirSync(directory,{recursive:true});
const file=new URL('evaluation.json',directory);fs.writeFileSync(file,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
console.log('Report: '+fileURLToPath(file));
if(failures.length)process.exitCode=1;
