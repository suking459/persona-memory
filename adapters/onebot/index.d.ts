import type {ChatMessage} from '../../index.js';
export declare function parseSegments(segments:unknown[],selfId?:string|number):{text:string;mentions:string[];mentionsSelf:boolean;replyTo:string|null};
export declare function parseOneBot(event:unknown,options?:{selfId?:string|number;replyToSelfId?:Set<string>}):ChatMessage|null;
declare const adapter:{parse:typeof parseOneBot;parseSegments:typeof parseSegments};export default adapter;
