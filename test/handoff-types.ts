import {PersonaMemory,createTaskHandoff,openTaskHandoff,TaskHandoff,OpenTaskHandoffResult} from '../index.js';
const pm=new PersonaMemory();
const subject={type:'project' as const,id:'p'};
const handoff:TaskHandoff=createTaskHandoff(pm,{subject,checkpoint:{goal:'Continue',completed:[],pending:[],blockers:[],nextSteps:[]},references:[]});
const opened:OpenTaskHandoffResult=openTaskHandoff(pm,handoff,{subject});
const executed:false=opened.taskExecuted;
void executed;
