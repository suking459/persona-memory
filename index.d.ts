export interface ChatMessage {
  chatId:string; userId:string; text:string; ts?:number; eventId?:string;
  mentions?:string[]; replyTo?:string; isSelf?:boolean; mentionsSelf?:boolean;
  replyToSelf?:boolean; directedToBot?:boolean; affinityDelta?:number; raw?:unknown;
}
export interface DimensionRule {min:number;max:number;baseline:number;decayPerDay?:number}
export interface DimensionState {value:number;lastAt:number}
export interface Tag {
  tag:string; source:'builtin'|'extra'|'model'|'manual'|'host'; advice:string;
  addedAt:number;lastHitAt:number;lastEvidenceAt?:number;expiresAt:number|null;
  longTerm:boolean;hits:number;injections:number;revision?:number;evidenceId?:string;promotedAt?:number|null;
}
export interface RawStyle {count:number;totalChars:number;questions:number;emojis:number;night:number;catch:Record<string,number>}
export interface StyleProfile {count:number;avgChars:number;questionRate:number;emojiRate:number;nightRate:number;catchphrases:string[]}
export interface Affinity {value:number;baseline:number;tier:string;hint:string;lastInteractiveAt:number}
export interface Profile {chatId:string;userId:string;affinity:Affinity;style:StyleProfile;tags:Tag[];dimensions:Record<string,DimensionState>;lastAt:number}
export interface Visitor {userId:string;firstSeen:number;lastSeen:number;count:number}
export type MemoryKind='preference'|'fact'|'constraint'|'decision'|'episode'|'state';
export type MemorySource='manual'|'user'|'host'|'rule'|'model'|'import';
export type MemoryValue=null|boolean|number|string|MemoryValue[]|{[key:string]:MemoryValue};
export interface MemorySubject {type:'user'|'project'|'task';id:string;chatId?:string}
export type MemoryAssertion='explicit'|'observed'|'inferred'|'external';
export interface MemoryDependency {id:string;revision:number;fingerprint?:string;slotFingerprint?:string}
export interface StoredMemoryDependency extends MemoryDependency {fingerprint:string;slotFingerprint:string}
export interface MemoryOrigin {space:string;contributor:string;host:string}
export interface MemoryInput {
  origin?:MemoryOrigin;
  id?:string;subject:MemorySubject;kind:MemoryKind;key:string;value:MemoryValue;derivedFrom?:MemoryDependency[];assertion?:MemoryAssertion;
  experience?:ExperienceMetadata;source?:MemorySource;evidenceId?:string;observedAt?:number;validFrom?:number;expiresAt?:number|null;replaceId?:string;expectedRevision?:number;
}
export interface MemoryRecord {
  origin?:MemoryOrigin;
  id:string;subject:MemorySubject;kind:MemoryKind;key:string;value:MemoryValue;source:MemorySource;derivedFrom?:StoredMemoryDependency[];assertion?:MemoryAssertion;
  experience?:ExperienceMetadata;evidenceId?:string;observedAt:number;expiresAt:number|null;createdAt:number;updatedAt:number;
  revision:number;validFrom:number;validUntil:number|null;status:'current'|'superseded';supersedes?:string;supersededBy?:string;
}
export interface ReadMemoryOptions {includeInactive?:boolean;now?:number}
export interface ListMemoryOptions extends ReadMemoryOptions {
  subject:MemorySubject;kind?:MemoryKind;key?:string;limit?:number;
}
export declare const MEMORY_KINDS:readonly MemoryKind[];
export type MemorySelection={subject:MemorySubject;subjects?:never}|{subject?:never;subjects:MemorySubject[]};
export interface MemorySearchFilters {
  /** BCP 47 case mapping/segmentation and context display; never translates stored values. */
  locale?:string;
  query?:string;kinds?:MemoryKind[];keys?:string[];sources?:MemorySource[];
  observedAfter?:number;observedBefore?:number;maxCandidates?:number;minScore?:number;
  relevance?:{id:string;score:number}[];now?:number;
}
export type SearchMemoryOptions=MemorySelection&MemorySearchFilters&{limit?:number};
export interface MemoryMatch {
  record:MemoryRecord;score:number;matchedTerms:string[];reasons:string[];
  method:'lexical'|'external'|'hybrid'|'filter';externalScore?:number;
}
export interface MemorySearchResult {
  query:string;terms:string[];matches:MemoryMatch[];scoped:number;eligible:number;
  considered:number;matched:number;scannedCharacters:number;truncated:boolean;
  omitted:{workLimit:number;textLimit:number;resultLimit:number};
}
export type BuildMemoryContextOptions=MemorySelection&MemorySearchFilters&{
  budget?:number;maxRecords?:number;tokenBudget?:number;countTokens?:(text:string)=>number;
};
export interface RecordMemoryContext {
  contextId:string;kind:'records';text:string;records:MemoryMatch[];
  omitted:{id:string;reason:'record-limit'|'character-budget'|'token-budget'}[];
  omittedCount:number;budget:number;characters:number;tokens?:number;tokenBudget?:number;createdAt:number;
  search:Omit<MemorySearchResult,'matches'>;
}
export type BuildTaskMemoryContextOptions=Omit<BuildMemoryContextOptions,'subject'|'subjects'|'relevance'>&{
  subject:MemorySubject&{type:'project'|'task'};
  /** Up to four total queries, including query when present. */
  facets?:string[];
  /** Include current scoped constraints independently of query overlap. Defaults to false. */
  includeStanding?:boolean;
};
export interface TaskMemoryContext extends RecordMemoryContext {
  taskSelection:{
    candidateIds:string[];standingIds:string[];duplicates:number;unionOmitted:number;
    facets:Omit<MemorySearchResult,'matches'>[];
    standing:Omit<MemorySearchResult,'matches'>|null;
  };
}
export interface ContextConfirmation {confirmed:boolean;duplicate?:boolean;tagCount:number;memoryCount:number}
export interface ConsolidationSource {id:string;revision:number;fingerprint?:string}
export interface PinnedConsolidationSource extends ConsolidationSource {fingerprint:string}
export interface ConsolidationSummary {key:string;text:string;reason:string;sourceIds:string[]}
export interface ConsolidationDraft {subject:MemorySubject;evidenceId:string;sources:PinnedConsolidationSource[];summaries:ConsolidationSummary[]}
export function readConsolidationSources(pm:PersonaMemory,options:{subject:MemorySubject;sources:ConsolidationSource[]}):{sources:PinnedConsolidationSource[];records:MemoryRecord[]};
export function proposeMemoryConsolidation(pm:PersonaMemory,options:ConsolidationDraft&{origin?:MemoryOrigin}):{candidates:MemoryCandidate[];evidenceVerified:false};
export function createMemoryConsolidator(pm:PersonaMemory,options:{subject:MemorySubject;timeoutMs?:number}):{
  draft(input:{evidenceId:string;sources:ConsolidationSource[]},summarize:(input:{subject:MemorySubject;records:MemoryRecord[]},options:{signal:AbortSignal})=>ConsolidationSummary[]|Promise<ConsolidationSummary[]>):Promise<ConsolidationDraft>;
};
export type CharacterReaction='positive'|'negative'|'neutral';
export type CharacterMood='pleased'|'subdued'|'neutral';
export interface CharacterObservation {id:string;sessionId:string;topic:string;reaction:CharacterReaction;channel:'chat'|'approved-milestone';at:number}
export interface CharacterPreference {topic:string;preference:'likes'|'dislikes';sessions:number;evidenceIds:string[];updatedAt:number}
export interface CharacterState {id:string;frozen:boolean;mood:CharacterMood;preferences:CharacterPreference[];events:CharacterObservation[]}
export interface CharacterChange {changed:boolean;status:'recorded'|'active'|'duplicate'|'forgotten'|'frozen'|'unavailable'|'corrected'|'reset'}
export interface CharacterProfile {
  inspect():Promise<CharacterState>;
  record(event:CharacterObservation):Promise<CharacterChange>;
  setFrozen(frozen:boolean):Promise<CharacterChange>;
  correct(id:string,changes:{topic?:string;reaction?:CharacterReaction}):Promise<CharacterChange>;
  forget(id:string):Promise<CharacterChange>;
  reset():Promise<CharacterChange>;
}
export interface CharacterSnapshot {
  format:'persona-memory/character';version:1;id:string;frozen:boolean;watermark:number;events:CharacterObservation[];removed:string[];
}
export interface CharacterSnapshotStore {
  read():Promise<{snapshot:CharacterSnapshot|null;revision:string|null}>;
  write(snapshot:CharacterSnapshot,options:{expectedRevision:string|null}):Promise<{revision:string}>;
}
export function openCharacterProfile(options:{id:string;clock?:()=>number}&(
  {file?:string;store?:never}|{store:CharacterSnapshotStore;file?:never}
)):Promise<CharacterProfile>;
export function createCharacterTurnRouter<WorkInput,WorkResult,ChatResult>(options:{
  profile:Pick<CharacterProfile,'inspect'>;
  runWork:(input:{text:string;workInput?:WorkInput})=>WorkResult;
  runChat:(input:{text:string;character:{mood:CharacterMood;preferences:Pick<CharacterPreference,'topic'|'preference'>[]}})=>ChatResult;
}):(input:{mode?:'work'|'chat';hasTask?:boolean;text:string;workInput?:WorkInput})=>Promise<Awaited<WorkResult>|Awaited<ChatResult>>;
export interface PersonaMemoryConfig {
  dailyGainCap?:number;talkDailyCap?:number;decayPerDay?:number;perMessageCap?:number;
  tagTtlHours?:number;maxTagsPerPerson?:number;attentionWindowSec?:number;
  maxPeople?:number;maxChars?:number;blockWords?:string[];
  maxCandidates?:number;maxCandidateBytes?:number;candidateTtlHours?:number;maxVersionsPerMemory?:number;maxMemories?:number;stateMemoryTtlHours?:number;episodeMemoryTtlDays?:number;
  extraRules?:Record<string,{words:string[];advice:string}>;decayBaseline?:number;
  longTermTtlDays?:number;maxInjections?:number;visitorTracking?:boolean;visitorHint?:boolean;
  visitorHintMinCount?:number;tagScope?:'user'|'chat';timeZone?:string;botId?:string|null;
  scoreAmbient?:boolean;affinityContext?:boolean;maxProfiles?:number;maxSnapshotBytes?:number;maxVisitors?:number;visitorRetentionDays?:number;maxStyleFragments?:number;
  dedupeLimit?:number;dedupeDays?:number;historyLimit?:number;dimensions?:Record<string,DimensionRule>;
}
export interface PersonaMemoryOptions {storage?:string|null;store?:SyncSnapshotStore;persona?:string;scope?:string;config?:PersonaMemoryConfig;clock?:()=>number}
export interface IngestResult {matched:boolean;delta:number;reasons:string[];tags?:string[];visitor?:boolean;duplicate?:boolean;ignored?:'out-of-order'}
export interface MaintainResult {decayed:number;expired:number;promoted:number;demoted:number;forcedOut:number;memoriesExpired:number;candidatesExpired:number}
export interface BuildBlockOptions {chatId:string;userIds:string[];budget?:number;maxPeople?:number;priorityUserIds?:string[];now?:number;tokenBudget?:number;countTokens?:(text:string)=>number}
export interface ContextPerson {userId:string;kind:'profile'|'visitor';reason:'explicit-priority'|'recent-activity';tags:Tag[]}
export interface MemoryContext {
  contextId:string;chatId:string;text:string;people:ContextPerson[];
  omitted:{userId:string;tag?:string;reason:string}[];budget:number;characters:number;createdAt:number;tokens?:number;tokenBudget?:number;
}
export type LegacyMemoryRecord=Omit<MemoryRecord,'validFrom'|'validUntil'|'experience'|'derivedFrom'|'assertion'|'origin'>;
export interface MemorySnapshotBase {
  persona:string;scope?:string;tagScope?:'user'|'chat';
  sessions:Record<string,Record<string,unknown>>;tags:Record<string,Tag[]>;
  visitors:Record<string,Omit<Visitor,'userId'>>;seen?:unknown[];uses?:unknown[];history?:unknown[];
}
export interface CurrentMemorySnapshot extends MemorySnapshotBase {
  schemaVersion:8;memories:Record<string,MemoryRecord>;candidates:Record<string,MemoryCandidate>;
}
export type MemorySnapshot=CurrentMemorySnapshot | (MemorySnapshotBase & (
  {schemaVersion:1|2;memories?:Record<string,never>} |
  {schemaVersion:3;memories:Record<string,LegacyMemoryRecord>} |
  {schemaVersion:4;memories:Record<string,Omit<MemoryRecord,'experience'|'derivedFrom'|'assertion'|'origin'>>;candidates?:Record<string,never>} |
  {schemaVersion:7;memories:Record<string,MemoryRecord>;candidates:Record<string,Omit<MemoryCandidate,'memory'>&{memory:Omit<CandidateMemory,'experience'>}>} |
  {schemaVersion:6;memories:Record<string,Omit<MemoryRecord,'origin'>>;candidates:Record<string,Omit<MemoryCandidate,'memory'>&{memory:Omit<CandidateMemory,'origin'|'experience'>}>} |
  {schemaVersion:5;memories:Record<string,Omit<MemoryRecord,'derivedFrom'|'assertion'|'origin'>>;candidates:Record<string,Omit<MemoryCandidate,'memory'>&{memory:Omit<CandidateMemory,'derivedFrom'|'assertion'|'origin'|'experience'>}>}
));
export interface TagInput {chatId:string;userId:string;tag:string;advice?:string;source?:Tag['source'];eventId?:string;expiresAt?:number|null;replace?:string[];ts?:number}
export interface HostEvent {chatId:string;userId:string;eventId?:string;type:string;changes:Record<string,number>;ts?:number}
export interface DiagnosticStats {schemaVersion:number;candidates:number;memories:number;profiles:number;visitors:number;tags:number;dedupeEntries:number;confirmedTurns:number;historyEntries:number}
export declare class PersonaMemory {
  constructor(options?:PersonaMemoryOptions);
  static open(options:Omit<PersonaMemoryOptions,'storage'|'store'>&{store:SnapshotStore}):Promise<PersonaMemory>;
  persist():Promise<void>;reload(options?:{discardChanges?:boolean;ifChanged?:boolean}):Promise<void>;
  readonly persona:string;readonly scope:string;readonly storage:string|null;config:PersonaMemoryConfig;
  ingest(msg:ChatMessage):IngestResult;
  buildBlock(options:BuildBlockOptions):string;
  buildContext(options:BuildBlockOptions):MemoryContext;
  confirmContext(context:string|MemoryContext|RecordMemoryContext,options:{turnId:string}):ContextConfirmation;
  confirmContexts(contexts:(string|MemoryContext|RecordMemoryContext)[],options:{turnId:string}):ContextConfirmation;
  searchMemories(options:SearchMemoryOptions):MemorySearchResult;
  buildMemoryContext(options:BuildMemoryContextOptions):RecordMemoryContext;
  buildTaskMemoryContext(options:BuildTaskMemoryContextOptions):TaskMemoryContext;
  getMemoryAt(options:MemoryAtOptions):MemoryRecord|null;
  exportMemories(options:ExportMemoriesOptions):MemoryBundle;
  previewMemoryImport(bundle:MemoryBundle,options:{mappings:SubjectMapping[]}):MemoryImportPreview;
  applyMemoryImport(planId:string,options?:{allowUpdates?:boolean}):MemoryImportResult;
  proposeMemory(input:CandidateInput):MemoryCandidate;
  proposeMemories(inputs:CandidateInput[],options?:{autoAccept?:AutoAcceptPolicy}):CandidateBatchResult;
  getCandidate(id:string,options?:{includeExpired?:boolean}):MemoryCandidate|null;
  inspectCandidate(id:string,options?:{limit?:number}):CandidateQuality;
  listCandidates(options:{subject:MemorySubject;status?:CandidateStatus;limit?:number;includeExpired?:boolean}):MemoryCandidate[];
  reviseCandidate(id:string,options:CandidateRevision):MemoryCandidate;
  rejectCandidate(id:string,options:{expectedRevision:number;reason?:string}):MemoryCandidate;
  acceptCandidate(id:string,options:{expectedRevision:number}):CandidateAcceptance;
  acceptCandidates(requests:{id:string;expectedRevision:number}[]):CandidateAcceptance[];
  forgetCandidate(id:string):{removed:number};
  recordExperience(input:ExperienceInput):ExperienceRecord&{source:'host'};
  listExperiences(options:{subject:MemorySubject;outcome?:ExperienceOutcome;verifiedOnly?:boolean;limit?:number;includeInactive?:boolean}):ExperienceRecord[];
  putMemory(input:MemoryInput):MemoryRecord;
  getMemory(id:string,options?:ReadMemoryOptions):MemoryRecord|null;
  listMemories(options:ListMemoryOptions):MemoryRecord[];
  forgetMemory(id:string):{removed:number};
  previewForgetMemory(id:string):{recordIds:string[];candidateIds:string[]};
  memoryStatus(id:string,options?:{now?:number}):{usable:boolean;reason:string;dependencyId?:string};
  deleteSubject(subject:MemorySubject):{removed:number};
  getProfile(chatId:string,userId:string):Profile|null;
  getVisitor(userId:string,options?:{chatId?:string}):Visitor|null;
  listVisitors(limit?:number):Visitor[];
  setTag(input:TagInput):Tag|{duplicate:true};
  removeTag(input:{chatId?:string;userId:string;tag:string}):boolean;
  recordEvent(input:HostEvent):Record<string,DimensionState>|{duplicate:true};
  deleteUser(userId:string,options?:{chatId?:string}):{removed:number};
  clear():{removed:number};
  diagnostics():DiagnosticStats;
  history(options?:{chatId?:string;userId?:string;subject?:MemorySubject}):Record<string,unknown>[];
  maintain(now?:number):MaintainResult;
  flush():void;export():CurrentMemorySnapshot;import(snapshot:MemorySnapshot):void;
}
export default PersonaMemory;
export interface Tier {min:number;tier:string;hint:string}
export interface ScoreRules {talkToBot:number;talkDailyCap:number;at:number;quote:number;praise:number;insult:number;pat:number;perMessageCap:number;dailyGainCap:number}
export declare const AFFINITY_MIN:number;
export declare const AFFINITY_MAX:number;
export declare const TIERS:readonly Tier[];
export declare const SCORE_RULES:Readonly<ScoreRules>;
export declare const TAG_RULES:readonly {tag:string;advice:string;words:string[]}[];
export declare function tierOf(value:number):Tier;
export declare function clampAffinity(value:number,min?:number,max?:number):number;
export declare function applyDailyGain(used:number,delta:number,cap:number):number;
export declare function decayAmount(value:number,baseline:number,perDay:number,days:number):number;
export declare function scoreMessage(text:string,ctx?:{mentionsSelf?:boolean;replyToSelf?:boolean;directedToBot?:boolean;isSelf?:boolean;affinityDelta?:number},overrides?:Partial<ScoreRules>):{delta:number;reasons:string[]};
export declare function isNight(ts:number):boolean;
export declare function updateStyle(style:RawStyle|null|undefined,text:string,ts:number,blockWords?:string[]):RawStyle;
export declare function summarizeStyle(style:Partial<RawStyle>|null|undefined):StyleProfile;
export declare function matchTags(text:string,extraRules?:PersonaMemoryConfig['extraRules']):{tag:string;advice:string;word:string;source:string}[];
export declare function normalizeTag(raw:unknown,now?:number):Tag|null;
export declare function hitTag(tags:Tag[],tag:string,advice:string,now:number,ttlHours?:number):Tag[];
export declare function sweepTags(tags:Tag[],now:number,options?:Pick<PersonaMemoryConfig,'tagTtlHours'|'maxTagsPerPerson'|'longTermTtlDays'|'maxInjections'>):{tags:Tag[];expired:number;promoted:number;demoted:number;forcedOut:number};

