import {performance} from 'node:perf_hooks';
// Independently implemented bounded execution leases; no automatic retry loops.
function timeoutError(){const error=new Error('turn exceeded its execution deadline');error.code='ERR_TURN_TIMEOUT';return error;}
export function createTurnRunner({limit=128,timeoutMs=30000}={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>1024||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>300000)throw new RangeError('invalid turn execution limits');
  const turns=new Map();
  return function run(turnId,text,operation){
    if(typeof turnId!=='string'||!turnId.trim()||turnId.length>256||typeof text!=='string'||text.length>100000)return Promise.reject(new TypeError('bounded text and unique turnId required'));
    turnId=turnId.trim();
    if(['__proto__','constructor','prototype'].includes(turnId) || /[\u0000-\u001f]/.test(turnId))return Promise.reject(new TypeError('invalid turnId'));
    let state=turns.get(turnId);
    if(state && state.text!==text)return Promise.reject(new TypeError('turnId reused with different input'));
    if(state?.promise)return state.promise;
    if(!state){
      if(turns.size>=limit){const evict=[...turns].find(([,s])=>!s.running);if(!evict)return Promise.reject(new RangeError('too many concurrent turns'));turns.delete(evict[0]);}
      state={text};turns.set(turnId,state);
    }
    const controller=new AbortController(),lease=Symbol('attempt');
    state.running=true;state.lease=lease;state.signal=controller.signal;
    const deadlineAt=performance.now()+timeoutMs;
    state.checkActive=()=>{
      if(controller.signal.aborted||state.lease!==lease||performance.now()>=deadlineAt){
        const error=timeoutError();if(!controller.signal.aborted)controller.abort(error);throw error;
      }
    };
    let timer;
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{const error=timeoutError();controller.abort(error);reject(error);},timeoutMs);});
    const execution=Promise.resolve().then(()=>operation(state)).then(result=>{
      state.running=false;clearTimeout(timer);return result;
    },error=>{state.running=false;clearTimeout(timer);state.promise=null;throw error;});
    state.promise=Promise.race([execution,deadline]);
    // A callback ignoring abort remains capacity-accounted until it settles.
    return state.promise;
  };
}
