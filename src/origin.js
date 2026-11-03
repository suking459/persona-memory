import {assertMemoryFields,memoryIdentifier} from './records.js';
// Labels are caller assertions in the SDK. A scoped host may stamp owner-assigned labels.
export function normalizeMemoryOrigin(raw){
 if(raw===undefined)return undefined;
 assertMemoryFields(raw,new Set(['space','contributor','host']),'memory origin');
 return {space:memoryIdentifier(raw.space,'origin space'),contributor:memoryIdentifier(raw.contributor,'origin contributor'),host:memoryIdentifier(raw.host,'origin host')};
}
