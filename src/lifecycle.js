// Evidence lifecycle reducer: immutable input, deterministic transitions, bounded trimming.
const HOUR=3600000,DAY=86400000,MAX_TIME=8640000000000000;
const SOURCES=new Set(['builtin','extra','model','manual','host']);
const finite=(value,fallback)=>typeof value==='number'&&Number.isFinite(value)?value:fallback;
const deadline=(now,hours)=>Math.min(MAX_TIME,now+hours*HOUR);
function count(value,fallback){return Math.min(Number.MAX_SAFE_INTEGER,Math.max(0,Math.floor(finite(value,fallback))));}
export function normalizeTag(raw,now=Date.now()){
  if(!raw || typeof raw!=='object' || !String(raw.tag??'').trim())return null;
  const addedAt=finite(raw.addedAt,now),lastHitAt=finite(raw.lastHitAt,addedAt);
  const longTerm=raw.longTerm===true || raw.expiresAt===null;
  return {tag:String(raw.tag).trim(),source:SOURCES.has(raw.source)?raw.source:'builtin',advice:String(raw.advice??''),
    addedAt,lastHitAt,lastEvidenceAt:finite(raw.lastEvidenceAt,lastHitAt),
    expiresAt:longTerm?null:finite(raw.expiresAt,deadline(addedAt,48)),longTerm,
    hits:Math.max(1,count(raw.hits,1)),injections:count(raw.injections,0),
    ...(typeof raw.evidenceId==='string'?{evidenceId:raw.evidenceId}:{}),
    ...(raw.promotedAt===null || Number.isFinite(raw.promotedAt)?{promotedAt:raw.promotedAt}:{}),
    ...(Number.isFinite(raw.revision)?{revision:count(raw.revision,0)}:{})};
}
export function hitTag(tags,tag,advice,now,ttlHours=48){
  const next=(tags||[]).map(t=>({...t}));
  const existing=next.find(t=>t.tag===tag);
  if(existing){
    existing.hits=count(existing.hits,0)+1;existing.lastHitAt=now;existing.lastEvidenceAt=now;existing.advice=advice||'';
    if(!existing.longTerm)existing.expiresAt=deadline(now,ttlHours);
  }else next.push({tag,advice:advice||'',source:'builtin',addedAt:now,lastHitAt:now,lastEvidenceAt:now,
    expiresAt:deadline(now,ttlHours),longTerm:false,hits:1,injections:0});
  return next;
}
export function sweepTags(tags,now,options={}){
  if(!Array.isArray(tags) || tags.length>4096)throw new RangeError('invalid or excessive tag list');
  const ttl=options.tagTtlHours??48,max=options.maxTagsPerPerson??16,longDays=options.longTermTtlDays??7,uses=options.maxInjections??200;
  if(![now,ttl,max,longDays,uses].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0) || !Number.isInteger(max) || max>256)throw new RangeError('invalid tag lifecycle options');
  let expired=0,promoted=0,demoted=0,forcedOut=0;
  const surviving=[];
  for(const input of tags){
    const t={...input};
    const isLong=t.longTerm || t.expiresAt===null;
    if(!isLong && now>=t.expiresAt){expired++;continue;}
    const evidence=t.lastEvidenceAt??t.lastHitAt??t.addedAt;
    if(isLong){
      if(now-evidence>longDays*DAY){t.longTerm=false;t.promotedAt=null;t.expiresAt=deadline(now,ttl);demoted++;}
    }else if(t.injections>=6 && now-t.addedAt>=3*DAY && now-evidence<=longDays*DAY){
      t.longTerm=true;t.expiresAt=null;t.promotedAt=now;t.lastEvidenceAt=evidence;promoted++;
    }else if(t.injections>=uses){forcedOut++;expired++;continue;}
    if(!t.longTerm && t.expiresAt!==null && now>=t.expiresAt){expired++;continue;}
    surviving.push(t);
  }
  // Select survivors once instead of repeatedly deleting from an array.
  const ranked=surviving.map((tag,index)=>({tag,index})).sort((a,b)=>
    Number(Boolean(b.tag.longTerm))-Number(Boolean(a.tag.longTerm)) ||
    (b.tag.lastHitAt??b.tag.addedAt)-(a.tag.lastHitAt??a.tag.addedAt) || a.index-b.index);
  const keep=new Set(ranked.slice(0,max).map(r=>r.index));
  return {tags:surviving.filter((_,i)=>keep.has(i)),expired,promoted,demoted,forcedOut};
}
