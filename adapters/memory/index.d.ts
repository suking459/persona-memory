import type {PersonaMemory,BuildMemoryContextOptions,RecordMemoryContext,ContextConfirmation} from '../../index.js';
export declare function createMemoryBridge(pm:PersonaMemory,options:BuildMemoryContextOptions&{timeoutMs?:number}):{
  invoke<T>(input:{text:string;query?:string;turnId:string},
    call:(input:{text:string;memory:string},options:{signal:AbortSignal})=>T|Promise<T>):
    Promise<{response:T;context:RecordMemoryContext;usage:ContextConfirmation&{reason?:string}}>;
};
