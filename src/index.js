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

const TAG_TTL_HOURS = 48;
const PROMOTE_INJECTIONS = 6;
const PROMOTE_ALIVE_DAYS = 3;
const PROMOTE_HITS = 2;
const MAX_TAGS_PER_PERSON = 16;
const HOUR = 3600000;
const DAY = 86400000;

const DEFAULT_CONFIG = {
  dailyGainCap: SCORE_RULES.dailyGainCap,
  decayPerDay: 2,
  perMessageCap: SCORE_RULES.perMessageCap,
  tagTtlHours: TAG_TTL_HOURS,
  maxTagsPerPerson: MAX_TAGS_PER_PERSON,
  attentionWindowSec: 180,
  maxPeople: 4,
  maxChars: 700,
  blockWords: [],
  extraRules: {},
  decayBaseline: 0,
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
export function scoreMessage(text, ctx = {}) {
  if (ctx.isSelf) return { delta: 0, reasons: [] }; // 自己的消息不计分
  const reasons = [];
  let delta = 0;

  if (containsAny(text, INSULT_WORDS)) {
    delta += SCORE_RULES.insult;
    reasons.push('骂了');
  }
  if (containsAny(text, PRAISE_WORDS)) {
    delta += SCORE_RULES.praise;
    reasons.push('夸了');
  }
  if (containsAny(text, PAT_WORDS)) {
    delta += SCORE_RULES.pat;
    reasons.push('拍了');
  }
  if (ctx.mentionsSelf) {
    delta += SCORE_RULES.at;
    reasons.push('@了');
  }
  if (ctx.replyToSelf) {
    delta += SCORE_RULES.quote;
    reasons.push('引用了');
  }
  if (delta === 0 && (ctx.mentionsSelf || ctx.replyToSelf)) {
    delta += SCORE_RULES.talkToBot;
    reasons.push('说了话');
  }

  // 单条封顶
  const capped = Math.max(-SCORE_RULES.perMessageCap, Math.min(SCORE_RULES.perMessageCap, delta));
  return { delta: capped, reasons };
}

// ─── 纯函数：风格统计 ────────────────────────────────────────────

const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

export function isNight(ts) {
  const h = new Date(ts).getHours();
  return h >= 23 || h < 6;
}

export function updateStyle(style, text, ts, blockWords = []) {
  const s = style || { count: 0, totalChars: 0, questions: 0, emojis: 0, night: 0, catch: {} };
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

export function normalizeTag(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const tag = String(o.tag ?? '').trim();
  if (!tag) return null;
  const longTerm = o.longTerm === true || o.expiresAt === null;
  const addedAt = Number(o.addedAt) || Date.now();
  return {
    tag,
    source: ['builtin', 'extra', 'model', 'manual'].includes(o.source) ? o.source : 'builtin',
    advice: String(o.advice ?? '').trim(),
    addedAt,
    lastHitAt: Number(o.lastHitAt) || addedAt,
    expiresAt: longTerm ? null : Number.isFinite(Number(o.expiresAt)) ? Number(o.expiresAt) : addedAt + TAG_TTL_HOURS * HOUR,
    longTerm,
    hits: Math.max(1, Number(o.hits) || 1),
    injections: Math.max(0, Number(o.injections) || 0),
  };
}

/** 命中标签：存在则顺延，不存在则新建。返回新数组。 */
export function hitTag(tags, tag, advice, now, ttlHours = TAG_TTL_HOURS) {
  const list = Array.isArray(tags) ? tags.slice() : [];
  const i = list.findIndex((t) => t.tag === tag);
  if (i >= 0) {
    const t = list[i];
    t.hits += 1;
    t.lastHitAt = now;
    if (!t.longTerm) t.expiresAt = now + ttlHours * HOUR;
    return list;
  }
  list.push({
    tag,
    source: 'builtin',
    advice: advice || '',
    addedAt: now,
    lastHitAt: now,
    expiresAt: now + ttlHours * HOUR,
    longTerm: false,
    hits: 1,
    injections: 0,
  });
  return list;
}

/** 清理过期 + 晋升长期 + 上限裁剪。 */
export function sweepTags(tags, now, opts = {}) {
  const ttl = opts.tagTtlHours || TAG_TTL_HOURS;
  const max = opts.maxTagsPerPerson || MAX_TAGS_PER_PERSON;
  let expired = 0;
  let promoted = 0;

  let list = (Array.isArray(tags) ? tags : []).filter((t) => {
    if (t.longTerm || t.expiresAt === null) return true;
    if (now <= t.expiresAt) return true;
    expired += 1;
    return false;
  });

  for (const t of list) {
    if (t.longTerm) continue;
    const aliveDays = (now - t.addedAt) / DAY;
    if (t.injections >= PROMOTE_INJECTIONS && aliveDays >= PROMOTE_ALIVE_DAYS && t.hits >= PROMOTE_HITS) {
      t.longTerm = true;
      t.expiresAt = null;
      promoted += 1;
    }
  }

  if (list.length > max) {
    const short = list.filter((t) => !t.longTerm).sort((a, b) => a.addedAt - b.addedAt);
    while (list.length > max && short.length) {
      const drop = short.shift();
      list = list.filter((t) => t !== drop);
    }
  }

  return { tags: list, expired, promoted };
}

// ─── 主类 ────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';

export class PersonaMemory {
  constructor({ storage = null, persona = 'default', config = {} } = {}) {
    this.storage = storage ? path.resolve(storage) : null;
    this.persona = persona;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = { schemaVersion: 1, persona, sessions: {}, tags: {} };
    this._dirty = false;
    if (this.storage) this._load();
  }

  _load() {
    const file = path.join(this.storage, `${this.persona}.json`);
    if (!fs.existsSync(file)) return;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (raw && raw.sessions) this.state = raw;
    } catch {
      /* 损坏就重来，不阻塞宿主 */
    }
  }

  _profile(chatId, userId, create = false) {
    if (!this.state.sessions[chatId]) {
      if (!create) return null;
      this.state.sessions[chatId] = {};
    }
    if (!this.state.sessions[chatId][userId]) {
      if (!create) return null;
      const now = Date.now();
      this.state.sessions[chatId][userId] = {
        affinity: { value: this.config.decayBaseline, baseline: this.config.decayBaseline, lastInteractiveAt: now, dayKey: '', dayGain: 0, ledger: [] },
        style: { count: 0, totalChars: 0, questions: 0, emojis: 0, night: 0, catch: {} },
        lastAt: now,
      };
    }
    return this.state.sessions[chatId][userId];
  }

  _dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** 喂一条消息 */
  ingest(msg) {
    const { chatId, userId, text = '', ts = Date.now(), mentions = [], replyTo, isSelf = false, mentionsSelf, replyToSelf } = msg || {};
    if (!chatId || !userId) return { matched: false };

    const p = this._profile(chatId, userId, true);
    p.lastAt = Math.max(p.lastAt || 0, ts);

    // 风格统计：自己的消息不统计
    if (!isSelf) p.style = updateStyle(p.style, text, ts, this.config.blockWords);

    const _mentionsSelf = mentionsSelf ?? (Array.isArray(mentions) && mentions.includes('self'));
    const _replyToSelf = replyToSelf ?? Boolean(replyTo && replyTo === 'self');

    const { delta, reasons } = scoreMessage(text, { mentionsSelf: _mentionsSelf, replyToSelf: _replyToSelf, isSelf });
    let applied = 0;

    if (delta !== 0) {
      const dayKey = this._dayKey(ts);
      if (p.affinity.dayKey !== dayKey) {
        p.affinity.dayKey = dayKey;
        p.affinity.dayGain = 0;
      }
      applied = applyDailyGain(p.affinity.dayGain, delta, this.config.dailyGainCap);
      if (applied !== 0) {
        p.affinity.value = clampAffinity(p.affinity.value + applied);
        if (applied > 0) p.affinity.dayGain += applied;
        p.affinity.lastInteractiveAt = ts;
        p.affinity.ledger.unshift({ ts, delta, applied, reason: reasons.join('+') || '互动' });
        if (p.affinity.ledger.length > 30) p.affinity.ledger.length = 30;
      }
    }

    this._dirty = true;
    return { matched: delta !== 0, delta: applied, reasons };
  }

  /** 组装提示词段落 */
  buildBlock({ chatId, userIds = [], budget, maxPeople } = {}) {
    const max = maxPeople || this.config.maxPeople || 4;
    const limit = budget || this.config.maxChars || 700;
    const session = this.state.sessions[chatId];
    if (!session) return '';

    const rows = userIds
      .map((id) => {
        const p = session[id];
        if (!p) return null;
        const t = tierOf(p.affinity.value);
        const style = summarizeStyle(p.style);
        const tags = (this.state.tags[id] || []).filter((x) => x.longTerm || x.expiresAt === null || x.expiresAt > Date.now());
        return { id, value: p.affinity.value, tier: t.tier, hint: t.hint, style, tags, lastAt: p.lastAt };
      })
      .filter(Boolean)
      .sort((a, b) => b.value - a.value)
      .slice(0, max);

    if (!rows.length) return '';

    const lines = [];
    for (const r of rows) {
      const parts = [`${r.tier}（${Math.round(r.value)} 分）`, r.hint];
      if (r.style.catchphrases.length) parts.push(`常带"${r.style.catchphrases[0]}"`);
      if (r.style.avgChars > 0) parts.push(`平均 ${r.style.avgChars} 字/句`);
      if (r.tags.length) parts.push(`状态：${r.tags.slice(0, 3).map((t) => t.tag).join('、')}`);
      lines.push(`- ${r.id}：${parts.join('，')}`);
    }

    let block = `【交往记忆】\n${lines.join('\n')}`;
    if (block.length > limit) block = block.slice(0, limit - 1) + '…';

    // 真进了提示词才记 injections（晋升用）
    for (const r of rows) {
      for (const t of r.tags) {
        if (block.includes(t.tag)) t.injections += 1;
      }
    }
    return block;
  }

  getProfile(chatId, userId) {
    const p = this._profile(chatId, userId, false);
    if (!p) return null;
    const t = tierOf(p.affinity.value);
    return {
      chatId,
      userId,
      affinity: { value: Math.round(p.affinity.value * 10) / 10, baseline: p.affinity.baseline, tier: t.tier, hint: t.hint, lastInteractiveAt: p.affinity.lastInteractiveAt },
      style: summarizeStyle(p.style),
      tags: (this.state.tags[userId] || []).map((x) => ({ ...x })),
      lastAt: p.lastAt,
    };
  }

  /** 维护：衰减 + 标签清理/晋升 */
  maintain(now = Date.now()) {
    let decayed = 0;
    let expired = 0;
    let promoted = 0;

    for (const chat of Object.values(this.state.sessions)) {
      for (const p of Object.values(chat)) {
        if (p.affinity.value > p.affinity.baseline) {
          const days = Math.max(0, (now - (p.affinity.lastInteractiveAt || now)) / DAY);
          const d = decayAmount(p.affinity.value, p.affinity.baseline, this.config.decayPerDay, days);
          if (d > 0) {
            p.affinity.value = clampAffinity(p.affinity.value - d);
            p.affinity.lastInteractiveAt = now;
            decayed += 1;
          }
        }
      }
    }

    for (const [uid, tags] of Object.entries(this.state.tags)) {
      const r = sweepTags(tags, now, this.config);
      this.state.tags[uid] = r.tags;
      expired += r.expired;
      promoted += r.promoted;
    }

    this._dirty = true;
    this.flush();
    return { decayed, expired, promoted };
  }

  flush() {
    if (!this.storage || !this._dirty) return;
    fs.mkdirSync(this.storage, { recursive: true });
    const file = path.join(this.storage, `${this.persona}.json`);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.state));
    fs.renameSync(tmp, file);
    this._dirty = false;
  }

  export() {
    return JSON.parse(JSON.stringify(this.state));
  }

  import(snapshot) {
    if (snapshot && snapshot.sessions) {
      this.state = snapshot;
      this._dirty = true;
    }
  }
}

export default PersonaMemory;
