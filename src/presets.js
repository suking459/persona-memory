const dimensions={
  familiarity:{min:0,max:100,baseline:0,decayPerDay:1},
  trust:{min:0,max:100,baseline:50,decayPerDay:0},
};
const presets={
  community:{tagScope:'chat',dailyGainCap:20,maxPeople:4,maxChars:700},
  companion:{tagScope:'user',dailyGainCap:20,dimensions,maxPeople:1},
  support:{tagScope:'chat',dailyGainCap:0,visitorHint:false,extraRules:{
    待跟进:{words:[],advice:'由宿主确认处理进度'},已解决:{words:[],advice:'不要继续追问已解决问题'},
  }},
  npc:{tagScope:'chat',dimensions,dailyGainCap:12,tagTtlHours:72},
};
export const PRESET_NAMES=Object.freeze(Object.keys(presets));
export function createPreset(name,overrides={}) {
  if(!Object.hasOwn(presets,name)) throw new TypeError('unknown preset: '+name);
  const base=JSON.parse(JSON.stringify(presets[name]));
  return {...base,...overrides,extraRules:{...base.extraRules,...overrides.extraRules},dimensions:{...base.dimensions,...overrides.dimensions}};
}
