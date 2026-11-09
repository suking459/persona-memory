import {PersonaMemory} from '../src/index.js';
import {createPreset} from '../src/presets.js';
export function createDemoState({storage=null}={}) {
  let now=Date.now();
  const memories=Object.fromEntries(['community','companion','support','npc'].map(name=>[name,new PersonaMemory({storage,persona:'scenario-'+name,clock:()=>now,config:createPreset(name)})]));
  function select(name){if(!Object.hasOwn(memories,name))throw new TypeError('unknown scenario');return memories[name];}
  function state(name){
    const pm=select(name),context=pm.buildContext({chatId:'demo',userIds:['visitor']});
    return {scenario:name,now,profile:pm.getProfile('demo','visitor'),context,stats:pm.diagnostics(),mode:'rule-demo'};
  }
  return {
    state,
    chat(name,text){
      text=String(text??'').trim();if(!text || text.length>2000)throw new TypeError('message must contain 1–2000 characters');
      now++;
      const pm=select(name);pm.ingest({chatId:'demo',userId:'visitor',text,mentionsSelf:true});
      const p=pm.getProfile('demo','visitor');
      const tags=p.tags.map(t=>t.tag);
      const reply=name==='support'?(tags.includes('unresolved')?'Your previous issue is still unresolved. Let us continue with that first.':tags.includes('resolved')?'Your previous issue was resolved. What has changed?':'Hello. What issue would you like help with?'):
        name==='npc'?'Welcome back. Familiarity: '+Math.round(p.dimensions.familiarity.value)+', trust: '+Math.round(p.dimensions.trust.value)+'.':
        tags.includes('feeling-tired')?'We can keep this brief if you are tired.':p.affinity.value>=20?'Welcome back. How have you been?':'Hello. What would you like to discuss?';
      pm.flush();
      return {...state(name),reply,withoutMemory:'Hello. How can I help?',explanation:'These rule-based responses illustrate state; they do not evaluate a model.'};
    },
    action(name,action){
      const pm=select(name);now++;
      if(action==='advance-day'){now+=86400000;for(const memory of Object.values(memories))memory.maintain();}
      else if(action==='reset')pm.deleteUser('visitor');
      else if(name==='support' && action==='unresolved')pm.setTag({chatId:'demo',userId:'visitor',tag:'unresolved',advice:'Confirm progress and continue the unresolved issue.',source:'host',expiresAt:null,replace:['resolved']});
      else if(name==='support' && action==='resolved')pm.setTag({chatId:'demo',userId:'visitor',tag:'resolved',advice:'Do not keep asking about a resolved issue.',source:'host',replace:['unresolved']});
      else if(name==='npc' && ['promise-kept','promise-broken'].includes(action))pm.recordEvent({chatId:'demo',userId:'visitor',type:action,changes:{trust:action==='promise-kept'?10:-10}});
      else throw new TypeError('action not available in this scenario');
      pm.flush();return state(name);
    },
  };
}
