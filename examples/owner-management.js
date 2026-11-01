// Synthetic SDK example. Preview by default; --apply explicitly exercises both decisions.
import {PersonaMemory,previewCandidateReview,applyCandidateReview,previewMemoryForget,applyMemoryForget} from 'persona-memory';
const subject={type:'project',id:'example'},memory=new PersonaMemory();
const candidate=memory.proposeMemory({memory:{subject,kind:'constraint',key:'reply-language',value:'Preserve source text; reply in the current user language.',assertion:'explicit',evidenceId:'synthetic-turn-1'},reason:'Synthetic owner request'});
const preview=await previewCandidateReview(memory,{subject,decision:'accept',requests:[{id:candidate.id,expectedRevision:1}]});
console.log(JSON.stringify({previewOnly:true,allowed:preview.allowed,rows:preview.rows},null,2));
if(process.argv.includes('--apply')){
  const accepted=await applyCandidateReview(memory,preview),recordId=accepted.results[0].recordId;
  const impact=await previewMemoryForget(memory,{subject,id:recordId,expectedRevision:1});
  console.log(JSON.stringify({syntheticDeletionPreview:impact.impact},null,2));
  console.log(JSON.stringify(await applyMemoryForget(memory,impact),null,2));
}
