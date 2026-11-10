import type { CommentItem } from './types';

// The model sometimes supplies its reaction only in the avatar field. Reuse that
// exact reaction sparingly in the body, without mutating text or inventing sentiment.
const EXPRESSIVE = new Set(['😅', '🙃', '😭', '🤡', '😂', '🤣', '😏', '😒', '😮‍💨', '😤', '😎', '🙄', '😐', '😕', '🥲', '🤔']);
export function bodyReaction(comment: CommentItem, no: number): string | null {
  if ((no - 1) % 4 !== 0 || !EXPRESSIVE.has(comment.emoji)) return null;
  if (/\p{Extended_Pictographic}|\[[^\]\n]{1,8}\]|[（(][^\n]{0,8}[▽ω﹏益][^\n]{0,8}[）)]/u.test(comment.text)) return null;
  return comment.emoji;
}
