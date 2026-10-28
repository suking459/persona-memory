import {validateResourceLimits,capacityError} from './limits.js';
import {validateTagRules} from './text-policy.js';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { SCORE_RULES, tierOf, clampAffinity, applyDailyGain, decayAmount, scoreMessage, updateStyle, summarizeStyle, matchTags, hitTag, normalizeTag, sweepTags } from './rules.js';

const DAY = 86400000;
const own = (object, key) => Object.hasOwn(object, key);
const clone = (value) => JSON.parse(JSON.stringify(value));
const chars = (text) => Array.from(text);
const clean = (text) => String(text).replace(/[\r\n\t\u0000-\u001f]/g, ' ').slice(0, 160);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DEFAULTS = {
  dailyGainCap: 30, talkDailyCap: 12, decayPerDay: 2, perMessageCap: 8,
  tagTtlHours: 48, maxTagsPerPerson: 16, attentionWindowSec: 180,
  maxPeople: 4, maxChars: 700, blockWords: [], extraRules: {}, decayBaseline: 0,
  longTermTtlDays: 7, maxInjections: 200, visitorTracking: true, visitorHint: true,
  visitorHintMinCount: 2, scoreAmbient: false, tagScope: 'user', timeZone: 'UTC', botId: null,
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
  for (const name of ['dailyGainCap','talkDailyCap','decayPerDay','perMessageCap','tagTtlHours','maxTagsPerPerson','attentionWindowSec','maxPeople','maxChars','longTermTtlDays','maxInjections','visitorHintMinCount','maxVisitors','visitorRetentionDays','maxStyleFragments','dedupeLimit','dedupeDays','historyLimit']) {
    number(config[name], name);
  }
  for(const name of ['visitorTracking','visitorHint','scoreAmbient']) if(typeof config[name]!=='boolean') throw new TypeError(name+' must be boolean');
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
    if (this.storage) this._load();
  }
  _empty() {
    return { schemaVersion: 2, persona: this.persona, scope: this.scope, tagScope: this.config.tagScope,
      sessions: {}, tags: {}, visitors: {}, seen: [], uses: [], history: [] };
  }
  _now(value = this.clock()) { number(value,'timestamp');if(value>8640000000000000)throw new RangeError('timestamp outside supported calendar');return value; }
  _file() {
    const name = this.scope ? 'scope-'+hash([this.scope,this.persona])+'.json' : encodeURIComponent(this.persona)+'.json';
    return path.join(this.storage, name);
  }
  _load() {
    const file = this._file();
    if (!fs.existsSync(file)) return;
    if(fs.statSync(file).size>this.config.maxSnapshotBytes) throw new Error('Snapshot exceeds the configured byte limit');
    try { this.state = this._hydrate(JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))); }
    catch (cause) { throw new Error('Cannot load memory snapshot; original file preserved: ' + file, { cause }); }
  }
  _hydrate(snapshot) {
    const raw = clone(snapshot);
    if (!dictionary(raw) || ![1,2].includes(raw.schemaVersion ?? 1) || !dictionary(raw.sessions)) throw new TypeError('invalid snapshot');
    if (raw.persona && raw.persona !== this.persona) throw new TypeError('snapshot persona mismatch');
    if ((raw.scope ?? '') !== this.scope) throw new TypeError('snapshot scope mismatch');
    if (raw.schemaVersion === 2 && raw.tagScope !== this.config.tagScope) throw new TypeError('snapshot tagScope mismatch');
    if (raw.schemaVersion !== 2 && this.config.tagScope !== 'user') throw new TypeError('v1 snapshot requires tagScope=user');
    const next = this._empty();
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
          const d = p.dimensions?.[name];
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
        if(field==='uses') r.userIds.forEach(id=>key(id,'userId'));
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
  _audit(type, chatId, userId, detail = {}) {
    if (!this.config.historyLimit) return;
    this.state.history.push({ type, chatId, userId, at:this._now(), ...detail });
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
      const v=this.state.visitors[pkey] || {firstSeen:ts,lastSeen:ts,count:0};
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
      let tags=sweepTags(this.state.tags[pkey] || [],ts,this.config).tags;
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
    if (!Array.isArray(replace)) throw new TypeError('replace must be an array');
    if (expiresAt !== undefined && expiresAt !== null) this._now(expiresAt);
    const p=this._profile(chatId,userId);
    if (p && now<p.lastAt) throw new RangeError('out-of-order tag update');
    this._assertProfileCapacity(chatId,userId);
    if (this._duplicate(eventId,chatId,userId,now)) return {duplicate:true};
    this._profile(chatId,userId,true,now).lastAt=now;
    const id=this._personKey(chatId,userId);
    let tags=sweepTags(this.state.tags[id] || [],now,this.config).tags.filter((t)=>!replace.includes(t.tag));
    tags=hitTag(tags,tag,String(advice),now,this.config.tagTtlHours);
    const t=tags.find((t)=>t.tag===tag);
    Object.assign(t,{source,evidenceId:eventId ? String(eventId) : undefined,lastEvidenceAt:now,revision:(t.revision??0)+1});
    if (expiresAt !== undefined) { t.expiresAt=expiresAt; t.longTerm=expiresAt===null; }
    this.state.tags[id]=sweepTags(tags,now,this.config).tags;
    this._pending.clear();
    this._audit('set-tag',chatId,userId,{tag,source,replaced:replace});
    this._dirty=true;
    return clone(t);
  }
  removeTag({chatId,userId,tag} = {}) {
    userId=key(userId,'userId'); tag=key(tag,'tag');
    const id=this._personKey(chatId,userId), tags=this.state.tags[id] || [];
    const next=tags.filter((t)=>t.tag!==tag);
    if (next.length===tags.length) return false;
    this.state.tags[id]=next; this._pending.clear(); this._dirty=true;
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
    if (this._duplicate(eventId,chatId,userId,now)) return {duplicate:true};
    const p=this._profile(chatId,userId,true,now); this._decay(p,now); p.lastAt=now;
    for (const [name,delta] of Object.entries(changes)) {
      const rule=this.config.dimensions[name],d=p.dimensions[name];
      d.value=Math.min(rule.max,Math.max(rule.min,d.value+delta)); d.lastAt=now;
    }
    this._audit('host-event',chatId,userId,{eventType:type,changes:clone(changes)});
    this._dirty=true; return clone(p.dimensions);
  }
  getVisitor(userId,{chatId}={}) {
    userId=key(userId,'userId');
    const v=this.state.visitors[this._personKey(chatId,userId)];
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
      style:summarizeStyle(p.style),tags:clone(this.state.tags[this._personKey(chatId,userId)] || []),dimensions:clone(p.dimensions),lastAt:p.lastAt};
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
      const v=this.state.visitors[pk];
      if (p) candidates.push({userId,kind:'profile',p,pk,lastAt:p.lastAt,priority:priority.has(userId)?1:0});
      else if (this.config.visitorHint && v && v.count>=this.config.visitorHintMinCount) candidates.push({userId,kind:'visitor',v,pk,lastAt:v.lastSeen,priority:priority.has(userId)?1:0});
      else omitted.push({userId,reason:'no-eligible-memory'});
    }
    candidates.sort((a,b)=>b.priority-a.priority || b.lastAt-a.lastAt || (b.p?.affinity.value??0)-(a.p?.affinity.value??0) || a.userId.localeCompare(b.userId));
    const header='【交往记忆】', lines=[],people=[],refs=[];
    for (const c of candidates) {
      if (people.length>=maxPeople) { omitted.push({userId:c.userId,reason:'people-limit'}); continue; }
      let body,selectedTags=[];
      if (c.kind==='visitor') body='来过 '+c.v.count+' 次，没怎么聊过';
      else {
        const t=tierOf(c.p.affinity.value),style=summarizeStyle(c.p.style);
        body=t.tier+'（'+Math.round(c.p.affinity.value)+' 分），'+t.hint;
        if (style.catchphrases.length) body+='，常带 '+JSON.stringify(clean(style.catchphrases[0]));
        const dims=Object.entries(c.p.dimensions);
        if (dims.length) body+='，关系维度：'+dims.map(([n,d])=>clean(n)+'='+Math.round(d.value*10)/10).join('、');
      }
      let line='- '+JSON.stringify(clean(c.userId))+'：'+body;
      const fits=(next)=>{const text=header+'\n'+[...lines,next].join('\n');return chars(text).length<=budget && (tokenBudget===undefined || tokenCount(text)<=tokenBudget);};
      if (!fits(line)) {
        omitted.push({userId:c.userId,reason:'character-budget'}); continue;
      }
      if (c.p) {
        const tags=(this.state.tags[c.pk] || []).filter((t)=>t.longTerm || t.expiresAt===null || t.expiresAt>now)
          .sort((a,b)=>(['manual','host'].includes(b.source)?1:0)-(['manual','host'].includes(a.source)?1:0) || b.lastHitAt-a.lastHitAt);
        for (const t of tags) {
          const next=line+(selectedTags.length?'、':'，状态：')+JSON.stringify(clean(t.tag));
          if (selectedTags.length>=3 || !fits(next)) { omitted.push({userId:c.userId,tag:t.tag,reason:'tag-budget'}); continue; }
          line=next; selectedTags.push(clone(t));
          refs.push({personKey:c.pk,tag:t.tag,addedAt:t.addedAt,lastEvidenceAt:t.lastEvidenceAt ?? t.lastHitAt,revision:t.revision??0});
        }
      }
      lines.push(line);
      people.push({userId:c.userId,kind:c.kind,reason:c.priority?'explicit-priority':'recent-activity',tags:selectedTags});
    }
    const text=lines.length ? header+'\n'+lines.join('\n') : '';
    const contextId=randomUUID();
    const result={contextId,chatId,text,people,omitted,budget,characters:chars(text).length,createdAt:now,...(tokenBudget===undefined?{}:{tokens:tokenCount(text),tokenBudget})};
    // Preview changes no persisted state. Pending acknowledgements are bounded and ephemeral.
    this._pending.set(contextId,{refs,chatId,userIds:people.map((p)=>p.userId),createdAt:now});
    while(this._pending.size>128) this._pending.delete(this._pending.keys().next().value);
    return result;
  }
  buildBlock(options={}) { return this.buildContext(options).text; }
  confirmContext(context,{turnId}={}) {
    turnId=key(turnId,'turnId');
    const contextId=typeof context==='string' ? context : context?.contextId;
    const pending=this._pending.get(contextId);
    const previous=this.state.uses.find((u)=>u.turnId===turnId);
    if (previous) return {confirmed:false,duplicate:true,tagCount:0};
    if (!pending) throw new TypeError('unknown or expired context; build a new context before confirming');
    if (this._now()-pending.createdAt>10*60000) throw new RangeError('context confirmation expired');
    let count=0;
    for (const r of pending.refs) {
      const t=(this.state.tags[r.personKey] || []).find((t)=>t.tag===r.tag && t.addedAt===r.addedAt && (t.lastEvidenceAt??t.lastHitAt)===r.lastEvidenceAt && (t.revision??0)===r.revision);
      if (t && (t.longTerm || t.expiresAt===null || t.expiresAt>this._now())) {t.injections++;count++;}
    }
    this.state.uses.push({turnId,chatId:pending.chatId,userIds:pending.userIds,at:this._now()});
    this.state.uses=this.config.dedupeLimit ? this.state.uses.slice(-this.config.dedupeLimit) : [];
    this._pending.delete(contextId);this._dirty=true;
    return {confirmed:true,tagCount:count};
  }
  deleteUser(userId,{chatId}={}) {
    userId=key(userId,'userId'); if (chatId!==undefined) chatId=key(chatId,'chatId');
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
    this.state.uses=this.state.uses.filter((r)=>!r.userIds.includes(userId) || (chatId!==undefined && r.chatId!==chatId));
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
    this._dirty=true;this.flush();
    return {decayed,expired,promoted,demoted,forcedOut};
  }
  clear() {
    const removed=this.diagnostics().profiles;
    this.state=this._empty();this._pending.clear();this._dirty=true;
    return {removed};
  }
  diagnostics() {
    return {schemaVersion:2,profiles:Object.values(this.state.sessions).reduce((n,p)=>n+Object.keys(p).length,0),
      visitors:Object.keys(this.state.visitors).length,tags:Object.values(this.state.tags).reduce((n,t)=>n+t.length,0),
      dedupeEntries:this.state.seen.length,confirmedTurns:this.state.uses.length,historyEntries:this.state.history.length};
  }
  history({chatId,userId}={}) {
    return clone(this.state.history.filter((r)=>(chatId===undefined || r.chatId===chatId)&&(userId===undefined || r.userId===userId)));
  }
  flush() {
    if(!this.storage || !this._dirty) return;
    const serialized=JSON.stringify(this.state);
    if(Buffer.byteLength(serialized)>this.config.maxSnapshotBytes)throw capacityError('snapshot');
    fs.mkdirSync(this.storage,{recursive:true});
    const file=this._file(),tmp=file+'.'+randomUUID()+'.tmp';
    try { fs.writeFileSync(tmp,serialized,{flag:'wx',mode:0o600});fs.renameSync(tmp,file);this._dirty=false; }
    catch(error) {try{fs.unlinkSync(tmp);}catch{} throw error;}
  }
  export() {return clone(this.state);}
  import(snapshot) {const next=this._hydrate(snapshot);this.state=next;this._pending.clear();this._dirty=true;}
}