export interface MemoryAtOptions {subject:MemorySubject;kind:MemoryKind;key:string;at:number;knownAt?:number}
export type ExportMemoriesOptions=MemorySelection&Pick<MemorySearchFilters,'kinds'|'keys'|'sources'>;
export type PortableMemory=Pick<MemoryRecord,'id'|'subject'|'kind'|'key'|'value'|'source'|'evidenceId'|'observedAt'|'validFrom'|'expiresAt'|'assertion'|'origin'>;
export interface MemoryBundle {format:'persona-memory/records';version:1|2|3;exportedAt:number;records:PortableMemory[]}
export interface SubjectMapping {from:MemorySubject;to:MemorySubject}
export interface MemoryImportPreview {
  planId:string;createdAt:number;expiresAt:number;counts:Record<'add'|'same'|'update'|'conflict',number>;
  rows:{incoming:MemoryValue;incomingId:string;target:MemorySubject;kind:MemoryKind;key:string;
    action:'add'|'same'|'update'|'conflict';reason?:string;currentId?:string;currentRevision?:number;current?:MemoryValue}[];
}
export interface MemoryImportResult {added:number;updated:number;unchanged:number;pruned:number;recordIds:string[]}
export interface SnapshotStore {
  read():Promise<{snapshot:MemorySnapshot|null;revision:string|null}>;
  write(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):Promise<{revision:string}>;
}
export declare class MemorySnapshotStore implements SnapshotStore {
  constructor(options?:{snapshot?:MemorySnapshot|null;maxBytes?:number});
  read():Promise<{snapshot:MemorySnapshot|null;revision:string|null}>;
  write(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):Promise<{revision:string}>;
}
export declare class JsonFileStore implements SnapshotStore {
  constructor(options:{file:string;maxBytes?:number});readonly file:string;readonly maxBytes:number;
  readSync():{snapshot:MemorySnapshot|null;revision:string|null};
  writeSync(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):{revision:string};
  read():Promise<{snapshot:MemorySnapshot|null;revision:string|null}>;
  write(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):Promise<{revision:string}>;
}

