// 回归测试：导演模式增量协议（mock，不发真实请求，不读真实密钥）
// 覆盖：完全/近似重复、引用编号全局化与范围、请求锁、旧响应丢弃、handler 集成
import assert from "node:assert/strict";

// ---- Deno shim（handler 需要）----
let apiKeyValue = null;
globalThis.Deno = { env: { get: (n) => (n === "DEEPSEEK_API_KEY" ? apiKeyValue : null) } };

const { validateThread, isNearDup, dedupeComments } = await import("../functions/ai.ts");
const { handler } = await import("../functions/handler.ts");
const { generateThread } = await import("../src/api.ts");

const mk = (over = {}) => ({
  stage: "split", role: "反方", emoji: "😤", name: "甲", text: "默认文本",
  likes: 10, reply_to: null, stance: "oppose", ...over,
});
const wrap = (comments, over = {}) => ({
  title: "测试楼", comments, summary: "总结", hot_search: ["a", "b"],
  heat: 50, conflict: 50, absurdity: 50,
  camps: { support: 40, oppose: 40, neutral: 20 }, fiction_notice: "虚构演绎",
  ...over,
});

const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (e) { results.push(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
};

// ============ 1. 完全重复 ============
await test("完全重复被过滤", () => {
  const existing = ["我真的无语了食堂的香菜奶茶"];
  const raw = wrap([mk({ text: "我真的无语了食堂的香菜奶茶" })]);
  assert.throws(
    () => validateThread(JSON.stringify(raw), { firstTurn: false, baseCount: 1, existingTexts: existing }),
    { message: "no_new_comments" },
  );
});

// ============ 2. 近似重复（标点/语气词差异） ============
await test("近似重复（标点与哈的差异）被过滤", () => {
  assert.ok(isNearDup("太好笑了哈哈哈哈哈！！！", "太好笑了 哈哈哈哈哈"));
  assert.ok(isNearDup("食堂香菜奶茶真的绝了。。", "食堂香菜奶茶真的绝了！！！"));
  assert.ok(!isNearDup("今天食堂的香菜奶茶火了", "我室友凌晨三点还在打游戏连麦"));
});

await test("近似重复混入新内容时只过滤重复项", () => {
  const existing = ["宿舍熄灯后还有人打游戏连麦，声音很大"];
  const raw = wrap([
    mk({ text: "宿舍熄灯后还有人打游戏连麦，声音很大！！！" }), // 近似重复
    mk({ text: "建议直接找辅导员调节，别自己硬扛" }),           // 新内容
  ]);
  const { thread, duplicates } = validateThread(JSON.stringify(raw), {
    firstTurn: false, baseCount: 1, existingTexts: existing,
  });
  assert.equal(thread.comments.length, 1);
  assert.equal(duplicates, 1);
  assert.match(thread.comments[0].text, /辅导员/);
});

// ============ 3. 批内重复 ============
await test("同一批内互相重复只保留第一条", () => {
  const raw = wrap([
    mk({ text: "周报八百字真的离谱啊" }),
    mk({ text: "周报八百字真的离谱！！！" }),
    mk({ text: "我写周报比论文还认真，笑死" }),
  ]);
  const { thread, duplicates } = validateThread(JSON.stringify(raw), {
    firstTurn: false, baseCount: 5, existingTexts: [],
  });
  assert.equal(thread.comments.length, 2);
  assert.equal(duplicates, 1);
});

// ============ 4. 引用编号全局化与范围 ============
await test("导演轮 reply_to 全局号正确换算且只引用已有楼", () => {
  // 已有 10 楼；新增批次 reply_to 输出全局号 3 → 校验后应为 3
  const raw = wrap([
    mk({ text: "新评论一号，回复三楼", reply_to: 3 }),
    mk({ text: "新评论二号，回复上一条", reply_to: 11 }),
    mk({ text: "新评论三号，引用未来楼", reply_to: 99 }),
    mk({ text: "新评论四号，开新话题线", reply_to: 0 }),
  ]);
  const { thread } = validateThread(JSON.stringify(raw), {
    firstTurn: false, baseCount: 10, existingTexts: ["已有楼" + 1],
  });
  const r = thread.comments.map((c) => c.reply_to);
  assert.equal(r[0], 3);   // 已有楼 → 原样
  assert.equal(r[1], 11);  // 批内前一条（全局 11）→ 正确
  assert.equal(r[2], null); // 越界 → 置空
  assert.equal(r[3], null); // 0 → 置空
  // 全部引用都在已有楼 + 批内更早新楼范围内
  const globalNo = (i) => 10 + i + 1;
  thread.comments.forEach((c, i) => {
    if (c.reply_to !== null) {
      assert.ok(c.reply_to >= 1 && c.reply_to < globalNo(i), `引用 ${c.reply_to} 越界`);
    }
  });
});

await test("首轮 reply_to 批内编号直接生效且禁止指向未来", () => {
  const raw = wrap([
    mk({ stage: "resonance", text: "一楼开楼", reply_to: null }),
    mk({ stage: "resonance", text: "二楼跟一楼", reply_to: 1 }),
    mk({ stage: "split", text: "三楼引用了五楼", reply_to: 5 }),
    mk({ stage: "split", text: "四楼开新线", reply_to: null }),
    mk({ stage: "derail", text: "五楼看戏", reply_to: 2 }),
    mk({ stage: "sublimate", text: "六楼收束", reply_to: 1 }),
  ]);
  const { thread } = validateThread(JSON.stringify(raw), {
    firstTurn: true, baseCount: 0, existingTexts: [],
  });
  assert.equal(thread.comments.length, 6);
  assert.equal(thread.comments[1].reply_to, 1);
  assert.equal(thread.comments[2].reply_to, null, "引用未来楼应被置空/修正为前楼");
});

// ============ 5. handler 集成（mock fetch） ============
const realFetch = globalThis.fetch;
// mock 为 DeepSeek/OpenAI chat/completions 响应格式
const openai = (thread) => new Response(
  JSON.stringify({ choices: [{ message: { content: JSON.stringify(thread) } }] }),
  { status: 200, headers: { "Content-Type": "application/json" } },
);
const post = (body) => handler(new Request("http://x/functions/v1/app/generate", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}));

