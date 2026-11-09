import type { CommentItem, Stage } from "../types";
import { STAGE_NAMES, STAGE_ORDER } from "../types";

interface Props {
  comments: CommentItem[];
  visible: number;
  likedSet: Set<number>;
  floatKeys: Set<number>;
  onLike: (localId: number) => void;
}

const ROLE_EMOJI: Record<string, string> = {
  热评王: "🔥", 反方: "😤", 理性人: "🤓", 乐子人: "🤣",
  神秘知情人: "🍉", 跑题人: "🛸", 共情党: "🥺", 总结怪: "🧾",
};

function stageIndexOf(stage: Stage): number {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

export function StageBar({ visibleCount, comments }: { visibleCount: number; comments: CommentItem[] }) {
  const visibleStages = comments.slice(0, visibleCount).map((c) => stageIndexOf(c.stage));
  const current = visibleStages.length ? Math.max(...visibleStages) : -1;
  return (
    <div className="cc-stagebar" aria-label="剧情阶段">
      {STAGE_ORDER.map((s, i) => (
        <span
          key={s}
          className={`cc-stage ${i === current ? "cc-active" : i < current ? "cc-done" : ""}`}
        >
          {i + 1}. {STAGE_NAMES[s]}
        </span>
      ))}
    </div>
  );
}

export function CommentCard({
  comment, no, replyTarget, liked, floating, onLike,
}: {
  comment: CommentItem;
  no: number;
  replyTarget: CommentItem | null;
  liked: boolean;
  floating: boolean;
  onLike: () => void;
}) {
  const stanceClass = `cc-role-stance-${comment.stance}`;
  return (
    <article className={`cc-card ${no % 2 ? "cc-odd" : "cc-even"}`}>
      <div className="cc-card-head">
        <span className="cc-avatar" aria-hidden="true">
          {comment.emoji || ROLE_EMOJI[comment.role] || "💬"}
        </span>
        <span className="cc-name">{comment.name}</span>
        <span className={`cc-role ${stanceClass}`}>{comment.role}</span>
        <span className="cc-role cc-role-stage">{STAGE_NAMES[comment.stage]}</span>
        <span className="cc-reply" aria-label={`第 ${no} 楼`}>#{no}</span>
      </div>
      {replyTarget && (
        <div className="cc-reply">
          <span aria-hidden="true">↩</span>
          <span className="cc-reply-bubble">
            回复 #{comment.reply_to} {replyTarget.name}：{replyTarget.text.slice(0, 28)}…
          </span>
        </div>
      )}
      <p className="cc-text">{comment.text}</p>
      <div className="cc-card-foot">
        <button
          type="button"
          className="cc-like"
          aria-pressed={liked}
          onClick={onLike}
        >
          👍 {comment.likes + (liked ? 1 : 0)}
        </button>
        {floating && <span className="cc-float" aria-hidden="true">+1 共鸣!</span>}
      </div>
    </article>
  );
}

export default function CommentFeed({ comments, visible, likedSet, floatKeys, onLike }: Props) {
  if (!comments.length) return null;
  return (
    <div className="cc-feed" aria-live="polite">
      {comments.slice(0, visible).map((c, i) => {
        const replyTarget = c.reply_to && c.reply_to >= 1 && c.reply_to <= i
          ? comments[c.reply_to - 1]
          : null;
        return (
          <CommentCard
            key={c.localId}
            comment={c}
            no={i + 1}
            replyTarget={replyTarget}
            liked={likedSet.has(c.localId!)}
            floating={floatKeys.has(c.localId!)}
            onLike={() => onLike(c.localId!)}
          />
        );
      })}
    </div>
  );
}
