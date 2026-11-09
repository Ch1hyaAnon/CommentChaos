// 评论区叠叠乐 唯一入口：/functions/v1/app
// 路由：GET /trending、POST /generate、GET /health
import {
  buildSystemPrompt, buildUserPrompt, callDeepSeek, validateThread,
  type CommunityId, type DirectorAction,
} from "./ai.ts";
import { getTrending } from "./trending.ts";

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const fail = (error: string, status = 400) =>
  Response.json({ ok: false, error }, { status, headers: jsonHeaders });

const COMMUNITY_IDS = ["campus", "anime", "game", "work", "emotion", "chaos"];
const ACTION_IDS = ["continue", "louder", "rational", "insider", "derail", "finale"];

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // 网关发布版会替换函数名段；按尾部子路由识别
  const m = url.pathname.match(/\/(trending|generate|health)\/?$/);
  const route = m ? m[1] : "";

  if (request.method === "GET" && route === "health") {
    return Response.json({ ok: true, service: "comment-chaos" }, { headers: jsonHeaders });
  }

  if (request.method === "GET" && route === "trending") {
    const keyword = url.searchParams.get("q");
    if (keyword && keyword.length > 40) return fail("invalid_keyword");
    const result = await getTrending(keyword);
    if (!result.ok) {
      return Response.json(
        { ok: false, error: "trending_unavailable", degraded: true, items: [] },
        { status: 200, headers: jsonHeaders },
      );
    }
    return Response.json(
      { ok: true, items: result.items, degraded: result.degraded },
      { headers: jsonHeaders },
    );
  }

  if (request.method === "POST" && route === "generate") {
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return fail("service_not_configured", 503);

    let body: any;
    try {
      const text = await request.text();
      if (text.length > 12000) return fail("payload_too_large", 413);
      body = JSON.parse(text);
    } catch {
      return fail("invalid_body");
    }

    const seed = typeof body?.seed === "string" ? body.seed.trim() : "";
    if (!seed) return fail("empty_seed");
    if (seed.length > 200) return fail("seed_too_long");

    const community: CommunityId = COMMUNITY_IDS.includes(body?.community)
      ? body.community
      : "chaos";
    const director: DirectorAction | null = ACTION_IDS.includes(body?.director)
      ? body.director
      : null;

    // 已有楼层：真实全局楼数 base_count + 近期楼层列表（客户端发末 40 条，服务端再防御性截尾）
    // 全局编号 = base_count - existing.length + 位置 + 1，绝不静默重置编号
    const MAX_FLOORS = 200;
    const existingRaw: unknown[] = Array.isArray(body?.existing) ? body.existing : [];
    const recentRaw = existingRaw.slice(-40);
    const existing: { no: number; role: string; text: string }[] = [];
    for (let i = 0; i < recentRaw.length; i++) {
      const e: any = recentRaw[i];
      if (!e || typeof e !== "object" || typeof e.text !== "string" || !e.text.trim()) continue;
      existing.push({
        no: i + 1, // 占位，下方按 baseCount 换算真实编号
        role: typeof e.role === "string" ? e.role.slice(0, 12) : "网友",
        text: e.text.trim().slice(0, 120),
      });
    }

    const firstTurn = existing.length === 0;
    let baseCount = existing.length;
    if (!firstTurn) {
      const claimed = body?.base_count;
      if (typeof claimed !== "number" || !Number.isInteger(claimed)) {
        return fail("invalid_base_count");
      }
      if (claimed < existing.length || claimed > MAX_FLOORS) {
        if (claimed > MAX_FLOORS) return fail("thread_too_long", 413);
        return fail("invalid_base_count");
      }
      baseCount = claimed;
      // 真实全局编号：第 i 条（0 基）= baseCount - existing.length + i + 1
      for (let i = 0; i < existing.length; i++) {
        existing[i].no = baseCount - existing.length + i + 1;
      }
    }

    let historyDigest = "";
    if (!firstTurn) {
      const recent = existing.slice(-8);
      historyDigest = recent
        .map((e) => `${e.no}楼[${e.role}] ${e.text}`)
        .join("\n")
        .slice(0, 1600);
    }

    const newsContext =
      typeof body?.news_context === "string" ? body.news_context.slice(0, 400) : "";

    try {
      const content = await callDeepSeek(
        buildSystemPrompt(firstTurn),
        buildUserPrompt(seed, community, director, historyDigest, newsContext),
        apiKey,
      );
      const { thread, duplicates } = validateThread(content, {
        firstTurn,
        baseCount,
        existingTexts: existing.map((e) => e.text),
      });
      return Response.json(
        { ok: true, thread, duplicates, first_turn: firstTurn, base_count: baseCount },
        { headers: jsonHeaders },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const map: Record<string, number> = {
        upstream_auth: 502, upstream_quota: 502, upstream_busy: 503,
        upstream_error: 502, bad_json: 502, bad_schema: 502,
        too_few_comments: 502, empty_upstream: 502,
      };
      if (msg === "no_new_comments") {
        return Response.json(
          { ok: false, error: "no_new_comments" },
          { status: 200, headers: jsonHeaders },
        );
      }
      const status = map[msg] ?? 500;
      const err = msg === "The operation was aborted" ? "upstream_timeout" : msg;
      return fail(map[err] ? err : "generation_failed", status);
    }
  }

  return Response.json(
    { ok: false, error: "not_found", path: url.pathname },
    { status: 404, headers: jsonHeaders },
  );
}
