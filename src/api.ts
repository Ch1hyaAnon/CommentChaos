import type { ThreadResult, TrendItem, DirectorAction, KnowledgeMetadata, MemeMetadata, RetrievalMetadata, HotspotContext, TrendSourceStatus } from "./types";

const BASE = "/functions/v1/app";

async function requestJson(path: string, init?: RequestInit): Promise<any> {
  let res: Response;
  try {
    res = await fetch(path, {
      credentials: "same-origin",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      ...init,
    });
  } catch {
    throw new Error("network_error");
  }
  if (res.status === 404) throw new Error("not_found");
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error("bad_response");
  }
  if (!res.ok || data?.ok !== true) {
    const code = typeof data?.error === "string" ? data.error : "server_error";
    throw new Error(code);
  }
  return data;
}

export class GenerationError extends Error {
  trace_id?: string;
  constructor(code: string, trace_id?: string) { super(code); this.name = "GenerationError"; this.trace_id = trace_id; }
}

export interface ExistingComment {
  role: string;
  text: string;
}

export interface GenerateInput {
  seed: string;
  community: string;
  director?: DirectorAction | null;
  existing?: ExistingComment[];
  base_count?: number;
  news_context?: string;
  hotspot_id?: string;
  hotspot_token?: string;
  hotspot_supplement?: string;
}

export interface GenerateResult {
  hotspot_context?: HotspotContext;
  hotspot_token?: string;
  thread: ThreadResult;
  duplicates: number;
  knowledge?: KnowledgeMetadata;
  meme_version?: string;
  meme_context?: MemeMetadata;
  trace_id?: string;
  retrieval?: RetrievalMetadata;
}

export async function generateThread(
  input: GenerateInput,
  signal?: AbortSignal,
): Promise<GenerateResult> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/generate`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw new Error("aborted");
    throw new Error("network_error");
  }
  if (res.status === 404) throw new Error("not_found");
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    throw new Error("bad_response");
  }
  if (!res.ok || data?.ok !== true) {
    const code = typeof data?.error === "string" ? data.error : "server_error";
    throw new GenerationError(code, typeof data?.trace_id === "string" ? data.trace_id : undefined);
  }
  const t = data?.thread;
  if (!t || !Array.isArray(t.comments) || typeof t.title !== "string") {
    throw new Error("bad_thread");
  }
  return {
    thread: t as ThreadResult,
    hotspot_context: data.hotspot_context,
    hotspot_token: data.hotspot_token,
    knowledge: data.knowledge,
    meme_version: data.meme_version,
    meme_context: data.meme_context,
    trace_id: data.trace_id,
    retrieval: data.retrieval,
    duplicates: typeof data.duplicates === "number" ? data.duplicates : 0,
  };
}

export async function fetchTrending(
  keyword?: string, community = "chaos", signal?: AbortSignal,
): Promise<{ items: TrendItem[]; degraded: boolean; stale: boolean; fetched_at: string; sources: TrendSourceStatus[] }> {
  const params = new URLSearchParams({ community });
  if (keyword?.trim()) params.set("q", keyword.trim());
  const data = await requestJson(`${BASE}/trending?${params}`, { signal });
  return { items: Array.isArray(data.items) ? data.items : [], degraded: data.degraded === true,
    stale: data.stale === true, fetched_at: data.fetched_at, sources: Array.isArray(data.sources) ? data.sources : [] };
}

export const ERROR_TEXT: Record<string, string> = {
  network_error: "网络开小差了，请重试",
  empty_seed: "先输入一句吐槽再开楼吧",
  seed_too_long: "吐槽有点长，精简到 200 字以内更好吵",
  service_not_configured: "AI 服务还没配置好（缺少密钥），稍后再来",
  upstream_auth: "AI 密钥校验失败，请联系站长",
  upstream_quota: "AI 额度不足，今天就吵到这里",
  upstream_busy: "AI 有点忙，稍等几秒再试",
  upstream_timeout: "AI 想得太久超时了，再试一次",
  entity_ambiguous: "还没确认你说的是哪个对象，请补充全名、作品或领域后再开楼。",
  retrieval_unavailable: "检索服务暂不可用，未能确认对象，请稍后重试。",
  retrieval_busy: "检索请求较多，请稍后再试。",
  upstream_network_error: "AI 服务连接中断，请重试。",
  upstream_bad_response: "AI 服务返回的数据无法读取，请重试。",
  upstream_truncated: "AI 输出被截断，请重新生成。",
  bad_json: "AI 返回的 JSON 不完整，请重试。",
  bad_schema: "AI 返回的评论结构不正确，请重试。",
  too_few_comments: "有效评论太少，请重新生成。",
  generation_failed: "这楼没吵起来，重新开一次",
  bad_thread: "AI 说的格式乱了，再试一次",
  hotspot_generation_ungrounded: "这轮评论未通过事件事实检查，请重试；输入和背景已保留。",
  hotspot_content_insufficient: "还没取得足够的事件细节，已暂停开楼。请补充具体内容帮助检索，或刷新热点、取消选择后自行开楼。",
  hotspot_expired: "热点背景已过期，请刷新并重新选择热点；你的输入已保留。",
  trending_unavailable: "热点源暂时都够不着，稍后再试",
  no_new_comments: "AI 觉得该吵的都吵过了：没有产生不重复的新评论，换个导演指令试试",
  invalid_base_count: "楼层数校验失败，请刷新页面重新开楼",
  thread_too_long: "本楼已吵到 200 层上限，楼上不动了。重新开楼换个话题吧",
  aborted: "请求已取消",
  server_error: "服务器出了点状况，请重试",
};
