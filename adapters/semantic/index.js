import {assertMemoryFields as fields,memoryArray,memoryFingerprint} from '../../src/records.js';
import {normalizeMemorySearch,normalizeMemoryContext} from '../../src/retrieval.js';
import {normalizeLocale} from '../../src/locale.js';
export {createHttpEmbedder,normalizeEmbeddingConfig} from './http.js';
const error=(message,code)=>Object.assign(new Error(message),{code});
const errorCode=cause=>cause&&typeof cause==='object'?Object.getOwnPropertyDescriptor(cause,'code')?.value:undefined;
function integer(value,fallback,min,max,label){const number=value===undefined?fallback:value;if(!Number.isSafeInteger(number)||number<min||number>max)throw new RangeError('invalid '+label);return number;}
function normalizedVectors(raw,count){
  const vectors=memoryArray(raw,'embedding vectors',129);if(vectors.length!==count)throw new TypeError('embedding vector count differs');
  let dimensions;
  return vectors.map(raw=>{
    const vector=memoryArray(raw,'embedding vector',4096);
    if(!vector.length||vector.some(value=>typeof value!=='number'||!Number.isFinite(value)))throw new TypeError('embedding vector requires bounded finite numbers');
    dimensions??=vector.length;if(vector.length!==dimensions)throw new TypeError('embedding dimensions differ');
    let scale=0;for(const number of vector)scale=Math.max(scale,Math.abs(number));if(!scale)throw new TypeError('zero embedding vector');
    const norm=Math.sqrt(vector.reduce((sum,value)=>sum+(value/scale)**2,0));return vector.map(value=>(value/scale)/norm);
  });
}
export function createSemanticRetriever(pm,options){
  fields(options,new Set(['subject','subjects','kinds','keys','sources','locale','embed','timeoutMs','maxCandidates','maxInputBytes','cacheSize','minSimilarity','fallback']),'semantic retriever options');
  if(typeof options.embed!=='function')throw new TypeError('embedding callback required');
  const embed=options.embed,timeoutMs=integer(options.timeoutMs,5000,1,60000,'semantic timeout'),maxCandidates=integer(options.maxCandidates,64,1,128,'semantic candidates');
  const maxInputBytes=integer(options.maxInputBytes,262144,1024,1048576,'semantic input budget'),cacheSize=integer(options.cacheSize,128,0,512,'semantic cache');
  const minSimilarity=options.minSimilarity===undefined?0.55:options.minSimilarity;
  if(typeof minSimilarity!=='number'||!Number.isFinite(minSimilarity)||minSimilarity<0||minSimilarity>1)throw new RangeError('invalid semantic minimum similarity');
  const fallback=options.fallback===undefined?'lexical':options.fallback;if(!['lexical','error'].includes(fallback))throw new TypeError('invalid semantic fallback');
  const selected={};for(const key of ['subject','subjects','kinds','keys','sources','locale'])if(options[key]!==undefined)selected[key]=options[key];
  const normalized=normalizeMemorySearch({...selected,query:'',limit:maxCandidates});
  const base={subjects:normalized.subjects,...Object.fromEntries(['kinds','keys','sources','locale'].filter(key=>normalized[key]!==undefined).map(key=>[key,normalized[key]]))};
  let caches=new WeakMap(),busy=false,calls=0,failures=0;
  function argumentsOf(raw,context){
    fields(raw,new Set(['query','locale','signal',...(context?['budget','maxRecords','tokenBudget','countTokens']:['limit'])]),'semantic query');
    if(raw.signal!==undefined&&!(raw.signal instanceof AbortSignal))throw new TypeError('AbortSignal required');
    const locale=normalizeLocale(raw.locale===undefined?base.locale:raw.locale),selection={...base,query:raw.query,locale};
    const captured=Object.fromEntries((context?['budget','maxRecords','tokenBudget','countTokens']:['limit']).filter(key=>raw[key]!==undefined).map(key=>[key,raw[key]]));
    if(context){const settings=normalizeMemoryContext({...selection,...captured},pm.config.maxChars);captured.budget=settings.budget;captured.maxRecords=settings.maxRecords;}
    else {captured.limit=raw.limit===undefined?8:raw.limit;normalizeMemorySearch({...selection,limit:captured.limit});}
    return {selection,signal:raw.signal,captured};
  }
  async function relevance(raw,context){
    const {selection,signal,captured}=argumentsOf(raw,context);
    if(signal?.aborted)throw error('semantic query aborted','ERR_SEMANTIC_ABORTED');
    if(busy)throw error('semantic query already running','ERR_SEMANTIC_BUSY');busy=true;
    let controller,timer,abortListener;
    try{
      const epoch=pm._recordEpoch,query=selection.query===undefined?'':selection.query.trim();
      const diagnostic={mode:'lexical',called:false,candidates:0,cacheHits:0,omittedInputBudget:0};
      if(!query)return {selection,signal,captured,epoch,diagnostic,relevance:[]};
      let cache=caches.get(epoch);if(!cache){cache=new Map();caches.set(epoch,cache);}
      const lexical=pm.searchMemories({...selection,limit:maxCandidates}),recent=pm.searchMemories({...selection,query:'',limit:maxCandidates});
      const pool=new Map();
      for(const item of [...lexical.matches,...recent.matches]){if(pool.size>=maxCandidates)break;if(!pool.has(item.record.id))pool.set(item.record.id,item.record);}
      if(!pool.size)return {selection,signal,captured,epoch,diagnostic,relevance:[]};
      diagnostic.candidates=pool.size;diagnostic.truncated=lexical.truncated||recent.truncated||recent.eligible>pool.size;
      const rows=[],texts=[query];let inputBytes=Buffer.byteLength(JSON.stringify(texts));
      if(inputBytes>maxInputBytes){diagnostic.omittedInputBudget=pool.size;return {selection,signal,captured,epoch,diagnostic,relevance:[]};}
      for(const record of pool.values()){
        const fingerprint=memoryFingerprint(record),cached=cache.get(record.id);
        if(cached?.fingerprint===fingerprint){rows.push({record,fingerprint,vector:cached.vector});diagnostic.cacheHits++;continue;}
        const text=JSON.stringify({kind:record.kind,key:record.key,value:record.value,assertion:record.assertion??'unspecified'}),cost=Buffer.byteLength(JSON.stringify(text))+1;
        if(inputBytes+cost>maxInputBytes){diagnostic.omittedInputBudget++;continue;}
        inputBytes+=cost;texts.push(text);rows.push({record,fingerprint,index:texts.length-1});
      }
      if(!rows.length)return {selection,signal,captured,epoch,diagnostic,relevance:[]};
      controller=new AbortController();
      const interrupted=new Promise((_,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(error('semantic deadline exceeded','ERR_SEMANTIC_TIMEOUT'));},timeoutMs);
        if(signal){abortListener=()=>{controller.abort();reject(error('semantic query aborted','ERR_SEMANTIC_ABORTED'));};signal.addEventListener('abort',abortListener,{once:true});}
      });
      if(epoch!==pm._recordEpoch)throw error('memory changed before semantic request','ERR_SEMANTIC_STALE');
      calls++;diagnostic.called=true;
      const rawVectors=await Promise.race([Promise.resolve().then(()=>embed({texts:[...texts],locale:selection.locale,signal:controller.signal})),interrupted]);
      if(signal?.aborted)throw error('semantic query aborted','ERR_SEMANTIC_ABORTED');
      if(epoch!==pm._recordEpoch)throw error('memory changed during semantic retrieval','ERR_SEMANTIC_STALE');
      const vectors=normalizedVectors(rawVectors,texts.length),queryVector=vectors[0],scores=[];
      for(const row of rows){
        const vector=row.vector??vectors[row.index];
        if(vector.length!==queryVector.length){caches=new WeakMap();throw error('embedding model dimensions changed','ERR_SEMANTIC_VECTOR');}
        let cosine=0;for(let index=0;index<vector.length;index++)cosine+=vector[index]*queryVector[index];
        cosine=Math.max(-1,Math.min(1,cosine));
        if(cosine>=minSimilarity&&cosine>0)scores.push({id:row.record.id,score:cosine});
      }
      for(const row of rows)if(!row.vector&&cacheSize){cache.set(row.record.id,{fingerprint:row.fingerprint,vector:vectors[row.index]});while(cache.size>cacheSize)cache.delete(cache.keys().next().value);}
      diagnostic.mode='hybrid';diagnostic.matched=scores.length;
      return {selection,signal,captured,epoch,diagnostic,relevance:scores};
    }catch(cause){
      const code=errorCode(cause);
      if(code==='ERR_SEMANTIC_ABORTED'||signal?.aborted)throw error('semantic query aborted','ERR_SEMANTIC_ABORTED');
      failures++;if(fallback==='error')throw error('semantic retrieval unavailable',['ERR_SEMANTIC_TIMEOUT','ERR_EMBEDDING_TIMEOUT'].includes(code)?'ERR_SEMANTIC_TIMEOUT':'ERR_SEMANTIC_PROVIDER');
      const reason=['ERR_SEMANTIC_TIMEOUT','ERR_EMBEDDING_TIMEOUT'].includes(code)?'timeout':code==='ERR_SEMANTIC_STALE'?'memory-changed':'provider-error';
      caches=new WeakMap();return {selection,signal,captured,diagnostic:{mode:'fallback',called:true,reason},relevance:[]};
    }finally{if(timer)clearTimeout(timer);if(signal&&abortListener)signal.removeEventListener('abort',abortListener);busy=false;}
  }
  function finalArguments(result){
    if(result.signal?.aborted)throw error('semantic query aborted','ERR_SEMANTIC_ABORTED');
    if(result.epoch&&result.epoch!==pm._recordEpoch){
      caches=new WeakMap();failures++;
      if(fallback==='error')throw error('memory changed during semantic retrieval','ERR_SEMANTIC_STALE');
      result.relevance=[];result.diagnostic={mode:'fallback',called:result.diagnostic.called,reason:'memory-changed'};
    }
    return {...result.selection,...result.captured,relevance:result.relevance};
  }
  return {
    async search(raw={}){const result=await relevance(raw,false),args=finalArguments(result),output={...pm.searchMemories(args),semantic:result.diagnostic};if(result.signal?.aborted)throw error('semantic query aborted','ERR_SEMANTIC_ABORTED');return output;},
    async buildContext(raw={}){const result=await relevance(raw,true),args=finalArguments(result),output={...pm.buildMemoryContext(args),semantic:result.diagnostic};if(result.signal?.aborted)throw error('semantic query aborted','ERR_SEMANTIC_ABORTED');return output;},
    clear(){caches=new WeakMap();},
    stats(){return {providerAttempts:calls,failures,cacheEntries:caches.get(pm._recordEpoch)?.size??0,busy};},
  };
}
