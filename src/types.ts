export type Stage = "resonance" | "split" | "derail" | "sublimate";
export const STAGE_NAMES: Record<Stage, string> = {
  resonance: "站队", split: "互怼", derail: "跑题", sublimate: "回扣",
};
export const STAGE_ORDER: Stage[] = ["resonance", "split", "derail", "sublimate"];

export interface CommunityDef {
  id: string;
  label: string;
  emoji: string;
  desc: string;
}
export const COMMUNITY_LIST: CommunityDef[] = [
  { id: "campus", label: "校园", emoji: "🎓", desc: "考研绩点宿舍食堂" },
  { id: "anime", label: "二次元", emoji: "🌸", desc: "番剧角色CP漫展" },
  { id: "game", label: "游戏", emoji: "🎮", desc: "版本抽卡氪金电竞" },
  { id: "work", label: "职场", emoji: "💼", desc: "加班薪资领导通勤" },
  { id: "emotion", label: "情感", emoji: "💔", desc: "恋爱分手相亲家庭" },
  { id: "chaos", label: "混乱宇宙", emoji: "🌀", desc: "万物皆可吵" },
];

export type DirectorAction =
  | "continue" | "louder" | "rational" | "insider" | "derail" | "finale";

export const DIRECTOR_BUTTONS: {
  id: DirectorAction; label: string; emoji: string;
}[] = [
  { id: "continue", label: "继续看戏", emoji: "🍿" },
  { id: "louder", label: "让它更吵", emoji: "🔊" },
  { id: "rational", label: "来个带论据的", emoji: "🤓" },
  { id: "insider", label: "扒点细节", emoji: "🍉" },
  { id: "derail", label: "歪楼加速", emoji: "🛸" },
  { id: "finale", label: "结束总结", emoji: "🎬" },
];

export interface CommentItem {
  stage: Stage;
  role: string;
  emoji: string;
  name: string;
  text: string;
  likes: number;
  reply_to: number | null;
  stance: "support" | "oppose" | "neutral";
  localId?: number;
  likedByMe?: boolean;
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

export interface TrendItem {
  id: string;
  platform: string;
  description: string;
  rank: number;
  heat: number | null;
  fetched_at: string;
  appearances: number;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
}

export const LOADING_LINES = [
  "正在安排热评王入场……",
  "反方已就位，正在酝酿情绪……",
  "理性人正在搜索资料，可能要迟到……",
  "乐子人搬好小板凳了……",
  "神秘知情人正在整理瓜料……",
  "跑题人已经跑出去三公里……",
  "总结怪在打草稿了，再等等……",
  "本楼热度正在冲榜……",
  "吵架值过载，正在散热……",
  "AI 嘴替们正在抢麦……",
];

export interface KnowledgeMetadata {
  status: "ready" | "summary_only" | "empty" | "unavailable";
  retrieved_at: string;
  sources: { title: string; url: string; published_at: string | null; retrieved_at: string; kind: "page" | "summary" }[];
}

export interface MemeMetadata {
  reason?: string;
  status: "ready" | "empty" | "unavailable";
  retrieved_at: string;
  sources: { title: string; url: string; updated_at: string | null }[];
}

export interface RetrievalMetadata {
  entity: { status: "resolved" | "not_required" | "ambiguous"; name: string; aliases: string[]; source_urls: string[] };
  counts: { ai_calls: number; fact_queries: number; fact_pages: number; meme_queries: number; matched: number; details: number; ranked: number; selected: number; injected: number };
  stages: { stage: string; status: string; reason?: string; count?: number }[];
  strategy_version: string;
  cache_hit?: boolean;
}

export interface TrendSourceStatus { source: string; status: "ready" | "unavailable"; count: number }
export interface HotspotContext {
  id: string; title: string; status: "ready" | "summary_only" | "insufficient"; retrieved_at: string;
  summary: string;
  points: { id: string; text: string; evidence: string; source_url: string; kind: "fact" | "claim" | "opinion" | "uncertain" }[];
  sources: KnowledgeMetadata["sources"];
}