export type CandidateStatus='pending'|'accepted'|'rejected';
export type CandidateMemory=Omit<PortableMemory,'id'|'evidenceId'>&{evidenceId:string;experience?:ExperienceMetadata;derivedFrom?:StoredMemoryDependency[]};
export interface CandidateInput {
  id?:string;memory:Omit<MemoryInput,'id'|'replaceId'|'expectedRevision'>&{evidenceId:string};
  reason?:string;confidence?:number;ttlHours?:number;
}
export interface MemoryCandidate {
  id:string;memory:CandidateMemory;reason:string;confidence?:number;
  base:{id:string|null;revision:number;fingerprint:string};
  createdAt:number;updatedAt:number;expiresAt:number;revision:number;status:CandidateStatus;
  reviewedAt?:number;decisionReason?:string;acceptedId?:string;
}
export interface CandidateRevision {
  expectedRevision:number;memory?:Partial<Pick<CandidateMemory,'value'|'evidenceId'|'observedAt'|'validFrom'|'expiresAt'|'assertion'>>&{derivedFrom?:MemoryDependency[]};
  reason?:string;confidence?:number;
}
export interface CandidateAcceptance {candidate:MemoryCandidate;record:MemoryRecord|null;duplicate:boolean}
export interface AutoAcceptPolicy {kinds:MemoryKind[];minConfidence:number;maxPerCall:number}
export interface CandidateBatchResult {candidates:MemoryCandidate[];accepted:string[];omitted:{id:string;reason:string}[]}
export type ExperienceOutcome='success'|'failure'|'mixed'|'unknown';
export interface ExperienceMetadata {outcome:ExperienceOutcome;verified:boolean;retired?:boolean;lifecycleReason?:string}
export type ExperienceValue={task:string;context:MemoryValue;attempt:string;result:string;conditions:string[]};
export interface ExperienceInput extends Omit<MemoryInput,'kind'|'value'|'source'|'experience'> {
  task:string;context?:MemoryValue;attempt:string;result:string;conditions?:string[];outcome:ExperienceOutcome;verified?:boolean;
}
export type ExperienceRecord=MemoryRecord&{kind:'episode';source:'host'|'model';experience:ExperienceMetadata;value:ExperienceValue};
export type ExperienceProposal=Omit<ExperienceInput,'id'|'replaceId'|'expectedRevision'>&{source?:'host'|'model';reason?:string;confidence?:number;ttlHours?:number};
export interface ExperienceFeedbackInput {
  subject:MemorySubject;id:string;expectedRevision:number;trialId:string;evidenceId:string;
  outcome:'helped'|'not-helpful'|'failed'|'not-applicable';conditions?:string[];note?:string;
  verification?:'reported'|'owner-attested';origin?:MemoryOrigin;
}
export interface ExperienceLifecycleInput {subject:MemorySubject;id:string;expectedRevision:number;evidenceId:string;reason:string;retired?:boolean;origin?:MemoryOrigin}
export interface ExperienceReuseItem {
  experience:ExperienceRecord;status:'eligible'|'needs-review';reasons:string[];missingConditions:string[];
  feedback:{helped:number;negative:number;reported:number;conflicting:number;invalid:number;evidenceIds:string[]};
  evidenceVerified:false;taskExecuted:false;
}
export interface ExperienceReuseResult {items:ExperienceReuseItem[];conditions:string[];scanCapped:boolean;evidenceVerified:false;taskExecuted:false}
export declare function proposeExperience(pm:PersonaMemory,input:ExperienceProposal):MemoryCandidate;
export declare function proposeExperienceFeedback(pm:PersonaMemory,input:ExperienceFeedbackInput):MemoryCandidate;
export declare function proposeExperienceRetirement(pm:PersonaMemory,input:ExperienceLifecycleInput):MemoryCandidate;
export declare function reuseExperiences(pm:PersonaMemory,options:{subject:MemorySubject;conditions?:string[];limit?:number;includeNeedsReview?:boolean}):ExperienceReuseResult;

