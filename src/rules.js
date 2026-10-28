import {maskQuotedText,validateTagRules,findEvidence} from './text-policy.js';
export {normalizeTag,hitTag,sweepTags} from './lifecycle.js';
// persona-memory · 核心实现（零依赖，纯 JS）
//
// 设计原则：
//  1. 所有计算是纯函数（score/tags/style 各自独立），IO 只在 flush/load
//  2. 好感度是「近期状态」不是终身积分：有日额度、会衰减
//  3. 标签跟人走（跨会话共享），好感度跟「人 + 会话」走
//  4. buildBlock 有预算，按好感度排序截断

export const AFFINITY_MIN = 0;
export const AFFINITY_MAX = 100;

export const TIERS = [
  { min: 80, tier: '很铁', hint: '语气随意、可以互怼开玩笑' },
  { min: 60, tier: '亲近', hint: '你挺喜欢 TA：愿意多搭理，语气软一点' },
  { min: 40, tier: '熟了', hint: '你们算熟了：正常唠嗑，不用客套' },
  { min: 20, tier: '眼熟', hint: '有点眼熟：客气一点，别自来熟' },
  { min: 0, tier: '生疏', hint: '还不太熟：话少一点，先观察' },
];

export const SCORE_RULES = {
  talkToBot: 1,
  talkDailyCap: 12,
  at: 2,
  quote: 2,
  praise: 3,
  insult: -5,
  pat: 1.5,
  perMessageCap: 8,
  dailyGainCap: 30,
};

// ─── 纯函数：好感度 ──────────────────────────────────────────────

export function tierOf(value) {
  for (const t of TIERS) if (value >= t.min) return t;
  return TIERS[TIERS.length - 1];
}

export function clampAffinity(v, min = AFFINITY_MIN, max = AFFINITY_MAX) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** 每日额度：只对正分生效，负分照扣。 */
export function applyDailyGain(used, delta, cap) {
  if (delta <= 0) return delta;
  const room = Math.max(0, cap - used);
  return Math.min(delta, room);
}

/** 衰减：从当前值往 baseline 回落，不会越过 baseline。 */
export function decayAmount(value, baseline, perDay, days) {
  if (value <= baseline) return 0;
  return Math.min(value - baseline, perDay * days);
}

const PRAISE_WORDS = ['好厉害', '真棒', '牛逼', '太强了', '喜欢你', '爱你', '可爱', '好萌'];
const INSULT_WORDS = ['傻逼', '垃圾', '滚', '恶心', '废物', '笨蛋', '讨厌你'];
const PAT_WORDS = ['拍拍', '摸摸', '贴贴', '抱抱', '拍一拍'];

function containsAny(text, words) {
  return words.some((w) => text.includes(w));
}

/**
 * 计算一条消息给某人带来的好感度变化。
 * @param {string} text 原文
 * @param {{mentionsSelf?:boolean, replyToSelf?:boolean, isSelf?:boolean}} ctx
 */
export function scoreMessage(text, ctx = {}, overrides = {}) {
  text = maskQuotedText(text);
  const score = { ...SCORE_RULES, ...overrides };
  if (ctx.isSelf) return { delta: 0, reasons: [] }; // 自己的消息不计分
  const reasons = [];
  let delta = 0;

  if (containsAny(text, INSULT_WORDS)) {
    delta += score.insult;
    reasons.push('骂了');
  }
  if (containsAny(text, PRAISE_WORDS)) {
    delta += score.praise;
    reasons.push('夸了');
  }
  if (containsAny(text, PAT_WORDS)) {
    delta += score.pat;
    reasons.push('拍了');
  }
  if (ctx.mentionsSelf) {
    delta += score.at;
    reasons.push('@了');
  }
  if (ctx.replyToSelf) {
    delta += score.quote;
    reasons.push('引用了');
  }
  if (delta === 0 && ctx.directedToBot) {
    delta += score.talkToBot;
    reasons.push('说了话');
  }

  // 单条封顶
  const capped = Math.max(-score.perMessageCap, Math.min(score.perMessageCap, delta));
  return { delta: capped, reasons };
}

// ─── 纯函数：风格统计 ────────────────────────────────────────────

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function isNight(ts) {
  const h = new Date(ts).getHours();
  return h >= 23 || h < 6;
}

export function updateStyle(style, text, ts, blockWords = []) {
  const s = style ? JSON.parse(JSON.stringify(style)) : { count: 0, totalChars: 0, questions: 0, emojis: 0, night: 0, catch: {} };
  const len = [...text].length;
  s.count += 1;
  s.totalChars += len;
  if (/[?？]\s*$/.test(text)) s.questions += 1;
  if (EMOJI_RE.test(text)) s.emojis += 1;
  if (isNight(ts)) s.night += 1;

  // 口头禅：2-4 字的连续片段，出现 3 次以上算
  if (len >= 2 && len <= 40) {
    const clean = text.replace(/[@\s]/g, '');
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= clean.length; i++) {
        const frag = clean.slice(i, i + n);
        if (/^[0-9a-zA-Z]+$/.test(frag)) continue;
        // 纯标点/符号片段（"??" "。。" "!!"）不是口头禅，跳过
        if (/^[\p{P}\p{S}\p{Z}]+$/u.test(frag)) continue;
        // 必须至少含一个汉字/字母，避免 "?好" 这种半截碎片
        if (!/[\p{Script=Han}a-zA-Z]/u.test(frag)) continue;
        if (blockWords.some((w) => w && (frag.includes(w) || w.includes(frag)))) continue;
        s.catch[frag] = (s.catch[frag] || 0) + 1;
      }
    }
  }
  return s;
}

