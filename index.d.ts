// persona-memory · 类型定义
// 与 src/index.js 的运行时实现一一对应。

/** 一条消息。宿主负责填好字段。 */
export interface ChatMessage {
  /** 会话作用域：群号 / 频道 ID / 项目 ID */
  chatId: string;
  /** 发送者 ID */
  userId: string;
  /** 纯文本 */
  text: string;
  /** 毫秒时间戳，默认 Date.now() */
  ts?: number;
  /** 本条消息 @ 了谁；包含 self 表示 @ 了 bot */
  mentions?: string[];
  /** 回复的消息 id；等于 self 表示回复 bot */
  replyTo?: string;
  /** bot 自己发的消息 */
  isSelf?: boolean;
  /** 是否 @ 了 bot（比 mentions 更直接，优先使用） */
  mentionsSelf?: boolean;
  /** 是否引用了 bot（优先使用） */
  replyToSelf?: boolean;
  /** 平台原始消息，不参与计算 */
  raw?: unknown;
}

export interface Affinity {
  /** 0-100 */
  value: number;
  /** 基线，长时间不来往会回落到这里 */
  baseline: number;
  /** '生疏' | '眼熟' | '熟了' | '亲近' | '很铁' */
  tier: string;
  /** 给提示词用的一句话 */
  hint: string;
  lastInteractiveAt: number;
}

export interface Tag {
  tag: string;
  source: 'builtin' | 'extra' | 'model' | 'manual';
  advice: string;
  addedAt: number;
  lastHitAt: number;
  /** null = 长期标签 */
  expiresAt: number | null;
  longTerm: boolean;
  hits: number;
  /** 真正进了几次提示词（用于晋升） */
  injections: number;
}

export interface StyleProfile {
  count: number;
  avgChars: number;
  /** 0-100 */
  questionRate: number;
  /** 0-100 */
  emojiRate: number;
  /** 0-100 */
  nightRate: number;
  catchphrases: string[];
}

export interface Profile {
  chatId: string;
  userId: string;
  affinity: Affinity;
  style: StyleProfile;
  tags: Tag[];
  lastAt: number;
}

export interface IngestResult {
  /** 这条消息是否触发了实质变化（好感度或标签） */
  matched: boolean;
  /** 只记了访客、没有建档（普通闲聊、无互动） */
  visitor?: boolean;
  /** 实际生效的好感度变化量（可能被每日额度截断） */
  delta?: number;
  /** 命中原因，如 ['夸了', '@了'] */
  reasons?: string[];
  /** 本次命中的状态标签名 */
  tags?: string[];
}

export interface MaintainResult {
  /** 回落了几个人 */
  decayed: number;
  /** 过期了几个标签 */
  expired: number;
  /** 晋升了几个长期标签 */
  promoted: number;
  /** 降回短期的长期标签数（超过 longTermTtlDays 没有新证据） */
  demoted: number;
  /** 因注入次数超限被强制过期的标签数 */
  forcedOut: number;
}

/** 轻量访客记录：只统计"来过几次"，不建完整档案 */
export interface Visitor {
  userId: string;
  firstSeen: number;
  lastSeen: number;
  count: number;
}

export interface BuildBlockOptions {
  chatId: string;
  userIds: string[];
  /** 字数上限，默认 700 */
  budget?: number;
  /** 最多注入几人，默认 4 */
  maxPeople?: number;
}

export interface PersonaMemoryConfig {
  /** 每天涨分上限，默认 30 */
  dailyGainCap?: number;
  /** 每天回落，默认 2 */
  decayPerDay?: number;
  /** 单条消息涨跌封顶，默认 8 */
  perMessageCap?: number;
  /** 标签存活小时，默认 48 */
  tagTtlHours?: number;
  /** 每人标签上限，默认 16 */
  maxTagsPerPerson?: number;
  /** 关注窗口秒数，默认 180（预留） */
  attentionWindowSec?: number;
  /** 提示词最多几人，默认 4 */
  maxPeople?: number;
  /** 提示词字数上限，默认 700 */
  maxChars?: number;
  /** 口头禅屏蔽词 */
  blockWords?: string[];
  /** 自定义标签词表（与内置词表合并） */
  extraRules?: Record<string, { words: string[]; advice: string }>;
  /** 好感度基线，默认 0 */
  decayBaseline?: number;
  /** 长期标签保鲜期（天）：超过这么久没有新命中 → 降回短期。默认 7 */
  longTermTtlDays?: number;
  /** 短期标签注入上限：超过仍未晋升 → 强制过期。默认 200 */
  maxInjections?: number;
  /** 是否记访客表（0 分闲聊不建档）。默认 true */
  visitorTracking?: boolean;
  /** 访客是否在提示词里提一句"来过 N 次"。默认 true */
  visitorHint?: boolean;
  /** 提访客提示的最低来访次数，默认 2 */
  visitorHintMinCount?: number;
}

