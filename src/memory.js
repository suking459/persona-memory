import {copySnapshotJSON} from './snapshot.js';
import {experienceInput,selectExperiences} from './experience.js';
import {stageCandidateProposals,stageCandidateAcceptance,reviseCandidate as reviseProposal,rejectCandidate as rejectProposal,selectCandidates,hydrateCandidates,candidateConflict} from './candidates.js';
import {validateResourceLimits,capacityError} from './limits.js';
import {validateTagRules} from './text-policy.js';
import {normalizeMemorySearch,normalizeMemoryContext,retrieveMemories} from './retrieval.js';
import {renderMemoryContext} from './record-context.js';
import {prepareMemoryWrite,hydrateMemories,normalizeSubject,sameSubject,memoryIdentifier,memorySlot,memorySlotForId,isCurrentMemory,selectMemories,memoryAt,assertMemoryFields} from './records.js';
import {exportMemoryBundle,prepareMemoryImport,stageMemoryImport} from './transfer.js';
import {JsonFileStore,checkRevision,storageError} from './storage.js';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SCORE_RULES, tierOf, clampAffinity, applyDailyGain, decayAmount, scoreMessage, updateStyle, summarizeStyle, matchTags, hitTag, normalizeTag, sweepTags } from './rules.js';

const DAY = 86400000;
const own = (object, key) => Object.hasOwn(object, key);
const entry = (object,key,fallback) => own(object,key)?object[key]:fallback;
const clone = (value) => JSON.parse(JSON.stringify(value));
const chars = (text) => Array.from(text);
const inline = (text) => String(text).replace(/[\r\n\t\u0000-\u001f]/g, ' ');
const clean = (text) => inline(text).slice(0, 160);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DEFAULTS = {
  dailyGainCap: 30, talkDailyCap: 12, decayPerDay: 2, perMessageCap: 8,
  tagTtlHours: 48, maxTagsPerPerson: 16, attentionWindowSec: 180,
  maxPeople: 4, maxChars: 700, blockWords: [], extraRules: {}, decayBaseline: 0,
  longTermTtlDays: 7, maxInjections: 200, visitorTracking: true, visitorHint: true,
  visitorHintMinCount: 2, scoreAmbient: false, affinityContext: true, tagScope: 'user', timeZone: 'UTC', botId: null,
  maxCandidates:1000,maxCandidateBytes:4194304,candidateTtlHours:72,maxVersionsPerMemory:32,maxMemories:10000,stateMemoryTtlHours:48,episodeMemoryTtlDays:90,
  maxProfiles:10000,maxSnapshotBytes:67108864,maxVisitors: 10000, visitorRetentionDays: 90, maxStyleFragments: 512,
  dedupeLimit: 2000, dedupeDays: 7, historyLimit: 100, dimensions: {},
};
function key(value, label = 'id') {
  if (typeof value !== 'string' && typeof value !== 'number') throw new TypeError(label + ' must be a string');
  const id = String(value).trim();
  if (!id || id.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(id)) throw new TypeError('invalid ' + label);
  return id;
}
function number(value, label, min = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new TypeError('invalid ' + label);
  return value;
}
function dictionary(value) { return value && typeof value === 'object' && !Array.isArray(value); }
function validateConfig(config) {
  for (const name of ['dailyGainCap','talkDailyCap','decayPerDay','perMessageCap','tagTtlHours','maxTagsPerPerson','attentionWindowSec','maxPeople','maxChars','longTermTtlDays','maxInjections','visitorHintMinCount','maxVisitors','visitorRetentionDays','maxStyleFragments','dedupeLimit','dedupeDays','historyLimit','stateMemoryTtlHours','episodeMemoryTtlDays']) {
    number(config[name], name);
  }
  for(const name of ['visitorTracking','visitorHint','scoreAmbient','affinityContext']) if(typeof config[name]!=='boolean') throw new TypeError(name+' must be boolean');
  for (const name of ['talkDailyCap','maxTagsPerPerson','maxPeople','maxChars','visitorHintMinCount','maxVisitors','maxStyleFragments','dedupeLimit','historyLimit']) {
    if (!Number.isInteger(config[name])) throw new TypeError(name + ' must be an integer');
  }
  if (!['user','chat'].includes(config.tagScope)) throw new TypeError('tagScope must be user or chat');
  if (config.decayBaseline < 0 || config.decayBaseline > 100 || !Number.isFinite(config.decayBaseline)) throw new TypeError('invalid decayBaseline');
  new Intl.DateTimeFormat('en', { timeZone: config.timeZone }).format(0);
  if (!Array.isArray(config.blockWords) || !dictionary(config.extraRules) || !dictionary(config.dimensions)) throw new TypeError('invalid rules configuration');
  for (const [name, rule] of Object.entries(config.dimensions)) {
    key(name, 'dimension');
    if (!dictionary(rule)) throw new TypeError('invalid dimension');
    for (const field of ['min','max','baseline']) if (!Number.isFinite(rule[field])) throw new TypeError('invalid dimension ' + field);
    if (rule.min > rule.baseline || rule.baseline > rule.max) throw new TypeError('invalid dimension bounds');
    number(rule.decayPerDay ?? 0, 'dimension decay');
  }
  validateTagRules(config.extraRules);
  validateResourceLimits(config);
  return config;
}

