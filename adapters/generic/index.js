const flag=(value,name)=>{if(typeof value!=='boolean')throw new TypeError(name+' must be boolean');return value;};
/** Normalize transport fields without losing explicit interaction flags. */
export function parse(raw) {
  if(!raw || typeof raw!=='object') return null;
  const chatId=String(raw.chatId??raw.chat_id??raw.channelId??'').trim();
  const userId=String(raw.userId??raw.user_id??raw.senderId??'').trim();
  if(!chatId || !userId) return null;
  const ts=raw.ts??raw.timestamp;
  return {chatId,userId,text:String(raw.text??raw.content??''),...(ts===undefined?{}:{ts:Number(ts)}),
    mentions:Array.isArray(raw.mentions)?raw.mentions.map(String):[],
    replyTo:raw.replyTo??raw.reply_to, isSelf:flag(raw.isSelf??raw.is_self??false,'isSelf'),
    ...(raw.mentionsSelf===undefined?{}:{mentionsSelf:flag(raw.mentionsSelf,'mentionsSelf')}),
    ...(raw.replyToSelf===undefined?{}:{replyToSelf:flag(raw.replyToSelf,'replyToSelf')}),
    ...(raw.directedToBot===undefined?{}:{directedToBot:flag(raw.directedToBot,'directedToBot')}),
    ...(raw.eventId===undefined?{}:{eventId:String(raw.eventId)}),raw};
}
export default {parse};
