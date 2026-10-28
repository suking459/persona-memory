// LangChain 适配器（零依赖，鸭子类型）
//
// 不 import langchain —— 各版本 Memory 接口变动频繁，继承会很快失效。
// 这里只提供 BaseMemory 需要的那几个方法，直接传给 chain 即可。
//
// 用法：
//   import { createLangChainMemory } from 'persona-memory/adapters/langchain';
//
//   const memory = createLangChainMemory(pm, {
//     chatId: 'group-1001',
//     senders: ['u-42', 'u-7'],       // 本次对话涉及的人（可选，<=4 个）
//   });
//
//   const chain = prompt.pipe(model).pipe(parser);
//   await chain.invoke({ question: '...' }, { configurable: { memory } });
//
// 或者手动：
//   const vars = await memory.loadMemoryVariables({});
//   // vars.persona_memory -> 【交往记忆】...
//   await memory.saveContext({ input: '...' }, { output: '...' });

/** @typedef {import('../../index.d.ts').PersonaMemory} PersonaMemory */

/**
 * 把 PersonaMemory 包成 LangChain Memory 形状。
 *
 * @param {PersonaMemory} pm
 * @param {object} options
 * @param {string} options.chatId 会话 ID
 * @param {string[]} [options.senders] 本次涉及的用户 ID（不传则用最近活跃的人）
 * @param {number} [options.budget] 字数上限，默认 700
 * @param {number} [options.maxPeople] 最多几人，默认 4
 * @param {(input: object) => string} [options.getText] 从 input 里取用户说的话（默认取 input.input ?? input.question ?? input.human_input）
 * @param {(output: object) => string} [options.getOutput] 从 output 里取模型回复（默认取 output.output ?? output.response ?? output.text）
 * @param {string} [options.memoryKey] 变量名，默认 'persona_memory'
 */
export function createLangChainMemory(pm, options = {}) {
  const {
    chatId,
    senders = [],
    budget = 700,
    maxPeople = 4,
    memoryKey = 'persona_memory',
    getText = (input) => String(input?.input ?? input?.question ?? input?.human_input ?? '').trim(),
    getOutput = (output) => String(output?.output ?? output?.response ?? output?.text ?? '').trim(),
  } = options;

  if (!chatId) throw new Error('[persona-memory] chatId is required');

  /** 从 input 里推断发言人（LangChain 的 input 通常没有 userId） */
  function pickSenders(input) {
    if (senders.length) return senders;
    const fromInput = input?.userId ?? input?.sender ?? input?.user_id;
    return fromInput ? [String(fromInput)] : [];
  }

  return {
    /** LangChain 会把这个数组里的键合进 prompt */
    memoryKeys: [memoryKey],

    /**
     * 取记忆变量。LangChain 的 BaseMemory 协议。
     * @returns {Promise<Record<string, string>>}
     */
    async loadMemoryVariables(values = {}) {
      const ids = pickSenders(values);
      if (!ids.length) return { [memoryKey]: '' };
      const block = pm.buildBlock({ chatId, userIds: ids, budget, maxPeople });
      return { [memoryKey]: block };
    },

    /**
     * 记录本轮对话：用户说的话 + 模型回复。
     * @param {object} inputValues
     * @param {object} outputValues
     */
    async saveContext(inputValues = {}, outputValues = {}) {
      const ids = pickSenders(inputValues);
      const humanText = getText(inputValues);
      const aiText = getOutput(outputValues);
      const ts = Date.now();

      for (const userId of ids) {
        if (humanText) {
          pm.ingest({
            chatId,
            userId,
            text: humanText,
            ts,
            mentionsSelf: true, // 能进 prompt 的就是在跟 bot 说话
          });
        }
        if (aiText) {
          pm.ingest({
            chatId,
            userId,
            text: aiText,
            ts: ts + 1,
            isSelf: true,
          });
        }
      }

      // 落盘（如果配了 storage）
      try {
        pm.flush();
      } catch {
        /* 落盘失败不阻塞对话 */
      }
    },
  };
}

/**
 * 另一种用法：给"每轮都查一次"的框架用的轻量接口（不实现 LangChain 协议）。
 * @param {PersonaMemory} pm
 * @param {{chatId: string}} opts
 */
export function createSimpleAdapter(pm, { chatId } = {}) {
  if (!chatId) throw new Error('[persona-memory] chatId is required');
  return {
    /** 取当前会话里这些人的关系段落 */
    context(userIds, opts = {}) {
      return pm.buildBlock({ chatId, userIds, ...opts });
    },
    /** 记一条用户消息 */
    record(userId, text, extra = {}) {
      return pm.ingest({ chatId, userId, text, ts: Date.now(), ...extra });
    },
  };
}

export default { createLangChainMemory, createSimpleAdapter };
