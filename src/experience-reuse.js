// Local evidence labels are assertions by the caller, never proof of real-world results.
import {createHash} from 'node:crypto';
import {experienceInput} from './experience.js';
import {assertMemoryFields as fields,normalizeSubject,sameSubject,memoryIdentifier,memoryArray} from './records.js';

const FORMAT='persona-memory/experience-feedback',OUTCOMES=['helped','not-helpful','failed','not-applicable'];
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function conditions(raw=[]){
  return [...new Set(memoryArray(raw,'reuse conditions',16).map(v=>{
    if(typeof v!=='string'||!v.trim()||v.length>256)throw new TypeError('invalid reuse condition');return v.trim();
  }))].sort();
}
function short(v,label,max=1000){if(typeof v!=='string'||!v.trim()||v.length>max)throw new TypeError('invalid '+label);return v.trim();}
function target(pm,input,{inactive=false}={}){
  const subject=normalizeSubject(input.subject),id=memoryIdentifier(input.id),record=pm.getMemory(id,{includeInactive:inactive});
  if(!record?.experience||!sameSubject(record.subject,subject)||record.status!=='current'||record.revision!==input.expectedRevision)throw new TypeError('current in-scope experience revision required');
  return record;
}
const feedbackKey=(value,evidenceId)=>'experience-feedback-'+digest([value.experienceId,value.experienceRevision,value.trialId,value.verification,evidenceId]);

export function proposeExperience(pm,input){
  fields(input,new Set(['subject','key','task','context','attempt','result','conditions','outcome','verified','evidenceId','observedAt','validFrom','expiresAt','derivedFrom','assertion','origin','source','reason','confidence','ttlHours']),'experience proposal');
  const {source='model',reason='',confidence,ttlHours,...report}=input;
  if(!['host','model'].includes(source))throw new TypeError('experience proposal source must be host or model');
  return pm.proposeMemory({memory:{...experienceInput(report),source},reason,...(confidence===undefined?{}:{confidence}),...(ttlHours===undefined?{}:{ttlHours})});
}

export function proposeExperienceFeedback(pm,input){
  fields(input,new Set(['subject','id','expectedRevision','trialId','outcome','conditions','note','evidenceId','verification','origin']),'experience feedback');
  const record=target(pm,input),trialId=memoryIdentifier(input.trialId,'trialId'),evidenceId=memoryIdentifier(input.evidenceId,'feedback evidence');
  const verification=input.verification??'reported';
  if(!['reported','owner-attested'].includes(verification)||!OUTCOMES.includes(input.outcome))throw new TypeError('invalid experience feedback labels');
  const value={format:FORMAT,version:1,experienceId:record.id,experienceRevision:record.revision,trialId,
    outcome:input.outcome,verification,conditions:conditions(input.conditions),note:input.note===undefined?'':short(input.note,'feedback note')};
  return pm.proposeMemory({memory:{subject:record.subject,kind:'episode',key:feedbackKey(value,evidenceId),value,
    source:verification==='owner-attested'?'host':'model',evidenceId,derivedFrom:[{id:record.id,revision:record.revision}],
    ...(input.origin===undefined?{}:{origin:input.origin})},reason:'Experience feedback requires review; evidence is a caller assertion.'});
}

export function proposeExperienceRetirement(pm,input){
  fields(input,new Set(['subject','id','expectedRevision','evidenceId','reason','retired','origin']),'experience lifecycle proposal');
  const record=target(pm,input,{inactive:true}),retired=input.retired??true;
  if(typeof retired!=='boolean')throw new TypeError('retired must be boolean');
  // Retired heads are intentionally excluded from ordinary reads, but can be explicitly reinstated.
  const now=pm._now();
  if(record.validFrom>now||(record.expiresAt!==null&&record.expiresAt<=now))throw new TypeError('experience is scheduled or expired');
  if(record.derivedFrom)for(const ref of record.derivedFrom)if(!pm.memoryStatus(ref.id).usable)throw new TypeError('experience dependency is unavailable');
  const reason=short(input.reason,'lifecycle reason'),evidenceId=memoryIdentifier(input.evidenceId,'lifecycle evidence');
  return pm.proposeMemory({memory:{subject:record.subject,kind:'episode',key:record.key,value:record.value,source:'host',evidenceId,
    observedAt:now,validFrom:now,expiresAt:record.expiresAt,experience:{outcome:record.experience.outcome,verified:false,retired,lifecycleReason:reason},
    ...(record.derivedFrom?{derivedFrom:record.derivedFrom}:{}),...(record.assertion?{assertion:record.assertion}:{}),
    ...((input.origin??record.origin)===undefined?{}:{origin:input.origin??record.origin})},reason});
}

