// Five fresh Node processes; each invokes the real current handler, never shared caches.
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const results=[];
for(let run=1;run<=5;run++){
 const child=spawn(process.execPath,['--env-file=.env.local','dev/trace-generation.mjs','如何评价bin','game'],{stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
 const code=await new Promise(resolve=>child.on('exit',resolve));
 const summary=stdout.trim().split('\n').map(line=>{try{return JSON.parse(line);}catch{return null;}}).findLast(value=>value?.trace_json);
 if(!summary){results.push({run,exit_code:code,error:'trace_not_written'});console.log(JSON.stringify(results.at(-1)));continue;}
 const trace=JSON.parse(await readFile(summary.trace_json,'utf8'));
 const wikiQueries=trace.records.filter(r=>r.stage==='3a. 梗Wiki关键词查询');
 const wrongSource=trace.final_generation_context?.factual_sources?.sources.some(s=>/wordnet|dictionary|词典/i.test(s.title));
 const checks={queried_anchor:wikiQueries.some(r=>new URL(r.request.url).searchParams.get('q').toLowerCase()==='bin'),no_dictionary:!wrongSource,success:trace.result.http_status===200,entity_resolved:trace.result.body.retrieval?.entity?.status==='resolved'};
 const result={run,exit_code:code,trace_json:summary.trace_json,trace_markdown:summary.trace_markdown,total_ms:trace.elapsed_ms,http_status:trace.result.http_status,trace_id:trace.result.body.trace_id,checks,entity:trace.result.body.retrieval?.entity?.name,meme_status:trace.result.body.meme_context?.status,meme_sources:trace.result.body.meme_context?.sources.map(s=>s.title),counts:trace.result.body.retrieval?.counts,error:trace.result.body.error,diagnostic_errors:trace.diagnostics?.filter(e=>e.diagnostic_error)};
 results.push(result);console.log(JSON.stringify(result));
}
await mkdir('artifacts/traces',{recursive:true});await writeFile('artifacts/traces/bin-fixed-cold-audit.json',JSON.stringify(results,null,2));
if(results.length!==5||results.some(r=>!r.checks||Object.values(r.checks).some(v=>!v)))process.exitCode=1;
