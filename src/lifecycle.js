// Compatibility contract: pure tag records, finite transitions and stable bounded selection.
const MS_HOUR=60*60*1000,MS_DAY=24*MS_HOUR,LAST_DATE=8.64e15;
const sourceNames=new Set(['builtin','extra','model','manual','host']);
const numeric=(value,fallback)=>Number.isFinite(value)?value:fallback;
const natural=value=>Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(numeric(value,0))));
function timeLimit(start,hours){return Math.min(LAST_DATE,start+MS_HOUR*hours);}
function clockValue(value){if(!Number.isFinite(value)||value<0||value>LAST_DATE)throw new RangeError('invalid tag time');return value;}
function tagList(value){if(!Array.isArray(value)||value.length>4096)throw new RangeError('invalid or excessive tag list');}
export function normalizeTag(raw,now=Date.now()){
  if(raw===null||typeof raw!=='object'||Array.isArray(raw))return null;
  const label=String(raw.tag??'').trim();if(!label)return null;
  clockValue(now);
  const timing={addedAt:numeric(raw.addedAt,now)};
  timing.lastHitAt=numeric(raw.lastHitAt,timing.addedAt);
  timing.lastEvidenceAt=numeric(raw.lastEvidenceAt,timing.lastHitAt);
  const permanent=raw.expiresAt===null||raw.longTerm===true;
  const result={tag:label,source:sourceNames.has(raw.source)?raw.source:'builtin',advice:String(raw.advice??''),
    ...timing,expiresAt:permanent?null:numeric(raw.expiresAt,timeLimit(timing.addedAt,48)),longTerm:permanent,
    hits:Math.max(1,natural(raw.hits)),injections:natural(raw.injections)};
  for(const field of ['evidenceId','promotedAt','revision']){
    const value=raw[field];
    if(field==='evidenceId'){if(typeof value==='string')result[field]=value;}
    else if(field==='promotedAt'){if(value===null||Number.isFinite(value))result[field]=value;}
    else if(Number.isFinite(value))result[field]=natural(value);
  }
  return result;
}
export function hitTag(tags,tag,advice,now,ttlHours=48){
  const input=tags??[];tagList(input);clockValue(now);
  if(typeof tag!=='string'||!tag.trim()||tag.length>256)throw new TypeError('invalid tag label');
  tag=tag.trim();
  if(!Number.isFinite(ttlHours)||ttlHours<0)throw new RangeError('invalid tag lifetime');
  let found=false;
  const output=input.map(item=>{
    const copy={...item};
    if(found||copy.tag!==tag)return copy;
    found=true;
    Object.assign(copy,{hits:Math.min(Number.MAX_SAFE_INTEGER,natural(copy.hits)+1),lastHitAt:now,lastEvidenceAt:now,advice:advice||''});
    if(!copy.longTerm)copy.expiresAt=timeLimit(now,ttlHours);
    return copy;
  });
  if(!found&&output.length===4096)throw new RangeError('tag list capacity exceeded');
  if(!found)output.push(normalizeTag({tag,advice:advice||'',addedAt:now,lastHitAt:now,
    expiresAt:timeLimit(now,ttlHours),hits:1,injections:0},now));
  return output;
}
function classify(tag,now,policy){
  const permanent=Boolean(tag.longTerm)||tag.expiresAt===null;
  if(!permanent&&tag.expiresAt<=now)return 'expired';
  const lastEvidence=tag.lastEvidenceAt??tag.lastHitAt??tag.addedAt;
  if(permanent)return now-lastEvidence>policy.idle?'demoted':'keep';
  const oldEnough=now-tag.addedAt>=3*MS_DAY,recent=now-lastEvidence<=policy.idle;
  if(tag.injections>=6&&oldEnough&&recent)return 'promoted';
  return tag.injections>=policy.uses?'forced':'keep';
}
export function sweepTags(tags,now,options={}){
  tagList(tags);clockValue(now);
  const ttl=options.tagTtlHours??48,capacity=options.maxTagsPerPerson??16;
  const days=options.longTermTtlDays??7,uses=options.maxInjections??200;
  if([ttl,capacity,days,uses].some(value=>!Number.isFinite(value)||value<0)||!Number.isInteger(capacity)||capacity>256)throw new RangeError('invalid tag lifecycle options');
  const counts={expired:0,promoted:0,demoted:0,forcedOut:0},kept=[];
  tags.forEach((original,position)=>{
    const item={...original},state=classify(item,now,{idle:days*MS_DAY,uses});
    if(state==='expired'||state==='forced'){counts.expired++;if(state==='forced')counts.forcedOut++;return;}
    if(state==='promoted'){
      Object.assign(item,{longTerm:true,expiresAt:null,promotedAt:now,lastEvidenceAt:item.lastEvidenceAt??item.lastHitAt??item.addedAt});counts.promoted++;
    }
    if(state==='demoted'){
      Object.assign(item,{longTerm:false,promotedAt:null,expiresAt:timeLimit(now,ttl)});counts.demoted++;
      if(item.expiresAt<=now){counts.expired++;return;}
    }
    kept.push({item,position});
  });
  kept.sort((left,right)=>Number(Boolean(right.item.longTerm))-Number(Boolean(left.item.longTerm))
    ||(right.item.lastHitAt??right.item.addedAt)-(left.item.lastHitAt??left.item.addedAt)||left.position-right.position);
  const selected=kept.slice(0,capacity).sort((a,b)=>a.position-b.position).map(entry=>entry.item);
  return {tags:selected,...counts};
}
