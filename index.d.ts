export interface ChatMessage {
  chatId:string; userId:string; text:string; ts?:number; eventId?:string;
  mentions?:string[]; replyTo?:string; isSelf?:boolean; mentionsSelf?:boolean;
  replyToSelf?:boolean; directedToBot?:boolean; raw?:unknown;
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
export interface MemoryInput {
  id?:string;subject:MemorySubject;kind:MemoryKind;key:string;value:MemoryValue;
  experience?:ExperienceMetadata;source?:MemorySource;evidenceId?:string;observedAt?:number;validFrom?:number;expiresAt?:number|null;replaceId?:string;expectedRevision?:number;
}
export interface MemoryRecord {
  id:string;subject:MemorySubject;kind:MemoryKind;key:string;value:MemoryValue;source:MemorySource;
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
export interface ContextConfirmation {confirmed:boolean;duplicate?:boolean;tagCount:number;memoryCount:number}
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
export interface PersonaMemoryOptions {storage?:string|null;persona?:string;scope?:string;config?:PersonaMemoryConfig;clock?:()=>number}
export interface IngestResult {matched:boolean;delta:number;reasons:string[];tags?:string[];visitor?:boolean;duplicate?:boolean;ignored?:'out-of-order'}
export interface MaintainResult {decayed:number;expired:number;promoted:number;demoted:number;forcedOut:number;memoriesExpired:number;candidatesExpired:number}
export interface BuildBlockOptions {chatId:string;userIds:string[];budget?:number;maxPeople?:number;priorityUserIds?:string[];now?:number;tokenBudget?:number;countTokens?:(text:string)=>number}
export interface ContextPerson {userId:string;kind:'profile'|'visitor';reason:'explicit-priority'|'recent-activity';tags:Tag[]}
export interface MemoryContext {
  contextId:string;chatId:string;text:string;people:ContextPerson[];
  omitted:{userId:string;tag?:string;reason:string}[];budget:number;characters:number;createdAt:number;tokens?:number;tokenBudget?:number;
}
export type LegacyMemoryRecord=Omit<MemoryRecord,'validFrom'|'validUntil'|'experience'>;
export interface MemorySnapshotBase {
  persona:string;scope?:string;tagScope?:'user'|'chat';
  sessions:Record<string,Record<string,unknown>>;tags:Record<string,Tag[]>;
  visitors:Record<string,Omit<Visitor,'userId'>>;seen?:unknown[];uses?:unknown[];history?:unknown[];
}
export interface CurrentMemorySnapshot extends MemorySnapshotBase {
  schemaVersion:5;memories:Record<string,MemoryRecord>;candidates:Record<string,MemoryCandidate>;
}
export type MemorySnapshot=CurrentMemorySnapshot | (MemorySnapshotBase & (
  {schemaVersion:1|2;memories?:Record<string,never>} |
  {schemaVersion:3;memories:Record<string,LegacyMemoryRecord>} |
  {schemaVersion:4;memories:Record<string,Omit<MemoryRecord,'experience'>>;candidates?:Record<string,never>}
));
export interface TagInput {chatId:string;userId:string;tag:string;advice?:string;source?:Tag['source'];eventId?:string;expiresAt?:number|null;replace?:string[];ts?:number}
export interface HostEvent {chatId:string;userId:string;eventId?:string;type:string;changes:Record<string,number>;ts?:number}
export interface DiagnosticStats {schemaVersion:number;candidates:number;memories:number;profiles:number;visitors:number;tags:number;dedupeEntries:number;confirmedTurns:number;historyEntries:number}
export declare class PersonaMemory {
  constructor(options?:PersonaMemoryOptions);
  static open(options:Omit<PersonaMemoryOptions,'storage'>&{store:SnapshotStore}):Promise<PersonaMemory>;
  persist():Promise<void>;reload(options?:{discardChanges?:boolean}):Promise<void>;
  readonly persona:string;readonly scope:string;readonly storage:string|null;config:PersonaMemoryConfig;
  ingest(msg:ChatMessage):IngestResult;
  buildBlock(options:BuildBlockOptions):string;
  buildContext(options:BuildBlockOptions):MemoryContext;
  confirmContext(context:string|MemoryContext|RecordMemoryContext,options:{turnId:string}):ContextConfirmation;
  confirmContexts(contexts:(string|MemoryContext|RecordMemoryContext)[],options:{turnId:string}):ContextConfirmation;
  searchMemories(options:SearchMemoryOptions):MemorySearchResult;
  buildMemoryContext(options:BuildMemoryContextOptions):RecordMemoryContext;
  getMemoryAt(options:MemoryAtOptions):MemoryRecord|null;
  exportMemories(options:ExportMemoriesOptions):MemoryBundle;
  previewMemoryImport(bundle:MemoryBundle,options:{mappings:SubjectMapping[]}):MemoryImportPreview;
  applyMemoryImport(planId:string,options?:{allowUpdates?:boolean}):MemoryImportResult;
  proposeMemory(input:CandidateInput):MemoryCandidate;
  proposeMemories(inputs:CandidateInput[],options?:{autoAccept?:AutoAcceptPolicy}):CandidateBatchResult;
  getCandidate(id:string,options?:{includeExpired?:boolean}):MemoryCandidate|null;
  listCandidates(options:{subject:MemorySubject;status?:CandidateStatus;limit?:number;includeExpired?:boolean}):MemoryCandidate[];
  reviseCandidate(id:string,options:CandidateRevision):MemoryCandidate;
  rejectCandidate(id:string,options:{expectedRevision:number;reason?:string}):MemoryCandidate;
  acceptCandidate(id:string,options:{expectedRevision:number}):CandidateAcceptance;
  acceptCandidates(requests:{id:string;expectedRevision:number}[]):CandidateAcceptance[];
  forgetCandidate(id:string):{removed:number};
  recordExperience(input:ExperienceInput):ExperienceRecord;
  listExperiences(options:{subject:MemorySubject;outcome?:ExperienceOutcome;verifiedOnly?:boolean;limit?:number;includeInactive?:boolean}):ExperienceRecord[];
  putMemory(input:MemoryInput):MemoryRecord;
  getMemory(id:string,options?:ReadMemoryOptions):MemoryRecord|null;
  listMemories(options:ListMemoryOptions):MemoryRecord[];
  forgetMemory(id:string):{removed:number};
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
export declare const SCORE_RULES:ScoreRules;
export declare const TAG_RULES:readonly {tag:string;advice:string;words:string[]}[];
export declare function tierOf(value:number):Tier;
export declare function clampAffinity(value:number,min?:number,max?:number):number;
export declare function applyDailyGain(used:number,delta:number,cap:number):number;
export declare function decayAmount(value:number,baseline:number,perDay:number,days:number):number;
export declare function scoreMessage(text:string,ctx?:{mentionsSelf?:boolean;replyToSelf?:boolean;directedToBot?:boolean;isSelf?:boolean},overrides?:Partial<ScoreRules>):{delta:number;reasons:string[]};
export declare function isNight(ts:number):boolean;
export declare function updateStyle(style:RawStyle|null|undefined,text:string,ts:number,blockWords?:string[]):RawStyle;
export declare function summarizeStyle(style:Partial<RawStyle>|null|undefined):StyleProfile;
export declare function matchTags(text:string,extraRules?:PersonaMemoryConfig['extraRules']):{tag:string;advice:string;word:string;source:string}[];
export declare function normalizeTag(raw:unknown,now?:number):Tag|null;
export declare function hitTag(tags:Tag[],tag:string,advice:string,now:number,ttlHours?:number):Tag[];
export declare function sweepTags(tags:Tag[],now:number,options?:Pick<PersonaMemoryConfig,'tagTtlHours'|'maxTagsPerPerson'|'longTermTtlDays'|'maxInjections'>):{tags:Tag[];expired:number;promoted:number;demoted:number;forcedOut:number};

export interface MemoryAtOptions {subject:MemorySubject;kind:MemoryKind;key:string;at:number;knownAt?:number}
export type ExportMemoriesOptions=MemorySelection&Pick<MemorySearchFilters,'kinds'|'keys'|'sources'>;
export type PortableMemory=Pick<MemoryRecord,'id'|'subject'|'kind'|'key'|'value'|'source'|'evidenceId'|'observedAt'|'validFrom'|'expiresAt'>;
export interface MemoryBundle {format:'persona-memory/records';version:1;exportedAt:number;records:PortableMemory[]}
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
export type CandidateMemory=Omit<PortableMemory,'id'|'evidenceId'>&{evidenceId:string};
export interface CandidateInput {
  id?:string;memory:Omit<MemoryInput,'id'|'replaceId'|'expectedRevision'|'experience'>&{evidenceId:string};
  reason?:string;confidence?:number;ttlHours?:number;
}
export interface MemoryCandidate {
  id:string;memory:CandidateMemory;reason:string;confidence?:number;
  base:{id:string|null;revision:number;fingerprint:string};
  createdAt:number;updatedAt:number;expiresAt:number;revision:number;status:CandidateStatus;
  reviewedAt?:number;decisionReason?:string;acceptedId?:string;
}
export interface CandidateRevision {
  expectedRevision:number;memory?:Partial<Pick<CandidateMemory,'value'|'evidenceId'|'observedAt'|'validFrom'|'expiresAt'>>;
  reason?:string;confidence?:number;
}
export interface CandidateAcceptance {candidate:MemoryCandidate;record:MemoryRecord|null;duplicate:boolean}
export interface AutoAcceptPolicy {kinds:MemoryKind[];minConfidence:number;maxPerCall:number}
export interface CandidateBatchResult {candidates:MemoryCandidate[];accepted:string[];omitted:{id:string;reason:string}[]}
export type ExperienceOutcome='success'|'failure'|'mixed'|'unknown';
export interface ExperienceMetadata {outcome:ExperienceOutcome;verified:boolean}
export type ExperienceValue={task:string;context:MemoryValue;attempt:string;result:string;conditions:string[]};
export interface ExperienceInput extends Omit<MemoryInput,'kind'|'value'|'source'|'experience'> {
  task:string;context?:MemoryValue;attempt:string;result:string;conditions?:string[];outcome:ExperienceOutcome;verified?:boolean;
}
export type ExperienceRecord=MemoryRecord&{kind:'episode';source:'host';experience:ExperienceMetadata;value:ExperienceValue};