export interface PersonaMemoryOptions {
  /** 落盘目录；null = 纯内存 */
  storage?: string | null;
  /** 人设键：换人设换一套档案 */
  persona?: string;
  config?: PersonaMemoryConfig;
}

export interface MemorySnapshot {
  schemaVersion: number;
  persona: string;
  sessions: Record<string, Record<string, unknown>>;
  tags: Record<string, Tag[]>;
  visitors: Record<string, Omit<Visitor, 'userId'>>;
}

export declare class PersonaMemory {
  constructor(options?: PersonaMemoryOptions);

  /** 喂一条消息。同步；落盘由 flush()/maintain() 批量做。 */
  ingest(msg: ChatMessage): IngestResult;

  /** 组装可直接拼进提示词的文本；无内容返回空字符串。 */
  buildBlock(options: BuildBlockOptions): string;

  /** 单人档案 */
  getProfile(chatId: string, userId: string): Profile | null;

  /** 查访客记录（只来过没聊过的人） */
  getVisitor(userId: string): Visitor | null;

  /** 列出访客，按最近来访排序 */
  listVisitors(limit?: number): Visitor[];

  /** 维护：衰减 + 标签清理/晋升/降级。建议 10 分钟一次。 */
  maintain(now?: number): MaintainResult;

  /** 立即落盘 */
  flush(): void;

  /** 导出快照（跨设备迁移） */
  export(): MemorySnapshot;

  /** 导入快照 */
  import(snapshot: MemorySnapshot): void;
}

export default PersonaMemory;

// ─── 纯函数（无 IO，可单独使用/测试） ──────────────────────────

export interface Tier {
  min: number;
  tier: string;
  hint: string;
}

export declare const AFFINITY_MIN: number;
export declare const AFFINITY_MAX: number;
export declare const TIERS: readonly Tier[];

export declare const SCORE_RULES: {
  talkToBot: number;
  talkDailyCap: number;
  at: number;
  quote: number;
  praise: number;
  insult: number;
  pat: number;
  perMessageCap: number;
  dailyGainCap: number;
};

/** 按分数找档位 */
export declare function tierOf(value: number): Tier;

/** 把值夹到 [min, max] */
export declare function clampAffinity(value: number, min?: number, max?: number): number;

/** 应用每日涨分额度（只对正分生效） */
export declare function applyDailyGain(used: number, delta: number, cap: number): number;

/** 计算衰减量（不会越过 baseline） */
export declare function decayAmount(value: number, baseline: number, perDay: number, days: number): number;

/** 计算单条消息的好感度变化 */
export declare function scoreMessage(
  text: string,
  ctx?: { mentionsSelf?: boolean; replyToSelf?: boolean; isSelf?: boolean }
): { delta: number; reasons: string[] };

/** 是否夜间（23:00-06:00） */
export declare function isNight(ts: number): boolean;

/** 更新风格统计（纯函数，返回新对象） */
export declare function updateStyle(
  style: StyleProfile | null | undefined,
  text: string,
  ts: number,
  blockWords?: string[]
): StyleProfile;

/** 汇总风格（算比率、挑口头禅） */
export declare function summarizeStyle(style: Partial<StyleProfile> | null | undefined): StyleProfile;

/** 标签归一化（读盘/手改都可能缺字段） */
export declare function normalizeTag(raw: unknown): Tag | null;

/** 内置状态标签词表 */
export declare const TAG_RULES: readonly { tag: string; advice: string; words: string[] }[];

/** 从一句话里检测命中了哪些状态标签 */
export declare function matchTags(
  text: string,
  extraRules?: Record<string, { words?: string[]; advice?: string }>
): { tag: string; advice: string; word: string }[];

/** 命中标签：存在则顺延，不存在则新建 */
export declare function hitTag(tags: Tag[], tag: string, advice: string, now: number, ttlHours?: number): Tag[];

/** 清理过期 + 晋升长期 + 长期降级 + 注入上限 */
export declare function sweepTags(
  tags: Tag[],
  now: number,
  opts?: {
    tagTtlHours?: number;
    maxTagsPerPerson?: number;
    longTermTtlDays?: number;
    maxInjections?: number;
  }
): { tags: Tag[]; expired: number; promoted: number; demoted: number; forcedOut: number };
