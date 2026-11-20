// Independently implemented task checkpoints. Checksums detect changes, not authorship.
import {createHash} from 'node:crypto';
import {copySnapshotJSON} from './snapshot.js';
import {assertMemoryFields as fields,normalizeSubject,sameSubject,memoryIdentifier,memoryFingerprint} from './records.js';
const MAX=32768,HOUR=3600000,MAX_TIME=8640000000000000;
const lists=['completed','pending','blockers','nextSteps'];
const exact=(value,names,label)=>{fields(value,new Set(names),label);for(const name of names)if(!Object.hasOwn(value,name))throw new TypeError('missing '+label+' '+name);};
const text=(s,max)=>{if(typeof s!=='string'||!s.trim()||s.length>max)throw new TypeError('invalid checkpoint text');return s;};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const digest=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
function checkpoint(raw){
 exact(raw,['goal',...lists],'checkpoint');const out={goal:text(raw.goal,2000)};
 for(const name of lists){const items=raw[name];if(!Array.isArray(items)||items.length>32)throw new RangeError('checkpoint list limit');out[name]=items.map(s=>text(s,512));}
 return out;
}
function references(raw,saved){
 if(!Array.isArray(raw)||raw.length>16)throw new RangeError('handoff reference limit');
 const seen=new Set();return raw.map(r=>{exact(r,saved?['id','revision','fingerprint']:['id','revision'],'handoff reference');
 const id=memoryIdentifier(r.id);if(id!==r.id||seen.has(id)||!Number.isSafeInteger(r.revision)||r.revision<1)throw new TypeError('invalid handoff reference');seen.add(id);
 if(saved&&(typeof r.fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(r.fingerprint)))throw new TypeError('invalid handoff fingerprint');
 return {id,revision:r.revision,...(saved?{fingerprint:r.fingerprint}:{})};});
}
function subject(raw){const s=normalizeSubject(raw);if(s.type==='user')throw new TypeError('task handoff requires project or task scope');return s;}
function identity(pm,raw){exact(raw,['persona','namespace'],'handoff identity');if(raw.persona!==pm.persona||raw.namespace!==pm.scope)throw new TypeError('handoff identity mismatch');return {persona:raw.persona,namespace:raw.namespace};}
export function createTaskHandoff(pm,options){
 const o=copySnapshotJSON(options,MAX);fields(o,new Set(['subject','checkpoint','references','ttlHours']),'handoff options');
 const s=subject(o.subject),cp=checkpoint(o.checkpoint),refs=references(o.references,false),ttl=o.ttlHours===undefined?24:o.ttlHours;
 if(typeof ttl!=='number'||!Number.isFinite(ttl)||ttl<=0||ttl>720)throw new RangeError('handoff TTL must be within 30 days');
 const now=pm._now(),expiresAt=now+ttl*HOUR;if(expiresAt>MAX_TIME)throw new RangeError('handoff exceeds calendar limit');
 const bound=refs.map(ref=>{const r=pm.getMemory(ref.id,{now});if(!r||!sameSubject(r.subject,s)||r.revision!==ref.revision)throw new TypeError('handoff reference unavailable');return {...ref,fingerprint:memoryFingerprint(r)};});
 const body={format:'persona-memory/handoff',version:1,identity:{persona:pm.persona,namespace:pm.scope},subject:s,createdAt:now,expiresAt,checkpoint:cp,references:bound};
 return copySnapshotJSON({...body,checksum:digest(body)},MAX);
}
export function openTaskHandoff(pm,raw,options){
 const o=copySnapshotJSON(options,MAX);exact(o,['subject'],'handoff open options');const granted=subject(o.subject);
 const bundle=copySnapshotJSON(raw,MAX);exact(bundle,['format','version','identity','subject','createdAt','expiresAt','checkpoint','references','checksum'],'handoff');
 if(bundle.format!=='persona-memory/handoff'||bundle.version!==1)throw new TypeError('unsupported handoff format');
 const s=subject(bundle.subject);if(!sameSubject(s,granted))throw new TypeError('handoff scope mismatch');
 const id=identity(pm,bundle.identity),cp=checkpoint(bundle.checkpoint),refs=references(bundle.references,true);
 for(const time of [bundle.createdAt,bundle.expiresAt])if(typeof time!=='number'||!Number.isFinite(time)||time<0||time>MAX_TIME)throw new TypeError('invalid handoff time');
 if(bundle.expiresAt<=bundle.createdAt||bundle.expiresAt-bundle.createdAt>720*HOUR)throw new TypeError('invalid handoff lifetime');
 const body={format:bundle.format,version:bundle.version,identity:id,subject:s,createdAt:bundle.createdAt,expiresAt:bundle.expiresAt,checkpoint:cp,references:refs};
 if(typeof bundle.checksum!=='string'||bundle.checksum!==digest(body))throw new TypeError('handoff checksum mismatch');
 const now=pm._now();
 const resolved=refs.map(ref=>{const r=pm.getMemory(ref.id,{now}),available=!!r&&sameSubject(r.subject,s)&&r.revision===ref.revision&&memoryFingerprint(r)===ref.fingerprint;
 return {id:ref.id,revision:ref.revision,status:available?'current':'unavailable'};});
 const status=now<bundle.createdAt?'not-yet-valid':now>=bundle.expiresAt?'expired':resolved.some(r=>r.status!=='current')?'needs-review':'ready';
 return {status,subject:s,checkpoint:cp,references:resolved,claimsVerified:false,taskExecuted:false,authorAuthenticated:false,instructionsTrusted:false};
}