const mkExisting = (n, over = {}) =>
  Array.from({ length: n }, (_, i) => ({ role: `角色${i}`, text: `已有第${i + 1}楼完全不同的原始内容${i}`, ...over }));

await test("handler：导演轮增量返回 + 全局引用", async () => {
  apiKeyValue = "test-key";
  globalThis.fetch = async () => openai(wrap([
    mk({ text: "全新增量评论A，回复三楼", reply_to: 3 }),
    mk({ text: "全新增量评论B，回复A", reply_to: 11 }),
  ]));
  try {
    const res = await post({
      seed: "测试种子", community: "work", director: "louder",
      existing: mkExisting(10), base_count: 10,
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, true);
    assert.equal(data.first_turn, false);
    assert.equal(data.thread.comments.length, 2);
    assert.equal(data.thread.comments[0].reply_to, 3);
    assert.equal(data.thread.comments[1].reply_to, 11);
    assert.equal(data.thread.comments[0].text.includes("已有楼"), false);
  } finally { globalThis.fetch = realFetch; apiKeyValue = null; }
});

await test("handler：上游全重复返回 no_new_comments（200, ok:false）", async () => {
  apiKeyValue = "test-key";
  globalThis.fetch = async () => openai(wrap([
    mk({ text: "已有楼一的内容原样复述" }),
  ]));
  try {
    const res = await post({
      seed: "测试种子", community: "work", director: "continue",
      existing: [{ role: "热评王", text: "已有楼一的内容原样复述" }], base_count: 1,
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.ok, false);
    assert.equal(data.error, "no_new_comments");
  } finally { globalThis.fetch = realFetch; apiKeyValue = null; }
});

await test("handler：首轮无 existing 标记 first_turn 且要求整楼", async () => {
  apiKeyValue = "test-key";
  const texts = [
    "这瓜保熟吗我先问问", "支持楼主，太真实了", "我站反方，楼主偏激了",
    "理性讨论别上升高度", "乐死我了这评论区", "知情人士表示纯属演绎",
    "跑题聊聊食堂新菜", "抱抱楼主别难过", "总结怪来晚了", "热评王的位置我坐了",
  ];
  const ten = texts.map((text, i) =>
    mk({ text, reply_to: i === 0 ? null : 1 }));
  globalThis.fetch = async () => openai(wrap(ten));
  try {
    const res = await post({ seed: "首楼种子", community: "campus" });
    const data = await res.json();
    assert.equal(data.first_turn, true);
    assert.equal(data.thread.comments.length, 10);
  } finally { globalThis.fetch = realFetch; apiKeyValue = null; }
});

// ============ 6b. base_count / 截断语义 / 上限 ============
await test("handler：缺 base_count 拒绝（不静默重置编号）", async () => {
  apiKeyValue = "test-key";
  try {
    const res = await post({
      seed: "测试种子", community: "work", director: "continue",
      existing: mkExisting(10),
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.error, "invalid_base_count");
  } finally { apiKeyValue = null; }
});

await test("handler：base_count 小于已传楼数拒绝", async () => {
  apiKeyValue = "test-key";
  try {
    const res = await post({
      seed: "测试种子", community: "work", director: "continue",
      existing: mkExisting(10), base_count: 5,
    });
    assert.equal((await res.json()).error, "invalid_base_count");
  } finally { apiKeyValue = null; }
});

await test("handler：超过 200 楼上限显式拒绝 thread_too_long", async () => {
  apiKeyValue = "test-key";
  try {
    const res = await post({
      seed: "测试种子", community: "work", director: "continue",
      existing: mkExisting(40), base_count: 201,
    });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error, "thread_too_long");
  } finally { apiKeyValue = null; }
});

await test("handler：>40 楼时全局编号按真实 base_count 延续", async () => {
  apiKeyValue = "test-key";
  let captured = null;
  globalThis.fetch = async (_u, init) => {
    captured = JSON.parse(init.body);
    return openai(wrap([
      mk({ text: "第 51 楼新评论，回复 47 楼", reply_to: 47 }),
      mk({ text: "第 52 楼新评论，回复 51 楼", reply_to: 51 }),
    ]));
  };
  try {
    const res = await post({
      seed: "测试种子", community: "work", director: "louder",
      existing: mkExisting(50), base_count: 50, // 客户端只传末 40 条
    });
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.base_count, 50);
    // digest 近期窗口（末 8 楼）使用真实全局编号 43..50
    const prompt = captured.messages.map((m) => m.content).join("\n");
    assert.match(prompt, /43楼\[/, "摘要应从 43 楼开始（50-8+1）");
    assert.doesNotMatch(prompt, /1楼\[/, "不得把近期楼重置为 1 楼起编号");
    assert.doesNotMatch(prompt, /41楼\[/, "不得按截断后的 40 条重置编号");
    const [c1, c2] = data.thread.comments;
    assert.equal(c1.no, 51);
    assert.equal(c2.no, 52);
    assert.equal(c1.reply_to, 47); // 引用近期窗口内的已有楼
    assert.equal(c2.reply_to, 51); // 批内引用重映射到新编号
  } finally { globalThis.fetch = realFetch; apiKeyValue = null; }
});

await test("validateThread：批内中间楼被过滤后引用号重映射", () => {
  const existing = ["已有楼A的原始内容"];
  const raw = wrap([
    mk({ text: "新评论一，回复已有楼", reply_to: 1 }),
    mk({ text: "已有楼A的原始内容！！！" }),      // 近似重复 → 被过滤
    mk({ text: "新评论三，回复被过滤的二楼", reply_to: 3 }), // 3 = baseCount(1)+2 → 指向批内第2项
  ]);
  const { thread } = validateThread(JSON.stringify(raw), {
    firstTurn: false, baseCount: 1, existingTexts: existing,
  });
  assert.equal(thread.comments.length, 2);
  const [a, b] = thread.comments;
  assert.equal(a.no, 2);            // 连续编号：2
  assert.equal(a.reply_to, 1);      // 已有楼不变
  assert.equal(b.no, 3);            // 连续编号：3
  assert.equal(b.reply_to, 2);      // 原指向被过滤楼 → 改指之前最近的保留新楼
});

await test("validateThread：批内引用被过滤楼且无前序保留楼时置空", () => {
  const long = "已有楼一的原始内容写长一点凑够十四个字以上";
  const raw = wrap([
    mk({ text: long + "！！！" }),               // 近似重复（包含式）→ 被过滤
    mk({ text: "新评论，回复被过滤的一楼", reply_to: 2 }),
  ]);
  const { thread } = validateThread(JSON.stringify(raw), {
    firstTurn: false, baseCount: 1, existingTexts: [long],
  });
  assert.equal(thread.comments.length, 1);
  assert.equal(thread.comments[0].reply_to, null);
});

// ============ 7. 请求锁（同刻连点）——模式复刻，非真实 App 集成 ============
// 说明：此处复刻 App.runGenerate 的 ref 锁判定模式；
// 真实 App 行为由浏览器连点测试验收（见 dev 测试记录）。
await test("请求锁：同一时刻并发点击只放行一次", async () => {
  // 复刻 App.runGenerate 的 ref 锁模式
  const busyRef = { current: false };
  let entered = 0, completed = 0;
  const guardedRun = async () => {
    if (busyRef.current) return "blocked";
    busyRef.current = true;
    try {
      entered++;
      await new Promise((r) => setTimeout(r, 30));
      completed++;
      return "ran";
    } finally { busyRef.current = false; }
  };
  const [a, b, c] = await Promise.all([guardedRun(), guardedRun(), guardedRun()]);
  assert.equal(entered, 1);
  assert.equal(completed, 1);
  assert.equal(a, "ran");
  assert.equal(b, "blocked");
  assert.equal(c, "blocked");
});

// ============ 8. 旧响应丢弃（会话版本）——模式复刻，非真实 App 集成 ============
// 说明：复刻 App 的 sessionRef 判定模式；真实行为由浏览器开楼中重开楼的验收覆盖。
await test("会话版本：重开楼后旧请求的响应不回流", async () => {
  const sessionRef = { current: 1 };
  const comments = [];
  // 模拟：请求发出（session 1），期间用户重开楼（session 2），旧响应到达
  const late = (async () => {
    await new Promise((r) => setTimeout(r, 20));
    return ["旧响应评论"];
  })();
  sessionRef.current = 2; // 重开楼
  const payload = await late;
  if (sessionRef.current !== 2) throw new Error("session 检查失败");
  // App 的判定：mySession !== sessionRef.current 时 return（此处 mySession 为 1）
  const mySession = 1;
  if (mySession === sessionRef.current) comments.push(...payload); // 不应执行
  assert.equal(comments.length, 0, "旧响应不得回流");
});

await test("generateThread：真实 api 层把 no_new_comments 转为可捕获错误", async () => {
  globalThis.fetch = async () => new Response(
    JSON.stringify({ ok: false, error: "no_new_comments" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
  try {
    await generateThread({ seed: "x", community: "work" });
    assert.fail("应当抛错");
  } catch (e) {
    assert.equal(e.message, "no_new_comments");
  } finally { globalThis.fetch = realFetch; }
});

await test("generateThread：abort 信号传播", async () => {
  globalThis.fetch = async (_u, init) => {
    return new Promise((_res, rej) => {
      init.signal.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")));
    });
  };
  const c = new AbortController();
  const p = generateThread({ seed: "x", community: "work" }, c.signal);
  c.abort();
  try {
    await p;
    assert.fail("应当抛错");
  } catch (e) {
    assert.equal(e.message, "aborted");
  } finally { globalThis.fetch = realFetch; }
});

console.log(results.join("\n"));
console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} 通过`);