export function summarizeStyle(style) {
  const s = style || { count: 0, totalChars: 0, questions: 0, emojis: 0, night: 0, catch: {} };
  const n = s.count || 1;

  // 滑窗切出的碎片里有很多是"被更长片段包含"的（"确实确实" 会切出 "实确"）。
  // 规则：一个片段如果被某个更长的片段包含，且那个长片段的出现次数不少于它，
  // 就认为它是碎片，丢掉。这样只留最长的、真正有意义的那个。
  const cand = Object.entries(s.catch || {}).filter(([, c]) => c >= 3);
  const keep = cand.filter(([w, c]) => {
    return !cand.some(([w2, c2]) => w2.length > w.length && w2.includes(w) && c2 >= c);
  });
  const catchphrases = keep
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  return {
    count: s.count,
    avgChars: Math.round((s.totalChars / n) * 10) / 10,
    questionRate: Math.round((s.questions / n) * 1000) / 10,
    emojiRate: Math.round((s.emojis / n) * 1000) / 10,
    nightRate: Math.round((s.night / n) * 1000) / 10,
    catchphrases,
  };
}

// ─── 纯函数：标签 ────────────────────────────────────────────────

/**
 * 内置状态标签词表。
 *
 * 每条 tag 配一组「同义说法」，命中即打标，advice 会逐字进提示词。
 * 选词原则：宁可漏，不可误——"累"这种单字会把"这个梗好累"也算成"最近很累"，
 * 所以只用多字组合。
 *
 * 你可以通过 config.extraRules 覆盖或追加：
 *   { 加班中: { words: ['在加班'], advice: '别打扰' } }
 */
export const TAG_RULES = [
  {
    tag: '心情不好',
    advice: '别开玩笑、别抬杠，可以关心一句但别追问',
    words: ['不开心', '不高兴', '心情不好', '郁闷', '好烦', '烦躁', '难过', '想哭', '崩溃', '破防', '委屈', '失落', '生气', '不爽', '糟心', '难受', '烦死了'],
  },
  {
    tag: '最近很累',
    advice: '话少一点、别催回复、别拉着熬夜聊',
    words: ['好累', '累死', '累瘫', '太累了', '困死', '没睡好', '熬夜', '通宵', '失眠', '睡不着', '加班', '刚下班', '忙死', '忙疯', '撑不住', '顶不住'],
  },
  {
    tag: '身体不舒服',
    advice: '关心一句就好，别说教',
    words: ['生病', '感冒', '发烧', '胃疼', '肚子疼', '头疼', '头痛', '嗓子疼', '咳嗽', '去医院', '看病', '吃药', '过敏', '受伤', '牙疼', '拉肚子'],
  },
  {
    tag: '压力大',
    advice: '少玩梗多顺着，适当打气',
    words: ['考试', '期末', '考研', '面试', '笔试', 'deadline', 'ddl', '绩效', '考核', 'kpi', '投简历', '找工作', '论文', '答辩', '赶工', '汇报', '压力大', '扛不住', '卷不动'],
  },
  {
    tag: '有喜事',
    advice: '起个哄、捧个场，别泼冷水',
    words: ['升职', '加薪', '涨薪', '上岸', '通过了', '考上了', '录取', '中奖', '中签', 'offer', '放假', '发工资', '发奖金', '脱单', '表白成功', '生日', '结婚', '搬家', '提车', '买房'],
  },
  {
    tag: '在忙',
    advice: '别催、别连着发消息',
    words: ['在忙', '忙会儿', '回头聊', '先不聊', '忙完再说', '等下聊'],
  },
];

/**
 * 从一句话里检测命中了哪些状态标签。
 * @param {string} text
 * @param {Record<string, {words?: string[], advice?: string}>} [extraRules] 自定义词表
 * @returns {{tag:string, advice:string, word:string}[]}
 */
export function matchTags(text,extraRules={}) {
  validateTagRules(extraRules);
  if(!text)return [];
  const lower=maskQuotedText(text).toLowerCase();
  const rules=TAG_RULES.filter(r=>!Object.hasOwn(extraRules,r.tag)).map(r=>({...r,source:'builtin'}));
  for(const [tag,rule] of Object.entries(extraRules))rules.push({tag,words:[...new Set(rule.words)],advice:rule.advice||'',source:'extra'});
  const hits=[];
  for(const rule of rules){const word=rule.words.find(word=>findEvidence(lower,word));if(word)hits.push({tag:rule.tag,advice:rule.advice,word,source:rule.source});}
  return hits;
}
