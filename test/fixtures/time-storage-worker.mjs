import {PersonaMemory} from '../../src/index.js';
const subject={type:'project',id:'bounded'},source=new PersonaMemory({clock:()=>1000});
for(let i=0;i<1000;i++)source.putMemory({id:'id'+i,subject,kind:'fact',key:'field'+i,value:i});
const bundle=source.exportMemories({subject}),target=new PersonaMemory({clock:()=>1000});
const preview=target.previewMemoryImport(bundle,{mappings:[{from:subject,to:subject}]});
target.applyMemoryImport(preview.planId);
if(target.diagnostics().memories!==1000)throw new Error('incomplete bounded import');
const next=target.previewMemoryImport(bundle,{mappings:[{from:subject,to:subject}]});
if(next.counts.same!==1000)throw new Error('retry changed current values');
const heavy={...bundle,records:bundle.records.map(record=>({...record,value:'x'.repeat(7900)}))};
let rejected=false;try{target.previewMemoryImport(heavy,{mappings:[{from:subject,to:subject}]});}catch{rejected=true;}
if(!rejected)throw new Error('oversized transfer accepted');
console.log(JSON.stringify({imported:1000,retryUnchanged:1000,oversizedRejected:true}));
