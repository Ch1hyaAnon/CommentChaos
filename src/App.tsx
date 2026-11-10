import { useCallback, useEffect, useRef, useState } from "react";
import type { CommentItem, DirectorAction, ThreadResult, TrendItem } from "./types";
import { COMMUNITY_LIST, LOADING_LINES } from "./types";
import { generateThread, ERROR_TEXT } from "./api";
import { DEMO_THREAD } from "./demo";
import { filterDuplicates, remapBatchReplies } from "./dedupe";
import InputStage from "./components/InputStage";
import CommentFeed, { StageBar } from "./components/CommentFeed";
import DirectorPanel from "./components/DirectorPanel";
import StatsPanel from "./components/StatsPanel";
import TrendingPanel from "./components/TrendingPanel";

const REVEAL_MS = 850;
const AUTO_MAX_TURNS = 2;
const AUTO_NEXT_MS = 2600;
const MAX_FLOORS = 200;

let localIdSeq = 1;
const withLocalIds = (comments: CommentItem[]): CommentItem[] =>
  comments.map((c) => ({ ...c, localId: localIdSeq++ }));

export default function App() {
  const [screen, setScreen] = useState<"input" | "thread">("input");
  const [seed, setSeed] = useState("");
  const [originalSeed, setOriginalSeed] = useState("");
  const [community, setCommunity] = useState("campus");
  const [mode, setMode] = useState<"auto" | "director">("auto");
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [result, setResult] = useState<ThreadResult | null>(null);
  const [visible, setVisible] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [likedSet, setLikedSet] = useState<Set<number>>(new Set());
  const [floatKeys, setFloatKeys] = useState<Set<number>>(new Set());
  const [turns, setTurns] = useState(0);
  const [finished, setFinished] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [selectedTrend, setSelectedTrend] = useState<TrendItem | null>(null);
  const [noNewNotice, setNoNewNotice] = useState<string | null>(null);

  // 并发/会话控制：ref 同步请求锁，防止同一时刻连点
  const busyRef = useRef(false);
  // 会话版本号：重开楼时 +1，旧响应到达即丢弃
  const sessionRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const commentsRef = useRef<CommentItem[]>([]);
  const originalSeedRef = useRef("");
  const selectedTrendRef = useRef<TrendItem | null>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const setCommentsSynced = (next: CommentItem[]) => {
    commentsRef.current = next;
    setComments(next);
  };

  // 加载台词轮换
  useEffect(() => {
    if (!busy) {
      if (loadingTimer.current) clearInterval(loadingTimer.current);
      loadingTimer.current = null;
      return;
    }
    let i = Math.floor(Math.random() * LOADING_LINES.length);
    setLoadingLine(LOADING_LINES[i]);
    loadingTimer.current = setInterval(() => {
      i = (i + 1) % LOADING_LINES.length;
      setLoadingLine(LOADING_LINES[i]);
    }, 2400);
    return () => { if (loadingTimer.current) clearInterval(loadingTimer.current); };
  }, [busy]);

  // 逐条弹出
  useEffect(() => {
    if (visible >= comments.length) return;
    const t = setTimeout(() => setVisible((v) => v + 1), REVEAL_MS);
    return () => clearTimeout(t);
  }, [visible, comments.length]);

  const clearAuto = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  const runGenerate = useCallback(
    async (action: DirectorAction | null) => {
      if (busyRef.current) return; // 同刻连点直接忽略
      const seedText = (seed.trim() || originalSeedRef.current);
      if (!action && !seedText.trim()) {
        setError(ERROR_TEXT.empty_seed);
        return;
      }
      if (action && commentsRef.current.length >= MAX_FLOORS) {
        setNoNewNotice(ERROR_TEXT.thread_too_long);
        return;
      }
      const mySession = sessionRef.current;
      const controller = new AbortController();
      abortRef.current = controller;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setNoNewNotice(null);
      try {
        const { thread, duplicates } = await generateThread(
          {
            seed: seedText,
            community,
            director: action,
            // 近期 40 条 + 真实全局楼数：服务端按 base_count 还原全局编号
            existing: commentsRef.current.slice(-40).map((c) => ({
              role: c.role, text: c.text,
            })),
            base_count: commentsRef.current.length,
            news_context: selectedTrendRef.current
              ? `${selectedTrendRef.current.title}（来源：${selectedTrendRef.current.source}）`
              : "",
          },
          controller.signal,
        );
        // 旧会话响应：丢弃，不回流
        if (mySession !== sessionRef.current) return;

        const baseCount = commentsRef.current.length;
        if (baseCount === 0) {
          // 首楼：直接全量接收（服务端已校验至少 6 条）
          setCommentsSynced([...commentsRef.current, ...withLocalIds(thread.comments)]);
        } else {
          // 前端最后防线：完全/近似去重 + 批内引用号重映射
          const existingTexts = commentsRef.current.map((c) => c.text);
          const { kept, duplicates: clientDups } = filterDuplicates(
            thread.comments.map((c) => c.text),
            existingTexts,
          );
          const fresh = remapBatchReplies(thread.comments, kept, baseCount);
          if (fresh.length === 0) {
            setNoNewNotice(
              `本轮${duplicates + clientDups} 条生成结果与已有评论重复，已全部过滤。换个导演指令试试，或重新开楼。`,
            );
          } else {
            setCommentsSynced([...commentsRef.current, ...withLocalIds(fresh)]);
          }
        }
        setResult(thread);
        setTurns((t) => t + 1);
        if (action === "finale") setFinished(true);
        if (!action) {
          originalSeedRef.current = seedText;
          setOriginalSeed(seedText);
          setScreen("thread");
        }
      } catch (e) {
        if (mySession !== sessionRef.current) return;
        const code = e instanceof Error ? e.message : "generation_failed";
        if (code === "aborted") return;
        if (code === "no_new_comments") {
          setNoNewNotice(ERROR_TEXT.no_new_comments);
        } else {
          setError(ERROR_TEXT[code] ?? "这楼没吵起来，重新开一次");
        }
      } finally {
        if (mySession === sessionRef.current) {
          busyRef.current = false;
          setBusy(false);
        }
      }
    },
    [seed, community],
  );

  // 自动看戏：播完自动续幕
  useEffect(() => {
    if (screen !== "thread" || mode !== "auto" || isDemo) return;
    if (busy || finished || visible < comments.length) return;
    if (turns > AUTO_MAX_TURNS) return;
    clearAuto();
    autoTimer.current = setTimeout(() => runGenerate("continue"), AUTO_NEXT_MS);
    return clearAuto;
  }, [screen, mode, isDemo, busy, finished, visible, comments.length, turns, runGenerate]);

  const onLike = (localId: number) => {
    setLikedSet((prev) => {
      const next = new Set(prev);
      if (next.has(localId)) next.delete(localId);
      else next.add(localId);
      return next;
    });
    if (!likedSet.has(localId)) {
      setFloatKeys((prev) => new Set(prev).add(localId));
      setTimeout(() => {
        setFloatKeys((prev) => {
          const next = new Set(prev);
          next.delete(localId);
          return next;
        });
      }, 800);
    }
  };

  const startDemo = () => {
    clearAuto();
    abortRef.current?.abort();
    sessionRef.current++;
    busyRef.current = false;
    setIsDemo(true);
    setResult(DEMO_THREAD);
    setCommentsSynced(withLocalIds(DEMO_THREAD.comments));
    setVisible(0);
    setScreen("thread");
    setFinished(true);
    setTurns(1);
    setLikedSet(new Set());
    setError(null);
    setNoNewNotice(null);
  };

  const restart = () => {
    clearAuto();
    abortRef.current?.abort();
    sessionRef.current++;
    busyRef.current = false;
    setScreen("input");
    setCommentsSynced([]);
    setResult(null);
    setVisible(0);
    setBusy(false);
    setError(null);
    setNoNewNotice(null);
    setLikedSet(new Set());
    setTurns(0);
    setFinished(false);
    setIsDemo(false);
    setSelectedTrend(null);
    selectedTrendRef.current = null;
  };

  const communityLabel = COMMUNITY_LIST.find((c) => c.id === community)?.label ?? "社区";
  const revealing = visible < comments.length;

  return (
    <div className="cc-shell">
      <div className="cc-wrap">
        <header className="cc-masthead">
          <div className="cc-brand">
            <span className="cc-brand-mark">评论区叠叠乐</span>
            <span className="cc-brand-sub">Comment Chaos · AI 嘴替编辑部</span>
          </div>
          <span className="cc-issue">虚构娱乐演绎 · 无需登录 · 第 1 期</span>
        </header>

        {screen === "input" ? (
          <div className="cc-columns cc-input-columns">
            <div className="cc-input-primary">
              <InputStage
                seed={seed}
                setSeed={setSeed}
                community={community}
                setCommunity={setCommunity}
                onSubmit={() => runGenerate(null)}
                onDemo={startDemo}
                error={error}
                busy={busy}
              />
              {busy && (
                <div className="cc-loading" role="status" style={{ marginTop: 24 }}>
                  <p className="cc-loading-line cc-loading-dots">{loadingLine}</p>
                  <p className="cc-hint">AI 嘴替们正在入场（一般 10–30 秒）</p>
                </div>
              )}
            </div>
            <TrendingPanel
              selected={selectedTrend}
              onSelect={(it) => {
                setSelectedTrend(it);
                selectedTrendRef.current = it;
                setSeed(it.title);
              }}
              clearSelected={() => {
                setSelectedTrend(null);
                selectedTrendRef.current = null;
              }}
            />
          </div>
        ) : (
          result && (
            <div className="cc-columns cc-thread-columns">
              <div className="cc-side">
                <StatsPanel thread={result} commentCount={visible} />
              </div>

              <main className="cc-main" aria-label="评论楼">
                <article className="cc-op">
                  <span className="cc-op-tag">{communityLabel}社区 · 主楼</span>
                  <h2 style={{ margin: 0, fontSize: "calc(22px * var(--site-type))", fontWeight: 800 }}>
                    {result.title}
                    {isDemo && <span className="cc-demo-badge">示例数据 · 非真实 AI 生成</span>}
                  </h2>
                  <p style={{ margin: "8px 0 0", color: "var(--site-muted)", fontSize: 14 }}>
                    楼主：{originalSeed || "（示例楼）"}
                    {selectedTrend && !isDemo && <> · 热点种子：{selectedTrend.title}</>}
                  </p>
                </article>
                <StageBar visibleCount={visible} comments={comments} />
                <CommentFeed
                  comments={comments}
                  visible={visible}
                  likedSet={likedSet}
                  floatKeys={floatKeys}
                  onLike={onLike}
                />
                {busy && (
                  <div className="cc-loading" role="status" style={{ marginTop: 16 }}>
                    <p className="cc-loading-line cc-loading-dots">{loadingLine}</p>
                  </div>
                )}
                {error && (
                  <div className="cc-error" style={{ marginTop: 16 }} role="alert">
                    <span>🥲 {error}</span>
                    <button
                      type="button"
                      className="cc-btn cc-btn-ghost"
                      style={{ padding: "6px 14px", fontSize: 13 }}
                      onClick={() => runGenerate(mode === "director" ? "continue" : null)}
                    >
                      重试
                    </button>
                  </div>
                )}
                {noNewNotice && !busy && (
                  <div className="cc-error" style={{ marginTop: 16, background: "var(--site-surface)" }} role="status">
                    <span>🈳 {noNewNotice}</span>
                  </div>
                )}
                {finished && !revealing && !busy && (
                  <div className="cc-summary">
                    <h3>🧾 {isDemo ? "示例楼" : "本期"}热搜总结</h3>
                    <p>{result.summary}</p>
                  </div>
                )}
                {isDemo && (
                  <p className="cc-note">
                    当前是离线示例楼，用于无网络/未配置密钥时体验玩法。点右上「重新开楼」输入你的吐槽，
                    由真实 AI 生成属于你的评论楼。
                  </p>
                )}
              </main>

              <DirectorPanel
                mode={mode}
                setMode={(m) => {
                  clearAuto(); // 切导演模式取消自动续幕计时
                  setMode(m);
                }}
                onAction={(a) => runGenerate(a)}
                onRestart={restart}
                busy={busy || revealing}
                finished={finished}
                turns={turns}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
