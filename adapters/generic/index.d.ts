import type {ChatMessage} from '../../index.js';
export declare function parse(raw:unknown):ChatMessage|null;
declare const adapter:{parse:typeof parse};export default adapter;
