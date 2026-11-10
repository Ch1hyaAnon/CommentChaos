import { safeLog } from "./diagnostics.ts";
// Live background only. Search results and page contents are untrusted data.
export interface KnowledgeSource {
  title: string;
  url: string;
  published_at: string | null;
  retrieved_at: string;
  kind: "page" | "summary";
  excerpt: string;
}
export interface Knowledge {
  status: "ready" | "summary_only" | "empty" | "unavailable";
  retrieved_at: string;
  sources: KnowledgeSource[];
}
export interface SearchResult {
  title: string; url: string; summary: string; snippet: string;
  date: string | null; authority: number; rerank_score: number;
}
const BASE = "https://api.deepseek.com/v1/tools";
const limit = (s: string, n: number) => Array.from(s).slice(0, n).join("");
export function publicUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    const h = u.hostname.toLowerCase();
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password ||
      h === 'localhost' || h.endsWith('.local') || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.lan') || h.endsWith('.home') ||
      /^\d+\.\d+\.\d+\.\d+$/.test(h) || h.includes(':') || !h.includes('.')) return null;
    u.hash = '';
    return u.href;
  } catch { return null; }
}
export async function toolRequest(path: "search" | "fetch", body: object, key: string, signal: AbortSignal): Promise<any> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(body), signal,
  });
  if (!res.ok) throw new Error(`tool_${res.status}`);
  return res.json();
}
export async function search(query: string, key: string, signal: AbortSignal): Promise<SearchResult[]> {
  const data = await toolRequest('search', { query: limit(query, 128), count: 5, need_content: false }, key, signal);
  if (!Array.isArray(data.results)) throw new Error('invalid_search_response');
  return data.results.flatMap((r: any) => {
    const url = publicUrl(r?.url);
    if (!url || typeof r.title !== 'string') return [];
    const text = (v: unknown) => typeof v === 'string' ? v : '';
    return [{ title: text(r.title).slice(0, 200), url, summary: text(r.summary).slice(0, 2400),
      snippet: text(r.snippet).slice(0, 600), date: typeof r.date === 'string' && !isNaN(Date.parse(r.date)) ? r.date : null,
      authority: typeof r.authority === 'number' ? r.authority : -1,
      rerank_score: typeof r.rerank_score === 'number' ? r.rerank_score : 0 }];
  });
}
export async function fetchPage(url: string, key: string, signal: AbortSignal, strict = false): Promise<string> {
  if (strict) url = await verifyFetchTarget(url, signal);
  if (!publicUrl(url)) throw new Error('invalid_url');
  const data = await toolRequest('fetch', { url }, key, signal);
  if (strict && (data.final_url || data.url)) await verifyPublicHost(data.final_url || data.url, signal);
  if (typeof data.content !== 'string' || !data.content.trim()) throw new Error('empty_page');
  return data.content.slice(0, 12000);
}
// Preflight every visible redirect and resolve both address families before delegating to Fetch.
// Fail closed when public DNS/redirect inspection is unavailable. No user supplied URL is fetched.
export function publicAddress(address: string): boolean {
  if (address.includes(':')) return /^[23][0-9a-f]{3}:/i.test(address) && !/^2001:(?:db8|0{1,4}|0?10|0?20|0?2):/i.test(address) && !/^2002:/i.test(address);
  const p = address.split('.').map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = p;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
type AddressResolver = (host: string, signal: AbortSignal) => Promise<string[]>;
async function resolveAddresses(host: string, signal: AbortSignal): Promise<string[]> {
  const { lookup } = await import('node:dns/promises');
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      lookup(host, { all: true, verbatim: true }).then(rows => rows.map(r => r.address)),
      new Promise<never>((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }); }),
    ]);
  } finally { if (abort) signal.removeEventListener('abort', abort); }
}
export async function verifyPublicHost(value: string, signal: AbortSignal, resolve: AddressResolver = resolveAddresses): Promise<string> {
  const url = publicUrl(value);
  if (!url || new URL(url).protocol !== 'https:' || (new URL(url).port && new URL(url).port !== '443')) throw Error('unsafe_fetch_url');
  const addresses = await resolve(new URL(url).hostname, signal);
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(a => !publicAddress(a))) throw Error('unsafe_fetch_address');
  return url;
}
export async function verifyFetchTarget(value: string, signal: AbortSignal, resolve?: AddressResolver): Promise<string> {
  let url = value;
  for (let i = 0; i < 4; i++) {
    url = await verifyPublicHost(url, signal, resolve);
    const res = await fetch(url, { method: 'HEAD', redirect: 'manual', signal });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) throw Error('invalid_redirect');
      url = new URL(location, url).href;
    } else return url;
  }
  throw Error('too_many_redirects');
}
// Lightweight topic extraction avoids sending an entire anecdote as an exact search intent.
// Unknown topics keep a bounded original phrase rather than being forced into an unrelated category.
export function topicTerms(topic: string): string {
  const terms = ["应届生", "实习", "就业", "考研", "绩点", "宿舍", "食堂", "香菜", "奶茶", "导师", "答辩",
    "番剧", "周边", "拼团", "漫展", "二创", "角色", "游戏", "版本", "平衡", "抽卡", "氪金", "电竞", "硬盘", "更新",
    "周报", "加班", "薪资", "裁员", "通勤", "相亲", "存款", "恋爱", "情绪价值", "家庭", "友谊", "科技", "人工智能", "AI"];
  const found = terms.filter(term => topic.toLowerCase().includes(term.toLowerCase())).slice(0, 6);
  return found.length ? found.join(' ') : limit(topic.replace(/[，。！？、；：,.!?;:]/g, ' '), 65);
}
export function buildQueries(seed: string, community: string, news: string, now: number, searchTerms?: string): string[] {
  const topic = (news || seed).replace(/\s+/g, ' ').trim();
  const year = topic.match(/\b((?:19|20)\d{2})年?/);
  const currentYear = new Date(now).getUTCFullYear();
  const relativeYear = /前年/.test(topic) ? currentYear - 2 : /去年/.test(topic) ? currentYear - 1 : null;
  let temporal = `after:${new Date(now - 30 * 86400000).toISOString().slice(0, 10)}`;
  if (year && +year[1] <= currentYear) temporal = `after:${year[1]}-01-01 before:${+year[1] + 1}-01-01`;
  if (relativeYear) temporal = `after:${relativeYear}-01-01 before:${relativeYear + 1}-01-01`;
  const base = limit(searchTerms?.trim() || topicTerms(topic), 85);
  return [`${base} ${temporal}`, base].map(q => limit(q, 128));
}
function toolFailure(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  return /^tool_\d+$/.test(message) ? message : e instanceof Error && e.name === 'AbortError' ? 'timeout' : 'invalid_or_unavailable_tool_response';
}
export function pageExcerpt(content: string, topic: string): string {
  const terms = topicTerms(topic).toLowerCase().split(/\s+/).filter(Boolean);
  const passages = content.split(/\n\s*\n/).map((text, index) => ({ text: text.trim(), index,
    score: terms.filter(term => text.toLowerCase().includes(term)).length }))
    .filter(p => p.text.length >= 20);
  const selected = passages.filter(p => p.score > 0).sort((a,b) => b.score-a.score || a.index-b.index).slice(0,3);
  return limit((selected.length ? selected : passages.slice(0,2)).sort((a,b) => a.index-b.index).map(p => p.text).join('\n'), 900);
}
const TTL = 30 * 60 * 1000;
const MAX_CACHE = 100;
export function createKnowledgeService(options: { now?: () => number; budgetMs?: number } = {}) {
  const now = options.now ?? Date.now;
  const cache = new Map<string, { at: number; value: Knowledge }>();
  const pending = new Map<string, Promise<Knowledge>>();
  async function collect(seed: string, community: string, news: string, key: string, searchTerms?: string): Promise<Knowledge> {
    const started = now();
    const retrieved_at = new Date(started).toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.budgetMs ?? 12000);
    let searchCalls = 0, fetchCalls = 0;
    let failure: string | null = null;
    let sources: KnowledgeSource[] = [];
    try {
      let results: SearchResult[] = [];
      for (const query of buildQueries(seed, community, news, started, searchTerms)) {
        searchCalls++;
        results = (await search(query, key, controller.signal)).filter(r => r.rerank_score >= 1.5);
        if (results.length) break;
      }
      const seen = new Set<string>();
      results = results.filter(r => { if (seen.has(r.url)) return false; seen.add(r.url); return true; });
      results.sort((a, b) => b.authority - a.authority || b.rerank_score - a.rerank_score);
      sources = results.slice(0, 3).map(r => ({ title: r.title, url: r.url, published_at: r.date,
        retrieved_at, kind: 'summary', excerpt: r.summary || r.snippet }));
      // Settle independently: a failed page must not discard usable search summaries.
      await Promise.all(sources.slice(0, 2).map(async source => {
        try {
          fetchCalls++;
          const content = await fetchPage(source.url, key, controller.signal);
          source.excerpt = `${limit(source.excerpt, 500)}\n正文摘录：${pageExcerpt(content, news || seed)}`;
          source.kind = 'page';
        }
        catch (e) { failure = toolFailure(e); }
      }));
      let remaining = 4000;
      sources = sources.filter(s => s.excerpt.trim()).map(s => {
        const excerpt = limit(s.excerpt, Math.min(1400, remaining));
        remaining -= Array.from(excerpt).length;
        return { ...s, excerpt };
      }).filter(s => s.excerpt.length > 0);
      const status = !sources.length ? 'empty' : sources.some(s => s.kind === 'page') ? 'ready' : 'summary_only';
      return { status, retrieved_at, sources };
    } catch (e) {
      failure = toolFailure(e);
      return { status: 'unavailable', retrieved_at, sources: [] };
    } finally {
      clearTimeout(timer);
      // Do not log seed, pages, credentials or user text.
      safeLog({ event: 'knowledge', elapsed_ms: now() - started, search_calls: searchCalls,
        fetch_calls: fetchCalls, reason: failure });
    }
  }
  return async (seed: string, community: string, news: string, key: string, searchTerms?: string): Promise<Knowledge> => {
    const id = JSON.stringify([seed.trim(), community, news.trim(), searchTerms]);
    const hit = cache.get(id);
    if (hit && now() - hit.at < TTL) return hit.value;
    if (pending.has(id)) return pending.get(id)!;
    // Bound both retained results and concurrent distinct retrievals.
    if (pending.size >= MAX_CACHE) return { status: 'unavailable', retrieved_at: new Date(now()).toISOString(), sources: [] };
    const task = collect(seed, community, news, key, searchTerms).then(value => {
      if (value.status !== 'unavailable') {
        cache.delete(id);
        if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
        cache.set(id, { at: now(), value });
      }
      return value;
    }).finally(() => pending.delete(id));
    pending.set(id, task);
    return task;
  };
}
export const getKnowledge = createKnowledgeService();