export interface CandidateQuality {
  assertion:MemoryAssertion|'unspecified';evidenceVerified:false;warnings:string[];
  current:null|{id:string;revision:number;source:MemorySource;assertion:MemoryAssertion|'unspecified';relation:'same-value'|'different-value';usable:boolean};
  similar:{id:string;revision:number;evidenceId:string;source:MemorySource;assertion:MemoryAssertion|'unspecified'}[];
  competing:CandidateQuality['similar'];similarCount:number;competingCount:number;sourceChanges:string[];truncated:boolean;limits:string;
}

export interface SyncSnapshotStore extends SnapshotStore {
  readSync():{snapshot:MemorySnapshot|null;revision:string|null};
  writeSync(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):{revision:string};
}
export declare class SQLiteSnapshotStore implements SyncSnapshotStore {
  constructor(options:{file:string;namespace?:string;maxBytes?:number;maxNamespaces?:number});
  readonly file:string;readonly namespace:string;readonly maxBytes:number;readonly maxNamespaces:number;
  readSync():{snapshot:MemorySnapshot|null;revision:string|null};
  writeSync(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):{revision:string};
  read():Promise<{snapshot:MemorySnapshot|null;revision:string|null}>;
  write(snapshot:MemorySnapshot,options:{expectedRevision:string|null}):Promise<{revision:string}>;
}
export interface MemoryBackupIdentity {persona:string;namespace:string;subjects:Record<string,MemorySubject>;locale?:string}
export interface MemoryBackup {format:'persona-memory-backup';version:1;createdAt:number;snapshot:MemorySnapshot;identity?:MemoryBackupIdentity;checksum:string}
export interface BackupCounts {memories:number;candidates:number;relationshipProfiles:number}
export interface MemoryRestorePreview {
  format:'persona-memory-restore-plan';version:1;createdAt:number;expiresAt:number;persona:string;scope:string;
  expectedRevision:string|null;targetDigest:string;configDigest:string;backupChecksum:string;checksum:string;
  replacing:BackupCounts;restoring:BackupCounts;
}
export declare function createMemoryBackup(pm:PersonaMemory,options?:{identity?:MemoryBackupIdentity;now?:number}):Promise<MemoryBackup>;
export declare function inspectMemoryBackup(raw:unknown,options?:{config?:PersonaMemoryConfig}):{checksum:string;createdAt:number;snapshot:MemorySnapshot;identity?:MemoryBackupIdentity;counts:BackupCounts};
export declare function previewMemoryRestore(pm:PersonaMemory,raw:unknown,options?:{now?:number}):Promise<MemoryRestorePreview>;
export declare function restoreMemoryBackup(pm:PersonaMemory,raw:unknown,preview:unknown,options?:{now?:number}):Promise<{committed:true;persistent:boolean;requiresReload:boolean;counts:BackupCounts}>;

