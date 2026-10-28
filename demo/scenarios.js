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
      const reply=name==='support'?(tags.includes('待跟进')?'我看到上次的问题还没处理完，先接着处理那件事。':tags.includes('已解决')?'上次的问题已经解决了，这次有什么新情况？':'你好，请说说这次需要处理的问题。'):
        name==='npc'?'你又来了。熟悉程度 '+Math.round(p.dimensions.familiarity.value)+'，信任 '+Math.round(p.dimensions.trust.value)+'。':
        tags.includes('最近很累')?'今天先轻松聊两句，累了就早点休息。':p.affinity.value>=20?'又见面啦，最近怎么样？':'你好，今天想聊点什么？';
      pm.flush();
      return {...state(name),reply,withoutMemory:'你好，请问有什么可以帮你？',explanation:'这两句是规则生成的对照，不是模型效果评测。'};
    },
    action(name,action){
      const pm=select(name);now++;
      if(action==='advance-day'){now+=86400000;for(const memory of Object.values(memories))memory.maintain();}
      else if(action==='reset')pm.deleteUser('visitor');
      else if(name==='support' && action==='unresolved')pm.setTag({chatId:'demo',userId:'visitor',tag:'待跟进',source:'host',expiresAt:null,replace:['已解决']});
      else if(name==='support' && action==='resolved')pm.setTag({chatId:'demo',userId:'visitor',tag:'已解决',source:'host',replace:['待跟进']});
      else if(name==='npc' && ['promise-kept','promise-broken'].includes(action))pm.recordEvent({chatId:'demo',userId:'visitor',type:action,changes:{trust:action==='promise-kept'?10:-10}});
      else throw new TypeError('action not available in this scenario');
      pm.flush();return state(name);
    },
  };
}
