import type {PersonaMemory,MemorySelection,MemorySearchResult,RecordMemoryContext} from '../../index.js';
export interface EmbeddingConfig {
  provider:'ollama'|'openai-compatible';endpoint:string;model:string;apiKeyEnv?:string;
  timeoutMs?:number;maxCandidates?:number;minSimilarity?:number;cacheSize?:number;
}
export interface NormalizedEmbeddingConfig extends EmbeddingConfig {timeoutMs:number;maxCandidates:number;minSimilarity:number;cacheSize:number}
export interface EmbedInput {texts:string[];locale?:string;signal:AbortSignal}
export type EmbedFunction=(input:EmbedInput)=>number[][]|Promise<number[][]>;
export type SemanticOptions=MemorySelection&{
  kinds?:('preference'|'fact'|'constraint'|'decision'|'episode'|'state')[];keys?:string[];sources?:('manual'|'user'|'host'|'rule'|'model'|'import')[];
  locale?:string;embed:EmbedFunction;timeoutMs?:number;maxCandidates?:number;maxInputBytes?:number;cacheSize?:number;minSimilarity?:number;fallback?:'lexical'|'error';
};
export interface SemanticDiagnostics {
  mode:'lexical'|'hybrid'|'fallback';called:boolean;reason?:'timeout'|'memory-changed'|'store-changed'|'provider-error';
  candidates?:number;cacheHits?:number;omittedInputBudget?:number;truncated?:boolean;matched?:number;
}
export interface SemanticQuery {query?:string;locale?:string;limit?:number;signal?:AbortSignal}
export interface SemanticContextQuery extends Omit<SemanticQuery,'limit'> {budget?:number;maxRecords?:number;tokenBudget?:number;countTokens?:(text:string)=>number}
export interface SemanticRetriever {
  search(query?:SemanticQuery):Promise<MemorySearchResult&{semantic:SemanticDiagnostics}>;
  buildContext(query?:SemanticContextQuery):Promise<RecordMemoryContext&{semantic:SemanticDiagnostics}>;
  clear():void;stats():{providerAttempts:number;failures:number;cacheEntries:number;busy:boolean};
}
export declare function createSemanticRetriever(pm:PersonaMemory,options:SemanticOptions):SemanticRetriever;
export declare function normalizeEmbeddingConfig(config:EmbeddingConfig):Readonly<NormalizedEmbeddingConfig>;
export declare function createHttpEmbedder(config:EmbeddingConfig,options?:{apiKey?:string;fetchImpl?:typeof fetch;maxResponseBytes?:number}):EmbedFunction;
