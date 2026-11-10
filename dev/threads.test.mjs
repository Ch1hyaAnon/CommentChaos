import{test}from'node:test';import assert from'node:assert/strict';import{groupComments}from'../src/threads.ts';
const make=parents=>parents.map((reply_to,i)=>({localId:i+100,name:`n${i}`,text:`text${i}`,reply_to}));
test('one parent accepts many replies; deeper conversations flatten without changing global floors',()=>{
 const comments=make([null,1,1,2,null,5,1,3,null]);const before=JSON.stringify(comments);const groups=groupComments(comments);
 assert.deepEqual(groups.map(g=>g.root.no),[1,5,9]);assert.deepEqual(groups[0].replies.map(r=>r.no),[2,3,4,7,8]);assert.deepEqual(groups[1].replies.map(r=>r.no),[6]);assert.equal(groups[0].replies[2].parentNo,2);assert.equal(groups[2].replies.length,0);assert.equal(JSON.stringify(comments),before);
});
test('only revealed floors contribute to threads and reply counts',()=>{
 const groups=groupComments(make([null,1,1,null,4]),2);assert.equal(groups.length,1);assert.deepEqual(groups[0].replies.map(r=>r.no),[2]);assert.equal(groupComments(make([null]),0).length,0);
});
test('invalid, self, future and fractional parents remain standalone safely',()=>{
 const groups=groupComments(make([1,0,99,-1,1.2,null]));assert.equal(groups.length,6);assert.ok(groups.every(g=>!g.replies.length));
});
test('later batches join earlier threads while preserving unique IDs and floor numbers',()=>{
 const old=make([null,1,null]);const next=[...old,...make([1,3,4]).map((c,i)=>({...c,localId:200+i}))];const groups=groupComments(next);assert.deepEqual(groups[0].replies.map(r=>r.no),[2,4,6]);assert.equal(groups[0].replies[1].comment.localId,200);
});
test('reuse the model reaction sparingly without changing comment text or duplicating expressions',async()=>{
 const{bodyReaction}=await import('../src/commentPresentation.ts');const c={text:'周报又改三遍',emoji:'😅'};
 assert.equal(bodyReaction(c,1),'😅');assert.equal(bodyReaction(c,2),null);assert.equal(bodyReaction({...c,text:'我真的谢😅'},1),null);assert.equal(bodyReaction({...c,text:'我真的谢[doge]'},1),null);assert.equal(bodyReaction({...c,text:'(￣▽￣)'},1),null);assert.equal(bodyReaction({...c,emoji:'📚'},1),null);assert.equal(c.text,'周报又改三遍');
});
