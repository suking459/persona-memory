// Bounded, local retrieval. External relevance is data supplied by the host, never a callback.
import {MEMORY_KINDS,normalizeSubject,memoryIdentifier,sameSubject,isCurrentMemory,assertMemoryFields} from './records.js';

const SOURCES=['manual','user','host','rule','model','import'];
const SEARCH_FIELDS=new Set(['subject','subjects','query','kinds','keys','sources','observedAfter','observedBefore','limit','maxCandidates','minScore','relevance','now']);
const CONTEXT_FIELDS=new Set([...SEARCH_FIELDS].filter(key=>key!=='limit').concat(['budget','maxRecords','tokenBudget','countTokens']));
const STOP=new Set(['a','an','the','is','are','what','when','how','do','does','i','you','my','please','can','could','should','to','of','and','for','it','be',
  '的','了','吗','呢','我','你','他','她','是','和','与','在','这个','那个','什么','怎么','如何','我们','你们','他们','请问','一下','是否','可以','现在','时候']);
const CJK=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const WORD=/[\p{L}\p{N}]/u;
const CONNECTORS=new Set(['_','+','#','.','-']);
const MAX_TIME=8640000000000000;
const binary=(a,b)=>a<b?-1:a>b?1:0;
const normalized=text=>text.normalize('NFC').toLowerCase();
function integer(value,label,max){
  if(!Number.isSafeInteger(value) || value<0 || value>max)throw new RangeError('invalid '+label);
  return value;
}
function time(value,label){
  if(typeof value!=='number' || !Number.isFinite(value) || value<0 || value>MAX_TIME)throw new TypeError('invalid '+label);
  return value;
}
function strings(value,label,allowed,max=32){
  if(value===undefined)return undefined;
  if(!Array.isArray(value) || value.length>max)throw new TypeError('invalid '+label);
  const result=[];
  for(const item of value){
    const text=memoryIdentifier(item,label);
    if(allowed && !allowed.includes(text))throw new TypeError('invalid '+label);
    if(!result.includes(text))result.push(text);
  }
  return result;
}
function tokenize(text,query=false){
  const tokens=new Set();let run='',mode='';
  const add=word=>{
    if(!word || (query && STOP.has(word)))return;
    tokens.add(word);
    if(query && tokens.size>64)throw new RangeError('too many query terms');
  };
  function flush(){
    if(mode==='cjk'){
      const chars=Array.from(run);
      if(!query || chars.length===1)for(const char of chars)add(char);
      for(let i=0;i+1<chars.length;i++)add(chars[i]+chars[i+1]);
    }else if(run){
      const word=run.replace(/^[_.-]+|[_.-]+$/g,'');
      add(word);
      // Expand stored identifiers for natural word queries, but preserve a query's literal version/identifier.
      if(!query && /[_.-]/.test(word))for(const part of word.split(/[_.-]+/))add(part);
    }
    run='';mode='';
  }
  for(const char of text){
    const next=CJK.test(char)?'cjk':WORD.test(char)?'word':'';
    if(next){if(mode && mode!==next)flush();mode=next;run+=char;}
    else if(mode==='word' && CONNECTORS.has(char))run+=char;
    else flush();
  }
  flush();return tokens;
}
export function normalizeMemorySearch(options={}){
  assertMemoryFields(options,SEARCH_FIELDS,'memory search options');
  if((options.subject===undefined)===(options.subjects===undefined))throw new TypeError('provide subject or subjects');
  const values=options.subject===undefined?options.subjects:[options.subject];
  if(!Array.isArray(values) || !values.length || values.length>32)throw new RangeError('invalid memory subjects');
  const subjects=[];
  for(const value of values){
    const subject=normalizeSubject(value);
    if(!subjects.some(item=>sameSubject(item,subject)))subjects.push(subject);
  }
  const query=options.query===undefined?'':options.query;
  if(typeof query!=='string' || query.length>1024)throw new RangeError('invalid or oversized memory query');
  const queryText=normalized(query.trim()),terms=[...tokenize(queryText,true)];
  const limit=integer((options.limit===undefined?10:options.limit),'memory search limit',1000);
  const maxCandidates=integer((options.maxCandidates===undefined?1000:options.maxCandidates),'memory search candidates',10000);
  const minScore=options.minScore===undefined?0:options.minScore;
  if(typeof minScore!=='number' || !Number.isFinite(minScore) || minScore<0 || minScore>1024)throw new RangeError('invalid memory minimum score');
  const relevance=new Map();
  if(options.relevance!==undefined){
    if(!Array.isArray(options.relevance) || options.relevance.length>1000)throw new RangeError('too many external relevance results');
    for(const item of options.relevance){
      assertMemoryFields(item,new Set(['id','score']),'external relevance');
      const id=memoryIdentifier(item.id);
      if(typeof item.score!=='number' || !Number.isFinite(item.score) || item.score<0 || item.score>1)throw new TypeError('invalid external relevance score');
      if(relevance.has(id))throw new TypeError('duplicate external relevance id');
      relevance.set(id,item.score);
    }
  }
  const observedAfter=options.observedAfter===undefined?undefined:time(options.observedAfter,'observedAfter');
  const observedBefore=options.observedBefore===undefined?undefined:time(options.observedBefore,'observedBefore');
  if(observedAfter!==undefined && observedBefore!==undefined && observedAfter>observedBefore)throw new RangeError('invalid observation time range');
  return {subjects,query:query.trim(),queryText,terms,limit,maxCandidates,minScore,relevance,
    kinds:strings(options.kinds,'memory kinds',MEMORY_KINDS,6),
    keys:strings(options.keys,'memory keys',null),
    sources:strings(options.sources,'memory sources',SOURCES,6),observedAfter,observedBefore,
    now:options.now===undefined?undefined:time(options.now,'search time')};
}
export function normalizeMemoryContext(options={},defaultBudget=700){
  assertMemoryFields(options,CONTEXT_FIELDS,'memory context options');
  const selection={};
  for(const key of SEARCH_FIELDS)if(key!=='limit' && options[key]!==undefined)selection[key]=options[key];
  selection.limit=1000;
  const search=normalizeMemorySearch(selection);
  const budget=integer(options.budget===undefined?defaultBudget:options.budget,'memory character budget',100000);
  const maxRecords=integer(options.maxRecords===undefined?8:options.maxRecords,'memory context records',64);
  let tokenBudget;
  if(options.tokenBudget!==undefined){
    tokenBudget=integer(options.tokenBudget,'memory token budget',1000000);
    if(typeof options.countTokens!=='function')throw new TypeError('tokenBudget requires a tokenizer');
  }else if(options.countTokens!==undefined && typeof options.countTokens!=='function')throw new TypeError('invalid tokenizer');
  return {search,budget,maxRecords,tokenBudget,countTokens:options.countTokens};
}
export function retrieveMemories(records,options,now){
  const {subjects,kinds,keys,sources,observedAfter,observedBefore,maxCandidates,queryText,terms,relevance,minScore}=options;
  let scoped=0;const eligible=[];
  for(const record of Object.values(records)){
    if(!subjects.some(subject=>sameSubject(subject,record.subject)))continue;
    scoped++;
    if(!isCurrentMemory(record,now) || (kinds && !kinds.includes(record.kind)) ||
      (keys && !keys.includes(record.key)) || (sources && !sources.includes(record.source)) ||
      (observedAfter!==undefined && record.observedAt<observedAfter) ||
      (observedBefore!==undefined && record.observedAt>observedBefore))continue;
    eligible.push(record);
  }
  // External candidates are still filtered first and cannot escape the host's explicit subjects.
  eligible.sort((a,b)=>(relevance.get(b.id)??0)-(relevance.get(a.id)??0) ||
    b.observedAt-a.observedAt || b.createdAt-a.createdAt || binary(a.id,b.id));
  const candidates=eligible.slice(0,maxCandidates),matches=[];
  let scannedCharacters=0,textLimit=0;
  for(const record of candidates){
    let score=0;const reasons=[],matchedTerms=[];
    const externalScore=relevance.get(record.id)??0;
    let lexical=false;
    if(queryText){
      if(terms.length){
        const rawValue=typeof record.value==='string'?record.value:JSON.stringify(record.value);
        const cost=record.key.length+rawValue.length;
        if(scannedCharacters+cost>1000000){textLimit++;}
        else {
        scannedCharacters+=cost;
        const keyText=normalized(record.key),valueText=normalized(rawValue);
        const keyTokens=tokenize(keyText),valueTokens=tokenize(valueText);
        let keyHits=0,valueHits=0;
        for(const term of terms){
          const inKey=keyTokens.has(term),inValue=valueTokens.has(term);
          if(inKey || inValue)matchedTerms.push(term);
          if(inKey)keyHits++;if(inValue)valueHits++;
        }
        lexical=matchedTerms.length>0;
        if(lexical){
          score=keyHits*3+valueHits;
          if(keyHits)reasons.push('key-match');if(valueHits)reasons.push('value-match');
          if(keyText===queryText){score+=6;reasons.push('exact-key');}
          else if(queryText.length>=2 && keyText.includes(queryText)){score+=2;reasons.push('key-phrase');}
          if(queryText.length>=2 && valueText.includes(queryText)){score+=1;reasons.push('value-phrase');}
        }
        }
      }
      if(!lexical && externalScore===0)continue;
    }else{score=1;reasons.push('explicit-filter');}
    if(externalScore>0){score+=externalScore*8;reasons.push('external-relevance');}
    if(score<minScore)continue;
    matches.push({record,score,matchedTerms,reasons,
      method:externalScore>0?(lexical?'hybrid':'external'):(queryText?'lexical':'filter'),
      ...(externalScore>0?{externalScore}:{})});
  }
  matches.sort((a,b)=>b.score-a.score || b.record.observedAt-a.record.observedAt ||
    b.record.createdAt-a.record.createdAt || binary(a.record.id,b.record.id));
  return {query:options.query,terms:[...terms],matches:matches.slice(0,options.limit),scoped,
    eligible:eligible.length,considered:candidates.length,matched:matches.length,
    scannedCharacters,truncated:eligible.length>candidates.length || textLimit>0,
    omitted:{workLimit:eligible.length-candidates.length,textLimit,resultLimit:Math.max(0,matches.length-options.limit)}};
}
