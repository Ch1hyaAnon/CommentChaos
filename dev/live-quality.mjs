// Uses only fixed, public test seeds. Never prints credentials or raw API errors.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
try {
 const text=await readFile(new URL('../.env.local',import.meta.url),'utf8');
 for(const line of text.split('\n')){
  const m=line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if(m&&!process.env[m[1]])process.env[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');
 }
}catch{}
if(!process.env.DEEPSEEK_API_KEY){console.log('Live integration unavailable: DEEPSEEK_API_KEY missing');process.exit(2);}
globalThis.Deno={env:{get:n=>process.env[n]}};
const {handler}=await import('../functions/handler.ts');
const {search,fetchPage}=await import('../functions/knowledge.ts');
const key=process.env.DEEPSEEK_API_KEY;
// Explicitly verify both tools; generation-only success must not masquerade as retrieval success.
try{
 const results=await search('DeepSeek API Search Fetch 官方文档',key,AbortSignal.timeout(12000));
 console.log('Live Search:',results.length,'results');
 const url=results[0]?.url;
 if(url){const page=await fetchPage(url,key,AbortSignal.timeout(12000));console.log('Live Fetch:',page.length,'characters');}
 else console.log('Live Fetch: not checked (no search results)');
}catch(e){console.log('Live tools unavailable:',/^tool_\d+$/.test(e.message)?e.message:e.name);}
const cases=JSON.parse(await readFile(new URL('./quality-cases.json',import.meta.url),'utf8'));
const selected=process.argv.includes('--all')?cases:[cases[7]];
const records=[];
for(const item of selected){
 const started=Date.now();
 const response=await handler(new Request('http://local/functions/v1/app/generate',{method:'POST',body:JSON.stringify(item)}));
 const data=await response.json();
 records.push({...item,http_status:response.status,elapsed_ms:Date.now()-started,...data});
 console.log(JSON.stringify({community:item.community,ok:data.ok,status:response.status,knowledge:data.knowledge?.status,comments:data.thread?.comments?.length,error:data.error}));
}
await mkdir('artifacts/quality',{recursive:true});
await writeFile(process.argv.includes('--all') ? 'artifacts/quality/live-results.json' : 'artifacts/quality/smoke-results.json',JSON.stringify(records,null,2));
if(records.some(r=>!r.ok))process.exitCode=1;
