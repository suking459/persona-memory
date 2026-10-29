// Independently implemented bounded literal-text policy; no model or unbounded regex.
export const TEXT_LIMITS=Object.freeze({messageChars:100000,ruleGroups:64,wordsPerRule:128,totalWords:512,wordChars:128,occurrencesPerWord:256});
const CLOSE=new Map([['“','”'],['「','」'],['『','』'],['"','"']]);
const CLAUSE_END=new Set('，,。.!！?？;；\n\r');
const SENTENCE_END=new Set('。.!！?？;；\n\r');
const CONTEXT_CHARS=160;
const PERSON=/(?:我的?)?(?:朋友|同事|同学|室友|家人|孩子|爸爸|妈妈|父亲|母亲|哥哥|姐姐|弟弟|妹妹|男友|女友|老公|老婆|客户)|他们|她们|(?<!其)他|她|对方|你们|(?<!迷)你|本人|我/g;
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
function contextOf(text,at,length){
  const lower=Math.max(0,at-CONTEXT_CHARS),upper=Math.min(text.length,at+length+CONTEXT_CHARS);
  let start=at,end=at+length;
  while(start>lower && !CLAUSE_END.has(text[start-1]))start--;
  while(end<upper && !CLAUSE_END.has(text[end]))end++;
  let sentenceStart=start;
  while(sentenceStart>lower && !SENTENCE_END.has(text[sentenceStart-1]))sentenceStart--;
  return {before:text.slice(start,at),after:text.slice(at+length,end),sentenceBefore:text.slice(sentenceStart,at),question:text[end]==='?' || text[end]==='？'};
}
function isSpeakerStatement(context){
  // Conservative, local Chinese markers only; this is not general subject or tense parsing.
  if(/如果|假如|假设|万一|(?<!主)要是|倘若|一旦/.test(context.sentenceBefore))return false;
  if(context.question || /请问|问一下|问下|是否|有没有|是不是|会不会|要不要|能不能|为什么|怎么|如何|谁/.test(context.before) || /[吗么][呀啊吧]*\s*$/.test(context.after))return false;
  let subject;
  for(const match of context.before.matchAll(PERSON))subject=match[0];
  return subject===undefined || subject==='我' || subject==='本人';
}
/** Progress is strict: nonempty needle; each rejection advances, with bounded context and occurrences. */
export function findEvidence(text,word){
  const needle=word.toLowerCase();
  if(!needle.length)throw new TypeError('empty literal keyword');
  let from=0,attempts=0;
  while(from<=text.length){
    const at=text.indexOf(needle,from);if(at<0)return false;
    if(++attempts>TEXT_LIMITS.occurrencesPerWord)throw new RangeError('excessive repeated keyword matches; split this message');
    const context=contextOf(text,at,needle.length),before=context.before.slice(-6);
    if(isSpeakerStatement(context) && !/(?:不是|并非|不再|没有|不用|没|不).{0,2}$/.test(before))return true;
    from=at+needle.length;
  }
  return false;
}
