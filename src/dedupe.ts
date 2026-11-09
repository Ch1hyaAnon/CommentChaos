// 与 functions/ai.ts 保持一致的去重逻辑（前端最后防线；服务端已先行过滤）
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s，。！？、,.!?~～…：:；;""''\"'（）()\[\]【】\-—_]/g, "")
    .replace(/[哈嘿呵嘻嘻]/g, "哈")
    .slice(0, 60);
}

function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

export function isNearDup(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 14 && nb.length >= 14 && (na.includes(nb) || nb.includes(na))) {
    return true;
  }
  const A = bigrams(na), B = bigrams(nb);
  if (!A.size || !B.size) return false;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter) >= 0.6;
}

export function filterDuplicates(
  incoming: string[],
  existing: string[],
): { kept: boolean[]; duplicates: number } {
  const pool = [...existing];
  const kept: boolean[] = [];
  let duplicates = 0;
  for (const t of incoming) {
    if (pool.some((e) => isNearDup(e, t))) { duplicates++; kept.push(false); continue; }
    pool.push(t);
    kept.push(true);
  }
  return { kept, duplicates };
}

// 服务端已过滤并按 no 连续编号；客户端二次过滤后需再修正：
// 保留楼按顺序重编为 baseCount+1…；reply_to 指向被过滤楼 → 改指其之前最近的保留新楼（无则置空）；
// 指向已有楼（≤ baseCount）→ 不变。
export interface ReplyLike {
  reply_to: number | null;
  no?: number;
}

export function remapBatchReplies<T extends ReplyLike>(
  batch: T[],
  keptFlags: boolean[],
  baseCount: number,
): T[] {
  // 保留楼新编号
  const newNo = new Array<number | null>(batch.length).fill(null);
  let seq = baseCount;
  for (let i = 0; i < batch.length; i++) {
    if (keptFlags[i]) { seq++; newNo[i] = seq; }
  }
  // 服务端原编号 no → 批内位置（无 no 时退化为顺序位置）
  const noIndex = new Map<number, number>();
  for (let i = 0; i < batch.length; i++) {
    const n = (batch[i] as { no?: number }).no;
    if (typeof n === "number") noIndex.set(n, i);
  }
  // 每个位置之前最近的保留楼
  const prevKept = new Array<number | null>(batch.length).fill(null);
  let lastKept: number | null = null;
  for (let i = 0; i < batch.length; i++) {
    prevKept[i] = lastKept;
    if (keptFlags[i]) lastKept = i;
  }
  const out: T[] = [];
  for (let i = 0; i < batch.length; i++) {
    if (!keptFlags[i]) continue;
    let replyTo = batch[i].reply_to;
    if (replyTo !== null && replyTo > baseCount) {
      const j = noIndex.get(replyTo) ?? replyTo - baseCount - 1;
      if (j >= 0 && j < batch.length && j < i) {
        if (keptFlags[j]) replyTo = newNo[j];
        else replyTo = prevKept[j] !== null ? newNo[prevKept[j]!] : null;
      } else {
        replyTo = null;
      }
    }
    out.push({ ...batch[i], reply_to: replyTo, no: newNo[i]! } as T);
  }
  return out;
}