function parseFeedback(record,experience){
  const value=record.value;
  if(!value||typeof value!=='object'||Array.isArray(value)||value.format!==FORMAT)return null;
  try{
    fields(value,new Set(['format','version','experienceId','experienceRevision','trialId','outcome','verification','conditions','note']),'feedback payload');
    if(value.version!==1||value.experienceId!==experience.id||value.experienceRevision!==experience.revision||
      !OUTCOMES.includes(value.outcome)||!['reported','owner-attested'].includes(value.verification)||
      record.key!==feedbackKey(value,record.evidenceId)||record.derivedFrom?.length!==1||record.derivedFrom[0].id!==experience.id||record.derivedFrom[0].revision!==experience.revision||
      !record.evidenceId||record.experience!==undefined||record.kind!=='episode'||
      record.source!==(value.verification==='owner-attested'?'host':'model'))throw new TypeError('invalid feedback');
    memoryIdentifier(value.trialId);conditions(value.conditions);
    if(typeof value.note!=='string'||value.note.length>1000)throw new TypeError('invalid feedback note');
    return {record,value};
  }catch{return false;}
}

// At most 1000 records and 32 experiences per request. A capped scan never claims eligibility.
export function reuseExperiences(pm,options){
  fields(options,new Set(['subject','conditions','limit','includeNeedsReview']),'experience reuse');
  const subject=normalizeSubject(options.subject),labels=conditions(options.conditions),limit=options.limit??8;
  if(!Number.isSafeInteger(limit)||limit<1||limit>32)throw new RangeError('experience reuse limit must be 1..32');
  if(options.includeNeedsReview!==undefined&&typeof options.includeNeedsReview!=='boolean')throw new TypeError('invalid includeNeedsReview');
  const records=pm.listMemories({subject,kind:'episode',limit:1000}),scanCapped=records.length===1000;
  const experiences=records.filter(r=>r.experience).slice(0,32),candidateScanCapped=records.filter(r=>r.experience).length>32;
  const items=[];
  for(const experience of experiences){
    const missingConditions=experience.value.conditions.filter(c=>!labels.includes(c)),feedback=[];let invalidFeedback=0;
    for(const record of records){
      if(record.value?.format!==FORMAT||record.value.experienceId!==experience.id)continue;
      const parsed=parseFeedback(record,experience);
      if(!parsed){invalidFeedback++;continue;}
      if(JSON.stringify(conditions(parsed.value.conditions))===JSON.stringify(labels))feedback.push(parsed);
    }
    // Evidence and trial collisions form one connected group, including transitive duplicates.
    const parents=feedback.map((_,i)=>i),root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
    const trials=new Map(),evidence=new Map();
    feedback.forEach(({record,value},i)=>{
      for(const [map,key] of [[trials,value.trialId],[evidence,record.evidenceId]]){
        if(map.has(key))parents[root(i)]=root(map.get(key));else map.set(key,i);
      }
    });
    const groups=new Map();feedback.forEach((item,i)=>{const key=root(i);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);});
    let helped=0,negative=0,reported=0,conflicting=0;
    const evidenceIds=[];
    for(const group of groups.values()){
      const attested=group.filter(f=>f.value.verification==='owner-attested');
      if(!attested.length){reported++;continue;}
      const outcomes=new Set(attested.map(f=>f.value.outcome));
      for(const f of attested)if(evidenceIds.length<16&&!evidenceIds.includes(f.record.evidenceId))evidenceIds.push(f.record.evidenceId);
      if(outcomes.size>1)conflicting++;
      else if(outcomes.has('helped'))helped++;else negative++;
    }
    const reasons=[];
    if(missingConditions.length)reasons.push('conditions-missing');
    if(scanCapped||candidateScanCapped)reasons.push('scan-capped');
    if(negative||conflicting)reasons.push('counterevidence');
    if(experience.experience.verified&&['failure','mixed'].includes(experience.experience.outcome))reasons.push('verified-adverse-outcome');
    if(invalidFeedback)reasons.push('invalid-feedback');
    if(!helped&&!(experience.source==='host'&&experience.experience.verified&&experience.experience.outcome==='success'))reasons.push('no-confirmed-success');
    const item={experience,status:reasons.length?'needs-review':'eligible',reasons,missingConditions,
      feedback:{helped,negative,reported,conflicting,invalid:invalidFeedback,evidenceIds},evidenceVerified:false,taskExecuted:false};
    if(options.includeNeedsReview!==false||!reasons.length)items.push(item);
  }
  items.sort((a,b)=>(a.status==='eligible'?0:1)-(b.status==='eligible'?0:1));
  return {items:items.slice(0,limit),scanCapped:scanCapped||candidateScanCapped,conditions:labels,evidenceVerified:false,taskExecuted:false};
}
