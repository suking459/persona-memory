// OneBot v11 适配器（QQ / SnowLuma / NapCat / go-cqhttp 等）
//
// 用法：
//   import { parseOneBot } from 'persona-memory/adapters/onebot';
//   const msg = parseOneBot(event, { selfId: 123456 });
//   if (msg) pm.ingest(msg);
//
// 只处理 message 事件，其他事件返回 null。

/** 从 OneBot 消息段里抽出纯文本 + @ 列表 + 回复目标 */
export function parseSegments(segments, selfId) {
  const parts = [];
  let mentionsSelf = false;
  let replyTo = null;
  const mentions = [];

  for (const seg of Array.isArray(segments) ? segments : []) {
    if (!seg || typeof seg !== 'object') continue;
    const { type, data = {} } = seg;

    if (type === 'text') {
      parts.push(String(data.text ?? ''));
    } else if (type === 'at') {
      const qq = String(data.qq ?? '');
      if (qq === 'all') {
        parts.push('@全体成员');
      } else {
        mentions.push(qq);
        if (String(qq) === String(selfId)) {
          mentionsSelf = true;
          parts.push('@你');
        } else {
          parts.push('@某人');
        }
      }
    } else if (type === 'reply') {
      replyTo = String(data.id ?? data.message_id ?? '');
    } else if (type === 'face' || type === 'mface') {
      parts.push('[表情]');
    } else if (type === 'image') {
      parts.push('[图片]');
    } else if (type === 'record' || type === 'video' || type === 'file') {
      parts.push('[媒体]');
    }
  }

  return { text: parts.join('').trim(), mentions, mentionsSelf, replyTo };
}

/**
 * OneBot 事件 → ChatMessage
 * @param {object} event 原始事件
 * @param {{selfId?: number|string, replyToSelfId?: Set<string>}} opts
 *        replyToSelfId：自己发过的消息 id 集合（用来判断"回复的是不是 bot"）
 */
export function parseOneBot(event, opts = {}) {
  if (!event || event.post_type !== 'message') return null;

  const selfId = opts.selfId ?? event.self_id;
  const isGroup = event.message_type === 'group';
  const chatId = isGroup ? `group-${event.group_id}` : `private-${event.user_id}`;
  const userId = String(event.user_id ?? '');
  if (!userId) return null;

  const { text, mentions, mentionsSelf, replyTo } = parseSegments(event.message, selfId);
  const replyToSelf = Boolean(replyTo && opts.replyToSelfId && opts.replyToSelfId.has(replyTo));

  return {
    chatId,
    userId,
    text: text || String(event.raw_message ?? '').trim(),
    ts: Number(event.time) ? Number(event.time) * 1000 : Date.now(),
    mentions,
    replyTo: replyTo || undefined,
    isSelf: String(userId) === String(selfId),
    mentionsSelf,
    replyToSelf,
    raw: event,
  };
}

export default { parse: parseOneBot, parseSegments };
