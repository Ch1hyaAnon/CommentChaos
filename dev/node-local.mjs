// 本地 Node 运行时替代 Deno：校验 handler 路由与真实外部调用（不进入部署包）
// 密钥从本地 .env.local 读取（gitignored，不进命令行/日志/产物）
import { readFileSync } from "node:fs";
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
} catch {
  // 无 .env.local 时按未配置处理
}

globalThis.Deno = {
  env: {
    get(name) {
      if (name === "DEEPSEEK_API_KEY") {
        const v = process.env.DEEPSEEK_API_KEY;
        return v && v.length > 0 ? v : null;
      }
      return null;
    },
  },
};

const { handler } = await import("../functions/handler.ts");
const port = Number(process.env.PORT || 8000);

const http = await import("node:http");
const s = http.createServer(async (req, res) => {
  const url = `http://127.0.0.1:${port}${req.url}`;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks).toString("utf8") : undefined;
  const request = new Request(url, {
    method: req.method,
    headers: req.headers,
    body: body && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
  });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
});
s.listen(port, "127.0.0.1", () => {
  console.log(`local function on http://127.0.0.1:${port}`);
});
