import type {ChatMessage} from '../../index.js';
export declare function parseDiscord(message:unknown,options?:{selfId?:string}):ChatMessage|null;
declare const adapter:{parse:typeof parseDiscord};export default adapter;
