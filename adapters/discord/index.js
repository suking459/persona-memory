/** Accept discord.js Message objects or captured event fixtures; makes no network requests. */
export function parseDiscord(message,{selfId}={}) {
  if(!message?.author?.id || !message.channelId || !selfId) return null;
  if(message.author.bot || message.webhookId) return null;
  const channel=String(message.channelId),userId=String(message.author.id);
  const chatId='discord:'+String(message.guildId??'dm')+':'+channel;
  const users=message.mentions?.users;
  const mentions=users && typeof users.keys==='function'?[...users.keys()].map(String):
    Array.isArray(message.mentions)?message.mentions.map((u)=>String(u.id??u)):[];
  const replyAuthor=message.mentions?.repliedUser?.id ?? message.referencedMessage?.author?.id;
  return {chatId,userId,eventId:String(message.id),text:String(message.content??''),
    ts:Number(message.createdTimestamp??Date.now()),mentions,mentionsSelf:mentions.includes(String(selfId)),
    replyTo:message.reference?.messageId,replyToSelf:String(replyAuthor??'')===String(selfId),
    directedToBot:!message.guildId};
}
export default {parse:parseDiscord};
