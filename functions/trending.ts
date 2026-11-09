// 服务端获取免 key 热点新闻：RSS 源 + 关键词过滤，带缓存与降级。
export interface TrendItem {
  title: string;
  url: string;
  source: string;
  published_at: string | null;
}

interface CacheEntry {
  at: number;
  items: TrendItem[];
}
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟
const FETCH_TIMEOUT = 6000;
const cache = new Map<string, CacheEntry>();

// 多源并行，谁先成功用谁；全部失败则降级
const SOURCES: { name: string; url: string }[] = [
  { name: "知乎热榜", url: "https://rss.allorigins.win/raw?url=https%3A%2F%2Fwww.zhihu.com%2Fapi%2Fv4%2Fcolumns%2Fhot" },
  { name: "微博热搜", url: "https://rsshub.app/weibo/search/hot" },
  { name: "百度热搜", url: "https://rsshub.app/baidu/topwords" },
  { name: "36氪", url: "https://36kr.com/feed" },
  { name: "少数派", url: "https://sspai.com/feed" },
];

function extractRss(xml: string, sourceName: string): TrendItem[] {
  const items: TrendItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/(item|entry)>/g) ?? [];
  for (const b of blocks.slice(0, 30)) {
    const pick = (tag: string): string => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      if (!m) return "";
      return m[1]
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        .trim();
    };
    let url = pick("link");
    if (!url) {
      const m = b.match(/<link[^>]*href="([^"]+)"/);
      url = m ? m[1] : "";
    }
    const title = pick("title");
    if (!title || !url) continue;
    const dateStr = pick("pubDate") || pick("published") || pick("updated");
    let published: string | null = null;
    const d = dateStr ? new Date(dateStr) : null;
    if (d && !isNaN(d.getTime())) published = d.toISOString();
    items.push({
      title: title.slice(0, 80),
      url: url.slice(0, 500),
      source: sourceName,
      published_at: published,
    });
  }
  return items;
}

async function fetchOne(source: { name: string; url: string }): Promise<TrendItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: { "User-Agent": "CommentChaos/1.0 (+https://qoder.site)" },
    });
    if (!res.ok) throw new Error(String(res.status));
    const xml = await res.text();
    const items = extractRss(xml, source.name);
    if (!items.length) throw new Error("empty");
    return items;
  } finally {
    clearTimeout(timer);
  }
}

export async function getTrending(keyword: string | null): Promise<{
  ok: boolean;
  items: TrendItem[];
  degraded: boolean;
}> {
  const key = keyword ? `kw:${keyword}` : "all";
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return { ok: true, items: hit.items, degraded: false };
  }
  try {
    const results = await Promise.allSettled(SOURCES.map(fetchOne));
    let items: TrendItem[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") items = items.concat(r.value);
    }
    // 去重（按标题）
    const seen = new Set<string>();
    items = items.filter((i) => {
      const t = i.title.slice(0, 24);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
    let final = items.slice(0, 20);
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      const filtered = final.filter(
        (i) => i.title.toLowerCase().includes(kw) || i.source.toLowerCase().includes(kw),
      );
      if (filtered.length) final = filtered.slice(0, 20);
      else final = [];
    }
    if (!final.length) return { ok: false, items: [], degraded: true };
    cache.set(key, { at: Date.now(), items: final });
    return { ok: true, items: final, degraded: false };
  } catch {
    return { ok: false, items: [], degraded: true };
  }
}
