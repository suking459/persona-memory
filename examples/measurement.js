import {performance} from 'node:perf_hooks';
import {PersonaMemory,createMemoryMetrics,compareMemoryTrials} from '../src/index.js';
const subject={type:'project',id:'synthetic-measurement'},pm=new PersonaMemory();
pm.putMemory({subject,kind:'constraint',key:'release',value:'Run the required validation.',source:'user'});
const meter=createMemoryMetrics({capacity:16}),trials=[];
for(let caseIndex=0;caseIndex<4;caseIndex++)for(const mode of ['disabled','enabled']){
  const start=performance.now();
  const text=mode==='enabled'?pm.buildMemoryContext({subject,query:'release',locale:'en',budget:2000}).text:'';
  const sample={durationMs:performance.now()-start,success:true,bytes:Buffer.byteLength(text)};
  meter.record({operation:'context',...sample});trials.push({caseIndex,mode,...sample});
}
console.log(JSON.stringify({dataset:'synthetic-library-context-overhead',modelCalls:0,
  limits:'Success means this bounded context construction completed. Timing is local overhead, not model-task quality. No tokenizer ran, so token counts are unknown.',
  metrics:meter.summary(),comparison:compareMemoryTrials(trials)},null,2));
