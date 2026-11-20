import {createHash} from 'node:crypto';
import {assertMemoryFields as fields,memoryArray,memoryIdentifier} from './records.js';
import {checkRevision,JsonFileStore,MemorySnapshotStore} from './storage.js';
import {copySnapshotJSON} from './snapshot.js';

const format='persona-memory/character',DAY=86400000;
const retention=90*DAY,halfLife=45*60000,limit=128,byteLimit=65536;
const dataFields=new Set(['format','version','id','frozen','watermark','events','removed']);
const eventFields=new Set(['id','sessionId','topic','reaction','channel','at']);
const reactions=new Set(['positive','negative','neutral']);
const channels=new Set(['chat','approved-milestone']);
const byId=(a,b)=>a.id<b.id?-1:a.id>b.id?1:0;
const hash=id=>createHash('sha256').update(id).digest('hex');
const validHash=id=>typeof id==='string'&&/^[a-f0-9]{64}$/.test(id);

function timestamp(at){
  if(!Number.isSafeInteger(at)||at<0||at>8640000000000000)throw new TypeError('invalid character timestamp');
  return at;
}

function normalizeEvent(raw){
  fields(raw,eventFields,'character observation');
  const id=memoryIdentifier(raw.id),sessionId=memoryIdentifier(raw.sessionId),{reaction,channel}=raw;
  if(id.length>96||sessionId.length>96||/[\p{Cc}\p{Cf}]/u.test(id+sessionId))throw new TypeError('invalid character observation ID');
  if(typeof raw.topic!=='string'||raw.topic.length>96||/[\p{Cc}\p{Cf}]/u.test(raw.topic))throw new TypeError('invalid character topic');
  const topic=raw.topic.normalize('NFC').trim();
  if(!topic||topic.length>96||!channels.has(channel)||!reactions.has(reaction))throw new TypeError('invalid character observation');
  return {id,sessionId,topic,reaction,channel,at:timestamp(raw.at)};
}

function validateState(snapshot,id){
  const data=copySnapshotJSON(snapshot,byteLimit);
  fields(data,dataFields,'character snapshot');
  if(data.format!==format||data.version!==1||data.id!==id||typeof data.frozen!=='boolean')throw new TypeError('character store format or identity mismatch');
  const watermark=timestamp(data.watermark),events=memoryArray(data.events,'character observations',limit).map(normalizeEvent);
  const removed=memoryArray(data.removed,'forgotten observations',limit);
  const seen=new Set();
  for(const entry of removed){
    if(!validHash(entry)||seen.has(entry))throw new TypeError('invalid forgotten observation');
    seen.add(entry);
  }
  let previousAt=0;
  for(const event of events){
    const digest=hash(event.id);
    if(seen.has(digest)||event.at>watermark||event.at<previousAt)throw new TypeError('invalid stored observation sequence');
    seen.add(digest);
    previousAt=event.at;
  }
  return {...data,events,removed};
}

function describe(state,at){
  const topics=new Map(),recentSessions=new Map();
  for(const event of state.events){
    const age=at-event.at;
    if(age<0||age>=retention)continue;
    if(age<=4*3600000){
      const previous=recentSessions.get(event.sessionId);
      if(!previous||event.at>=previous.at)recentSessions.set(event.sessionId,event);
    }
    const key=event.topic.toLowerCase();
    if(!topics.has(key))topics.set(key,new Map());
    const sessions=topics.get(key),previous=sessions.get(event.sessionId);
    if(!previous||event.at>=previous.at)sessions.set(event.sessionId,event);
  }
  const preferences=[];
  for(const sessions of topics.values()){
    const evidence=[...sessions.values()].filter(event=>event.reaction!=='neutral');
    const score=evidence.reduce((total,event)=>total+(event.reaction==='positive'?1:-1),0);
    if(evidence.length<3||Math.abs(score)<2)continue;
    evidence.sort((a,b)=>b.at-a.at||byId(a,b));
    preferences.push({topic:evidence[0].topic,preference:score>0?'likes':'dislikes',sessions:evidence.length,
      evidenceIds:evidence.map(event=>event.id),updatedAt:evidence[0].at});
  }
  preferences.sort((a,b)=>b.sessions-a.sessions||b.updatedAt-a.updatedAt||(a.topic<b.topic?-1:a.topic>b.topic?1:0));
  let mood=0;
  for(const event of recentSessions.values()){
    const sign=event.reaction==='positive'?1:event.reaction==='negative'?-1:0;
    mood+=sign*2**(-(at-event.at)/halfLife);
  }
  return {id:state.id,frozen:state.frozen,mood:mood>=0.5?'pleased':mood<=-0.5?'subdued':'neutral',preferences};
}

