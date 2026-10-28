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
export interface PersonaMemoryConfig {
  dailyGainCap?:number;talkDailyCap?:number;decayPerDay?:number;perMessageCap?:number;
  tagTtlHours?:number;maxTagsPerPerson?:number;attentionWindowSec?:number;
  maxPeople?:number;maxChars?:number;blockWords?:string[];
  extraRules?:Record<string,{words:string[];advice:string}>;decayBaseline?:number;
  longTermTtlDays?:number;maxInjections?:number;visitorTracking?:boolean;visitorHint?:boolean;
  visitorHintMinCount?:number;tagScope?:'user'|'chat';timeZone?:string;botId?:string|null;
  scoreAmbient?:boolean;maxProfiles?:number;maxSnapshotBytes?:number;maxVisitors?:number;visitorRetentionDays?:number;maxStyleFragments?:number;
  dedupeLimit?:number;dedupeDays?:number;historyLimit?:number;dimensions?:Record<string,DimensionRule>;
}
export interface PersonaMemoryOptions {storage?:string|null;persona?:string;scope?:string;config?:PersonaMemoryConfig;clock?:()=>number}
export interface IngestResult {matched:boolean;delta:number;reasons:string[];tags?:string[];visitor?:boolean;duplicate?:boolean;ignored?:'out-of-order'}
export interface MaintainResult {decayed:number;expired:number;promoted:number;demoted:number;forcedOut:number}
export interface BuildBlockOptions {chatId:string;userIds:string[];budget?:number;maxPeople?:number;priorityUserIds?:string[];now?:number;tokenBudget?:number;countTokens?:(text:string)=>number}
export interface ContextPerson {userId:string;kind:'profile'|'visitor';reason:'explicit-priority'|'recent-activity';tags:Tag[]}
export interface MemoryContext {
  contextId:string;chatId:string;text:string;people:ContextPerson[];
  omitted:{userId:string;tag?:string;reason:string}[];budget:number;characters:number;createdAt:number;tokens?:number;tokenBudget?:number;
}
export interface MemorySnapshot {
  schemaVersion:1|2;persona:string;scope?:string;tagScope?:'user'|'chat';
  sessions:Record<string,Record<string,unknown>>;tags:Record<string,Tag[]>;
  visitors:Record<string,Omit<Visitor,'userId'>>;
  seen?:unknown[];uses?:unknown[];history?:unknown[];
}
export interface TagInput {chatId:string;userId:string;tag:string;advice?:string;source?:Tag['source'];eventId?:string;expiresAt?:number|null;replace?:string[];ts?:number}
export interface HostEvent {chatId:string;userId:string;eventId?:string;type:string;changes:Record<string,number>;ts?:number}
export interface DiagnosticStats {schemaVersion:number;profiles:number;visitors:number;tags:number;dedupeEntries:number;confirmedTurns:number;historyEntries:number}
export declare class PersonaMemory {
  constructor(options?:PersonaMemoryOptions);
  readonly persona:string;readonly scope:string;readonly storage:string|null;config:PersonaMemoryConfig;
  ingest(msg:ChatMessage):IngestResult;
  buildBlock(options:BuildBlockOptions):string;
  buildContext(options:BuildBlockOptions):MemoryContext;
  confirmContext(context:string|MemoryContext,options:{turnId:string}):{confirmed:boolean;duplicate?:boolean;tagCount:number};
  getProfile(chatId:string,userId:string):Profile|null;
  getVisitor(userId:string,options?:{chatId?:string}):Visitor|null;
  listVisitors(limit?:number):Visitor[];
  setTag(input:TagInput):Tag|{duplicate:true};
  removeTag(input:{chatId?:string;userId:string;tag:string}):boolean;
  recordEvent(input:HostEvent):Record<string,DimensionState>|{duplicate:true};
  deleteUser(userId:string,options?:{chatId?:string}):{removed:number};
  clear():{removed:number};
  diagnostics():DiagnosticStats;
  history(options?:{chatId?:string;userId?:string}):Record<string,unknown>[];
  maintain(now?:number):MaintainResult;
  flush():void;export():MemorySnapshot;import(snapshot:MemorySnapshot):void;
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
