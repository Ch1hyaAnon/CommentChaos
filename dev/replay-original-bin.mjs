// Offline transport/validation comparison only; never makes a network request.
import{readFile,writeFile}from'node:fs/promises';
import{callDeepSeek,validateThread}from'../functions/ai.ts';
import{createTrace}from'../functions/diagnostics.ts';
const path='artifacts/traces/bin-2026-11-10T04-35-18-209Z.json';
const recorded=JSON.parse(await readFile(path,'utf8'));
const generation=recorded.records.find(r=>r.stage==='5. AI评论生成');
const originalFetch=globalThis.fetch,originalInfo=console.info;
const results=[];
try{
 for(const mode of ['old_sync_copy','new_async_copy']){
  const captures=[];const errors=[];
  globalThis.fetch=async()=>{
   const response=Response.json(generation.response);
   if(mode==='old_sync_copy')await response.clone().text();
   else captures.push(response.clone().text());
   return response;
  };
  const trace=createTrace({onError:e=>errors.push(e),onEvent:()=>{throw Error('diagnostic observer failed');}});
  console.info=()=>{throw Error('diagnostic logger failed');};
  try{
   const content=await callDeepSeek(generation.request.body.messages[0].content,generation.request.body.messages[1].content,'offline-placeholder',{onResult:r=>trace.emit('generation',r)});
   const{thread,duplicates}=validateThread(content,{firstTurn:true,baseCount:0,existingTexts:[]});
   trace.emit('validation',{status:'ok',count:thread.comments.length});await Promise.all(captures);
   results.push({mode,ok:true,comments:thread.comments.length,duplicates,errors});
  }catch(e){trace.error('replay',e);results.push({mode,ok:false,errors});}
 }
}finally{globalThis.fetch=originalFetch;console.info=originalInfo;}
const report={note:'离线回放首次记录中的真实生成响应；对比旧同步复制和新异步复制，并注入日志/观察者异常。不代表原始500根因已被定位，也不包含新的外部调用。',source:path,results,historical_500_root_cause:'not_reproduced_unresolved'};
await writeFile('artifacts/traces/bin-original-response-replay.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
if(results.some(r=>!r.ok))process.exitCode=1;
