import type { ThreadResult, CommentItem } from "./types";

// 用 Canvas 绘制分享卡并下载 PNG
export async function downloadShareCard(
  thread: ThreadResult,
  comments: CommentItem[],
): Promise<void> {
  const W = 1080, H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");

  // 底色
  ctx.fillStyle = "#faf6ef";
  ctx.fillRect(0, 0, W, H);
  // 顶部色带
  ctx.fillStyle = "#1f1b16";
  ctx.fillRect(0, 0, W, 90);
  ctx.fillStyle = "#f04e23";
  ctx.fillRect(0, 90, W, 14);
  ctx.fillStyle = "#ffc940";
  ctx.fillRect(0, 104, W, 6);
  // 报头
  ctx.fillStyle = "#faf6ef";
  ctx.font = "700 34px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText("评论区叠叠乐 · 热搜周报", 48, 60);
  ctx.fillStyle = "#ffc940";
  ctx.textAlign = "right";
  ctx.font = "600 26px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText("AI 虚构娱乐演绎", W - 48, 58);
  ctx.textAlign = "left";

  // 标题
  let y = 190;
  ctx.fillStyle = "#1f1b16";
  ctx.font = "900 52px 'PingFang SC','Microsoft YaHei',sans-serif";
  y = wrapText(ctx, thread.title, 48, y, W - 96, 66);

  // 摘要
  y += 20;
  ctx.fillStyle = "#8a8075";
  ctx.font = "500 30px 'PingFang SC','Microsoft YaHei',sans-serif";
  y = wrapText(ctx, thread.summary, 48, y, W - 96, 44);

  // 三条热评
  y += 36;
  const top = [...comments]
    .sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0))
    .slice(0, 3);
  for (const c of top) {
    if (y > H - 320) break;
    // 卡片
    const cardH = 150;
    ctx.fillStyle = "#fffdf8";
    ctx.strokeStyle = "#1f1b16";
    ctx.lineWidth = 2;
    roundRect(ctx, 48, y, W - 96, cardH, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(31,27,22,0.14)";
    roundRect(ctx, 48 + 5, y + 5, W - 96, cardH, 14);
    ctx.fill();
    // 头像与昵称
    ctx.fillStyle = "#1f1b16";
    ctx.font = "34px sans-serif";
    ctx.fillText(c.emoji, 72, y + 46);
    ctx.font = "700 26px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`${c.name} · ${c.role}`, 118, y + 42);
    // 正文
    ctx.fillStyle = "#1f1b16";
    ctx.font = "500 26px 'PingFang SC','Microsoft YaHei',sans-serif";
    wrapText(ctx, c.text, 72, y + 84, W - 150, 36, 2);
    // 赞
    ctx.fillStyle = "#f04e23";
    ctx.font = "700 24px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`👍 ${c.likes}`, W - 190, y + 42);
    y += cardH + 26;
  }

  // 数据条
  y = Math.max(y, H - 280);
  ctx.fillStyle = "#1f1b16";
  roundRect(ctx, 48, y, W - 96, 120, 16);
  ctx.fill();
  const stats: [string, number][] = [
    ["热度", thread.heat], ["吵架值", thread.conflict], ["离谱值", thread.absurdity],
  ];
  stats.forEach(([label, v], i) => {
    const x = 48 + ((W - 96) / 3) * i + 40;
    ctx.fillStyle = "#ffc940";
    ctx.font = "800 26px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(label, x, y + 46);
    ctx.fillStyle = "#faf6ef";
    ctx.font = "900 40px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(String(v), x, y + 94);
  });

  // 热搜词条
  y += 160;
  ctx.fillStyle = "#1f1b16";
  ctx.font = "800 26px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText("本期热搜", 48, y);
  let x = 48;
  y += 16;
  for (const t of thread.hot_search.slice(0, 4)) {
    const w = ctx.measureText(`#${t} `).width + 40;
    if (x + w > W - 48) break;
    ctx.fillStyle = "#ffc940";
    roundRect(ctx, x, y, w, 48, 24);
    ctx.fill();
    ctx.strokeStyle = "#1f1b16";
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, 48, 24);
    ctx.stroke();
    ctx.fillStyle = "#1f1b16";
    ctx.font = "700 24px 'PingFang SC','Microsoft YaHei',sans-serif";
    ctx.fillText(`#${t}`, x + 20, y + 33);
    x += w + 14;
  }

  // 底部
  ctx.fillStyle = "#8a8075";
  ctx.font = "500 22px 'PingFang SC','Microsoft YaHei',sans-serif";
  ctx.fillText("评论区叠叠乐 · 输入一句话，AI 帮你把它吵上热搜", 48, H - 40);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("blob_failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `评论区叠叠乐-${thread.title.slice(0, 12)}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function roundRect(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  maxW: number, lineH: number, maxLines = 6,
): number {
  const chars = [...text];
  let line = "";
  let lines = 0;
  for (const ch of chars) {
    if (ctx.measureText(line + ch).width > maxW) {
      ctx.fillText(line, x, y + lines * lineH);
      lines++;
      line = ch;
      if (lines >= maxLines - 1) break;
    } else {
      line += ch;
    }
  }
  ctx.fillText(line, x, y + lines * lineH);
  return y + (lines + 1) * lineH;
}
