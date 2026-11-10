// 评论区叠叠乐 唯一入口：/functions/v1/app
// 路由：GET /trending、POST /generate、GET /health
import {
  buildSystemPrompt, buildUserPrompt, callDeepSeek, validateThread,
  type CommunityId, type DirectorAction,
} from "./ai.ts";
import { retrieveContext } from "./retrieval.ts";
import { createTrace, type DiagnosticOptions } from "./diagnostics.ts";
import { selectMemes, memeVersion } from "./memes.ts";
import { reviewEventThread } from "./event-review.ts";
import { hotspotSessions } from "./hotspot.ts";
import { getTrending, resolveHotspot } from "./trending.ts";

const jsonHeaders = { "Content-Type": "application/json", "Cache-Control": "no-store" };


const COMMUNITY_IDS = ["campus", "anime", "game", "work", "emotion", "chaos"];
const ACTION_IDS = ["continue", "louder", "rational", "insider", "derail", "finale"];

export async function handler(request: Request, diagnostic: DiagnosticOptions = {}): Promise<Response> {
  const trace = createTrace(diagnostic, Deno.env.get("DEEPSEEK_API_KEY") ?? "");
  const fail = (error: string, status = 400) => Response.json({ ok: false, error, trace_id: trace.id }, { status, headers: jsonHeaders });
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
    const requested = url.searchParams.get("community");
    const community: CommunityId = COMMUNITY_IDS.includes(requested ?? "") ? requested as CommunityId : "chaos";
    const result = await getTrending(keyword, community, Deno.env.get("DEEPSEEK_API_KEY") ?? "");
    return Response.json(result, { headers: jsonHeaders });
  }

  if (request.method === "POST" && route === "generate") {
    const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!apiKey) return fail("service_not_configured", 503);

    let body: any;
    try {
      const text = await request.text();
      if (text.length > 30000) return fail("payload_too_large", 413);
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
      const recent = existing.slice(-40);
      historyDigest = recent
        .map((e) => `${e.no}楼[${e.role}] ${e.text}`)
        .join("\n")
        .slice(0, 10000);
    }

    const newsContext =
      typeof body?.news_context === "string" ? body.news_context.slice(0, 400) : "";

    const hotspotId = typeof body?.hotspot_id === "string" ? body.hotspot_id.slice(0, 100) : "";
    const token = typeof body?.hotspot_token === "string" ? body.hotspot_token.slice(0, 100) : "";
    const userSupplement = typeof body?.hotspot_supplement === "string" ? body.hotspot_supplement.trim().slice(0, 3000) : "";
    let stage = "retrieval";
    try {
      let enrichment;
      if (hotspotId && !firstTurn) {
        enrichment = hotspotSessions.get(token, hotspotId);
        if (!enrichment) return fail("hotspot_expired", 410);
        enrichment = { ...enrichment, cache_hit: true, counts: { ...enrichment.counts, ai_calls: 0, fact_queries: 0, fact_pages: 0, meme_queries: 0, details: 0 } };
        trace.emit("hotspot_snapshot", { status: "hit", count: enrichment.hotspot_context?.points.length });
      } else {
        const hotspot = hotspotId ? await resolveHotspot(hotspotId) : null;
        if (hotspotId && !hotspot) return fail("hotspot_expired", 410);
        enrichment = await retrieveContext(seed, community, hotspot ? `${hotspot.title}\n${hotspot.description.slice(0,600)}\n用户补充（未核实，仅检索线索）：${userSupplement}` : newsContext, apiKey, trace, hotspot ?? undefined);
      }
      if (enrichment.hotspot_context?.status === "insufficient") {
        trace.emit("hotspot_gate", { status: "paused", reason: "insufficient_details", count: enrichment.hotspot_context.points.length });
        return fail("hotspot_content_insufficient", 422);
      }
      if (enrichment.entity.status === "ambiguous") {
        const unavailable = enrichment.meme_status === "unavailable" || enrichment.stages.filter(s => s.stage === "fact_query" && s.status === "failed").length === enrichment.counts.fact_queries;
        if (unavailable) return fail("retrieval_unavailable", 503);
        trace.emit("entity", { status: "ambiguous" });
        return Response.json({ ok: false, error: "entity_ambiguous", trace_id: trace.id,
          retrieval: { entity: enrichment.entity, counts: enrichment.counts, stages: enrichment.stages, strategy_version: enrichment.strategy_version } }, { status: 409, headers: jsonHeaders });
      }
      const knowledge = enrichment.knowledge;
      const wikiMemes = enrichment.memes.filter(m => !historyDigest.includes(m.phrase));
      const memes = enrichment.meme_status === "ready" ? wikiMemes : selectMemes(`${seed} ${newsContext}`, community, historyDigest);
      const counts = { ...enrichment.counts, injected: memes.length };
      trace.emit("injection", { status: "ok", count: memes.length, source_ids: wikiMemes.map(m => m.id) });
      const memeContext = { status: enrichment.meme_status, reason: enrichment.meme_reason, retrieved_at: enrichment.retrieved_at,
        sources: wikiMemes.map(m => ({ title: m.phrase, url: m.source_url, updated_at: m.updated_at })) };
      stage = "generation";
      const content = await callDeepSeek(
        buildSystemPrompt(firstTurn, !!enrichment.hotspot_context),
        buildUserPrompt(seed, community, director, historyDigest, newsContext, { firstTurn, baseCount, knowledge, memes, hotspot: enrichment.hotspot_context, userSupplement }),
        apiKey,
        { onResult: result => trace.emit("generation", { status: "model_returned", ...result }) },
      );
      stage = "validation";
      let { thread, duplicates } = validateThread(content, {
        firstTurn,
        baseCount,
        existingTexts: existing.map((e) => e.text),
        onRepair: () => trace.emit("validation", { status: "normalized", reason: "unescaped_json_control" }),
      });
      if (enrichment.hotspot_context) {
        stage = "event_review";
        thread = await reviewEventThread(thread, enrichment.hotspot_context, knowledge, apiKey, trace, firstTurn);
        // Recheck lengths, duplicates and reply numbering after factual text corrections.
        stage = "validation";
        const reviewed = validateThread(JSON.stringify(thread), { firstTurn, baseCount, existingTexts: existing.map(e => e.text) });
        thread = reviewed.thread; duplicates += reviewed.duplicates;
      }
      trace.emit("validation", { status: "ok", count: thread.comments.length });
      const hotspotToken = hotspotId ? (firstTurn ? hotspotSessions.put(hotspotId, enrichment) : token) : undefined;
      const metadata = { ...knowledge, sources: knowledge.sources.map(({ excerpt: _excerpt, ...source }) => source) };
      return Response.json(
        { ok: true, hotspot_context: enrichment.hotspot_context, hotspot_token: hotspotToken, thread, duplicates, first_turn: firstTurn, base_count: baseCount, knowledge: metadata, meme_context: memeContext, meme_version: enrichment.meme_status === "ready" ? "cnmeme-v1" : memeVersion, trace_id: trace.id, retrieval: { entity: enrichment.entity, counts, stages: enrichment.stages, strategy_version: enrichment.strategy_version, cache_hit: enrichment.cache_hit ?? false } },
        { headers: jsonHeaders },
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      const map: Record<string, number> = {
        hotspot_generation_ungrounded: 502, retrieval_busy: 503, upstream_auth: 502, upstream_quota: 502, upstream_busy: 503,
        upstream_network_error: 502, upstream_error: 502, upstream_timeout: 504, upstream_bad_response: 502, upstream_truncated: 502, bad_json: 502, bad_schema: 502,
        too_few_comments: 502, empty_upstream: 502,
      };
      const err = (e instanceof Error && e.name === "AbortError") || msg === "The operation was aborted" ? "upstream_timeout" : msg;
      trace.error(stage, e);
      trace.emit(stage, { status: "failed", reason: map[err] || err === "no_new_comments" ? err : "generation_failed" });
      if (msg === "no_new_comments") {
        return Response.json(
          { ok: false, error: "no_new_comments", trace_id: trace.id },
          { status: 200, headers: jsonHeaders },
        );
      }
      const status = map[err] ?? 500;
      return fail(map[err] ? err : "generation_failed", status);
    }
  }

  return Response.json(
    { ok: false, error: "not_found", path: url.pathname },
    { status: 404, headers: jsonHeaders },
  );
}
