import {Memory} from '@llamaindex/core/memory';
import {PersonaMemory} from '../src/index.js';
import {createLlamaIndexBridge} from '../adapters/llamaindex/index.js';
const bridge=createLlamaIndexBridge(new PersonaMemory(),{memory:new Memory(),chatId:'example',userId:'visitor'});
const result=await bridge.invoke({text:'I feel tired today.',turnId:'example-1',call:async messages=>({message:{content:'Rule-based demonstration'},received:messages})});
console.log(JSON.stringify(result,null,2));
