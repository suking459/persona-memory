// OneBot v11 adapter (QQ / SnowLuma / NapCat / go-cqhttp and others)
//
// Usage:
//   import { parseOneBot } from 'persona-memory/adapters/onebot';
//   const msg = parseOneBot(event, { selfId: 123456 });
//   if (msg) pm.ingest(msg);
//
// Handles message events only; returns null for other event types.

/** Extract plain text, mentions and reply target from OneBot message segments. */
// Compatibility placeholders participate in legacy linguistic evidence checks.
// Keep them as source-language resources; translating them changes attribution.
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
 * OneBot event to ChatMessage
 * @param {object} event Raw event
 * @param {{selfId?: number|string, replyToSelfId?: Set<string>}} opts
 *        replyToSelfId: IDs sent by this bot, used to identify replies to the bot.
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
