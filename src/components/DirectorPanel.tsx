import { DIRECTOR_BUTTONS, type DirectorAction } from "../types";

interface Props {
  mode: "auto" | "director";
  setMode: (m: "auto" | "director") => void;
  onAction: (a: DirectorAction) => void;
  onRestart: () => void;
  busy: boolean;
  finished: boolean;
  turns: number;
}

export default function DirectorPanel({
  mode, setMode, onAction, onRestart, busy, finished, turns,
}: Props) {
  return (
    <section className="cc-director-col" aria-label="导演面板">
      <div className="cc-col-title">
        🎬 导演台 <small>{turns > 0 ? `已导 ${turns} 幕` : "待开机"}</small>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          type="button"
          className={`cc-dir-btn ${mode === "auto" ? "cc-btn-yellow" : ""}`}
          aria-pressed={mode === "auto"}
          onClick={() => setMode("auto")}
          style={mode === "auto" ? { boxShadow: "3px 3px 0 var(--site-fg)" } : undefined}
        >
          🍿 自动看戏
        </button>
        <button
          type="button"
          className={`cc-dir-btn ${mode === "director" ? "cc-btn-yellow" : ""}`}
          aria-pressed={mode === "director"}
          onClick={() => setMode("director")}
          style={mode === "director" ? { boxShadow: "3px 3px 0 var(--site-fg)" } : undefined}
        >
          🎥 导演模式
        </button>
      </div>
      {mode === "director" && (
        <div className="cc-director-grid">
          {DIRECTOR_BUTTONS.map((b) => (
            <button
              key={b.id}
              type="button"
              className="cc-dir-btn"
              onClick={() => onAction(b.id)}
              disabled={busy}
              title={finished && b.id !== "finale" ? "本楼已总结，可重新开楼" : undefined}
            >
              {b.emoji} {b.label}
            </button>
          ))}
        </div>
      )}
      {mode === "auto" && (
        <p className="cc-hint">
          自动看戏：评论逐条弹出，播完自动续下一幕（自动续 2 幕后停，避免无限消耗）。
          想亲手上节奏就切导演模式。
        </p>
      )}
      <button
        type="button"
        className="cc-btn cc-btn-ghost"
        style={{ marginTop: 14, width: "100%" }}
        onClick={onRestart}
        disabled={busy}
      >
        ✍️ 重新开楼
      </button>
    </section>
  );
}
