import type { CommentItem } from './types';

export interface NumberedComment { comment: CommentItem; no: number; parentNo: number | null }
export interface CommentThread { root: NumberedComment; replies: NumberedComment[] }

// Presentation only: never renumber or mutate the generation protocol's global floor numbers.
export function groupComments(comments: CommentItem[], visible = comments.length): CommentThread[] {
  const threads: CommentThread[] = [];
  const threadOf = new Map<number, CommentThread>();
  for (const [index, comment] of comments.slice(0, Math.max(0, visible)).entries()) {
    const no = index + 1;
    const parentNo = Number.isInteger(comment.reply_to) && comment.reply_to! >= 1 && comment.reply_to! < no ? comment.reply_to : null;
    const item = { comment, no, parentNo };
    const parentThread = parentNo === null ? undefined : threadOf.get(parentNo);
    if (parentThread) {
      parentThread.replies.push(item);
      threadOf.set(no, parentThread);
    } else {
      const thread = { root: item, replies: [] };
      threads.push(thread);
      threadOf.set(no, thread);
    }
  }
  return threads;
}