export interface MemoryDoctorReport {
  ok:true;readOnly:true;schemaVersion:8;persistent:boolean;dirty:boolean;
  counts:{records:number;currentHeads:number;candidates:number;pending:number;expiredPending:number};
  sourceCheck:{inspected:number;unusable:number;reasons:Record<string,number>;samples:{id:string;reason:string}[];truncated:boolean};
  warnings:string[];evidenceVerified:false;externalServicesContacted:false;repairsApplied:false;limits:string;
}
export declare function diagnoseMemory(pm:PersonaMemory,options?:{subjects?:MemorySubject[];maxRecords?:number}):MemoryDoctorReport;
export declare function explainMemoryRecall(pm:PersonaMemory,options:{subject:MemorySubject;query?:string;locale?:string;limit?:number;id?:string}):{
  mode:'local-lexical-diagnostic';semanticConsulted:false;subject:MemorySubject;result:MemorySearchResult;
  inspected?:{available:boolean;id?:string;validity?:{usable:boolean;reason:string;dependencyId?:string};selected?:boolean;reason:string};
  explanation:Record<string,unknown>;limits:string;
};
export interface ManagementPreview {
  format:'persona-memory-management-plan';version:1;kind:'review'|'forget'|'maintenance';subject:MemorySubject;
  createdAt:number;expiresAt:number;persona:string;scope:string;expectedRevision:string|null;
  targetDigest:string;configDigest:string;checksum:string;allowed:boolean;
}
export interface CandidateReviewPreview extends ManagementPreview {
  kind:'review';decision:'accept'|'reject';requests:{id:string;expectedRevision:number}[];reason?:string;
  rows:{id:string;revision:number;status:CandidateStatus;kind:MemoryKind;key:string;proposedValue:MemoryValue;
    before:{id:string;revision:number;value:MemoryValue;validFrom:number;expiresAt:number|null}|null;
    evidenceId:string;reason:string;source:MemorySource;assertion:MemoryAssertion|'unspecified';quality:CandidateQuality}[];
  evidenceVerified:false;denial?:{code:string;message:string};
}
export interface MemoryForgetPreview extends ManagementPreview {
  kind:'forget';id:string;expectedMemoryRevision:number;
  impact:{memories:number;candidates:number;recordIds:string[];candidateIds:string[];truncated:boolean};
}
export interface ManagedCommitResult {committed:true;persistent:boolean;requiresReload:boolean;counts:BackupCounts}
export declare function previewCandidateReview(pm:PersonaMemory,options:{subject:MemorySubject;requests:{id:string;expectedRevision:number}[];decision:'accept'|'reject';reason?:string}):Promise<CandidateReviewPreview>;
export declare function applyCandidateReview(pm:PersonaMemory,preview:unknown):Promise<ManagedCommitResult&{decision:'accept'|'reject';reviewed:number;results:{candidateId:string;recordId?:string;status:'accepted'|'rejected'}[]}>;
export declare function previewMemoryForget(pm:PersonaMemory,options:{subject:MemorySubject;id:string;expectedRevision:number}):Promise<MemoryForgetPreview>;
export declare function applyMemoryForget(pm:PersonaMemory,preview:unknown):Promise<ManagedCommitResult&{removed:number}>;

