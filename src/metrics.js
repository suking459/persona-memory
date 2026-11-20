// Explicit scalar observations only: no providers, timers, bodies or background persistence.
import {assertMemoryFields as fields,memoryArray} from './records.js';
export const MEMORY_OPERATIONS=Object.freeze(['recall','context','proposal','review','persist','maintenance','task']);
function number(value,label,max,{integer=false}={}){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>max||(integer&&!Number.isSafeInteger(value)))throw new TypeError('invalid '+label);
  return value;
}
function measurement(raw){
  fields(raw,new Set(['operation','durationMs','success','inputTokens','outputTokens','bytes']),'measurement');
  if(!MEMORY_OPERATIONS.includes(raw.operation)||typeof raw.success!=='boolean')throw new TypeError('explicit operation and success required');
  const result={operation:raw.operation,durationMs:number(raw.durationMs,'durationMs',86400000),success:raw.success};
  for(const key of ['inputTokens','outputTokens','bytes'])if(raw[key]!==undefined)result[key]=number(raw[key],key,1000000000,{integer:true});
  return result;
}
function aggregate(samples){
  const duration=samples.map(s=>s.durationMs).sort((a,b)=>a-b),sum=key=>samples.every(s=>s[key]!==undefined)?samples.reduce((n,s)=>n+s[key],0):null;
  return {samples:samples.length,succeeded:samples.filter(s=>s.success).length,failed:samples.filter(s=>!s.success).length,
    durationMs:{mean:duration.length?duration.reduce((n,x)=>n+x,0)/duration.length:null,
      p50:duration.length?duration[Math.ceil(duration.length*.5)-1]:null,p95:duration.length?duration[Math.ceil(duration.length*.95)-1]:null},
    inputTokens:samples.length?sum('inputTokens'):null,outputTokens:samples.length?sum('outputTokens'):null,bytes:samples.length?sum('bytes'):null,
    known:{inputTokens:samples.filter(s=>s.inputTokens!==undefined).length,outputTokens:samples.filter(s=>s.outputTokens!==undefined).length,bytes:samples.filter(s=>s.bytes!==undefined).length}};
}
export function createMemoryMetrics(options={}){
  fields(options,new Set(['capacity']),'metrics options');const capacity=options.capacity??128;
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>1024)throw new RangeError('metrics capacity must be 1..1024');
  const ring=new Array(capacity);let next=0,size=0,total=0;
  const samples=()=>Array.from({length:size},(_,i)=>({...ring[(next-size+i+capacity)%capacity]}));
  return {
    record(raw){const sample=measurement(raw);if(total===Number.MAX_SAFE_INTEGER)throw new RangeError('metrics counter exhausted; clear explicitly');
      ring[next]=sample;next=(next+1)%capacity;size=Math.min(size+1,capacity);total++;return {retained:size,dropped:total-size};},
    summary(){const rows=samples();return {capacity,retained:size,total,dropped:total-size,measurementSource:'caller-reported',evidenceVerified:false,
      operations:Object.fromEntries(MEMORY_OPERATIONS.map(op=>[op,aggregate(rows.filter(s=>s.operation===op))]))};},
    samples,
    clear(){ring.fill(undefined);next=0;size=0;total=0;},
  };
}
export function compareMemoryTrials(raw){
  const rows=memoryArray(raw,'paired trials',256);if(!rows.length)throw new RangeError('at least one trial required');
  const cases=new Map();
  for(const row of rows){
    fields(row,new Set(['caseIndex','mode','durationMs','success','inputTokens','outputTokens','bytes']),'trial');
    const caseIndex=number(row.caseIndex,'caseIndex',1000000000,{integer:true});
    if(!['enabled','disabled'].includes(row.mode))throw new TypeError('trial mode must be enabled or disabled');
    const {caseIndex:unused,mode,...sample}=row,normalized=measurement({operation:'task',...sample});
    if(!cases.has(caseIndex))cases.set(caseIndex,{});const pair=cases.get(caseIndex);
    if(pair[mode])throw new TypeError('duplicate case/mode; use one completed trial per mode');pair[mode]=normalized;
  }
  const pairs=[],unpaired=[];
  for(const [caseIndex,pair] of [...cases].sort((a,b)=>a[0]-b[0])){
    if(!pair.enabled||!pair.disabled){unpaired.push({caseIndex,missing:pair.enabled?'disabled':'enabled'});continue;}
    const delta={durationMs:pair.enabled.durationMs-pair.disabled.durationMs};
    for(const key of ['inputTokens','outputTokens','bytes'])delta[key]=pair.enabled[key]===undefined||pair.disabled[key]===undefined?null:pair.enabled[key]-pair.disabled[key];
    const {operation:a,...enabled}=pair.enabled,{operation:b,...disabled}=pair.disabled;
    pairs.push({caseIndex,enabled,disabled,delta});
  }
  return {measurementSource:'caller-reported',evidenceVerified:false,pairs,unpaired,
    summary:{paired: pairs.length,enabledSuccess:pairs.filter(p=>p.enabled.success).length,disabledSuccess:pairs.filter(p=>p.disabled.success).length,
      meanDurationDeltaMs:pairs.length?pairs.reduce((n,p)=>n+p.delta.durationMs,0)/pairs.length:null},
    limits:'Pairing checks numeric case IDs, not equivalent tasks, environments, result truth or statistical significance. Missing tokens remain unknown; no price, savings or quality estimate is generated.'};
}
