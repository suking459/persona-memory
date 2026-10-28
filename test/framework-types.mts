import {Memory} from '@llamaindex/core/memory';
import {RunnableLambda} from '@langchain/core/runnables';
import {PersonaMemory} from 'persona-memory';
import {createLlamaIndexBridge} from 'persona-memory/adapters/llamaindex';
import {createLangChainBridge} from 'persona-memory/adapters/langchain';
const pm=new PersonaMemory();
createLlamaIndexBridge(pm,{memory:new Memory(),chatId:'r',userId:'u'});
const model=RunnableLambda.from((values:Record<string,unknown>)=>String(values.persona_memory));
await createLangChainBridge(pm,{chatId:'r',userId:'u'}).invoke({text:'hello',turnId:'one'},values=>model.invoke(values));
