import type {PersonaMemory,MemoryContext} from '../../index.js';
export interface Message {role:string;content:unknown}
export declare function createLlamaIndexBridge(pm:PersonaMemory,options:{memory:{add(message:Message):Promise<void>;get(options:{type:'llamaindex'}):Promise<Message[]>};chatId:string;userId:string;budget?:number;timeoutMs?:number}):{
  invoke<T>(options:{text:string;turnId:string;call:(messages:Message[],options:{signal:AbortSignal})=>Promise<T>|T}):Promise<{response:T;context:MemoryContext;usage:{confirmed:boolean;tagCount:number;duplicate?:boolean;reason?:string}}>;
  context():MemoryContext;
};
