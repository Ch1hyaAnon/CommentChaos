import type { ThreadResult, TrendItem, DirectorAction } from "./types";

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
}

export interface GenerateResult {
  thread: ThreadResult;
  duplicates: number;
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
    throw new Error(code);
  }
  const t = data?.thread;
  if (!t || !Array.isArray(t.comments) || typeof t.title !== "string") {
    throw new Error("bad_thread");
  }
  return {
    thread: t as ThreadResult,
    duplicates: typeof data.duplicates === "number" ? data.duplicates : 0,
  };
}

export async function fetchTrending(
  keyword?: string,
): Promise<{ items: TrendItem[]; degraded: boolean }> {
  const q = keyword?.trim();
  const data = await requestJson(`${BASE}/trending${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  const items = Array.isArray(data.items) ? data.items : [];
  return { items: items as TrendItem[], degraded: data.degraded === true };
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
  generation_failed: "这楼没吵起来，重新开一次",
  bad_thread: "AI 说的格式乱了，再试一次",
  trending_unavailable: "热点源暂时都够不着，稍后再试",
  no_new_comments: "AI 觉得该吵的都吵过了：没有产生不重复的新评论，换个导演指令试试",
  invalid_base_count: "楼层数校验失败，请刷新页面重新开楼",
  thread_too_long: "本楼已吵到 200 层上限，楼上不动了。重新开楼换个话题吧",
  aborted: "请求已取消",
  server_error: "服务器出了点状况，请重试",
};
