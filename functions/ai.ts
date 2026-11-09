// DeepSeek 生成：评论区叠叠乐。首轮完整楼，导演轮仅增量评论。
// 密钥仅服务端持有；输出为结构化 JSON 并做去重与引用号校验。

export type CommunityId =
  | "campus" | "anime" | "game" | "work" | "emotion" | "chaos";

export const COMMUNITIES: Record<CommunityId, string> = {
  campus: "校园社区（考研绩点、宿舍、食堂、导师、答辩）",
  anime: "二次元社区（番剧、角色、CP、漫展、二创）",
  game: "游戏社区（版本、抽卡、平衡性、氪金、电竞）",
  work: "职场社区（加班、薪资、领导、裁员、通勤）",
  emotion: "情感社区（恋爱、分手、相亲、家庭、友谊）",
  chaos: "混乱宇宙（时空错乱、规则崩坏、万物皆可吵）",
};

export type Stage = "resonance" | "split" | "derail" | "sublimate";
export const STAGES: Stage[] = ["resonance", "split", "derail", "sublimate"];

export type DirectorAction =
  | "continue" | "louder" | "rational" | "insider" | "derail" | "finale";

export const ACTION_PROMPTS: Record<DirectorAction, string> = {
  continue: "剧情自然推进：沿着当前情绪往下吵。",
  louder: "让它更吵：对立升级，情绪更激烈，但仍在安全表达范围内。",
  rational: "来个理性人入场：摆事实讲逻辑，试图降温但被反呛。",
  insider: "爆点内幕：神秘知情人爆料（纯虚构娱乐演绎，不针对真实个人或真实事件内幕），把讨论推向高潮。",
  derail: "歪楼加速：讨论彻底跑偏到荒诞方向。",
  finale: "结束总结：只做收尾。新增 2-3 条评论，总结怪最后收尾，并给出最终热搜总结与数值。",
};

export interface CommentItem {
  stage: Stage;
  role: string;
  emoji: string;
  name: string;
  text: string;
  likes: number;
  reply_to: number | null;
  stance: "support" | "oppose" | "neutral";
  /** 过滤后新楼的全局楼号（响应携带，供客户端二次过滤时重映射） */
  no?: number;
}

export interface ThreadResult {
  title: string;
  comments: CommentItem[];
  summary: string;
  hot_search: string[];
  heat: number;
  conflict: number;
  absurdity: number;
  camps: { support: number; oppose: number; neutral: number };
  fiction_notice: string;
}

const API_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-chat";

const clip = (s: unknown, max: number): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "";

// ---------- 去重（完全 + 近似） ----------
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s，。！？、,.!?~～…：:；;""''\"'（）()\[\]【】\-—_]/g, "")
    .replace(/[哈嘿呵嘻嘻]/g, "哈")
    .slice(0, 60);
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

// 近似：归一化后包含（≥14 字）或二元组 Jaccard ≥ 0.6
export function isNearDup(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 14 && nb.length >= 14 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  const A = bigrams(na), B = bigrams(nb);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter) >= 0.6;
}

export function dedupeComments(
  incoming: CommentItem[],
  existing: CommentItem[],
): { kept: CommentItem[]; keptFlags: boolean[]; duplicates: number } {
  const pool = existing.map((c) => c.text);
  const kept: CommentItem[] = [];
  const keptFlags: boolean[] = [];
  let duplicates = 0;
  for (const c of incoming) {
    if (pool.some((t) => isNearDup(t, c.text))) { duplicates++; keptFlags.push(false); continue; }
    pool.push(c.text);
    kept.push(c);
    keptFlags.push(true);
  }
  return { kept, keptFlags, duplicates };
}

