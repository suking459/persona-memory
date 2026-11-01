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

import {createSemanticRetriever,createHttpEmbedder,type EmbeddingConfig} from 'persona-memory/adapters/semantic';
const embedding:EmbeddingConfig={provider:'ollama',endpoint:'http://127.0.0.1:11434/api/embed',model:'owner-selected-model'};
const semantic=createSemanticRetriever(localeMemory,{subject:{type:'project',id:'p'},embed:createHttpEmbedder(embedding)});
const semanticResult=await semantic.search({query:'咖啡',locale:'zh'});const semanticMatches=semanticResult.matches;void semanticMatches;
const semanticContext=await semantic.buildContext({query:'coffee',budget:2000});const selectedRecords=semanticContext.records;void selectedRecords;
prepareAgentBundle({host:'workbuddy',out:'/tmp/semantic',project:'/tmp/project',retrieval:embedding});
// @ts-expect-error Per-query callers cannot widen the fixed subject selection.
semantic.search({query:'coffee',subject:{type:'user',id:'other'}});


import {SQLiteSnapshotStore,createMemoryBackup,inspectMemoryBackup,previewMemoryRestore,restoreMemoryBackup} from 'persona-memory';
import {SQLiteSnapshotStore as SQLiteSubpath} from 'persona-memory/storage/sqlite';
import {openAgentMemory} from 'persona-memory/adapters/agent';
const sqliteStore=new SQLiteSnapshotStore({file:'./memory.sqlite',namespace:'project'});
const sqliteMemory=new PersonaMemory({store:sqliteStore});
const sqliteBackup=await createMemoryBackup(sqliteMemory);
const sqlitePreview=await previewMemoryRestore(sqliteMemory,sqliteBackup);
const sqliteRestored=await restoreMemoryBackup(sqliteMemory,sqliteBackup,sqlitePreview);
const sqliteInspected=inspectMemoryBackup(sqliteBackup);
new SQLiteSubpath({file:'./other.sqlite'});openAgentMemory({});
const restoredFlag:boolean=sqliteRestored.committed;const memoryCount:number=sqliteInspected.counts.memories;

import {diagnoseMemory,explainMemoryRecall,previewCandidateReview,applyCandidateReview,previewMemoryForget,applyMemoryForget} from 'persona-memory';
import {doctorAgent} from 'persona-memory/adapters/agent';
const diagnosed=diagnoseMemory(sqliteMemory,{maxRecords:5});
const explained=explainMemoryRecall(sqliteMemory,{subject:{type:'project',id:'p'},query:'query'});
const batchPreview=await previewCandidateReview(sqliteMemory,{subject:{type:'project',id:'p'},requests:[{id:'c',expectedRevision:1}],decision:'accept'});
await applyCandidateReview(sqliteMemory,batchPreview);
const forgetPreview=await previewMemoryForget(sqliteMemory,{subject:{type:'project',id:'p'},id:'memory',expectedRevision:1});
await applyMemoryForget(sqliteMemory,forgetPreview);doctorAgent(binding);
const noContact:false=explained.semanticConsulted;const readOnlyDoctor:true=diagnosed.readOnly;
