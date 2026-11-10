// Diagnostic only: execute the real handler once in a fresh process and capture public test traffic.
// Credentials are never serialized. Intended for explicit, non-private diagnostic seeds.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const key=process.env.DEEPSEEK_API_KEY;
if(!key)throw Error('DEEPSEEK_API_KEY is required; use node --env-file=.env.local');
const seed=process.argv[2]||'如何评价bin';
const community=process.argv[3]||'game';
const start=Date.now();
const records=[];const events=[];const captures=[];const diagnostics=[];
const nativeFetch=globalThis.fetch;
const nativeInfo=console.info;
const clean=value=>typeof value==='string'?value.split(key).join('[REDACTED]'):value;
const stage=(url,body)=>{
 if(url.includes('/chat/completions')){
  const system=body?.messages?.[0]?.content||'';
  return system.includes('实体确认与检索排序器')?'3c. 联合实体确认与排序':system.includes('检索规划器')?'1. AI关键词规划':system.includes('表达素材筛选员')?'4. AI梗筛选与衍生整理':'5. AI评论生成';
 }
 if(url.includes('cnmeme.wiki'))return url.includes('?')?'3a. 梗Wiki关键词查询':'3b. 梗Wiki详情读取';
 return url.endsWith('/search')?'2a. 事实Search':url.endsWith('/fetch')?'2b. 事实Fetch':'其他HTTP请求';
};
globalThis.fetch=async(input,init={})=>{
 const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
 let body=init.body??null;try{body=JSON.parse(body);}catch{}
 const headers=Object.fromEntries(new Headers(init.headers));
 for(const name of Object.keys(headers))if(/authorization|cookie|key|token/i.test(name))headers[name]='[REDACTED]';
 const record={id:records.length+1,stage:stage(url,body),started_at:new Date().toISOString(),start_ms:Date.now()-start,request:{method:init.method||'GET',url,headers,body}};
 records.push(record);
 try{
  const response=await nativeFetch(input,init);
  record.http_status=response.status;record.response_headers=Object.fromEntries(response.headers);
  for(const name of Object.keys(record.response_headers))if(/cookie|token|key/i.test(name))record.response_headers[name]='[REDACTED]';
  const copy=response.clone();
  captures.push(copy.text().then(raw=>{
    const text=clean(raw);
    try{record.response=JSON.parse(text);}catch{record.response=text;}
    record.elapsed_ms=Date.now()-start-record.start_ms;
    console.log(JSON.stringify({id:record.id,stage:record.stage,status:response.status,elapsed_ms:record.elapsed_ms}));
  }).catch(e=>{record.capture_error={name:e.name,message:clean(e.message)};}));
  return response;
 }catch(e){record.elapsed_ms=Date.now()-start-record.start_ms;record.error={name:e.name,message:clean(e.message)};console.log(JSON.stringify({id:record.id,stage:record.stage,error:e.name,elapsed_ms:record.elapsed_ms}));throw e;}
};
console.info=(...args)=>{events.push({at_ms:Date.now()-start,message:clean(args.map(String).join(' '))});};
globalThis.Deno={env:{get:name=>process.env[name]}};
const {handler}=await import('../functions/handler.ts');
const request={seed,community};
let result;
try{const response=await handler(new Request('http://diagnostic.local/functions/v1/app/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request)}), {onEvent:e=>diagnostics.push(e),onError:e=>diagnostics.push({diagnostic_error:e})});result={http_status:response.status,body:await response.json()};}
finally{globalThis.fetch=nativeFetch;console.info=nativeInfo;}
await Promise.allSettled(captures);
const generation=records.find(r=>r.stage==='5. AI评论生成');
let context=null;
try{context=JSON.parse(generation.request.body.messages[1].content.split('\n')[1]);}catch{}
const trace={input:request,started_at:new Date(start).toISOString(),timezone:'Asia/Shanghai',fresh_process:true,notes:['调用的是当前生产handler代码，未注入mock，独立进程无缓存命中。','请求头中的密钥已移除。其他请求体、提示词、响应正文保留。','事实检索与梗检索并行，记录按发起时间编号；返回顺序可能不同。','AI记录只含API可见请求/响应，不包含模型内部推理。'],elapsed_ms:Date.now()-start,records,events,diagnostics,final_generation_context:context,result};
const dir=resolve('artifacts/traces');await mkdir(dir,{recursive:true});
const base=`bin-${new Date(start).toISOString().replace(/[:.]/g,'-')}`;
const jsonPath=resolve(dir,`${base}.json`),mdPath=resolve(dir,`${base}.md`);
const json=value=>clean(JSON.stringify(value,null,2));
await writeFile(jsonPath,json(trace));
let markdown=`# “${seed}”完整调用记录\n\n- 输入：${json(request)}\n- 时间：${new Date(start).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}（北京时间）\n- 独立进程、当前handler、无mock、无已有缓存\n- 总耗时：${trace.elapsed_ms}ms\n- 事实和梗检索并行；以下按请求发起顺序列出。密钥已隐去，模型内部推理不可见。\n\n## 调用概览\n\n| ID | 阶段 | 发起偏移ms | 耗时ms | HTTP |\n|---|---|---:|---:|---|\n`;
for(const r of records)markdown+=`| ${r.id} | ${r.stage} | ${r.start_ms} | ${r.elapsed_ms} | ${r.http_status??r.error?.name} |\n`;
for(const r of records)markdown+=`\n## ${r.id}. ${r.stage}\n\n### 完整请求\n\n\`\`\`json\n${json(r.request)}\n\`\`\`\n\n### 完整返回\n\n\`\`\`json\n${json(r.error??{http_status:r.http_status,headers:r.response_headers,body:r.response})}\n\`\`\`\n`;
markdown+=`\n## 结构化阶段与异常\n\n\`\`\`json\n${json(diagnostics)}\n\`\`\`\n\n## 应用阶段日志\n\n\`\`\`json\n${json(events)}\n\`\`\`\n\n## 最终实际注入的资料\n\n\`\`\`json\n${json(context)}\n\`\`\`\n\n## 应用最终响应（含完整评论）\n\n\`\`\`json\n${json(result)}\n\`\`\`\n`;
await writeFile(mdPath,markdown);
console.log(JSON.stringify({trace_json:jsonPath,trace_markdown:mdPath,total_ms:trace.elapsed_ms,result_status:result.http_status,ok:result.body.ok,knowledge:result.body.knowledge?.status,memes:result.body.meme_context?.status}));
if(!result.body.ok)process.exitCode=1;
