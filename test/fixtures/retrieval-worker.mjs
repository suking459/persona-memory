import assert from 'node:assert/strict';
import {PersonaMemory} from '../../src/index.js';
const pm=new PersonaMemory({clock:()=>1000}),subject={type:'project',id:'bounded'};
const relevance=[];
for(let i=0;i<300;i++){
  const id='r'+i;
  pm.putMemory({id,subject,kind:'fact',key:'entry-'+i,value:'x'.repeat(7900)+' release'});
  relevance.push({id,score:0.5});
}
const search=pm.searchMemories({subject,query:'release',limit:1000});
assert.ok(search.scannedCharacters<=1000000 && search.omitted.textLimit>0);
const context=pm.buildMemoryContext({subject,query:'release',relevance,budget:100000,maxRecords:64});
assert.ok(context.characters<=100000 && context.records.length>0);
assert.equal(pm.confirmContext(context,{turnId:'bounded'}).memoryCount,context.records.length);
const restored=new PersonaMemory({clock:()=>1000});restored.import(pm.export());
assert.deepEqual(restored.export(),pm.export());
console.log(JSON.stringify({completed:true,records:300,selected:context.records.length}));
