import {Memory} from '@llamaindex/core/memory';
import {PersonaMemory} from '../src/index.js';
import {createLlamaIndexBridge} from '../adapters/llamaindex/index.js';
const bridge=createLlamaIndexBridge(new PersonaMemory(),{memory:new Memory(),chatId:'example',userId:'visitor'});
const result=await bridge.invoke({text:'今天好累',turnId:'example-1',call:async messages=>({message:{content:'规则演示'},received:messages})});
console.log(JSON.stringify(result,null,2));
