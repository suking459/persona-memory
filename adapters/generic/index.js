// 通用适配器：你的宿主只要能产出一个 JSON 对象，就能接进来。
//
// 约定：
//   { chatId, userId, text, ts?, mentions?, replyTo?, isSelf? }
// 缺 ts 用当前时间；缺 mentions 当没 @ 人。

export function parse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const chatId = String(raw.chatId ?? raw.chat_id ?? raw.channelId ?? '').trim();
  const userId = String(raw.userId ?? raw.user_id ?? raw.senderId ?? '').trim();
  const text = String(raw.text ?? raw.content ?? '').trim();
  if (!chatId || !userId) return null;
  return {
    chatId,
    userId,
    text,
    ts: Number(raw.ts ?? raw.timestamp) || Date.now(),
    mentions: Array.isArray(raw.mentions) ? raw.mentions.map(String) : [],
    replyTo: raw.replyTo ?? raw.reply_to ?? undefined,
    isSelf: Boolean(raw.isSelf ?? raw.is_self),
    raw,
  };
}

export default { parse };
