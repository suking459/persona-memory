// npm run discord --workspace examples/integrations (install its optional SDK first).
import {Client,Events,GatewayIntentBits,Partials} from 'discord.js';
import {PersonaMemory} from '../src/index.js';
import {createPreset} from '../src/presets.js';
import {parseDiscord} from '../adapters/discord/index.js';
if(!process.env.DISCORD_TOKEN) throw new Error('Set DISCORD_TOKEN locally; never paste it into chat.');
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.DirectMessages,GatewayIntentBits.MessageContent],partials:[Partials.Channel]});
const pm=new PersonaMemory({storage:process.env.PM_STORAGE||'./data/discord',config:createPreset('community')});
client.on(Events.MessageCreate,async message=>{
  const normalized=parseDiscord(message,{selfId:client.user?.id});
  if(!normalized)return;
  try{
    const result=pm.ingest(normalized);pm.flush();
    if(result.duplicate || result.ignored || !(normalized.mentionsSelf || normalized.replyToSelf || normalized.directedToBot))return;
    const context=pm.buildContext({chatId:normalized.chatId,userIds:[normalized.userId]});
    // Rule demonstration: replace this reply builder with your model call.
    // Suppress a new @ notification; user-derived content stays data.
    await message.reply({content:context.text||'暂时没有关系记录。',allowedMentions:{parse:[],repliedUser:false}});
    // Counts as display, not LLM usage: intentionally do not call confirmContext here.
  }catch(e){console.error('Memory step failed:',e.message);}
});
client.once(Events.ClientReady,()=>console.log('Discord relationship demo ready (rule output, no LLM).'));
client.login(process.env.DISCORD_TOKEN);
const timer=setInterval(()=>{try{pm.maintain();}catch(e){console.error(e.message);}},600000);timer.unref();
const stop=()=>{clearInterval(timer);pm.flush();client.destroy();};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