export interface MemoryMaintenancePreview extends ManagementPreview {
  kind:'maintenance';limit:number;targets:{type:'memory'|'candidate';id:string;revision:number}[];
  impact:{memories:number;candidates:number;recordIds:string[];candidateIds:string[];truncated:boolean};
  skipped:{type:'memory'|'candidate';id:string;reason:string}[];remaining:number;considered:number;scan:{records:number;candidates:number};
}
export declare function previewMemoryMaintenance(pm:PersonaMemory,options:{subject:MemorySubject;limit?:number}):Promise<MemoryMaintenancePreview>;
export declare function applyMemoryMaintenance(pm:PersonaMemory,preview:unknown):Promise<(ManagedCommitResult|{committed:false;reason:'no-eligible-targets';requiresReload:false})&{removed:{memories:number;candidates:number}}>;

export type MemoryOperation='recall'|'context'|'proposal'|'review'|'persist'|'maintenance'|'task';
export declare const MEMORY_OPERATIONS:readonly MemoryOperation[];
export interface MemoryMeasurement {operation:MemoryOperation;durationMs:number;success:boolean;inputTokens?:number;outputTokens?:number;bytes?:number}
export interface OperationMetrics {
  samples:number;succeeded:number;failed:number;durationMs:{mean:number|null;p50:number|null;p95:number|null};
  inputTokens:number|null;outputTokens:number|null;bytes:number|null;known:{inputTokens:number;outputTokens:number;bytes:number};
}
export interface MemoryMetricsSummary {
  capacity:number;retained:number;total:number;dropped:number;measurementSource:'caller-reported';evidenceVerified:false;operations:Record<MemoryOperation,OperationMetrics>;
}
export interface MemoryMetrics {
  record(sample:MemoryMeasurement):{retained:number;dropped:number};summary():MemoryMetricsSummary;samples():MemoryMeasurement[];clear():void;
}
export declare function createMemoryMetrics(options?:{capacity?:number}):MemoryMetrics;
export type MemoryTrial=Omit<MemoryMeasurement,'operation'>&{caseIndex:number;mode:'enabled'|'disabled'};
export interface MemoryTrialComparison {
  measurementSource:'caller-reported';evidenceVerified:false;
  pairs:{caseIndex:number;enabled:Omit<MemoryMeasurement,'operation'>;disabled:Omit<MemoryMeasurement,'operation'>;delta:{durationMs:number;inputTokens:number|null;outputTokens:number|null;bytes:number|null}}[];
  unpaired:{caseIndex:number;missing:'enabled'|'disabled'}[];
  summary:{paired:number;enabledSuccess:number;disabledSuccess:number;meanDurationDeltaMs:number|null};limits:string;
}
export declare function compareMemoryTrials(trials:MemoryTrial[]):MemoryTrialComparison;

export interface TaskCheckpoint {goal:string;completed:string[];pending:string[];blockers:string[];nextSteps:string[]}
export interface TaskHandoff {
 format:'persona-memory/handoff';version:1;identity:{persona:string;namespace:string};
 subject:MemorySubject;createdAt:number;expiresAt:number;checkpoint:TaskCheckpoint;
 references:{id:string;revision:number;fingerprint:string}[];checksum:string;
}
export interface OpenTaskHandoffResult {
 status:'ready'|'expired'|'not-yet-valid'|'needs-review';subject:MemorySubject;checkpoint:TaskCheckpoint;
 references:{id:string;revision:number;status:'current'|'unavailable'}[];
 claimsVerified:false;taskExecuted:false;authorAuthenticated:false;instructionsTrusted:false;
}
export function createTaskHandoff(pm:PersonaMemory,options:{subject:MemorySubject;checkpoint:TaskCheckpoint;references:{id:string;revision:number}[];ttlHours?:number}):TaskHandoff;
export function openTaskHandoff(pm:PersonaMemory,bundle:TaskHandoff,options:{subject:MemorySubject}):OpenTaskHandoffResult;
