import { useState } from "react";
import type { ThreadResult } from "../types";
import { downloadShareCard } from "../shareCard";

interface Props {
  thread: ThreadResult;
  commentCount: number;
}

export default function StatsPanel({ thread, commentCount }: Props) {
  const [shareState, setShareState] = useState<"idle" | "done" | "error">("idle");

  const meters: { label: string; value: number; color: string; emoji: string }[] = [
    { label: "动态热度", value: thread.heat, color: "var(--site-accent)", emoji: "🔥" },
    { label: "吵架值", value: thread.conflict, color: "#e0b400", emoji: "⚡" },
    { label: "离谱值", value: thread.absurdity, color: "var(--site-fg)", emoji: "🛸" },
  ];
  const total = Math.max(
    thread.camps.support + thread.camps.oppose + thread.camps.neutral, 1,
  );
  const camps = [
    { label: "站队支持", v: Math.round((thread.camps.support / total) * 100), color: "#5a9e52" },
    { label: "反方阵营", v: Math.round((thread.camps.oppose / total) * 100), color: "var(--site-accent)" },
    { label: "吃瓜中立", v: Math.round((thread.camps.neutral / total) * 100), color: "var(--site-muted)" },
  ];

  const onShare = async () => {
    setShareState("idle");
    try {
      await downloadShareCard(thread, thread.comments.slice(0, commentCount));
      setShareState("done");
    } catch {
      setShareState("error");
    }
    setTimeout(() => setShareState("idle"), 3000);
  };

  return (
    <section aria-label="热度数据">
      <div className="cc-col-title">📊 热度仪表 <small>实时</small></div>
      {meters.map((m) => (
        <div className="cc-meter" key={m.label}>
          <div className="cc-meter-label">
            <span>{m.emoji} {m.label}</span>
            <span>{m.value}</span>
          </div>
          <div
            className="cc-meter-track"
            role="meter"
            aria-valuenow={m.value}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={m.label}
          >
            <div className="cc-meter-fill" style={{ width: `${m.value}%`, background: m.color }} />
          </div>
        </div>
      ))}
      <div className="cc-camps">
        {camps.map((c) => (
          <div className="cc-camp" key={c.label}>
            <span style={{ color: c.color }}>{c.label}</span>
            <b>{c.v}%</b>
          </div>
        ))}
      </div>
      <div className="cc-taglist">
        {thread.hot_search.map((t) => <span className="cc-tag" key={t}>#{t}</span>)}
      </div>
      <button
        type="button"
        className="cc-btn"
        style={{ marginTop: 14, width: "100%" }}
        onClick={onShare}
      >
        🖼️ 下载分享卡 PNG
      </button>
      {shareState === "done" && <p className="cc-hint" role="status">已生成分享卡并开始下载 ✓</p>}
      {shareState === "error" && <p className="cc-hint" role="alert">分享卡生成失败，请重试</p>}
      <p className="cc-note">{thread.fiction_notice} · 不针对任何真实个人或事件</p>
    </section>
  );
}
