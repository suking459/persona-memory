import {PersonaMemory,proposeExperience,proposeExperienceFeedback,proposeExperienceRetirement,reuseExperiences,ExperienceReuseResult} from 'persona-memory';
const pm=new PersonaMemory(),subject={type:'task' as const,id:'release'};
proposeExperience(pm,{subject,key:'method',task:'validate',attempt:'test',result:'success',outcome:'success',evidenceId:'run'});
proposeExperienceFeedback(pm,{subject,id:'id',expectedRevision:1,trialId:'trial',outcome:'helped',evidenceId:'e',verification:'owner-attested'});
proposeExperienceRetirement(pm,{subject,id:'id',expectedRevision:1,evidenceId:'e',reason:'obsolete'});
const result:ExperienceReuseResult=reuseExperiences(pm,{subject,conditions:['Linux']});
const verified:false=result.evidenceVerified;
void verified;
// @ts-expect-error evidence required
proposeExperienceFeedback(pm,{subject,id:'id',expectedRevision:1,trialId:'trial',outcome:'helped'});
