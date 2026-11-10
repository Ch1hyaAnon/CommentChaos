import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createPlanner,parseRetrievalPlan} from '../functions/retrieval-plan.ts';
import {searchWiki,detailWiki,plainText,parseWikiSelection,createWikiService} from '../functions/cnmeme.ts';
import {buildQueries} from '../functions/knowledge.ts';
const original=globalThis.fetch;
const run=fn=>async()=>{try{await fn();}finally{globalThis.fetch=original;}};
const chat=data=>Response.json({choices:[{message:{content:JSON.stringify(data)}}]});
const entry={slug:'有/空 格',title:'测试梗',summary:'测试梗表示压力很大。',aliases:['别名'],keywords:['压力'],tags:['职场'],updated_at:'2026-11-10',source_video:{title:'旧视频',published_at:'2020-01-01'}};
const selection={items:[{slug:entry.slug,meaning:'表达压力',usage:'用于吐槽加班',derivatives:['有源衍生','捏造衍生'],evidence:'测试梗表示压力很大。'}]};
test('planner uses Pro and bounded independent short keywords; cached concurrent requests',run(async()=>{
 let calls=0;globalThis.fetch=async(_u,i)=>{calls++;const body=JSON.parse(i.body);assert.equal(body.model,'deepseek-v4-pro');assert.equal(body.thinking.type,'disabled');return chat({fact_query:'某具体游戏 2020年 平衡调整',meme_keywords:['加班','压力','加班','改需求','第四个词']});};
 let clock=Date.now();const plan=createPlanner({now:()=>clock});
 const [a,b]=await Promise.all([plan('改需求','work','','k'),plan('改需求','work','','k')]);
 assert.deepEqual(a,b);assert.equal(calls,1);assert.deepEqual(a.meme_keywords,['改需求','加班','压力']);
 await plan('改需求','work','','k');assert.equal(calls,1);clock+=31*60000;await plan('改需求','work','','k');assert.equal(calls,2);
 const queries=buildQueries('2020年某游戏','game','',clock,a.fact_query);assert.match(queries[0],/某具体游戏/);assert.match(queries[0],/after:2020/);
 assert.throws(()=>parseRetrievalPlan('{}'));
}));
test('planner failure falls back without preventing generation',run(async()=>{
 globalThis.fetch=async()=>new Response('',{status:429});
 const p=await createPlanner()('反复加班改周报','work','','k');assert.equal(p.origin,'fallback');assert.ok(p.meme_keywords.includes('加班'));
}));
test('wiki uses GET encoded keywords and actual slug; no API credentials',run(async()=>{
 const seen=[];globalThis.fetch=async(u,i)=>{seen.push(u);assert.equal(i.headers.Authorization,undefined);assert.ok(i.headers['User-Agent']);return Response.json(u.includes('?')?{schema_version:1,items:[entry]}:{schema_version:1,item:{...entry,content_html:'<h2>含义</h2><p>测试梗表示压力很大。</p><p>有源衍生</p>'}});};
 const entries=await searchWiki('加班 & 压力',AbortSignal.timeout(1000));assert.equal(new URL(seen[0]).searchParams.get('q'),'加班 & 压力');assert.equal(new URL(seen[0]).searchParams.get('limit'),'5');
 const detail=await detailWiki(entries[0],AbortSignal.timeout(1000));assert.ok(seen[1].endsWith(encodeURIComponent(entry.slug)));assert.match(detail.content,/测试梗/);
 const memes=parseWikiSelection(JSON.stringify(selection),[detail]);assert.equal(memes.length,1);assert.deepEqual(memes[0].derivatives,['有源衍生']);assert.equal(memes[0].source_published_at,'2020-01-01');
 assert.equal(parseWikiSelection(JSON.stringify({items:[{...selection.items[0],slug:'AI猜的slug'}]}),[detail]).length,0);
 assert.equal(parseWikiSelection(JSON.stringify({items:[{...selection.items[0],evidence:'捏造证据'}]}),[detail]).length,0);
}));
test('HTML is converted to reference text, never rendered',()=>{
 assert.equal(plainText('<script>evil()</script><p>压力&nbsp;&amp;&#x5927;</p>').trim(),'压力 &大');
});
test('wiki coalesces lookups, dedupes entries, AI curates details, caches result',run(async()=>{
 let calls=0;globalThis.fetch=async(u)=>{calls++;
  if(u.includes('chat/completions'))return chat(selection);
  return Response.json(u.includes('?')?{schema_version:1,items:[entry]}:{schema_version:1,item:{...entry,content_html:'<p>测试梗表示压力很大。有源衍生</p>'}});
 };
 const get=createWikiService();const [a,b]=await Promise.all([get('加班','work',['加班','压力'],'k'),get('加班','work',['加班','压力'],'k')]);assert.deepEqual(a,b);assert.equal(a.status,'ready');assert.equal(calls,4);await get('加班','work',['加班','压力'],'k');assert.equal(calls,4);
}));
test('empty, unavailable, malformed schema, and no keyword paths do not invent material',run(async()=>{
 let calls=0;globalThis.fetch=async()=>{calls++;return Response.json({schema_version:1,items:[]});};
 assert.equal((await createWikiService()('x','work',[],'k')).status,'empty');assert.equal(calls,0);
 assert.equal((await createWikiService()('x','work',['不存在'],'k')).status,'empty');
 for(const status of [403,429,500]){globalThis.fetch=async()=>new Response('html',{status});assert.equal((await createWikiService()('x','work',['压力'],'k')).status,'unavailable');}
 globalThis.fetch=async()=>Response.json({schema_version:2,items:[]});assert.equal((await createWikiService()('x','work',['压力'],'k')).status,'unavailable');
}));
test('wiki deadline cancels external calls',run(async()=>{
 globalThis.fetch=async(_u,i)=>new Promise((_resolve,reject)=>i.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
 assert.equal((await createWikiService({budgetMs:10})('x','work',['压力'],'k')).status,'unavailable');
}));
test('recently edited pages with only old usage records are not treated as new memes',async()=>{
 const {historicalOnly}=await import('../functions/cnmeme.ts');const now=Date.parse('2026-11-10');
 const old={...entry,title:'旧梗',aliases:['旧称'],updated_at:'2026-11-10',content:'2011年开始传播。2012年入选流行语。'};
 assert.equal(historicalOnly(old,'加班压力大',now),true);
 assert.equal(historicalOnly(old,'我要玩旧称这个梗',now),false);
 assert.equal(historicalOnly({...old,content:'2011年起源，2026年仍有使用记录。'},'压力',now),false);
 assert.equal(historicalOnly({...old,content:'没有明确时间。'},'压力',now),false);
});
