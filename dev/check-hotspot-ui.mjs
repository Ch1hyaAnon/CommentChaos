// Browser regression with deterministic public-topic fixtures; optional tooling stays outside app dependencies.
import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {DEMO_THREAD}=await import('../src/demo.ts');
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[],requests=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
const date=new Date().toISOString();
const point={id:'e1',text:'通知要求周六上午九点开会，每次持续三个小时。',evidence:'通知要求周六上午九点开会，每次持续三个小时。',source_url:'https://www.zhihu.com/question/123',kind:'fact'};
const item=community=>({id:`${community}-test`,title:community==='work'?'公司要求周末开会，员工不满':'校园食堂新规则引争议',description:'通知要求周六上午九点开会，每次持续三个小时。员工称会议不计加班且无调休。',platform:'zhihu',source:'知乎',url:'https://www.zhihu.com/question/123',published_at:null,fetched_at:date,rank:1,heat:null,appearances:1});
let shouldFail=true;
await page.route('**/functions/v1/app/trending?**',async route=>{
 const community=new URL(route.request().url()).searchParams.get('community');
 if(community==='campus')await new Promise(r=>setTimeout(r,300));
 await route.fulfill({json:{ok:true,items:[item(community)],degraded:true,stale:false,fetched_at:date,sources:[{source:'知乎',status:'ready',count:1},{source:'B站',status:'unavailable',count:0}]}}).catch(()=>{});
});
await page.route('**/functions/v1/app/generate',async route=>{
 const body=route.request().postDataJSON();requests.push(body);
 if(shouldFail){await route.fulfill({status:422,json:{ok:false,error:'hotspot_content_insufficient',trace_id:'ui-test'}});return;}
 await route.fulfill({json:{ok:true,thread:{...DEMO_THREAD,title:"周末开会算不算加班"},duplicates:0,hotspot_token:'frozen-token',hotspot_context:{id:body.hotspot_id,title:item('work').title,status:'summary_only',retrieved_at:date,summary:point.text,points:[point,{...point,id:'e2',text:'员工称会议不计加班，也没有调休。',kind:'claim'}],sources:[]}}});
});
try{
 await page.goto('http://127.0.0.1:5173');
 await page.getByRole('button',{name:/职场/}).click();
 await page.getByRole('button',{name:/公司要求周末开会/}).waitFor();
 assert.equal(await page.getByRole('button',{name:/校园食堂新规则/}).count(),0);checks.push('community response isolation');
 await page.getByRole('button',{name:/公司要求周末开会/}).click();
 await page.getByRole('button',{name:/开楼，吵上热搜/}).click();
 await page.getByRole('alert').filter({hasText:'还没取得足够'}).waitFor();
 assert.equal(await page.locator('#cc-seed').inputValue(),item('work').title);assert.equal(requests[0].hotspot_id,'work-test');checks.push('insufficient content preserves seed and selection');
 for(const width of [390,768,1024,1280,1440]){
  await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`input overflow ${width}`);
 }
 await page.setViewportSize({width:1440,height:1000});await mkdir('artifacts/hotspots/ui',{recursive:true});await page.screenshot({path:'artifacts/hotspots/ui/input.png',fullPage:true});checks.push('input widths 390/768/1024/1280/1440');
 await page.getByRole('button',{name:'取消选择'}).click();assert.equal(await page.locator('#cc-hotspot-supplement').count(),0);assert.equal(await page.locator('#cc-seed').inputValue(),item('work').title);checks.push('cancel retains typed seed');
 await page.getByRole('button',{name:/公司要求周末开会/}).click();await page.locator('#cc-hotspot-supplement').fill('员工补充线索');shouldFail=false;
 await page.getByRole('button',{name:/开楼，吵上热搜/}).click();await page.getByText(/事件背景 ·/).click();await page.locator('.cc-event-background li').filter({hasText:point.text}).waitFor();
 assert.equal(requests.at(-1).hotspot_supplement,'员工补充线索');checks.push('background evidence, source links and unverified supplement');
 for(const width of [390,768,1024,1280,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`thread overflow ${width}`);}
 await page.setViewportSize({width:390,height:1000});assert.equal(await page.locator('.cc-masthead').count(),1);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await page.screenshot({path:'artifacts/hotspots/ui/thread-mobile.png'});checks.push('thread widths 390/768/1024/1280/1440');
 assert.deepEqual(errors,[]);await writeFile('artifacts/hotspots/ui/checks.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
