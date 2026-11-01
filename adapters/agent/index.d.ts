import type {PersonaMemory,MemorySubject,MemoryCandidate,MemoryRecord,CandidateStatus,CandidateQuality,MemoryAssertion} from '../../index.js';
export interface AgentBinding {
  readonly version:1;readonly host:string;readonly storage:string;readonly persona:string;
  readonly namespace:string;readonly access:'read'|'capture'|'review';
  readonly locale:string;
  readonly subjects:Readonly<Record<string,Readonly<MemorySubject>>>;
}
export interface AgentTool {name:string;description:string;inputSchema:Record<string,unknown>;annotations:Record<string,boolean>}
export interface AgentSession {binding:AgentBinding;tools:AgentTool[];instructions:string;call(name:string,args?:unknown):Promise<unknown>}
export declare function normalizeBinding(raw:unknown):AgentBinding;
export declare function readBinding(file:string):AgentBinding;
export declare function createAgentSession(pm:PersonaMemory,binding:unknown):AgentSession;
export declare function createAgentRpc(session:AgentSession):(message:unknown)=>Promise<unknown>;
export interface HostProfile {name:string;target:string;format:string;source:string;checked:string;hostEndToEnd:false}
export declare const HOST_PROFILES:Readonly<Record<string,HostProfile>>;
export declare function prepareAgentBundle(options:{host:string;out:string;project:string;userId?:string;access?:AgentBinding['access'];storage?:string;locale?:string}):{directory:string;manifest:Record<string,unknown>;binding:AgentBinding};
export declare function applyAgentBundle(options:{bundle:string;target:string}):{applied:true;target:string;recoveryRecord:string};
export declare function undoAgentBundle(options:{bundle:string}):{restored:true;target:string};

export interface AgentReviewQuery {scope:string;candidateId?:string;status?:CandidateStatus|'all';limit?:number;after?:string}
export interface AgentReviewList {
  mode:'list';scope:string;checkedAt:number;status:CandidateStatus|'all';evidenceVerified:false;nextAfter:string|null;
  candidates:(Pick<MemoryCandidate,'id'|'revision'|'status'|'createdAt'|'expiresAt'>&{kind:MemoryRecord['kind'];key:string;evidenceId:string;source:MemoryRecord['source'];assertion:MemoryAssertion|'unspecified';expired:boolean})[];
}
export interface AgentReviewDetail {
  mode:'candidate';scope:string;checkedAt:number;candidate:MemoryCandidate;current:MemoryRecord|null;effect:'create'|'replace';
  acceptance:{allowed:boolean;code?:string;message?:string};quality:CandidateQuality;evidenceVerified:false;
}
/** Opens a fresh, read-only view. Evidence references remain unverified; preview is not approval. */
export declare function inspectAgentCandidates(binding:unknown,request:AgentReviewQuery):AgentReviewList|AgentReviewDetail;
