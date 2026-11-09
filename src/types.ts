export type Stage = "resonance" | "split" | "derail" | "sublimate";
export const STAGE_NAMES: Record<Stage, string> = {
  resonance: "共鸣", split: "分裂", derail: "歪楼", sublimate: "升华",
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
  { id: "rational", label: "来个理性人", emoji: "🤓" },
  { id: "insider", label: "爆点内幕", emoji: "🍉" },
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
