import type {PersonaMemory,MemorySelection,MemoryKind,MemorySubject,MemoryValue,AutoAcceptPolicy,MemoryCandidate} from '../../index.js';
export type MemoryLearnerOptions=MemorySelection&{
  kinds?:MemoryKind[];source?:'model'|'rule';maxCandidatesPerCall?:number;timeoutMs?:number;autoAccept?:AutoAcceptPolicy;
};
export interface ExtractedMemory {
  subject:MemorySubject;kind:MemoryKind;key:string;value:MemoryValue;reason?:string;confidence?:number;
  observedAt?:number;validFrom?:number;expiresAt?:number|null;
}
export interface LearningResult {candidates:MemoryCandidate[];accepted:string[];omitted:{id:string;reason:string}[];unavailable:string[]}
export declare function createMemoryLearner(pm:PersonaMemory,options:MemoryLearnerOptions):{
  extract(input:{eventId:string;text:string},extractor:(input:{text:string;eventId:string;subjects:MemorySubject[];kinds?:MemoryKind[]},options:{signal:AbortSignal})=>ExtractedMemory[]|Promise<ExtractedMemory[]>):Promise<LearningResult>;
};
