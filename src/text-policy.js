// Independently implemented bounded literal-text policy; no model or regex backtracking.
export const TEXT_LIMITS=Object.freeze({messageChars:100000,ruleGroups:64,wordsPerRule:128,totalWords:512,wordChars:128,occurrencesPerWord:256});
const CLOSE=new Map([['“','”'],['「','」'],['『','』'],['"','"']]);
export function maskQuotedText(value){
  const text=String(value??'');
  if(text.length>TEXT_LIMITS.messageChars)throw new RangeError('message too large');
  const output=[];let close=null;
  for(const char of text){
    if(close!==null){if(char===close)close=null;continue;}
    if(CLOSE.has(char)){close=CLOSE.get(char);output.push(' ');}else output.push(char);
  }
  return output.join('');
}
export function validateTagRules(rules={}){
  if(!rules || typeof rules!=='object' || Array.isArray(rules))throw new TypeError('extraRules must be an object');
  const entries=Object.entries(rules);if(entries.length>TEXT_LIMITS.ruleGroups)throw new RangeError('too many tag rules');
  let total=0;
  for(const [tag,rule] of entries){
    if(!tag.trim() || tag.length>256 || !rule || typeof rule!=='object' || !Array.isArray(rule.words))throw new TypeError('invalid tag rule');
    if(rule.words.length>TEXT_LIMITS.wordsPerRule)throw new RangeError('too many words in tag rule');
    for(const word of rule.words){if(typeof word!=='string' || !word.trim() || word.length>TEXT_LIMITS.wordChars)throw new TypeError('invalid literal keyword');total++;}
    if(rule.advice!==undefined && (typeof rule.advice!=='string' || rule.advice.length>2000))throw new TypeError('invalid tag advice');
  }
  if(total>TEXT_LIMITS.totalWords)throw new RangeError('too many total keywords');
}
/** Progress is strict: nonempty needle; every rejected occurrence advances by its length. */
export function findEvidence(text,word){
  const needle=word.toLowerCase();let from=0,attempts=0;
  while(from<=text.length){
    const at=text.indexOf(needle,from);if(at<0)return false;
    if(++attempts>TEXT_LIMITS.occurrencesPerWord)throw new RangeError('excessive repeated keyword matches; split this message');
    const before=text.slice(Math.max(0,at-6),at);
    if(!/(?:不是|并非|不再|没有|不用|没|不).{0,2}$/.test(before))return true;
    from=at+needle.length;
  }
  return false;
}
