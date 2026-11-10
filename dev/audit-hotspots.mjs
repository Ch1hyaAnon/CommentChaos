// Explicit local diagnostics for public hotlists. Never serialize credentials or private seeds.
import {mkdir,writeFile} from 'node:fs/promises';
if(!process.env.DEEPSEEK_API_KEY){console.log('DEEPSEEK_API_KEY missing');process.exit(2);}
globalThis.Deno={env:{get:n=>process.env[n]}};
const {getTrending}=await import('../functions/trending.ts');
const {handler}=await import('../functions/handler.ts');
const key=process.env.DEEPSEEK_API_KEY;
const nativeFetch=globalThis.fetch;
const records=[],captures=[];
let label='hotlists';
globalThis.fetch=async(input,init={})=>{
 const url=String(input),start=Date.now(),record={label,url,method:init.method??'GET',started_at:new Date().toISOString()};records.push(record);
 if(init.body){try{const body=JSON.parse(init.body);record.request=url.includes('chat/completions')?{model:body.model,system:body.messages?.[0]?.content,data:body.messages?.[1]?.content}:body;}catch{}}
 try{const r=await nativeFetch(input,init);record.status=r.status;record.elapsed_ms=Date.now()-start;
  captures.push(r.clone().text().then(text=>{try{record.response=JSON.parse(text);}catch{record.response=text.slice(0,500);}}).catch(()=>{record.capture_failed=true;}));return r;
 }catch(e){record.error=e.name;record.elapsed_ms=Date.now()-start;throw e;}
};
const output={started_at:new Date().toISOString(),lists:{},runs:[],records};
await mkdir('artifacts/hotspots',{recursive:true});
const path=`artifacts/hotspots/audit-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
const save=async()=>{await Promise.allSettled(captures);await writeFile(path,JSON.stringify(output,null,2).split(key).join('[REDACTED]'));};
const single=process.argv.find(a=>a.startsWith('--single='))?.slice(9);
const communities=single?[single.split(':')[0]]:['game','work','emotion'];
for(const community of communities){
 label=`list:${community}`;const start=Date.now();const result=await getTrending(single?.split(':')[1]??null,community,key);output.lists[community]={...result,elapsed_ms:Date.now()-start};
 console.log(JSON.stringify({stage:'list',community,elapsed_ms:Date.now()-start,degraded:result.degraded,items:result.items.map(i=>({id:i.id,title:i.title,description_chars:i.description.length,platform:i.platform}))}));await save();
}
if(!process.argv.includes('--lists')){
 for(const community of communities){
  for(const item of output.lists[community].items.slice(0,single?1:2)){
   label=`generate:${community}:${item.id}`;const start=Date.now(),events=[];
   const response=await handler(new Request('http://audit.local/generate',{method:'POST',body:JSON.stringify({seed:item.title.slice(0,200),community,hotspot_id:item.id})}),{onEvent:e=>events.push(e),onError:e=>events.push({error:e})});
   const body=await response.json();output.runs.push({community,item,status:response.status,elapsed_ms:Date.now()-start,events,result:body});
   console.log(JSON.stringify({stage:'generate',community,id:item.id,status:response.status,elapsed_ms:Date.now()-start,error:body.error,points:body.hotspot_context?.points.length,comments:body.thread?.comments.map(c=>c.text)}));await save();
  }
 }
}
await save();console.log(JSON.stringify({artifact:path,runs:output.runs.length}));
