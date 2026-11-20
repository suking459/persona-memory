import {openCharacterProfile,createCharacterTurnRouter} from 'persona-memory';

const at=Date.now();
const profile=await openCharacterProfile({id:'example-character'});
for(let index=1;index<=3;index++){
  await profile.record({id:`observation-${index}`,sessionId:`chat-${index}`,topic:'space mysteries',
    channel:'chat',reaction:'positive',at});
}

const route=createCharacterTurnRouter({
  profile,
  runWork:({text,workInput})=>({handler:'work',text,workInput}),
  runChat:({text,character})=>({handler:'chat',text,character}),
});

console.log(await route({mode:'chat',hasTask:false,text:'What shall we talk about?'}));
console.log(await route({mode:'chat',hasTask:true,text:'Also run the tests.',workInput:{suite:'core'}}));
