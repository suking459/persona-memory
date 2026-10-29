import {assertMemoryFields as fields,normalizeSubject,sameSubject,isCurrentMemory,normalizeExperienceValue} from './records.js';
const INPUT_FIELDS=new Set(['id','subject','key','task','context','attempt','result','conditions','outcome','verified','evidenceId','observedAt','validFrom','expiresAt','replaceId','expectedRevision']);
export function experienceInput(input){
  fields(input,INPUT_FIELDS,'experience report');
  const value=normalizeExperienceValue({task:input.task,context:input.context===undefined?null:input.context,
    attempt:input.attempt,result:input.result,conditions:input.conditions===undefined?[]:input.conditions});
  const memory={subject:input.subject,kind:'episode',key:input.key,value,source:'host',
    experience:{outcome:input.outcome,verified:input.verified===undefined?false:input.verified}};
  for(const key of ['id','evidenceId','observedAt','validFrom','expiresAt','replaceId','expectedRevision'])if(input[key]!==undefined)memory[key]=input[key];
  return memory;
}
export function selectExperiences(records,options,now){
  fields(options,new Set(['subject','outcome','verifiedOnly','limit','includeInactive']),'experience list');
  const subject=normalizeSubject(options.subject),limit=options.limit===undefined?50:options.limit;
  if(!Number.isSafeInteger(limit)||limit<0||limit>1000)throw new RangeError('experience limit must be 0..1000');
  if(options.outcome!==undefined&&!['success','failure','mixed','unknown'].includes(options.outcome))throw new TypeError('invalid experience outcome');
  for(const key of ['verifiedOnly','includeInactive'])if(options[key]!==undefined&&typeof options[key]!=='boolean')throw new TypeError('invalid '+key);
  return Object.values(records).filter(record=>record.experience&&sameSubject(record.subject,subject)&&
    (options.includeInactive||isCurrentMemory(record,now))&&(!options.verifiedOnly||record.experience.verified)&&
    (options.outcome===undefined||record.experience.outcome===options.outcome))
    .sort((a,b)=>b.createdAt-a.createdAt||(a.id<b.id?-1:a.id>b.id?1:0)).slice(0,limit);
}
