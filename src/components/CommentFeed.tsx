import { useMemo, useState } from "react";
import type { CommentItem, Stage } from "../types";
import { STAGE_NAMES, STAGE_ORDER } from "../types";
import { groupComments } from "../threads";
import { bodyReaction } from "../commentPresentation";

interface Props {
  comments: CommentItem[];
  visible: number;
  likedSet: Set<number>;
  floatKeys: Set<number>;
  onLike: (localId: number) => void;
}

const ROLE_EMOJI: Record<string, string> = {
  孝子: "🛡️", 黑子: "😒", 串子: "🎣", 杠精: "🧐", 阴阳人: "🙃", 吃瓜群众: "🍿", 考据党: "🔎", 路人: "💬",
  热评王: "🔥", 反方: "😤", 理性人: "🤓", 乐子人: "🤣", 神秘知情人: "🍉", 跑题人: "🛸", 共情党: "🥺", 总结怪: "🧾",
};

export function StageBar({ visibleCount, comments }: { visibleCount: number; comments: CommentItem[] }) {
  const counts = new Map<Stage, number>();
  for (const comment of comments.slice(0, visibleCount)) counts.set(comment.stage, (counts.get(comment.stage) ?? 0) + 1);
  return <div className="cc-stagebar" aria-label="讨论走向">{STAGE_ORDER.map(stage => (
    <span key={stage} className={`cc-stage ${counts.has(stage) ? "cc-active" : ""}`}>{STAGE_NAMES[stage]} {counts.get(stage) ?? 0}</span>
  ))}</div>;
}

export function CommentCard({ comment, no, replyTarget, liked, floating, onLike, compact = false, replyCount }: {
  comment: CommentItem;
  no: number;
  replyTarget: CommentItem | null;
  liked: boolean;
  floating: boolean;
  onLike: () => void;
  compact?: boolean;
  replyCount?: number;
}) {
  const reaction = bodyReaction(comment, no);
  return (
    <article id={`cc-comment-${no}`} tabIndex={-1} className={`cc-comment ${compact ? "cc-comment-compact" : ""}`} aria-label={`第 ${no} 楼 ${comment.name}`}>
      <span className="cc-avatar" aria-hidden="true">{comment.emoji || ROLE_EMOJI[comment.role] || "💬"}</span>
      <div className="cc-comment-body">
        <div className="cc-comment-head">
          <span className="cc-name">{comment.name}</span>
          <span className="cc-floor">#{no}</span>
        </div>
        {replyTarget && <a className="cc-reply-to" href={`#cc-comment-${comment.reply_to}`} title={replyTarget.text}>
          回复 @{replyTarget.name} · #{comment.reply_to}
        </a>}
        <p className="cc-comment-text">{comment.text}{reaction && <span className="cc-body-reaction"> {reaction}</span>}</p>
        <div className="cc-comment-actions">
          <button type="button" className="cc-like" aria-label={`赞第 ${no} 楼`} aria-pressed={liked} onClick={onLike}>
            <span aria-hidden="true">{liked ? "♥" : "♡"}</span> {comment.likes + (liked ? 1 : 0)}
          </button>
          {replyCount !== undefined && <span className="cc-reply-count">{replyCount} 条回复</span>}
          {floating && <span className="cc-float">+1</span>}
        </div>
      </div>
    </article>
  );
}

export default function CommentFeed({ comments, visible, likedSet, floatKeys, onLike }: Props) {
  const [view, setView] = useState<"threads" | "floors">("threads");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const threads = useMemo(() => groupComments(comments, visible), [comments, visible]);
  const items = comments.slice(0, visible);
  if (!comments.length) return null;
  const card = (comment: CommentItem, no: number, compact = false, replyCount?: number) => {
    const parent = comment.reply_to;
    const replyTarget = parent && Number.isInteger(parent) && parent >= 1 && parent < no ? comments[parent - 1] : null;
    return <CommentCard key={comment.localId ?? no} comment={comment} no={no} compact={compact} replyTarget={replyTarget}
      liked={likedSet.has(comment.localId!)} floating={floatKeys.has(comment.localId!)} onLike={() => onLike(comment.localId!)} replyCount={replyCount} />;
  };
  return (
    <section className="cc-discussion" aria-label="评论区">
      <div className="cc-discussion-toolbar">
        <div><h3>评论区 <span>{items.length}</span></h3><p>{threads.length} 条主评论 · {items.length - threads.length} 条楼中楼</p></div>
        <div className="cc-view-toggle" role="group" aria-label="评论显示方式">
          <button type="button" aria-pressed={view === "threads"} onClick={() => setView("threads")}>按讨论串</button>
          <button type="button" aria-pressed={view === "floors"} onClick={() => setView("floors")}>按楼层</button>
        </div>
      </div>
      <p className="cc-sr-only" role="status" aria-live="polite">已显示 {items.length} 条评论</p>
      <div className="cc-feed">
        {view === "floors" ? items.map((comment, i) => <div className="cc-thread" key={comment.localId ?? i}>{card(comment, i + 1)}</div>) : threads.map(thread => {
          const key = thread.root.comment.localId ?? thread.root.no;
          const open = expanded.has(key);
          const shown = open ? thread.replies : thread.replies.slice(0, 3);
          return <section className="cc-thread" key={key} aria-label={`第 ${thread.root.no} 楼的讨论串`}>
            {card(thread.root.comment, thread.root.no, false, thread.replies.length)}
            {thread.replies.length > 0 && <div className="cc-thread-replies" id={`cc-replies-${thread.root.no}`}>
              {shown.map(item => card(item.comment, item.no, true))}
              {thread.replies.length > 3 && <button type="button" className="cc-expand-replies" aria-expanded={open} aria-controls={`cc-replies-${thread.root.no}`} onClick={() => setExpanded(prev => {
                const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next;
              })}>{open ? "收起回复" : `展开其余 ${thread.replies.length - shown.length} 条回复`} <span aria-hidden="true">{open ? "⌃" : "⌄"}</span></button>}
            </div>}
          </section>;
        })}
      </div>
    </section>
  );
}
