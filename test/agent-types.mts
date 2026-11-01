import {PersonaMemory} from 'persona-memory';
import {normalizeBinding,createAgentSession,prepareAgentBundle,applyAgentBundle,HOST_PROFILES} from 'persona-memory/adapters/agent';
const binding=normalizeBinding({version:1,host:'codex',storage:'/tmp/data',persona:'agent-memory',namespace:'project',access:'capture',subjects:{project:{type:'project',id:'p'}}});
const session=createAgentSession(new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace}),binding);
const result:Promise<unknown>=session.call('memory_status');
void result;void HOST_PROFILES.codex.source;
prepareAgentBundle({host:'codex',out:'/tmp/bundle',project:'/tmp/project',access:'capture'});
applyAgentBundle({bundle:'/tmp/bundle',target:'/tmp/project/.codex/config.toml'});
// @ts-expect-error Access must use an explicit supported capability.
prepareAgentBundle({host:'codex',out:'/tmp/bundle',project:'/tmp/project',access:'admin'});

const language:string=binding.locale;void language;
prepareAgentBundle({host:'workbuddy',out:'/tmp/zh',project:'/tmp/project',locale:'zh-CN'});
session.call('memory_recall',{scope:'project',query:'istanbul',locale:'tr'});
const localeMemory=new PersonaMemory();
localeMemory.searchMemories({subject:{type:'project',id:'p'},query:'กาแฟ',locale:'th'});
localeMemory.buildMemoryContext({subject:{type:'project',id:'p'},locale:'en',budget:2000});
// @ts-expect-error Locale must be a BCP 47 string, not a list.
localeMemory.searchMemories({subject:{type:'project',id:'p'},locale:['en']});

import {inspectAgentCandidates} from 'persona-memory/adapters/agent';
const inspection=inspectAgentCandidates(binding,{scope:'project',limit:20});
if(inspection.mode==='candidate'){const original=inspection.candidate.memory.value;void original;}
else{const cursor:string|null=inspection.nextAfter;void cursor;}
await localeMemory.reload({ifChanged:true});
// @ts-expect-error Conditional reload is a boolean option.
await localeMemory.reload({ifChanged:'yes'});
// @ts-expect-error Inspection must use a supported status.
inspectAgentCandidates(binding,{scope:'project',status:'unknown'});

const qualityRecord=localeMemory.putMemory({id:'basis',subject:{type:'project',id:'p'},kind:'fact',key:'basis',value:'basis',assertion:'explicit'});
localeMemory.putMemory({subject:{type:'project',id:'p'},kind:'fact',key:'summary',value:'summary',assertion:'inferred',derivedFrom:[{id:qualityRecord.id,revision:qualityRecord.revision}]});
const quality=localeMemory.inspectCandidate('candidate',{limit:8});const verified:false=quality.evidenceVerified;void verified;
localeMemory.previewForgetMemory(qualityRecord.id);localeMemory.memoryStatus(qualityRecord.id);
// @ts-expect-error Assertion labels do not accept a claim of verification.
localeMemory.putMemory({subject:{type:'project',id:'p'},kind:'fact',key:'bad',value:'value',assertion:'verified'});
