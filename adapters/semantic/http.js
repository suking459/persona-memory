import {assertMemoryFields as fields,memoryIdentifier,memoryArray} from '../../src/records.js';
import {copySnapshotJSON} from '../../src/snapshot.js';
export function normalizeEmbeddingConfig(raw){
  const value=copySnapshotJSON(raw,8192);
  fields(value,new Set(['provider','endpoint','model','apiKeyEnv','timeoutMs','maxCandidates','minSimilarity','cacheSize']),'embedding configuration');
  if(!['ollama','openai-compatible'].includes(value.provider))throw new TypeError('unsupported embedding provider');
  if(typeof value.endpoint!=='string'||value.endpoint.length>2048)throw new TypeError('embedding endpoint required');
  let endpoint;try{endpoint=new URL(value.endpoint);}catch{throw new TypeError('invalid embedding endpoint');}
  const loopback=['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
  if((endpoint.protocol!=='https:'&&!(endpoint.protocol==='http:'&&loopback))||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw new TypeError('use HTTPS or loopback HTTP without URL credentials/query/fragment');
  if(endpoint.href.length>2048)throw new TypeError('canonical embedding endpoint too long');
  const model=memoryIdentifier(value.model,'embedding model');
  if(value.apiKeyEnv!==undefined&&(typeof value.apiKeyEnv!=='string'||!/^[A-Z][A-Z0-9_]{0,127}$/.test(value.apiKeyEnv)))throw new TypeError('invalid credential environment variable name');
  const bounded=(name,fallback,min,max)=>{const number=value[name]===undefined?fallback:value[name];if(!Number.isSafeInteger(number)||number<min||number>max)throw new RangeError('invalid embedding '+name);return number;};
  const minSimilarity=value.minSimilarity===undefined?0.55:value.minSimilarity;
  if(typeof minSimilarity!=='number'||!Number.isFinite(minSimilarity)||minSimilarity<0||minSimilarity>1)throw new RangeError('invalid minimum similarity');
  return Object.freeze({provider:value.provider,endpoint:endpoint.href,model,...(value.apiKeyEnv===undefined?{}:{apiKeyEnv:value.apiKeyEnv}),
    timeoutMs:bounded('timeoutMs',5000,1,60000),maxCandidates:bounded('maxCandidates',64,1,128),cacheSize:bounded('cacheSize',128,0,512),minSimilarity});
}
export function createHttpEmbedder(raw,{apiKey,fetchImpl=globalThis.fetch,maxResponseBytes=16777216}={}){
  const config=normalizeEmbeddingConfig(raw);
  if(typeof fetchImpl!=='function'||!Number.isSafeInteger(maxResponseBytes)||maxResponseBytes<1024||maxResponseBytes>16777216)throw new TypeError('invalid embedding HTTP implementation or response budget');
  if(apiKey!==undefined&&(typeof apiKey!=='string'||apiKey.length>8192||/[\u0000-\u001f\u007f]/.test(apiKey)))throw new TypeError('invalid embedding credential');
  let returnedModel;
  return async function embed({texts,signal}){
    texts=memoryArray(texts,'embedding inputs',129);
    if(!texts.length||texts.some(text=>typeof text!=='string'||!text.length)||Buffer.byteLength(JSON.stringify(texts))>1048576)throw new RangeError('embedding input budget exceeded');
    if(signal!==undefined&&!(signal instanceof AbortSignal))throw new TypeError('AbortSignal required');
    if(signal?.aborted)throw Object.assign(new Error('embedding aborted'),{code:'ERR_EMBEDDING_ABORTED'});
    if(config.apiKeyEnv&&!apiKey)throw Object.assign(new Error('embedding credential unavailable'),{code:'ERR_EMBEDDING_AUTH'});
    const controller=new AbortController();let timer,abortListener,reader;
    const interrupted=new Promise((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reader?.cancel().catch(()=>{});reject(Object.assign(new Error('embedding deadline exceeded'),{code:'ERR_EMBEDDING_TIMEOUT'}));},config.timeoutMs);
      if(signal){abortListener=()=>{controller.abort();reader?.cancel().catch(()=>{});reject(Object.assign(new Error('embedding aborted'),{code:'ERR_EMBEDDING_ABORTED'}));};signal.addEventListener('abort',abortListener,{once:true});}
    });
    const request=async()=>{
      const body=config.provider==='ollama'?{model:config.model,input:texts,truncate:false}:{model:config.model,input:texts,encoding_format:'float'};
      const response=await fetchImpl(config.endpoint,{method:'POST',headers:{'content-type':'application/json',...(apiKey?{authorization:'Bearer '+apiKey}:{})},body:JSON.stringify(body),signal:controller.signal,redirect:'error'});
      if(!response.ok){await response.body?.cancel();throw Object.assign(new Error('embedding HTTP request failed'),{code:'ERR_EMBEDDING_HTTP'});}
      const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)>maxResponseBytes){await response.body?.cancel();throw new RangeError('embedding response budget exceeded');}
      if(!response.body)throw new TypeError('embedding response has no body');
      reader=response.body.getReader();const chunks=[];let bytes=0;
      try{for(;;){if(controller.signal.aborted)throw new Error('embedding aborted');const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>maxResponseBytes)throw new RangeError('embedding response budget exceeded');chunks.push(Buffer.from(next.value));}}
      catch(error){await reader.cancel().catch(()=>{});throw error;}finally{reader.releaseLock();}
      if(controller.signal.aborted)throw new Error('embedding aborted');
      const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes))),model=memoryIdentifier(parsed.model,'returned embedding model');
      if(returnedModel!==undefined&&returnedModel!==model)throw Object.assign(new Error('embedding model identity changed'),{code:'ERR_EMBEDDING_MODEL_CHANGED'});
      returnedModel=model;
      if(config.provider==='ollama')return parsed.embeddings;
      const data=memoryArray(parsed.data,'embedding response rows',129);
      if(data.length!==texts.length)throw new TypeError('embedding response row count differs');
      const vectors=new Array(texts.length),seen=new Set();
      for(const row of data){fields(row,new Set(['object','index','embedding']),'embedding response row');if(!Number.isSafeInteger(row.index)||row.index<0||row.index>=texts.length||seen.has(row.index))throw new TypeError('invalid embedding response index');seen.add(row.index);vectors[row.index]=row.embedding;}
      return vectors;
    };
    try{return await Promise.race([request(),interrupted]);}
    catch(cause){
      const allowed=['ERR_EMBEDDING_TIMEOUT','ERR_EMBEDDING_ABORTED','ERR_EMBEDDING_HTTP','ERR_EMBEDDING_MODEL_CHANGED'];
      const value=cause&&typeof cause==='object'?Object.getOwnPropertyDescriptor(cause,'code')?.value:undefined;
      const code=allowed.includes(value)?value:signal?.aborted?'ERR_EMBEDDING_ABORTED':'ERR_EMBEDDING_PROTOCOL';
      throw Object.assign(new Error('embedding operation unavailable'),{code});
    }finally{clearTimeout(timer);if(signal&&abortListener)signal.removeEventListener('abort',abortListener);}
  };
}
