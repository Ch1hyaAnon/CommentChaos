import { useEffect, useState } from "react";
import type { TrendItem } from "../types";
import { fetchTrending } from "../api";

interface Props {
  onSelect: (item: TrendItem) => void;
  selected: TrendItem | null;
  clearSelected: () => void;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TrendingPanel({ onSelect, selected, clearSelected }: Props) {
  const [items, setItems] = useState<TrendItem[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "degraded" | "error">("loading");
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");

  const load = async (kw: string) => {
    setState("loading");
    try {
      const r = await fetchTrending(kw || undefined);
      setItems(r.items);
      setState(r.items.length === 0 ? "degraded" : "ok");
    } catch {
      setItems([]);
      setState("error");
    }
  };

  useEffect(() => { load(""); }, []);

  return (
    <section className="cc-side" aria-label="今日热点">
      <div className="cc-col-title">📻 今日热点 <small>真实新闻源</small></div>
      <div className="cc-search-row">
        <input
          className="cc-search-input"
          type="search"
          placeholder="搜热点关键词…"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { setQuery(keyword); load(keyword); }
          }}
        />
        <button
          type="button"
          className="cc-dir-btn"
          onClick={() => { setQuery(keyword); load(keyword); }}
          disabled={state === "loading"}
        >
          搜索
        </button>
      </div>
      {state === "loading" && <p className="cc-hint cc-loading-dots">正在拉取热点</p>}
      {(state === "degraded" || state === "error") && (
        <p className="cc-hint" role="status">
          {state === "error"
            ? "热点源暂时够不着（网络或源站超时），稍后再试。也可以直接输入吐槽开楼。"
            : query
              ? `没有搜到与「${query}」相关的热点，换个词试试。`
              : "热点源暂时没有返回内容，稍后再试。不影响直接开楼。"}
        </p>
      )}
      {selected && (
        <p className="cc-hint" role="status">
          🎯 已选热点种子：{selected.title}{" "}
          <button type="button" className="cc-like" onClick={clearSelected}>取消</button>
        </p>
      )}
      {state === "ok" && items.map((it) => (
        <a
          key={it.url + it.title}
          className="cc-trend-item"
          href={it.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(e) => {
            e.preventDefault();
            onSelect(it);
          }}
          title="选作开楼种子（右键/长按可打开原文）"
        >
          {it.title}
          <span className="cc-trend-meta">
            <span>来源：{it.source}</span>
            {it.published_at && <span>{fmtTime(it.published_at)}</span>}
          </span>
        </a>
      ))}
      <p className="cc-note">
        热点来自公开新闻/热榜 RSS，仅供选题参考；楼内评论均为 AI 虚构演绎，与来源内容无关。
      </p>
    </section>
  );
}