/** The host supplies authorized event metadata. This store is dedicated to a single character. */
export async function openCharacterProfile(options){
  fields(options,new Set(['id','store','file','clock']),'character options');
  if(options.file!==undefined&&options.store!==undefined)throw new TypeError('choose a character file or store');
  const id=memoryIdentifier(options.id,'character ID');
  const store=options.file!==undefined?new JsonFileStore({file:options.file,maxBytes:byteLimit}):options.store??new MemorySnapshotStore({maxBytes:byteLimit});
  const clock=options.clock??Date.now;
  if(typeof clock!=='function'||typeof store.read!=='function'||typeof store.write!=='function')throw new TypeError('invalid character clock or store');
  const empty={format,version:1,id,frozen:false,watermark:0,events:[],removed:[]};
  async function read(){
    const {snapshot,revision}=await store.read();
    checkRevision(revision);
    if((snapshot===null)!==(revision===null))throw new TypeError('invalid character store response');
    return {state:snapshot===null?structuredClone(empty):validateState(snapshot,id),revision};
  }
  await read();
  async function update(change){
    const {state,revision}=await read();
    const now=timestamp(clock());
    if(now<state.watermark)throw new RangeError('character clock moved backwards');
    const result=change(state,now);
    if(!result.changed)return result;
    const snapshot=validateState(state,id);
    const saved=await store.write(snapshot,{expectedRevision:revision});
    checkRevision(saved.revision,{empty:false});
    return result;
  }
  return Object.freeze({
    async inspect(){
      const {state}=await read(),at=timestamp(clock());
      if(at<state.watermark)throw new RangeError('character clock moved backwards');
      return {...describe(state,at),events:state.events.filter(event=>at-event.at<retention)};
    },
    record(raw){
      const event=normalizeEvent(raw);
      return update((state,now)=>{
        const existing=state.events.find(item=>item.id===event.id);
        if(existing){
          if(JSON.stringify(existing)!==JSON.stringify(event))throw new TypeError('observation ID belongs to different content');
          return {changed:false,status:'duplicate'};
        }
        if(state.removed.includes(hash(event.id)))return {changed:false,status:'forgotten'};
        if(state.frozen)return {changed:false,status:'frozen'};
        if(event.at>now||event.at<state.watermark||now-event.at>=retention)throw new RangeError('observation time is stale or in the future');
        if(state.events.length===limit&&event.at===state.events[0].at)throw new RangeError('too many observations at this timestamp');
        state.events=state.events.filter(item=>now-item.at<retention);
        state.events.push(event);
        state.events=state.events.slice(-limit);
        state.watermark=event.at;
        return {changed:true,status:'recorded'};
      });
    },
    setFrozen(frozen){
      if(typeof frozen!=='boolean')throw new TypeError('frozen must be boolean');
      return update(state=>{
        const changed=state.frozen!==frozen;
        state.frozen=frozen;
        return {changed,status:frozen?'frozen':'active'};
      });
    },
    correct(eventId,changes){
      const id=memoryIdentifier(eventId,'character observation ID');
      fields(changes,new Set(['topic','reaction']),'character correction');
      return update((state,now)=>{
        const index=state.events.findIndex(event=>event.id===id);
        if(index<0||now-state.events[index].at>=retention)return {changed:false,status:'unavailable'};
        const event=state.events[index],next=normalizeEvent({...event,...changes});
        if(JSON.stringify(event)===JSON.stringify(next))return {changed:false,status:'duplicate'};
        state.events[index]=next;
        state.watermark=now;
        return {changed:true,status:'corrected'};
      });
    },
    forget(eventId){
      const id=memoryIdentifier(eventId,'character observation ID');
      return update((state,now)=>{
        if(!state.events.some(event=>event.id===id))return {changed:false,status:'unavailable'};
        state.events=state.events.filter(event=>event.id!==id);
        state.removed=[...state.removed,hash(id)].slice(-limit);
        state.watermark=now;
        return {changed:true,status:'forgotten'};
      });
    },
    reset(){
      return update((state,now)=>{
        state.removed=[...state.removed,...state.events.map(event=>hash(event.id))].slice(-limit);
        state.events=[];
        state.watermark=now;
        return {changed:true,status:'reset'};
      });
    },
  });
}

/** Route at the trusted host boundary, before a model receives history or tools. */
export function createCharacterTurnRouter({profile,runWork,runChat}){
  if(typeof profile?.inspect!=='function'||typeof runWork!=='function'||typeof runChat!=='function')throw new TypeError('character router needs separate work and chat handlers');
  return async function route(input){
    fields(input,new Set(['mode','hasTask','text','workInput']),'character turn');
    const {mode,hasTask,text,workInput}=input;
    if(typeof text!=='string'||text.length>100000)throw new TypeError('invalid turn text');
    if(mode!=='chat'||hasTask!==false)return runWork({text,workInput});
    const {mood,preferences}=await profile.inspect();
    const character={mood,preferences:preferences.slice(0,6).map(({topic,preference})=>({topic,preference}))};
    return runChat({text,character});
  };
}
