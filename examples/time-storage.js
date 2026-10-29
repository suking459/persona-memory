// No external service or API key. MemorySnapshotStore is shared in-process only.
import {PersonaMemory,MemorySnapshotStore} from '../src/index.js';
let now=1000;
const store=new MemorySnapshotStore(),project={type:'project',id:'planner'};
const memory=await PersonaMemory.open({store,clock:()=>now});
const old=memory.putMemory({id:'release-current',subject:project,kind:'constraint',key:'release-channel',value:'preview'});
now=1100;
memory.putMemory({id:'release-scheduled',subject:project,kind:'constraint',key:'release-channel',
  value:'stable',validFrom:2000,replaceId:old.id,expectedRevision:old.revision});
console.log('Currently effective:',memory.listMemories({subject:project})[0].value);
console.log('Scheduled at 2000:',memory.getMemoryAt({subject:project,kind:'constraint',key:'release-channel',at:2000}).value);
await memory.persist();
now=2000;await memory.reload();
const bundle=memory.exportMemories({subject:project}),target={type:'project',id:'other-app'};
const other=new PersonaMemory({clock:()=>now});
const preview=other.previewMemoryImport(bundle,{mappings:[{from:project,to:target}]});
console.log('Review import:',preview.counts);
console.log('Applied:',other.applyMemoryImport(preview.planId));
console.log('Transferred value:',other.listMemories({subject:target})[0].value);
