import { useState } from "react";
import { COMMUNITY_LIST } from "../types";

interface Props {
  seed: string;
  setSeed: (v: string) => void;
  community: string;
  setCommunity: (v: string) => void;
  onSubmit: () => void;
  onDemo: () => void;
  error: string | null;
  busy: boolean;
}

const SAMPLES = [
  "凌晨三点室友还在打游戏连麦，我戴着耳塞数了 47 辆幻想中的跑车",
  "公司规定周报必须满 800 字，我现在写周报比写毕业论文还认真",
  "新版本抽卡 90 发没出货，群友 10 发双黄",
  "相亲对象上来就问我存款有几位数",
];

export default function InputStage({
  seed, setSeed, community, setCommunity, onSubmit, onDemo, error, busy,
}: Props) {
  const [touched, setTouched] = useState(false);
  const trimmed = seed.trim();
  const showEmptyError = touched && !trimmed;

  return (
    <section className="cc-main" aria-label="开楼">
      <div className="cc-hero">
        <h1 className="cc-hero-title">
          输入一句话，<br />
          AI 帮你把它<em>吵上热搜</em>。
        </h1>
        <p className="cc-hero-sub">
          一句吐槽丢进社区，护主的、唱反调的、反串的、看热闹的各说各话，
          有人共鸣，有人抬杠，也有人顺手歪楼，十条评论带出不同视角，再给你一份热搜总结。
        </p>
      </div>
      <div className="cc-input-card" style={{ marginTop: 20 }}>
        <label htmlFor="cc-seed" className="cc-col-title" style={{ border: "none", marginBottom: 8 }}>
          ✍️ 今天的吐槽 <small>200 字以内</small>
        </label>
        <textarea
          id="cc-seed"
          className={`cc-textarea ${showEmptyError || error ? "cc-error" : ""}`}
          placeholder="例如：食堂新出的香菜奶茶，喝完我沉默了……"
          value={seed}
          maxLength={200}
          onChange={(e) => setSeed(e.target.value)}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit();
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span className="cc-hint" role={showEmptyError ? "alert" : undefined}>
            {showEmptyError ? "还没写吐槽呢，空楼吵不起来" : "⌘/Ctrl + Enter 快捷开楼"}
          </span>
          <span className="cc-hint">{seed.length}/200</span>
        </div>

        <div className="cc-col-title" style={{ marginTop: 16 }}>🏘️ 选个社区 <small>看谁来吵</small></div>
        <div className="cc-community-grid">
          {COMMUNITY_LIST.map((c) => (
            <button
              key={c.id}
              type="button"
              className="cc-chip"
              aria-pressed={community === c.id}
              onClick={() => setCommunity(c.id)}
            >
              {c.emoji} {c.label}
              <small>{c.desc}</small>
            </button>
          ))}
        </div>

        {error && (
          <div className="cc-error" style={{ marginTop: 16 }} role="alert">
            <span>🥲 {error}</span>
            <button type="button" className="cc-btn cc-btn-ghost" style={{ padding: "6px 14px", fontSize: 13 }} onClick={onSubmit}>
              重试
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 12, marginTop: 18, flexWrap: "wrap" }}>
          <button type="button" className="cc-btn" onClick={onSubmit} disabled={busy}>
            {busy ? "开楼中…" : "🚀 开楼，吵上热搜"}
          </button>
          <button type="button" className="cc-btn cc-btn-ghost" onClick={onDemo}>
            📦 看离线示例楼
          </button>
        </div>
      </div>
      <div className="cc-taglist" aria-label="灵感样例">
        {SAMPLES.map((s) => (
          <button
            key={s}
            type="button"
            className="cc-chip"
            style={{ textAlign: "left", fontSize: 12 }}
            onClick={() => setSeed(s)}
          >
            💡 {s.length > 22 ? s.slice(0, 22) + "…" : s}
          </button>
        ))}
      </div>
    </section>
  );
}