// 去重删除批内楼层后，对保留的新楼重新连续编号并重映射 reply_to：
// 保留楼按顺序获得 baseCount+1、+2…；指向被过滤楼 → 改指其之前最近的保留新楼（无则置空）；
// 指向已有楼（≤ baseCount）→ 不变。响应携带每条新楼的最终全局楼号 no。
export function remapBatchReplies(
  batch: CommentItem[],
  keptFlags: boolean[],
  baseCount: number,
): CommentItem[] {
  // 连续编号：保留楼按顺序 baseCount+1…
  const globalOf = new Array<number | null>(batch.length).fill(null);
  let seq = baseCount;
  for (let i = 0; i < batch.length; i++) {
    if (keptFlags[i]) { seq++; globalOf[i] = seq; }
  }
  // 批内目标批号（0 基）→ 之前最近的保留楼
  const prevKept = new Array<number | null>(batch.length).fill(null);
  let lastKept: number | null = null;
  for (let i = 0; i < batch.length; i++) {
    prevKept[i] = lastKept;
    if (keptFlags[i]) lastKept = i;
  }
  const out: CommentItem[] = [];
  for (let i = 0; i < batch.length; i++) {
    if (!keptFlags[i]) continue;
    const c = batch[i];
    let replyTo = c.reply_to;
    if (replyTo !== null && replyTo > baseCount) {
      const j = replyTo - baseCount - 1;
      if (j >= 0 && j < batch.length && j < i) {
        if (keptFlags[j]) replyTo = globalOf[j];
        else replyTo = prevKept[j] !== null ? globalOf[prevKept[j]!] : null;
      } else {
        replyTo = null;
      }
    }
    out.push({ ...c, reply_to: replyTo, no: globalOf[i]! });
  }
  return out;
}

// ---------- Prompt ----------
const JSON_SHAPE = `JSON 结构：{"title":"主楼标题，20字内","comments":[],"summary":"80字内热搜总结","hot_search":["...","...","...","..."],"heat":0-100整数,"conflict":0-100整数,"absurdity":0-100整数,"camps":{"support":0-100,"oppose":0-100,"neutral":0-100},"fiction_notice":"虚构娱乐演绎声明，30字内"}`;

const BASE_RULES = [
  "你是中文互联网社区评论区模拟器，输出皆为虚构娱乐演绎，不代表任何真实人物或事件。",
  "只输出 JSON，无任何其他文字，外层无 markdown 代码块。",
  "每条 comment：{\"stage\":\"resonance|split|derail|sublimate\",\"role\":\"角色\",\"emoji\":\"单个emoji\",\"name\":\"昵称\",\"text\":\"评论正文\",\"likes\":数字,\"reply_to\":全局楼号或null,\"stance\":\"support|oppose|neutral\"}",
  "角色从这些中选：热评王、反方、理性人、乐子人、神秘知情人、跑题人、共情党、总结怪。",
  "reply_to 必须指向已存在的楼层或本批更早的新楼，绝不能指向未来或超出范围的楼层。",
  "每条 text 控制在 90 字以内，口语化、有网感、贴合社区语境。",
  "不输出仇恨、歧视、针对真实个人的攻击或'内幕'。神秘知情人的爆料必须是明显虚构的演绎。",
];

export function buildSystemPrompt(firstTurn: boolean): string {
  if (firstTurn) {
    return [
      ...BASE_RULES,
      "本任务：生成完整首楼。comments 恰好 10 条，按顺序经历四阶段：共鸣(resonance)前3条、分裂(split)第4-6条、歪楼(derail)第7-8条、升华(sublimate)第9-10条。热评王开楼，总结怪收尾。楼号 1-10。",
      JSON_SHAPE,
    ].join("\n");
  }
  return [
    ...BASE_RULES,
    "本任务：楼已存在，只输出【新增评论】，严禁复述、改写或概括任何已有评论（意思相同也算重复）。",
    "新增 comments 为 3-5 条（结束总结指令为 2-3 条），必须推进剧情、带来新内容。",
    "reply_to 使用全局楼号（题目会给出已有楼列表和编号）。",
    "除'结束总结'指令外，新增评论中不要出现总结怪角色。",
    "summary/hot_search/数值字段按包含新旧全部楼层的最新整体状态输出。",
    JSON_SHAPE,
  ].join("\n");
}

export function buildUserPrompt(
  seed: string,
  community: CommunityId,
  directorHint: DirectorAction | null,
  historyDigest: string,
  newsContext: string,
): string {
  const parts = [
    `用户吐槽（种子）：${seed}`,
    `社区设定：${COMMUNITIES[community]}`,
  ];
  if (newsContext) parts.push(`实时热点背景（仅作氛围参考，不与真实事件/人物挂钩）：${newsContext}`);
  if (historyDigest) {
    parts.push(`已有楼层（全局楼号=编号，新增评论的 reply_to 只能引用这里的楼号或新增批次内更早的楼号）：\n${historyDigest}`);
  }
  if (directorHint) {
    parts.push(`导演指令：${ACTION_PROMPTS[directorHint]}`);
  } else {
    parts.push("模式：自动看戏，按四阶段推进（仅首轮使用）。");
  }
  parts.push(firstTurnHint(historyDigest));
  return parts.join("\n");
}

