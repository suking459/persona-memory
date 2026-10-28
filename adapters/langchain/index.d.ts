import type {PersonaMemory,MemoryContext,IngestResult} from '../../index.js';
export declare function createLangChainMemory(pm:PersonaMemory,options:{chatId:string;senders?:string[];budget?:number;maxPeople?:number;memoryKey?:string;getText?:(input:Record<string,unknown>)=>string}):{
  memoryKeys:string[];loadMemoryVariables(input?:Record<string,unknown>):Promise<Record<string,string>>;saveContext(input?:Record<string,unknown>,output?:Record<string,unknown>):Promise<void>;
};
export declare function createLangChainBridge(pm:PersonaMemory,options:{chatId:string;userId:string;budget?:number;timeoutMs?:number;memoryKey?:string}):{
  invoke<T>(input:{text?:string;input?:string;question?:string;turnId:string},call:(input:Record<string,unknown>,options:{signal:AbortSignal})=>Promise<T>|T):Promise<{response:T;context:MemoryContext;usage:{confirmed:boolean;tagCount:number;duplicate?:boolean;reason?:string}}>;
};
export declare function createSimpleAdapter(pm:PersonaMemory,options:{chatId:string}):{context(userIds:string[],options?:{budget?:number;maxPeople?:number}):string;record(userId:string,text:string,extra?:Record<string,unknown>):IngestResult};
