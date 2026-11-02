import {TEXT_LIMITS,maskQuotedText,validateTagRules,findEvidence} from './text-policy.js';
import {dictionaryWords} from './locale.js';
export {normalizeTag,hitTag,sweepTags} from './lifecycle.js';

// API numbers are compatibility parameters. No default personality or sentiment vocabulary.
export const AFFINITY_MIN=0;
export const AFFINITY_MAX=100;
export const TIERS=Object.freeze(Array.from({length:5},(_,index)=>Object.freeze({
  min:(4-index)*20,tier:'band-'+(4-index),hint:'',
})));
export const TAG_RULES=Object.freeze([]);
export const SCORE_RULES=Object.freeze({
  talkToBot:1,talkDailyCap:12,at:2,quote:2,praise:0,insult:0,pat:0,perMessageCap:8,dailyGainCap:30,
});

export function clampAffinity(value,min=AFFINITY_MIN,max=AFFINITY_MAX){
  const numeric=Number(value);
  if(!Number.isFinite(numeric)||numeric<min)return min;
  return numeric>max?max:numeric;
}
export function tierOf(value){
  const band=Math.min(4,Math.floor(clampAffinity(value)/20));
  return TIERS[4-band];
}
export function applyDailyGain(used,delta,cap){
  if(delta<=0)return delta;
  const remaining=cap-used;
  if(remaining<=0)return 0;
  return delta>remaining?remaining:delta;
}
export function decayAmount(value,baseline,perDay,days){
  const distance=value-baseline;
  if(distance<=0)return 0;
  const elapsed=perDay*days;
  return elapsed<distance?elapsed:distance;
}

/** Text never supplies sentiment. A host delta explicitly overrides structural interaction scoring. */
export function scoreMessage(text,ctx={},overrides={}){
  if(String(text??'').length>TEXT_LIMITS.messageChars)throw new RangeError('message too large');
  const weights={...SCORE_RULES,...overrides};
  for(const name of ['talkToBot','at','quote','perMessageCap']){
    if(!Number.isFinite(weights[name]))throw new TypeError('score weight must be finite');
  }
  if(weights.perMessageCap<0)throw new RangeError('score cap must be nonnegative');
  if(ctx.affinityDelta!==undefined&&!Number.isFinite(ctx.affinityDelta))throw new TypeError('affinityDelta must be finite');
  if(ctx.isSelf)return {delta:0,reasons:[]};
  const reasons=[];let requested=0;
  if(ctx.affinityDelta!==undefined){
    requested=ctx.affinityDelta;reasons.push('host');
  }else{
    for(const [flag,weight,reason]of [['mentionsSelf','at','mention'],['replyToSelf','quote','reply']]){
      if(ctx[flag]){requested+=weights[weight];reasons.push(reason);}
    }
    if(!reasons.length&&ctx.directedToBot){requested=weights.talkToBot;reasons.push('direct');}
  }
  return {delta:clampAffinity(requested,-weights.perMessageCap,weights.perMessageCap),reasons};
}

const finiteCount=value=>Number.isFinite(value)&&value>=0?Math.min(Number.MAX_SAFE_INTEGER,value):0;
export function isNight(ts){
  const hour=new Date(ts).getHours();
  return hour<6||hour>=23;
}
export function updateStyle(style,text,ts,blockWords=[]){
  if(typeof text!=='string'||text.length>TEXT_LIMITS.messageChars)throw new RangeError('invalid or excessive style text');
  const before=style??{},next=Object.fromEntries(['count','totalChars','questions','emojis','night'].map(name=>[name,finiteCount(before[name])]));
  const add=(name,amount)=>{next[name]=Math.min(Number.MAX_SAFE_INTEGER,next[name]+amount);};
  add('count',1);add('totalChars',Array.from(text).length);
  add('questions',/[?？]\s*$/u.test(text)?1:0);
  add('emojis',/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)?1:0);
  add('night',isNight(ts)?1:0);
  const frequencies=new Map(Object.entries(before.catch??{}).filter(([,value])=>Number.isFinite(value)&&value>=0));
  const observed=new Set();
  for(const term of dictionaryWords(text.slice(0,4096))){
    const size=Array.from(term).length;
    if(size<2||size>32||!/[\p{L}]/u.test(term))continue;
    if(blockWords.some(word=>typeof word==='string'&&word&&(term.includes(word)||word.includes(term))))continue;
    observed.add(term);if(observed.size===128)break;
  }
  for(const term of observed)frequencies.set(term,Math.min(Number.MAX_SAFE_INTEGER,(frequencies.get(term)??0)+1));
  next.catch=Object.fromEntries(frequencies);
  return next;
}
export function summarizeStyle(style){
  const raw=style??{},samples=finiteCount(raw.count);
  const percentage=name=>Math.round(1000*finiteCount(raw[name])/(samples||1))/10;
  const phrases=Object.entries(raw.catch??{}).filter(([,value])=>Number.isFinite(value)&&value>=3);
  phrases.sort((a,b)=>b[1]-a[1]||Array.from(b[0]).length-Array.from(a[0]).length||(a[0]<b[0]?-1:a[0]>b[0]?1:0));
  return {count:samples,avgChars:Math.round(10*finiteCount(raw.totalChars)/(samples||1))/10,
    questionRate:percentage('questions'),emojiRate:percentage('emojis'),nightRate:percentage('night'),
    catchphrases:phrases.slice(0,5).map(([word])=>word)};
}

/** Explicit custom rules only. The existing literal-policy guard is not a language-understanding model. */
export function matchTags(text,extraRules={}){
  validateTagRules(extraRules);
  if(!text)return [];
  const searchable=maskQuotedText(text).toLowerCase(),matches=[];
  for(const [tag,rule]of Object.entries(extraRules)){
    for(const word of new Set(rule.words)){
      if(!findEvidence(searchable,word))continue;
      matches.push({tag,advice:rule.advice??'',word,source:'extra'});break;
    }
  }
  return matches;
}