function firstTurnHint(historyDigest: string): string {
  return historyDigest
    ? "请只输出新增评论的 JSON。"
    : "请输出完整 10 条评论的首楼 JSON。";
}

// ---------- 校验 ----------
const num01 = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(0, Math.min(100, Math.round(v)))
    : 50;

export interface ValidateOptions {
  firstTurn: boolean;
  baseCount: number;        // 已有全局楼数
  existingTexts: string[];  // 已有评论正文（去重池）
}

export function validateThread(
  raw: string,
  opts: ValidateOptions,
): { thread: ThreadResult; duplicates: number } {
  let data: any;
  const text = raw.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  try {
    data = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch {
    throw new Error("bad_json");
  }
  if (!data || !Array.isArray(data.comments)) throw new Error("bad_schema");

  const maxNew = opts.firstTurn ? 10 : 6;
  const minNew = opts.firstTurn ? 6 : 1;
  const rawComments = data.comments.slice(0, maxNew);

  // 1) 解析并全局化楼号
  const parsed: CommentItem[] = [];
  for (const c of rawComments) {
    if (!c || typeof c !== "object") continue;
    const stage: Stage = STAGES.includes(c.stage) ? c.stage : "derail";
    const batchNo = parsed.length + 1;
    const globalNo = opts.baseCount + batchNo;
    let replyTo: number | null = null;
    if (typeof c.reply_to === "number" && Number.isInteger(c.reply_to)) {
      const v = c.reply_to;
      if (opts.firstTurn) {
        // 首轮：批次内编号，只能指向本批更早的楼
        if (v >= 1 && v < batchNo) replyTo = v;
      } else {
        // 增量轮：全局楼号，只能指向已有楼或本批更早的新楼
        if (v >= 1 && v <= globalNo - 1) replyTo = v;
        else if (v - opts.baseCount >= 1 && v - opts.baseCount < batchNo) {
          replyTo = v; // 批次内编号写法，等价于全局号
        }
      }
      // 其余（指向未来、自身或 0/负数）：置 null，开新话题线
    }
    parsed.push({
      stage,
      role: clip(c.role, 12) || "乐子人",
      emoji: clip(c.emoji, 8) || "💬",
      name: clip(c.name, 16) || "匿名网友",
      text: clip(c.text, 120),
      likes: typeof c.likes === "number" && c.likes >= 0
        ? Math.min(Math.round(c.likes), 99999) : 0,
      reply_to: replyTo,
      stance: c.stance === "support" || c.stance === "oppose" ? c.stance : "neutral",
    });
  }

  // 2) 去重（完全 + 近似，对照已有楼层与本批内部）
  const existingFake: CommentItem[] = opts.existingTexts.map((t, i) => ({
    stage: "resonance", role: "", emoji: "", name: "", text: t,
    likes: 0, reply_to: i, stance: "neutral",
  }));
  const { keptFlags, duplicates } = dedupeComments(parsed, existingFake);
  const kept = remapBatchReplies(parsed, keptFlags, opts.baseCount);

  if (kept.length < minNew) {
    throw new Error(kept.length === 0 ? "no_new_comments" : "too_few_comments");
  }

  const hotSearch = Array.isArray(data.hot_search)
    ? data.hot_search.slice(0, 4).map((h: unknown) => clip(h, 24)).filter(Boolean)
    : [];
  return {
    duplicates,
    thread: {
      title: clip(data.title, 30) || "这条吐槽吵翻了",
      comments: kept,
      summary: clip(data.summary, 100),
      hot_search: hotSearch.length ? hotSearch : ["评论区叠叠乐", "今天你吵了吗"],
      heat: num01(data.heat),
      conflict: num01(data.conflict),
      absurdity: num01(data.absurdity),
      camps: {
        support: num01(data.camps?.support),
        oppose: num01(data.camps?.oppose),
        neutral: num01(data.camps?.neutral),
      },
      fiction_notice: clip(data.fiction_notice, 40) || "以上内容均为 AI 虚构娱乐演绎",
    },
  };
}

export async function callDeepSeek(
  system: string,
  user: string,
  apiKey: string,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 1.1,
        max_tokens: 1600,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      if (res.status === 401) throw new Error("upstream_auth");
      if (res.status === 402) throw new Error("upstream_quota");
      if (res.status === 429) throw new Error("upstream_busy");
      throw new Error("upstream_error");
    }
    const json = await res.json();
    const content = json?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw new Error("empty_upstream");
    return content;
  } finally {
    clearTimeout(timer);
  }
}