export class PersonaMemory {
  constructor({ storage = null, persona = 'default', scope = '', config = {}, clock = Date.now } = {}) {
    this.persona = key(persona, 'persona');
    this.scope = scope ? key(scope, 'scope') : '';
    this.storage = storage ? path.resolve(storage) : null;
    if (typeof clock !== 'function') throw new TypeError('clock must be a function');
    this.clock = clock;
    this.config = validateConfig({ ...clone(DEFAULTS), ...clone(config) });
    this.state = this._empty();
    this._dirty = false;
    this._pending = new Map();
    this._recordEpoch = {};this._learningEpoch={};
    this._imports=new Map();this._storeRevision=null;this._storeBusy=false;
    this._store=this.storage?new JsonFileStore({file:this._file(),maxBytes:this.config.maxSnapshotBytes}):null;
    if (this.storage) this._load();
  }
  _empty() {
    return { schemaVersion: 5, persona: this.persona, scope: this.scope, tagScope: this.config.tagScope,
      sessions: {}, tags: {}, visitors: {}, memories: {}, candidates: {}, seen: [], uses: [], history: [] };
  }
  _now(value = this.clock()) { number(value,'timestamp');if(value>8640000000000000)throw new RangeError('timestamp outside supported calendar');return value; }
  _file() {
    const name = this.scope ? 'scope-'+hash([this.scope,this.persona])+'.json' : encodeURIComponent(this.persona)+'.json';
    return path.join(this.storage, name);
  }
  _load() {
    try{
      const loaded=this._store.readSync();
      if(loaded.snapshot!==null)this.state=this._hydrate(loaded.snapshot);
      this._storeRevision=loaded.revision;
    }catch(cause){throw new Error('Cannot load memory snapshot; original file preserved: '+this._file(),{cause});}
  }
  static async open({store,...options}={}) {
    if(!store || typeof store.read!=='function' || typeof store.write!=='function')throw new TypeError('snapshot store read/write required');
    if(options.storage)throw new TypeError('choose storage directory or store');
    const pm=new PersonaMemory(options);pm._store=store;await pm.reload();return pm;
  }
  async reload({discardChanges=false}={}) {
    if(typeof discardChanges!=='boolean')throw new TypeError('discardChanges must be boolean');
    if(!this._store)throw new TypeError('no snapshot store configured');
    if(this._storeBusy)throw storageError('ERR_STORE_BUSY','another store operation is pending');
    if(this._dirty && !discardChanges)throw storageError('ERR_STORE_DIRTY','local changes require persist or explicit discardChanges');
    const before=JSON.stringify(this.state);this._storeBusy=true;
    try{
      const loaded=await this._store.read();
      if(!loaded || !Object.hasOwn(loaded,'snapshot'))throw new TypeError('invalid store read result');
      checkRevision(loaded.revision);
      if((loaded.snapshot===null)!==(loaded.revision===null))throw new TypeError('inconsistent store read result');
      const next=loaded.snapshot===null?this._empty():this._hydrate(loaded.snapshot);
      if(JSON.stringify(this.state)!==before)throw storageError('ERR_STORE_DIRTY','memory changed during reload; local changes preserved');
      this.state=next;this._storeRevision=loaded.revision;this._dirty=false;
      this._recordEpoch={};this._learningEpoch={};this._pending.clear();this._imports.clear();
    }finally{this._storeBusy=false;}
  }
  async persist() {
    if(!this._store)return;
    if(this._storeBusy)throw storageError('ERR_STORE_BUSY','another store operation is pending');
    if(!this._dirty)return;
    const snapshot=this.export(),serialized=JSON.stringify(snapshot);
    if(Buffer.byteLength(serialized)>this.config.maxSnapshotBytes)throw capacityError('snapshot');
    this._storeBusy=true;
    try{
      const saved=await this._store.write(snapshot,{expectedRevision:this._storeRevision});
      checkRevision(saved?.revision,{empty:false});this._storeRevision=saved.revision;
      this._dirty=JSON.stringify(this.state)!==serialized;
    }finally{this._storeBusy=false;}
  }
  _hydrate(snapshot) {
    const raw=copySnapshotJSON(snapshot,this.config.maxSnapshotBytes);
    const memories=hydrateMemories(raw.memories===undefined?{}:raw.memories,this.config,{legacy:(raw.schemaVersion??1)<4,allowExperience:raw.schemaVersion>=5});
    const candidates=hydrateCandidates(raw.candidates===undefined?{}:raw.candidates,this.config,memories);
    if (!dictionary(raw) || ![1,2,3,4,5].includes(raw.schemaVersion ?? 1) || !dictionary(raw.sessions)) throw new TypeError('invalid snapshot');
    if (raw.persona && raw.persona !== this.persona) throw new TypeError('snapshot persona mismatch');
    if ((raw.scope ?? '') !== this.scope) throw new TypeError('snapshot scope mismatch');
    if (raw.schemaVersion >= 2 && raw.tagScope !== this.config.tagScope) throw new TypeError('snapshot tagScope mismatch');
    if ((raw.schemaVersion??1) === 1 && this.config.tagScope !== 'user') throw new TypeError('v1 snapshot requires tagScope=user');
    if ((raw.schemaVersion??1)<3 && Object.keys(memories).length)throw new TypeError('memory records require schemaVersion=3');
    if(raw.schemaVersion>=3 && raw.memories===undefined)throw new TypeError('schemaVersion>=3 requires memories');
    if(raw.schemaVersion===5&&raw.candidates===undefined)throw new TypeError('schemaVersion=5 requires candidates');
    if((raw.schemaVersion??1)<5&&Object.keys(candidates).length)throw new TypeError('candidates require schemaVersion=5');
    const next = this._empty();next.memories=memories;next.candidates=candidates;
    for (const [chatId, people] of Object.entries(raw.sessions)) {
      key(chatId, 'chatId');
      if (!dictionary(people)) throw new TypeError('invalid snapshot people');
      next.sessions[chatId] = {};
      for (const [userId, p] of Object.entries(people)) {
        key(userId, 'userId');
        if (!dictionary(p) || !dictionary(p.affinity) || !dictionary(p.style)) throw new TypeError('invalid snapshot profile');
        number(p.affinity.value, 'affinity');
        if (p.affinity.value > 100) throw new TypeError('invalid affinity');
        const lastAt = this._now(p.lastAt ?? 0);
        const a = p.affinity;
        const profile = this._newProfile(lastAt);
        profile.affinity = { ...profile.affinity, ...a, ledger: Array.isArray(a.ledger) ? a.ledger.slice(0,30) : [] };
        for (const field of ['baseline','lastInteractiveAt','lastDecayAt','dayGain','talkCount']) number(profile.affinity[field], field);
        if (profile.affinity.baseline > 100) throw new TypeError('invalid baseline');
        profile.affinity.lastDecayAt = a.lastDecayAt ?? a.lastInteractiveAt ?? lastAt;
        profile.style = { ...profile.style, ...p.style };
        for (const field of ['count','totalChars','questions','emojis','night']) number(profile.style[field], 'style.'+field);
        if (!dictionary(profile.style.catch)) throw new TypeError('invalid style fragments');
        profile.style.catch = Object.fromEntries(Object.entries(profile.style.catch).filter(([,n])=>Number.isFinite(n) && n>=0).sort((a,b)=>b[1]-a[1]).slice(0,this.config.maxStyleFragments));
        profile.lastAt = lastAt;
        profile.lastAddressedAt = p.lastAddressedAt==null ? null : this._now(p.lastAddressedAt);
        profile.dimensions = {};
        for (const [name, rule] of Object.entries(this.config.dimensions)) {
          const d = entry(p.dimensions??{},name);
          profile.dimensions[name] = { value: d ? Math.max(rule.min, Math.min(rule.max, number(d.value,'dimension',-Number.MAX_VALUE))) : rule.baseline,
            lastAt: this._now(d?.lastAt ?? lastAt) };
        }
        next.sessions[chatId][userId] = profile;
      }
    }
    if (raw.tags && !dictionary(raw.tags)) throw new TypeError('invalid snapshot tags');
    for (const [id, tags] of Object.entries(raw.tags || {})) {
      this._validatePersonKey(id);
      if (!Array.isArray(tags) || tags.length>4096) throw new TypeError('invalid or excessive tag list');
      next.tags[id] = tags.map((t) => {
        if (!dictionary(t) || typeof t.tag!=='string' || !t.tag.trim() || t.tag.length>256) throw new TypeError('invalid tag');
        if (t.advice!==undefined && (typeof t.advice!=='string' || t.advice.length>2000)) throw new TypeError('invalid tag advice');
        for(const field of ['hits','injections','addedAt','lastHitAt','lastEvidenceAt']) if(t[field]!==undefined) number(t[field],'tag.'+field);
        const normalized = normalizeTag(t);
        normalized.lastEvidenceAt = t.lastEvidenceAt ?? t.lastHitAt ?? t.addedAt;
        this._now(normalized.addedAt); this._now(normalized.lastHitAt);
        if (normalized.expiresAt !== null) this._now(normalized.expiresAt);
        return normalized;
      });
    }
    if (raw.visitors && !dictionary(raw.visitors)) throw new TypeError('invalid visitors');
    for (const [id,v] of Object.entries(raw.visitors || {})) {
      this._validatePersonKey(id);
      if (!dictionary(v)) throw new TypeError('invalid visitor');
      next.visitors[id] = { firstSeen:this._now(v.firstSeen), lastSeen:this._now(v.lastSeen), count:number(v.count,'visitor count') };
    }
    for (const field of ['seen','uses','history']) {
      if (raw[field] !== undefined && !Array.isArray(raw[field])) throw new TypeError('invalid '+field);
      const records=raw[field] || [];
      const limit=field==='history'?this.config.historyLimit:this.config.dedupeLimit;
      for(const r of records) {
        if(!dictionary(r) || !Number.isFinite(r.at)) throw new TypeError('invalid '+field+' record');
        if(r.chatId!==undefined) key(r.chatId,'chatId');
        if(r.userId!==undefined) key(r.userId,'userId');
        if(field==='seen' && (typeof r.key!=='string' || !r.chatId || !r.userId)) throw new TypeError('invalid dedupe record');
        if(field==='uses' && (typeof r.turnId!=='string' || !Array.isArray(r.userIds))) throw new TypeError('invalid usage record');
        if(field==='uses'){
          r.userIds.forEach(id=>key(id,'userId'));
          if(r.recordIds!==undefined){
            if(!Array.isArray(r.recordIds) || r.recordIds.length>64)throw new TypeError('invalid memory usage ids');
            r.recordIds.forEach(id=>memoryIdentifier(id));
          }
          if(r.memorySubjects!==undefined){
            if(!Array.isArray(r.memorySubjects) || r.memorySubjects.length>32)throw new TypeError('invalid memory usage subjects');
            r.memorySubjects=r.memorySubjects.map(normalizeSubject);
          }
        }
        if(field==='history' && r.subject!==undefined)r.subject=normalizeSubject(r.subject);
        if(field==='history' && r.recordId!==undefined)memoryIdentifier(r.recordId);
        if(field==='history' && r.candidateId!==undefined)memoryIdentifier(r.candidateId);
      }
      next[field] = limit ? records.slice(-limit) : [];
    }
    const profiles=Object.values(next.sessions).reduce((n,p)=>n+Object.keys(p).length,0);
    if(profiles>this.config.maxProfiles || Object.keys(next.visitors).length>this.config.maxVisitors)throw capacityError('import');
    return next;
  }
  _newProfile(now) {
    return { affinity: { value:this.config.decayBaseline, baseline:this.config.decayBaseline, lastInteractiveAt:now,
      lastDecayAt:now, dayKey:'', dayGain:0, talkCount:0, ledger:[] },
      style: { count:0,totalChars:0,questions:0,emojis:0,night:0,catch:{} }, lastAt:now, lastAddressedAt:null,
      dimensions:Object.fromEntries(Object.entries(this.config.dimensions).map(([name,r])=>[name,{value:r.baseline,lastAt:now}])) };
  }
  _assertProfileCapacity(chatId,userId){
    if(this._profile(chatId,userId))return;
    const total=Object.values(this.state.sessions).reduce((n,people)=>n+Object.keys(people).length,0);
    if(total>=this.config.maxProfiles)throw capacityError('profile');
  }
  _profile(chatId, userId, create = false, now = this._now()) {
    if (!own(this.state.sessions,chatId)) {
      if (!create) return null;
      this.state.sessions[chatId] = {};
    }
    const people = this.state.sessions[chatId];
    if (!own(people,userId)) { if (!create) return null; people[userId] = this._newProfile(now); }
    return people[userId];
  }
  _personKey(chatId, userId) {
    if (this.config.tagScope === 'user') return userId;
    return JSON.stringify([key(chatId,'chatId'),userId]);
  }
  _validatePersonKey(id) {
    if(this.config.tagScope==='user') key(id,'person key');
    if(this.config.tagScope==='chat') {
      const pair=JSON.parse(id);
      if(!Array.isArray(pair) || pair.length!==2) throw new TypeError('invalid scoped person key');
      pair.forEach(value=>key(value,'scoped id'));
    }
  }
  _dayKey(ts) { return new Intl.DateTimeFormat('en-CA',{timeZone:this.config.timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(ts); }
  _audit(type, chatId, userId, detail = {}, at) {
    if (!this.config.historyLimit) return;
    this.state.history.push({ type, chatId, userId, at:at??this._now(), ...detail });
    this.state.history = this.state.history.slice(-this.config.historyLimit);
  }
  _duplicate(eventId,chatId,userId,ts) {
    if (!eventId) return false;
    const id = key(eventId,'eventId');
    const eventKey = hash([chatId,userId,id]);
    const cutoff = this._now() - this.config.dedupeDays*DAY;
    this.state.seen = this.state.seen.filter((r)=>r.at >= cutoff);
    if (this.state.seen.some((r)=>r.key === eventKey)) return true;
    this.state.seen.push({key:eventKey,chatId,userId,at:this._now()});
    this.state.seen = this.config.dedupeLimit ? this.state.seen.slice(-this.config.dedupeLimit) : [];
    this._dirty = true;
    return false;
  }
  _decay(p, now) {
    const a=p.affinity;
    const since=a.lastDecayAt ?? a.lastInteractiveAt;
    if (now <= since) return false;
    const amount=decayAmount(a.value,a.baseline,this.config.decayPerDay,(now-since)/DAY);
    a.value=clampAffinity(a.value-amount);
    a.lastDecayAt=now;
    for (const [name,d] of Object.entries(p.dimensions)) {
      const rule=this.config.dimensions[name];
      if (!rule) continue;
      const steps=(now-d.lastAt)/DAY*(rule.decayPerDay??0);
      d.value=d.value>rule.baseline ? Math.max(rule.baseline,d.value-steps) : Math.min(rule.baseline,d.value+steps);
      d.lastAt=now;
    }
    return amount>0;
  }
  ingest(msg = {}) {
    const chatId=key(msg.chatId,'chatId'), userId=key(msg.userId,'userId'), ts=this._now(msg.ts);
    for(const name of ['isSelf','mentionsSelf','replyToSelf','directedToBot']) if(msg[name]!==undefined && typeof msg[name]!=='boolean') throw new TypeError(name+' must be boolean');
    if(msg.mentions!==undefined && !Array.isArray(msg.mentions)) throw new TypeError('mentions must be an array');
    const text=String(msg.text ?? '');
    if (text.length>100000) throw new RangeError('message too large');
    if (msg.isSelf) return {matched:false,delta:0,reasons:[]};
    const existing=this._profile(chatId,userId);
    if (existing && ts<Math.max(existing.lastAt,existing.affinity.lastDecayAt)) return {matched:false,delta:0,reasons:[],ignored:'out-of-order'};
    const mentionsSelf=msg.mentionsSelf ?? (msg.mentions || []).some((id)=>String(id)==='self' || (this.config.botId!==null && String(id)===String(this.config.botId)));
    const replyToSelf=msg.replyToSelf ?? (msg.replyTo==='self');
    const directed=Boolean(msg.directedToBot || mentionsSelf || replyToSelf || (this.config.attentionWindowSec>0 && Number.isFinite(existing?.lastAddressedAt) && ts>=existing.lastAddressedAt && ts-existing.lastAddressedAt<=this.config.attentionWindowSec*1000));
    let score=scoreMessage(text,{mentionsSelf,replyToSelf,directedToBot:directed},{perMessageCap:this.config.perMessageCap});
    if (!directed && !this.config.scoreAmbient) score={delta:0,reasons:[]};
    const tagHits=matchTags(text,this.config.extraRules);
    const pkey=this._personKey(chatId,userId);
    const visitorOnly=!existing && score.delta===0 && !tagHits.length && !directed && this.config.visitorTracking;
    if(!visitorOnly)this._assertProfileCapacity(chatId,userId);
    if(this._duplicate(msg.eventId,chatId,userId,ts))return {matched:false,delta:0,reasons:[],duplicate:true};
    if (visitorOnly) {
      if(!own(this.state.visitors,pkey)){
        if(this.config.maxVisitors===0)return {matched:false,visitor:true,delta:0,reasons:['visitor-recording-disabled']};
        const entries=Object.entries(this.state.visitors);
        if(entries.length>=this.config.maxVisitors){let oldest=entries[0];for(const item of entries)if(item[1].lastSeen<oldest[1].lastSeen)oldest=item;delete this.state.visitors[oldest[0]];}
      }
      const v=entry(this.state.visitors,pkey) || {firstSeen:ts,lastSeen:ts,count:0};
      v.firstSeen=Math.min(v.firstSeen,ts); v.lastSeen=Math.max(v.lastSeen,ts); v.count++;
      this.state.visitors[pkey]=v; this._dirty=true;
      return {matched:false,visitor:true,delta:0,reasons:[]};
    }
    const p=this._profile(chatId,userId,true,ts);
    this._decay(p,ts);
    p.lastAt=ts;
    p.style=updateStyle(p.style,text,ts,this.config.blockWords);
    p.style.catch=Object.fromEntries(Object.entries(p.style.catch).sort((a,b)=>b[1]-a[1]).slice(0,this.config.maxStyleFragments));
    const a=p.affinity, dayKey=this._dayKey(ts);
    if (a.dayKey!==dayKey) { a.dayKey=dayKey; a.dayGain=0; a.talkCount=0; }
    if (score.reasons.includes('说了话')) {
      if (a.talkCount>=this.config.talkDailyCap) score={delta:0,reasons:['普通互动日额度已满']};
      else a.talkCount++;
    }
    const before=a.value;
    const allowed=applyDailyGain(a.dayGain,score.delta,this.config.dailyGainCap);
    a.value=clampAffinity(before+allowed);
    const applied=a.value-before;
    if (applied>0) a.dayGain+=applied;
    if (directed || score.delta!==0) {
      a.lastInteractiveAt=ts; a.lastDecayAt=ts;
      if (mentionsSelf || replyToSelf || msg.directedToBot) p.lastAddressedAt=ts;
    }
    if (applied!==0) {
      a.ledger.unshift({ts,delta:score.delta,applied,reason:score.reasons.join('+')});
      a.ledger=a.ledger.slice(0,30);
    }
    if (directed && p.dimensions.familiarity) {
      const r=this.config.dimensions.familiarity,d=p.dimensions.familiarity;
      d.value=Math.min(r.max,d.value+Math.max(0,applied)); d.lastAt=ts;
    }
    if (tagHits.length) {
      let tags=sweepTags(entry(this.state.tags,pkey,[]),ts,this.config).tags;
      for (const h of tagHits) {
        tags=hitTag(tags,h.tag,h.advice,ts,this.config.tagTtlHours);
        const t=tags.find((t)=>t.tag===h.tag);
        Object.assign(t,{source:h.source || 'builtin',evidenceId:msg.eventId ? String(msg.eventId) : undefined, lastEvidenceAt:ts,revision:(t.revision??0)+1});
      }
      this.state.tags[pkey]=sweepTags(tags,ts,this.config).tags;
    }
    this._dirty=true;
    if (applied || tagHits.length) this._audit('ingest',chatId,userId,{delta:applied,tags:tagHits.map((t)=>t.tag)});
    return {matched:applied!==0 || tagHits.length>0,delta:applied,reasons:score.reasons,tags:tagHits.map((t)=>t.tag)};
  }
  setTag({chatId,userId,tag,advice='',source='manual',eventId,expiresAt,replace=[],ts} = {}) {
    chatId=key(chatId,'chatId'); userId=key(userId,'userId'); tag=key(tag,'tag'); const now=this._now(ts);
    if (!['manual','host','model','extra','builtin'].includes(source)) throw new TypeError('invalid tag source');
    if (typeof advice!=='string' || advice.length>2000) throw new TypeError('invalid tag advice');
    if (!Array.isArray(replace)) throw new TypeError('replace must be an array');
    if (expiresAt !== undefined && expiresAt !== null) this._now(expiresAt);
    const p=this._profile(chatId,userId);
    if (p && now<p.lastAt) throw new RangeError('out-of-order tag update');
    this._assertProfileCapacity(chatId,userId);
    if (this._duplicate(eventId,chatId,userId,now)) return {duplicate:true};
    this._profile(chatId,userId,true,now).lastAt=now;
    const id=this._personKey(chatId,userId);
    let tags=sweepTags(entry(this.state.tags,id,[]),now,this.config).tags.filter((t)=>!replace.includes(t.tag));
    tags=hitTag(tags,tag,String(advice),now,this.config.tagTtlHours);
    const t=tags.find((t)=>t.tag===tag);
    Object.assign(t,{source,evidenceId:eventId ? String(eventId) : undefined,lastEvidenceAt:now,revision:(t.revision??0)+1});
    if (expiresAt !== undefined) { t.expiresAt=expiresAt; t.longTerm=expiresAt===null; }
    this.state.tags[id]=sweepTags(tags,now,this.config).tags;
    this._clearTagContexts();
    this._audit('set-tag',chatId,userId,{tag,source,replaced:replace});
    this._dirty=true;
    return clone(t);
  }
  removeTag({chatId,userId,tag} = {}) {
    userId=key(userId,'userId'); tag=key(tag,'tag');
    const id=this._personKey(chatId,userId), tags=entry(this.state.tags,id,[]);
    const next=tags.filter((t)=>t.tag!==tag);
    if (next.length===tags.length) return false;
    this.state.tags[id]=next; this._clearTagContexts(); this._dirty=true;
    this._audit('remove-tag',chatId,userId,{tag}); return true;
  }
  recordEvent({chatId,userId,eventId,type,changes,ts} = {}) {
    chatId=key(chatId,'chatId'); userId=key(userId,'userId'); type=key(type,'type');
    const now=this._now(ts);
    if (!dictionary(changes) || !Object.keys(changes).length) throw new TypeError('changes required');
    for (const [name,delta] of Object.entries(changes)) {
      if (!own(this.config.dimensions,name)) throw new TypeError('dimension not enabled: '+name);
      if (!Number.isFinite(delta)) throw new TypeError('invalid dimension delta');
    }
    const existing=this._profile(chatId,userId);
    if (existing && now<existing.lastAt) throw new RangeError('out-of-order event');
    this._assertProfileCapacity(chatId,userId);
    if (this._duplicate(eventId,chatId,userId,now)) return {duplicate:true};
    const p=this._profile(chatId,userId,true,now); this._decay(p,now); p.lastAt=now;
    for (const [name,delta] of Object.entries(changes)) {
      const rule=this.config.dimensions[name],d=p.dimensions[name];
      d.value=Math.min(rule.max,Math.max(rule.min,d.value+delta)); d.lastAt=now;
    }
    this._audit('host-event',chatId,userId,{eventType:type,changes:clone(changes)});
    this._dirty=true; return clone(p.dimensions);
  }
  recordExperience(input) {return this.putMemory(experienceInput(input));}
  listExperiences(options) {return clone(selectExperiences(this.state.memories,options,this._now()));}
  putMemory(input) {
    const now=this._now(),plan=prepareMemoryWrite(this.state.memories,input,now,this.config,randomUUID);
    if(plan.duplicate)return clone(plan.record);
    if(plan.previous)this.state.memories[plan.previous.id]=plan.previous;
    const pruned=new Set(plan.removeIds);this._removeMemories(record=>pruned.has(record.id));
    this.state.memories[plan.record.id]=plan.record;
    this._recordEpoch={};
    const {subject,kind,key:field,id}=plan.record;
    this._audit('memory-put',subject.chatId,subject.type==='user'?subject.id:undefined,
      {recordId:id,subject,kind,key:field,...(plan.previous?{replacedId:plan.previous.id}:{})},now);
    this._dirty=true;return clone(plan.record);
  }
  _commitLearning(plan,now) {
    const created=plan.newIds??[],accepted=plan.results.filter(result=>!result.duplicate);
    if(!created.length&&!accepted.length)return;
    if(accepted.length){
      this._removeMemories(record=>plan.removed.has(record.id));
      this.state.memories=plan.records;this._recordEpoch={};
    }
    this.state.candidates=plan.candidates;this._learningEpoch={};this._dirty=true;
    for(const id of created){const candidate=plan.candidates[id],subject=candidate.memory.subject;
      this._audit('candidate-proposed',subject.chatId,subject.type==='user'?subject.id:undefined,{subject,candidateId:id,kind:candidate.memory.kind,key:candidate.memory.key},now);}
    for(const result of accepted){const subject=result.candidate.memory.subject;
      this._audit('candidate-accepted',subject.chatId,subject.type==='user'?subject.id:undefined,{subject,candidateId:result.candidate.id,recordId:result.record.id},now);}
  }
  proposeMemories(inputs,options={}) {
    const now=this._now(),plan=stageCandidateProposals(this.state.memories,this.state.candidates,inputs,options,now,this.config);
    this._commitLearning(plan,now);
    return clone({candidates:plan.ids.map(id=>plan.candidates[id]),accepted:plan.results.map(result=>result.record?.id).filter(Boolean),omitted:plan.omitted});
  }
  proposeMemory(input) {return this.proposeMemories([input]).candidates[0];}
  acceptCandidates(requests) {
    const now=this._now(),plan=stageCandidateAcceptance(this.state.memories,this.state.candidates,requests,now,this.config);
    this._commitLearning(plan,now);return clone(plan.results);
  }
  acceptCandidate(id,options={}) {assertMemoryFields(options,new Set(['expectedRevision']),'candidate acceptance options');return this.acceptCandidates([{id,...options}])[0];}
  getCandidate(id,{includeExpired=false}={}) {
    id=memoryIdentifier(id);if(typeof includeExpired!=='boolean')throw new TypeError('invalid includeExpired');
    const candidate=own(this.state.candidates,id)?this.state.candidates[id]:null;
    return candidate&&(includeExpired||candidate.expiresAt>this._now())?clone(candidate):null;
  }
  listCandidates(options) {return clone(selectCandidates(this.state.candidates,options,this._now()));}
  reviseCandidate(id,options) {
    id=memoryIdentifier(id);const candidate=own(this.state.candidates,id)?this.state.candidates[id]:null;
    if(!candidate)throw candidateConflict('candidate is unavailable');
    const now=this._now(),next=reviseProposal(candidate,options,now,this.config),candidates={...this.state.candidates,[id]:next};
    hydrateCandidates(candidates,this.config);this.state.candidates=candidates;this._learningEpoch={};this._dirty=true;
    const subject=next.memory.subject;this._audit('candidate-revised',subject.chatId,subject.type==='user'?subject.id:undefined,{subject,candidateId:id},now);
    return clone(next);
  }
  rejectCandidate(id,options) {
    id=memoryIdentifier(id);const candidate=own(this.state.candidates,id)?this.state.candidates[id]:null;
    if(!candidate)throw candidateConflict('candidate is unavailable');
    const now=this._now(),next=rejectProposal(candidate,options,now);
    if(next!==candidate){this.state.candidates[id]=next;this._learningEpoch={};this._dirty=true;
      const subject=next.memory.subject;this._audit('candidate-rejected',subject.chatId,subject.type==='user'?subject.id:undefined,{subject,candidateId:id},now);}
    return clone(next);
  }
  _removeCandidates(predicate) {
    const ids=new Set(Object.values(this.state.candidates).filter(predicate).map(candidate=>candidate.id));
    if(ids.size){for(const id of ids)delete this.state.candidates[id];
      this.state.history=this.state.history.filter(row=>!ids.has(row.candidateId));this._learningEpoch={};this._dirty=true;}
    return ids.size;
  }
  forgetCandidate(id) {id=memoryIdentifier(id);this._learningEpoch={};return {removed:this._removeCandidates(candidate=>candidate.id===id)};}
  searchMemories(options={}) {
    const selection=normalizeMemorySearch(options),now=this._now(selection.now);
    return clone(retrieveMemories(this.state.memories,selection,now));
  }
  buildMemoryContext(options={}) {
    const settings=normalizeMemoryContext(options,this.config.maxChars),now=this._now(settings.search.now);
    const epoch=this._recordEpoch;
    const result=retrieveMemories(this.state.memories,settings.search,now);
    const rendered=renderMemoryContext(result,settings);
    if(epoch!==this._recordEpoch)throw new Error('memory changed while building context; build a new context');
    const contextId=randomUUID(),context={contextId,kind:'records',...rendered,createdAt:now};
    this._storePending(contextId,{family:'records',subjects:settings.search.subjects,
      refs:rendered.records.map(({record})=>({id:record.id,fingerprint:hash(record)})),createdAt:now});
    return context;
  }
  _storePending(contextId,pending) {
    this._pending.set(contextId,pending);
    while(this._pending.size>128)this._pending.delete(this._pending.keys().next().value);
  }
  _clearTagContexts() {
    for(const [id,pending] of this._pending)if(pending.family!=='records')this._pending.delete(id);
  }
  exportMemories(options) {return clone(exportMemoryBundle(this.state.memories,options,this._now()));}
  previewMemoryImport(bundle,options) {
    const now=this._now(),plan=prepareMemoryImport(this.state.memories,bundle,options,now,this.config),planId=randomUUID();
    const bytes=Buffer.byteLength(JSON.stringify(plan))+512;
    if(bytes>8388608)throw new RangeError('import preview exceeds 8 MiB; select fewer records');
    for(const [id,entry] of this._imports)if(now<entry.createdAt || now-entry.createdAt>600000)this._imports.delete(id);
    this._imports.set(planId,{...plan,epoch:this._recordEpoch,createdAt:now,bytes});
    let total=[...this._imports.values()].reduce((n,entry)=>n+entry.bytes,0);
    while(this._imports.size>128 || total>8388608){const id=this._imports.keys().next().value;total-=this._imports.get(id).bytes;this._imports.delete(id);}
    return clone({planId,createdAt:now,expiresAt:Math.min(8640000000000000,now+600000),counts:plan.counts,rows:plan.rows});
  }
  applyMemoryImport(planId,options={}) {
    planId=memoryIdentifier(planId,'memory import plan');const plan=this._imports.get(planId),now=this._now();
    if(!plan || plan.epoch!==this._recordEpoch || now<plan.createdAt || now-plan.createdAt>600000)throw Object.assign(new Error('import preview expired or memory changed; preview again'),{code:'ERR_MEMORY_CONFLICT'});
    const staged=stageMemoryImport(this.state.memories,plan,options,now,this.config,randomUUID);
    // Validate the whole result before committing; capacity/conflict failures are atomic.
    hydrateMemories(staged.next,this.config);
    if(staged.written.length){
      this._removeMemories(record=>staged.removed.has(record.id));
      this.state.memories=staged.next;this._recordEpoch={};this._dirty=true;
      for(const record of staged.written)this._audit('memory-import',record.subject.chatId,record.subject.type==='user'?record.subject.id:undefined,
        {recordId:record.id,subject:record.subject,kind:record.kind,key:record.key},now);
    }
    this._imports.delete(planId);
    return {added:plan.counts.add,updated:plan.counts.update,unchanged:plan.counts.same,pruned:staged.removed.size,recordIds:staged.written.map(record=>record.id)};
  }
  getMemoryAt(options) {
    const now=this._now(),record=memoryAt(this.state.memories,options,now);
    if(!record)return null;
    const result=clone(record),knownAt=options.knownAt===undefined?now:options.knownAt;
    if(result.updatedAt>knownAt){result.status='current';result.updatedAt=result.createdAt;result.validUntil=null;delete result.supersededBy;}
    return result;
  }
  getMemory(id,{includeInactive=false,now}={}) {
    id=memoryIdentifier(id);now=this._now(now);
    if(typeof includeInactive!=='boolean')throw new TypeError('includeInactive must be boolean');
    const record=own(this.state.memories,id)?this.state.memories[id]:null;
    return record && (includeInactive || isCurrentMemory(record,now))?clone(record):null;
  }
  listMemories(options={}) {
    const now=this._now(options.now);
    return clone(selectMemories(this.state.memories,options,now));
  }
  _removeMemories(predicate) {
    const ids=new Set(Object.values(this.state.memories).filter(predicate).map(record=>record.id));
    if(ids.size){
      for(const id of ids)this.state.memories[id] && delete this.state.memories[id];
      this.state.history=this.state.history.filter(row=>!ids.has(row.recordId) && !ids.has(row.replacedId));
      this.state.uses=this.state.uses.filter(row=>!row.recordIds?.some(id=>ids.has(id)));
      for(const [contextId,pending] of this._pending)if(pending.family==='records' && pending.refs.some(ref=>ids.has(ref.id)))this._pending.delete(contextId);
      this._recordEpoch={};this._imports.clear();this._dirty=true;
    }
    return ids.size;
  }
  forgetMemory(id) {
    id=memoryIdentifier(id);this._imports.clear();this._learningEpoch={};
    const reviewed=Object.values(this.state.candidates).find(candidate=>candidate.acceptedId===id);
    const slot=memorySlotForId(this.state.memories,id)??(reviewed?memorySlot(reviewed.memory):null);
    if(slot===null)return {removed:0};
    const removed=this._removeMemories(item=>memorySlot(item)===slot)+this._removeCandidates(candidate=>memorySlot(candidate.memory)===slot);
    return {removed};
  }
  deleteSubject(subject) {
    subject=normalizeSubject(subject);this._imports.clear();
    this._learningEpoch={};
    const removed=this._removeMemories(record=>sameSubject(record.subject,subject))+this._removeCandidates(candidate=>sameSubject(candidate.memory.subject,subject));
    const uses=this.state.uses.filter(row=>!row.memorySubjects?.some(item=>sameSubject(item,subject)));
    if(uses.length!==this.state.uses.length){this.state.uses=uses;this._dirty=true;}
    for(const [id,pending] of this._pending)if(pending.family==='records' && pending.subjects.some(item=>sameSubject(item,subject)))this._pending.delete(id);
    this._recordEpoch={};return {removed};
  }
  getVisitor(userId,{chatId}={}) {
    userId=key(userId,'userId');
    const v=entry(this.state.visitors,this._personKey(chatId,userId));
    return v ? {userId,...clone(v)} : null;
  }
  listVisitors(limit=50) {
    number(limit,'limit');
    return Object.entries(this.state.visitors).sort((a,b)=>b[1].lastSeen-a[1].lastSeen).slice(0,limit).map(([userId,v])=>({userId,...clone(v)}));
  }
  getProfile(chatId,userId) {
    chatId=key(chatId,'chatId'); userId=key(userId,'userId');
    const p=this._profile(chatId,userId); if (!p) return null;
    const t=tierOf(p.affinity.value);
    return {chatId,userId,affinity:{value:Math.round(p.affinity.value*10)/10,baseline:p.affinity.baseline,tier:t.tier,hint:t.hint,lastInteractiveAt:p.affinity.lastInteractiveAt},
      style:summarizeStyle(p.style),tags:clone(entry(this.state.tags,this._personKey(chatId,userId),[])),dimensions:clone(p.dimensions),lastAt:p.lastAt};
  }
  buildContext({chatId,userIds=[],budget=this.config.maxChars,maxPeople=this.config.maxPeople,priorityUserIds=[],now,tokenBudget,countTokens}={}) {
    chatId=key(chatId,'chatId'); now=this._now(now);
    number(budget,'budget'); number(maxPeople,'maxPeople');
    if (!Number.isInteger(budget) || !Number.isInteger(maxPeople) || !Array.isArray(userIds) || !Array.isArray(priorityUserIds)) throw new TypeError('invalid context options');
    if(tokenBudget!==undefined && (typeof countTokens!=='function' || !Number.isInteger(tokenBudget) || tokenBudget<0)) throw new TypeError('tokenBudget requires a tokenizer and nonnegative integer');
    const tokenCount=(text)=>{const count=countTokens(text);if(!Number.isInteger(count)||count<0)throw new TypeError('tokenizer must return a nonnegative integer');return count;};
    const ids=[...new Set(userIds.map((id)=>key(id,'userId')))],priority=new Set(priorityUserIds.map(String));
    const candidates=[],omitted=[];
    for (const userId of ids) {
      const p=this._profile(chatId,userId),pk=this._personKey(chatId,userId);
      const v=entry(this.state.visitors,pk);
      if (p) candidates.push({userId,kind:'profile',p,pk,lastAt:p.lastAt,priority:priority.has(userId)?1:0});
      else if (this.config.visitorHint && v && v.count>=this.config.visitorHintMinCount) candidates.push({userId,kind:'visitor',v,pk,lastAt:v.lastSeen,priority:priority.has(userId)?1:0});
      else omitted.push({userId,reason:'no-eligible-memory'});
    }
    candidates.sort((a,b)=>b.priority-a.priority || b.lastAt-a.lastAt || (b.p?.affinity.value??0)-(a.p?.affinity.value??0) || a.userId.localeCompare(b.userId));
    const header='【交往记忆】', lines=[],people=[],refs=[];
    for (const c of candidates) {
      if (people.length>=maxPeople) { omitted.push({userId:c.userId,reason:'people-limit'}); continue; }
      let body,selectedTags=[];
      const tags=c.p ? (entry(this.state.tags,c.pk,[])).filter((t)=>t.longTerm || t.expiresAt===null || t.expiresAt>now)
        .sort((a,b)=>(['manual','host'].includes(b.source)?1:0)-(['manual','host'].includes(a.source)?1:0) || b.lastHitAt-a.lastHitAt) : [];
      if (c.kind==='visitor') body='来过 '+c.v.count+' 次，没怎么聊过';
      else {
        const parts=[],t=tierOf(c.p.affinity.value),style=summarizeStyle(c.p.style);
        if (this.config.affinityContext) {
          parts.push(t.tier+'（'+Math.round(c.p.affinity.value)+' 分）');
          // Current state guidance takes priority over a generic relationship tone.
          if (!tags.some(tag=>tag.advice?.trim())) parts.push(t.hint);
        }
        if (style.catchphrases.length) parts.push('常带 '+JSON.stringify(clean(style.catchphrases[0])));
        const dims=Object.entries(c.p.dimensions);
        if (dims.length) parts.push('关系维度：'+dims.map(([n,d])=>clean(n)+'='+Math.round(d.value*10)/10).join('、'));
        body=parts.length ? parts.join('，') : '互动记录';
      }
      let line='- '+JSON.stringify(clean(c.userId))+'：'+body;
      const fits=(next)=>{const text=header+'\n'+[...lines,next].join('\n');return chars(text).length<=budget && (tokenBudget===undefined || tokenCount(text)<=tokenBudget);};
      if (!fits(line)) {
        omitted.push({userId:c.userId,reason:'character-budget'}); continue;
      }
      if (c.p) {
        for (const t of tags) {
          // Keep a label and its guidance together: neither may be silently truncated.
          const label=JSON.stringify(inline(t.tag))+(t.advice?.trim() ? '（建议：'+JSON.stringify(inline(t.advice))+'）' : '');
          const next=line+(selectedTags.length?'、':'，状态：')+label;
          if (selectedTags.length>=3 || !fits(next)) { omitted.push({userId:c.userId,tag:t.tag,reason:'tag-budget'}); continue; }
          line=next; selectedTags.push(clone(t));
          refs.push({personKey:c.pk,tag:t.tag,addedAt:t.addedAt,lastEvidenceAt:t.lastEvidenceAt ?? t.lastHitAt,revision:t.revision??0});
        }
      }
      lines.push(line);
      people.push({userId:c.userId,kind:c.kind,reason:c.priority?'explicit-priority':'recent-activity',tags:selectedTags});
    }
    const text=lines.length ? header+'\n'+lines.join('\n') : '';
    const finalTokens=tokenBudget===undefined?undefined:tokenCount(text);
    if(finalTokens!==undefined && finalTokens>tokenBudget)throw new RangeError('final context exceeds token budget');
    const contextId=randomUUID();
    const result={contextId,chatId,text,people,omitted,budget,characters:chars(text).length,createdAt:now,...(tokenBudget===undefined?{}:{tokens:finalTokens,tokenBudget})};
    // Preview changes no persisted state. Pending acknowledgements are bounded and ephemeral.
    this._storePending(contextId,{refs,chatId,userIds:people.map((p)=>p.userId),createdAt:now});
    return result;
  }
  buildBlock(options={}) { return this.buildContext(options).text; }
  confirmContext(context,options={}) { return this.confirmContexts([context],options); }
  confirmContexts(contexts,{turnId}={}) {
    turnId=key(turnId,'turnId');
    if(!Array.isArray(contexts) || !contexts.length || contexts.length>16)throw new RangeError('provide 1 to 16 contexts');
    if(this.state.uses.some(row=>row.turnId===turnId))return {confirmed:false,duplicate:true,tagCount:0,memoryCount:0};
    const now=this._now(),pendingById=new Map();
    for(const context of contexts){
      const id=typeof context==='string'?context:context?.contextId,pending=this._pending.get(id);
      if(!pending)throw new TypeError('unknown or expired context; build a new context before confirming');
      if(now<pending.createdAt || now-pending.createdAt>10*60000)throw new RangeError('context confirmation expired');
      pendingById.set(id,pending);
    }
    const chats=new Set(),users=new Set(),recordIds=new Set(),memorySubjects=new Map(),tags=new Map(),memories=new Map();
    for(const pending of pendingById.values()){
      if(pending.family==='records'){
        for(const subject of pending.subjects)memorySubjects.set(JSON.stringify(subject),subject);
        for(const ref of pending.refs){
          recordIds.add(ref.id);
          const record=own(this.state.memories,ref.id)?this.state.memories[ref.id]:null;
          if(record && isCurrentMemory(record,now) && hash(record)===ref.fingerprint)memories.set(record.id,record);
        }
      }else{
        chats.add(pending.chatId);pending.userIds.forEach(id=>users.add(id));
        for(const ref of pending.refs){
          const tag=(entry(this.state.tags,ref.personKey,[])).find(tag=>tag.tag===ref.tag && tag.addedAt===ref.addedAt &&
            (tag.lastEvidenceAt??tag.lastHitAt)===ref.lastEvidenceAt && (tag.revision??0)===ref.revision);
          if(tag && (tag.longTerm || tag.expiresAt===null || tag.expiresAt>now))tags.set(JSON.stringify([ref.personKey,ref.tag]),tag);
        }
      }
    }
    if(chats.size>1)throw new TypeError('relationship contexts in one confirmation must share a chat');
    if(recordIds.size>64 || memorySubjects.size>32)throw new RangeError('combined memory confirmation limit exceeded');
    // Validate the whole bundle before changing counters or writing the usage row.
    for(const tag of tags.values())tag.injections=Math.min(Number.MAX_SAFE_INTEGER,tag.injections+1);
    const row={turnId,at:now,userIds:[...users],...(chats.size?{chatId:[...chats][0]}:{})};
    if(memorySubjects.size){row.recordIds=[...recordIds];row.memorySubjects=[...memorySubjects.values()];}
    this.state.uses.push(row);
    this.state.uses=this.config.dedupeLimit?this.state.uses.slice(-this.config.dedupeLimit):[];
    for(const id of pendingById.keys())this._pending.delete(id);
    this._dirty=true;return {confirmed:true,tagCount:tags.size,memoryCount:memories.size};
  }
  deleteUser(userId,{chatId}={}) {
    userId=key(userId,'userId'); if (chatId!==undefined) chatId=key(chatId,'chatId');
    this._imports.clear();this._learningEpoch={};
    let removed=0;
    for (const [cid,people] of Object.entries(this.state.sessions)) {
      if (chatId!==undefined && cid!==chatId) continue;
      if (own(people,userId)) {delete people[userId];removed++;}
      if (!Object.keys(people).length) delete this.state.sessions[cid];
      if (this.config.tagScope==='chat') {delete this.state.tags[this._personKey(cid,userId)];delete this.state.visitors[this._personKey(cid,userId)];}
    }
    if (this.config.tagScope==='user' && (chatId===undefined || !Object.values(this.state.sessions).some((p)=>own(p,userId)))) {
      if (own(this.state.tags,userId) || own(this.state.visitors,userId)) removed++;
      delete this.state.tags[userId];delete this.state.visitors[userId];
    }
    if (this.config.tagScope==='chat') {
      for (const collection of [this.state.tags,this.state.visitors]) for (const id of Object.keys(collection)) {
        const [cid,uid]=JSON.parse(id);
        if(uid===userId && (chatId===undefined || cid===chatId)) {delete collection[id];removed++;}
      }
    }
    this.state.history=this.state.history.filter((r)=>r.userId!==userId || (chatId!==undefined && r.chatId!==chatId));
    this.state.seen=this.state.seen.filter((r)=>r.userId!==userId || (chatId!==undefined && r.chatId!==chatId));
    this.state.uses=this.state.uses.filter((r)=>(!r.userIds.includes(userId) || (chatId!==undefined && r.chatId!==chatId)) &&
      !r.memorySubjects?.some(subject=>subject.type==='user' && subject.id===userId && (chatId===undefined || subject.chatId===chatId)));
    removed+=this._removeMemories(record=>record.subject.type==='user' && record.subject.id===userId &&
      (chatId===undefined || record.subject.chatId===chatId));
    removed+=this._removeCandidates(candidate=>candidate.memory.subject.type==='user'&&candidate.memory.subject.id===userId&&(chatId===undefined||candidate.memory.subject.chatId===chatId));
    this._pending.clear();this._dirty=true;
    return {removed};
  }
  maintain(now=this._now()) {
    now=this._now(now); let decayed=0,expired=0,promoted=0,demoted=0,forcedOut=0;
    for(const people of Object.values(this.state.sessions)) for(const p of Object.values(people)) if(this._decay(p,now)) decayed++;
    for(const [id,tags] of Object.entries(this.state.tags)) {
      const r=sweepTags(tags,now,this.config);this.state.tags[id]=r.tags;
      expired+=r.expired;promoted+=r.promoted;demoted+=r.demoted;forcedOut+=r.forcedOut;
    }
    const visitors=Object.entries(this.state.visitors).filter(([,v])=>now-v.lastSeen<=this.config.visitorRetentionDays*DAY)
      .sort((a,b)=>b[1].lastSeen-a[1].lastSeen).slice(0,this.config.maxVisitors);
    this.state.visitors=Object.fromEntries(visitors);
    const cutoff=now-this.config.dedupeDays*DAY;
    this.state.seen=this.state.seen.filter((r)=>r.at>=cutoff);
    this.state.uses=this.state.uses.filter((r)=>r.at>=cutoff);
    const memoriesExpired=this._removeMemories(record=>record.expiresAt!==null && record.expiresAt<=now);
    const candidatesExpired=this._removeCandidates(candidate=>candidate.expiresAt<=now);
    this._dirty=true;if(this._store?.writeSync)this.flush();
    return {decayed,expired,promoted,demoted,forcedOut,memoriesExpired,candidatesExpired};
  }
  clear() {
    const stats=this.diagnostics(),removed=stats.profiles+stats.memories+stats.candidates;
    this.state=this._empty();this._recordEpoch={};this._learningEpoch={};this._pending.clear();this._imports.clear();this._dirty=true;
    return {removed};
  }
  diagnostics() {
    return {schemaVersion:5,candidates:Object.keys(this.state.candidates).length,memories:Object.keys(this.state.memories).length,profiles:Object.values(this.state.sessions).reduce((n,p)=>n+Object.keys(p).length,0),
      visitors:Object.keys(this.state.visitors).length,tags:Object.values(this.state.tags).reduce((n,t)=>n+t.length,0),
      dedupeEntries:this.state.seen.length,confirmedTurns:this.state.uses.length,historyEntries:this.state.history.length};
  }
  history({chatId,userId,subject}={}) {
    if(subject!==undefined)subject=normalizeSubject(subject);
    return clone(this.state.history.filter((r)=>(chatId===undefined || r.chatId===chatId)&&(userId===undefined || r.userId===userId) && (subject===undefined || (r.subject && sameSubject(r.subject,subject)))));
  }
  flush() {
    if(!this._store || !this._dirty)return;
    if(this._storeBusy)throw storageError('ERR_STORE_BUSY','another store operation is pending');
    if(typeof this._store.writeSync!=='function')throw storageError('ERR_STORE_ASYNC','this store requires await persist()');
    if(Buffer.byteLength(JSON.stringify(this.state))>this.config.maxSnapshotBytes)throw capacityError('snapshot');
    const saved=this._store.writeSync(this.state,{expectedRevision:this._storeRevision});
    checkRevision(saved?.revision,{empty:false});this._storeRevision=saved.revision;this._dirty=false;
  }
  export() {return clone(this.state);}
  import(snapshot) {const next=this._hydrate(snapshot);this.state=next;this._recordEpoch={};this._learningEpoch={};this._pending.clear();this._imports.clear();this._dirty=true;}
}
