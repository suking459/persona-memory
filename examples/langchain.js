import {RunnableLambda} from '@langchain/core/runnables';
import {PersonaMemory} from '../src/index.js';
import {createLangChainBridge} from '../adapters/langchain/index.js';
const pm=new PersonaMemory();
const bridge=createLangChainBridge(pm,{chatId:'example',userId:'visitor'});
// The receiving Runnable represents the model boundary, with no external API call.
const modelBoundary=RunnableLambda.from(values=>({received:values.persona_memory,reply:'规则演示'}));
const chain=RunnableLambda.from(input=>bridge.invoke(input,values=>modelBoundary.invoke(values)));
console.log(await chain.invoke({text:'今天好累',turnId:'example-1'}));
