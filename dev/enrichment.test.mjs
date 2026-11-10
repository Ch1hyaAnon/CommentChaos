import{test}from'node:test';
import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{parseRetrievalPlan}from'../functions/retrieval-plan.ts';
import{validateAssessment,tokenMatch,unsuitableMaterial,factMatches,createRetrievalService}from'../functions/retrieval.ts';
import{createTrace}from'../functions/diagnostics.ts';
import fixture from'./fixtures/bin-retrieval.json'with{type:'json'};
const nativeFetch=globalThis.fetch;
const nativeInfo=console.info;
const run=fn=>async()=>{try{await fn();}finally{globalThis.fetch=nativeFetch;console.info=nativeInfo;}};
const fact=(r)=>({...r,summary:r.summary||r.snippet||'',snippet:r.snippet||'',date:r.date??null,authority:r.authority??0,rerank_score:r.rerank_score??0});
const facts=fixture.search.results.map(fact);
const entries=[...new Map(fixture.wiki_lists.flatMap(l=>l.items).map(e=>[e.slug,{...e,aliases:e.aliases??[],keywords:e.keywords??[],tags:e.tags??[],source_video:e.source_video??null}])).values()];
const plan=parseRetrievalPlan(JSON.stringify({fact_query:'bin 评价',meme_keywords:['评价','上单']}),'如何评价bin');
const assessment=()=>({entity:{status:'resolved',name:'Bin',aliases:['Bin','模型编造的别名'],source_ids:['f0'],evidence:facts[0].title},facts:[{id:'f0',evidence:facts[0].title}],memes:entries.map(e=>({slug:e.slug,priority:1,evidence:e.title,reason:'同领域'}))});
test('recorded empty plan preserves bin and removes generic query terms',()=>{
 const p=parseRetrievalPlan(JSON.stringify(fixture.first_plan),'如何评价bin');assert.deepEqual(p.meme_keywords,['bin']);assert.equal(p.entity_required,true);
 assert.deepEqual(plan.meme_keywords,['bin','上单']);
});
test('recorded WordNet results cannot establish a gaming entity even at high scores',()=>{
 const wordnet=fixture.first_searches[1].results.map(fact).find(r=>r.title==='WordNet Search');assert.ok(wordnet);
 assert.equal(factMatches(wordnet,['bin'],'game',true),false);
 const a=validateAssessment(JSON.stringify({entity:{status:'resolved',name:'bin',aliases:['bin'],source_ids:['f0'],evidence:wordnet.title},facts:[{id:'f0',evidence:wordnet.title}],memes:[]}),plan,[wordnet],[],'game');assert.equal(a.entity.status,'ambiguous');assert.equal(a.facts.length,0);
});
test('all recorded summaries compete for detail slots before truncation',()=>{
 const a=validateAssessment(JSON.stringify(assessment()),plan,facts,entries,'game');assert.equal(a.entity.status,'resolved');assert.ok(!a.entity.aliases.includes('模型编造的别名'));
 const top=a.ranked.slice(0,5).map(e=>e.title);assert.ok(top.includes('Bin大小姐'));assert.ok(top.includes('我依旧是世一X'));assert.ok(!top.includes('欧派动力学'));assert.ok(!top.includes('48上单'));
});
test('token boundaries and material targets do not ban ordinary criticism',()=>{
 assert.equal(tokenMatch('Anrobino','bin'),false);assert.equal(tokenMatch('Bin大小姐','bin'),true);
 assert.equal(unsuitableMaterial('针对选手家人的侮辱性黑称'),true);
 assert.equal(unsuitableMaterial('这波操作就这？还吹世一上，孝子急了'),false);
});
test('valid classic material is ranked independently of origin year',()=>{
 const old={...entries.find(e=>e.title==='Bin大小姐'),summary:'Bin相关句式，2011年起源。'};
 const a=validateAssessment(JSON.stringify({...assessment(),memes:[{slug:old.slug,priority:3,evidence:'2011年起源',reason:'对象相关'}]}),plan,facts,[old],'game');assert.equal(a.ranked.length,1);
});
const entry={slug:'有依据',title:'Bin大小姐',summary:'Bin是游戏电竞选手，Bin大小姐用于调侃表现。',aliases:['Bin大小姐'],keywords:['bin'],tags:['游戏'],updated_at:'2026-11-10',source_video:null};
const freshFact={title:'Bin 英雄联盟选手评价',url:'https://example.com/bin',summary:'Bin是英雄联盟电竞选手。',snippet:'Bin是英雄联盟电竞选手。',date:null,authority:3,rerank_score:2};
function mockFetch(options={}){
 return async(u,i={})=>{
  if(u.includes('cnmeme.wiki'))return Response.json(u.includes('?')?{schema_version:1,items:[entry]}:{schema_version:1,item:{...entry,content_html:'<p>Bin大小姐用于调侃表现。</p><p>2011年起源，但并不说明已过时。</p>'}});
  if(u.endsWith('/search'))return Response.json({results:[freshFact]});
  if(u.endsWith('/fetch'))return options.pageFailure?new Response('',{status:404}):Response.json({title:freshFact.title,content:freshFact.summary});
  const body=JSON.parse(i.body);const system=body.messages[0].content;
  if(options.badJson)return Response.json({choices:[{message:{content:'not JSON'}}]});
  if(system.includes('实体确认与检索排序器'))return Response.json({choices:[{message:{content:JSON.stringify({entity:{status:'resolved',name:'Bin',aliases:['Bin'],source_ids:['f0'],evidence:freshFact.title},facts:[{id:'f0',evidence:freshFact.title}],memes:[{slug:entry.slug,priority:3,evidence:entry.title,reason:'对象明确'}]})}}]});
  if(system.includes('表达素材筛选员'))return Response.json({choices:[{message:{content:JSON.stringify({items:[{slug:entry.slug,meaning:'调侃表现',usage:'回怼比赛表现',derivatives:[],evidence:'Bin大小姐用于调侃表现。'}]})}}]});
  return Response.json({choices:[{message:{content:JSON.stringify({fact_query:'bin',raw_entities:['bin'],meme_keywords:[]})}}]});
 };
}
test('bounded pipeline reads selected details, preserves old relevant expressions, coalesces and caches accurately',run(async()=>{
 globalThis.fetch=mockFetch();let clock=Date.now();const get=createRetrievalService({now:()=>clock});const trace=createTrace();
 const [a,b]=await Promise.all([get('如何评价bin','game','','k',trace),get('如何评价bin','game','','k',trace)]);
 assert.equal(a.entity.status,'resolved');assert.equal(a.meme_status,'ready');assert.equal(a.memes[0].phrase,'Bin大小姐');assert.ok(a.counts.ai_calls<=4);assert.equal(a.counts.details,1);assert.equal(b.cache_hit,true);
 const c=await get('如何评价bin','game','','k',trace);assert.equal(c.cache_hit,true);assert.equal(c.counts.ai_calls,0);assert.equal(c.counts.meme_queries,0);
 clock+=31*60000;const d=await get('如何评价bin','game','','k',trace);assert.notEqual(d.cache_hit,true);
}));
test('fetch failure retains summary, malformed assessment is explicit, ambiguous failures expire quickly',run(async()=>{
 let clock=Date.now();globalThis.fetch=mockFetch({pageFailure:true});const get=createRetrievalService({now:()=>clock});
 assert.equal((await get('如何评价bin','game','','k',createTrace())).knowledge.status,'summary_only');
 globalThis.fetch=mockFetch({badJson:true});const failed=createRetrievalService({now:()=>clock});
 const a=await failed('如何评价bin','game','','k',createTrace());assert.equal(a.entity.status,'ambiguous');assert.equal(a.meme_status,'unavailable');
 assert.equal((await failed('如何评价bin','game','','k',createTrace())).cache_hit,true);
 clock+=61000;assert.notEqual((await failed('如何评价bin','game','','k',createTrace())).cache_hit,true);
}));
test('logging and diagnostic callback exceptions never break successful results',run(async()=>{
 globalThis.fetch=mockFetch();console.info=()=>{throw Error('logger failed');};
 const trace=createTrace({onEvent:()=>{throw Error('observer failed');},onError:()=>{throw Error('observer failed');}},'secret');
 const data=await createRetrievalService()('如何评价bin','game','','k',trace);assert.equal(data.meme_status,'ready');trace.error('test',Error('secret'));
}));
test('diagnostic error retains stage and redacts secret',()=>{
 let result;createTrace({onError:e=>{result=e;}},'sensitive-key').error('validation',Error('failed sensitive-key'));
 assert.equal(result.stage,'validation');assert.ok(result.stack);assert.ok(!result.message.includes('sensitive-key'));
});
test('slow fact pages cannot consume the meme-selection reserve',run(async()=>{
 const normal=mockFetch();globalThis.fetch=async(u,i)=>{
  if(u.endsWith('/fetch'))return new Promise((_resolve,reject)=>{if(i.signal.aborted)return reject(new DOMException('timeout','AbortError'));i.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError')),{once:true});});
  return normal(u,i);
 };
 const started=Date.now();const data=await createRetrievalService({budgetMs:6600})('如何评价bin','game','','k',createTrace());
 assert.equal(data.meme_status,'ready');assert.equal(data.knowledge.status,'summary_only');assert.ok(Date.now()-started<2000);
}));
test('handler preserves successful comments when logger and diagnostic observers throw',run(async()=>{
 const {DEMO_THREAD}=await import('../src/demo.ts');const normal=mockFetch();
 globalThis.Deno={env:{get:()=> 'test-key'}};console.info=()=>{throw Error('broken telemetry');};
 globalThis.fetch=async(u,i)=>{const body=i?.body?JSON.parse(i.body):null;
  if(body?.messages?.[0]?.content.includes('你生成的是中文互联网'))return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(DEMO_THREAD)}}]});
  return normal(u,i);
 };
 const{handler}=await import('../functions/handler.ts');const response=await handler(new Request('http://test/functions/v1/app/generate',{method:'POST',body:JSON.stringify({seed:'如何评价bin',community:'game'})}),{onEvent:()=>{throw Error('observer error');},onError:()=>{throw Error('observer error');}});
 const data=await response.json();assert.equal(response.status,200);assert.equal(data.ok,true);assert.ok(data.trace_id);assert.ok(data.thread.comments.length>=6);
}));
test('generation parse, transport and truncation failures retain stage, trace and specific codes',run(async()=>{
 const{handler}=await import('../functions/handler.ts');globalThis.Deno={env:{get:()=> 'test-key'}};
 for(const mode of ['parse','transport','network','truncated','schema']){
  const normal=mockFetch();globalThis.fetch=async(u,i)=>{const body=i?.body?JSON.parse(i.body):null;
   if(body?.messages?.[0]?.content.includes('你生成的是中文互联网')){
    if(mode==='transport')throw new DOMException('aborted','AbortError');
    if(mode==='network')throw new TypeError('fetch failed');
    return Response.json({choices:[{finish_reason:mode==='truncated'?'length':'stop',message:{content:mode==='schema'?'{}':'invalid JSON'}}]});
   }return normal(u,i);
  };
  const errors=[];const response=await handler(new Request('http://test/functions/v1/app/generate',{method:'POST',body:JSON.stringify({seed:'如何评价bin',community:'game'})}),{onError:e=>errors.push(e)});
  const data=await response.json();assert.equal(response.status,mode==='transport'?504:502);assert.ok(data.trace_id);assert.equal(data.error,({parse:'bad_json',transport:'upstream_timeout',network:'upstream_network_error',truncated:'upstream_truncated',schema:'bad_schema'})[mode]);assert.equal(errors.at(-1).stage,mode==='parse'||mode==='schema'?'validation':'generation');
 }
}));
test('literal JSON control characters are repaired without inventing structure or changing text',async()=>{
 const {escapeJsonControls,validateThread}=await import('../functions/ai.ts');
 const {DEMO_THREAD}=await import('../src/demo.ts');
 const data=JSON.stringify({...DEMO_THREAD,comments:DEMO_THREAD.comments.map((c,i)=>i?c:{...c,text:'第一句\n第二句'})});
 assert.equal(escapeJsonControls(data),data);
 const broken=data.replace('第一句\\n第二句','第一句\n第二句');
 const result=validateThread(broken,{firstTurn:true,baseCount:0,existingTexts:[]});assert.equal(result.thread.comments[0].text,'第一句 第二句');
 assert.throws(()=>validateThread('{"comments":["broken',{firstTurn:true,baseCount:0,existingTexts:[]}),/bad_json/);
 assert.equal(escapeJsonControls('{"s":"escaped \\\" quote"}'),'{"s":"escaped \\\" quote"}');
});
test('the recorded live malformed response is repaired and emits an observable normalization event',async()=>{
 const fixture=JSON.parse(await readFile(new URL('./fixtures/bin-malformed-generation.json',import.meta.url),'utf8'));
 const{validateThread}=await import('../functions/ai.ts');let repairs=0;
 assert.equal(fixture.finish_reason,'stop');assert.throws(()=>JSON.parse(fixture.content));
 const result=validateThread(fixture.content,{firstTurn:true,baseCount:0,existingTexts:[],onRepair:()=>{repairs++;}});
 assert.equal(result.thread.comments.length,10);assert.equal(repairs,1);
});
