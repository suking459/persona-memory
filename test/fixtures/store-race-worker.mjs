import {PersonaMemory} from '../../src/index.js';
const pm=new PersonaMemory({storage:process.argv[2],clock:()=>1000});
process.send('ready');
process.once('message',()=>{
  try{
    pm.putMemory({id:process.argv[3],subject:{type:'task',id:'race'},kind:'fact',key:process.argv[3],value:'saved'});
    pm.flush();process.send({ok:true});
  }catch(error){process.send({ok:false,code:error.code});}
  process.disconnect();
});
