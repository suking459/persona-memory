import {PersonaMemory,createMemoryMetrics,compareMemoryTrials,previewMemoryMaintenance,applyMemoryMaintenance} from 'persona-memory';
const meter=createMemoryMetrics({capacity:16});meter.record({operation:'recall',durationMs:1,success:true});
const known:number|null=meter.summary().operations.recall.inputTokens;
compareMemoryTrials([{caseIndex:1,mode:'enabled',durationMs:1,success:true}]);
const pm=new PersonaMemory(),plan=await previewMemoryMaintenance(pm,{subject:{type:'project',id:'p'},limit:2});
const result=await applyMemoryMaintenance(pm,plan);if(result.committed){const durable:boolean=result.persistent;void durable;}
void known;
// @ts-expect-error no text field is accepted
meter.record({operation:'task',durationMs:1,success:true,text:'private'});
