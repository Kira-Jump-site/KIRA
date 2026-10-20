import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {listQualityQueue} from './mock-unit/review-queue-under-test.mjs';
import {submitReport,listReportQueue,reviewReport} from './mock-unit/report-moderation-under-test.mjs';
const root=new URL('../',import.meta.url);
for(const [file,fixture,changes] of [
 ['lib/review-queue-v10.mjs','tests/mock-unit/review-queue-under-test.mjs',[["from './blob-catalog.mjs'","from './review-store-doubles.mjs'"]]],
 ['lib/report-moderation-v10.mjs','tests/mock-unit/report-moderation-under-test.mjs',[["from './blob-catalog.mjs'","from './review-store-doubles.mjs'"],["from './review-state-v9.mjs'","from './review-store-doubles.mjs'"]]]]){
 test(`mocked fixture matches production source: ${file}`,()=>{let actual=readFileSync(new URL(file,root),'utf8');for(const [a,b] of changes)actual=actual.replace(a,b);assert.equal(actual,readFileSync(new URL(fixture,root),'utf8'))})
}
function db(){return {docs:new Map(),works:new Map(),revisions:new Map(),async get(k){return structuredClone(this.docs.get(k)||null)},async setJSON(k,v){this.docs.set(k,structuredClone(v))},async list({prefix,limit=100,cursor}){const keys=[...this.docs.keys()].filter(k=>k.startsWith(prefix)).sort(),offset=Number(cursor||0);return {blobs:keys.slice(offset,offset+limit).map(key=>({key})),cursor:offset+limit<keys.length?String(offset+limit):null}}}}
const work=(id)=>({source:'pixiv',source_post_id:String(id),rating:'safe',visibility:'pending',review_status:'pending',quality_admission:{eligible:true},images:[{image_index:0,thumbnail_url:'https://cdn.example/thumb.webp',preview_url:'https://cdn.example/full.webp'}]});
test('100 pending works per page, correct cursor and default-safe approval separation',async()=>{const store=db();for(let i=0;i<205;i++){const w=work(i);store.docs.set(`catalog/v2/live/items/pixiv/${String(i).padStart(4,'0')}.json`,{schema:3,work:w});store.works.set(`pixiv:${i}`,w)}
 const page1=await listQualityQueue(store,{source:'pixiv',limit:100});assert.equal(page1.works.length,100);assert(page1.next_cursor);
 const page2=await listQualityQueue(store,{source:'pixiv',limit:100,cursor:page1.next_cursor});assert.equal(page2.works.length,100);assert.notEqual(page2.works[0].source_post_id,page1.works[0].source_post_id);
 const page3=await listQualityQueue(store,{source:'pixiv',limit:100,cursor:page2.next_cursor});assert.equal(page3.works.length,5);assert.equal(page3.next_cursor,null);
});
test('approved and quality-failed candidates never enter admin pending queue',async()=>{const store=db();for(let i=0;i<3;i++){const w=work(i);if(i===1)w.review_status='approved';if(i===2)w.quality_admission.eligible=false;store.works.set('pixiv:'+i,w);store.docs.set(`catalog/v2/live/items/pixiv/${i}.json`,{work:w})}
 const q=await listQualityQueue(store,{source:'pixiv',limit:100});assert.deepEqual(q.works.map(x=>x.source_post_id),['0'])});
test('report submit idempotent; source IP not stored plaintext; report displays thumbnail',async()=>{const store=db(),secret='test-secret-1234567890',time=Date.UTC(2026,9,20);store.works.set('pixiv:7',{...work('7'),visibility:'public'});
 const input={source:'pixiv',source_post_id:'7',reason:'broken_image',description:'打不开'};
 const a=await submitReport(store,input,{fingerprint:'203.0.113.6',secret,now:time});assert.equal(a.duplicate,false);
 const b=await submitReport(store,input,{fingerprint:'203.0.113.6',secret,now:time});assert.equal(b.duplicate,true);
 const q=await listReportQueue(store);assert.equal(q.reports.length,1);assert.equal(q.reports[0].work.thumbnail_url,'https://cdn.example/thumb.webp');
 assert(!JSON.stringify([...store.docs.values()]).includes('203.0.113.6'));
});
test('report keep closes report but does not hide artwork',async()=>{const store=db(),secret='test-secret-1234567890',time=Date.UTC(2026,9,20);store.works.set('pixiv:7',{...work('7'),visibility:'public'});
 await submitReport(store,{source:'pixiv',source_post_id:'7',reason:'duplicate'},{fingerprint:'a',secret,now:time});const q=await listReportQueue(store);const r=q.reports[0];const result=await reviewReport(store,{id:r.id,action:'keep',expected_revision:r.revision});assert.equal(result.status,'dismissed');assert.equal(store.works.get('pixiv:7').visibility,'public')});
test('report hide hides live artwork; legacy-only work must remain pending',async()=>{const store=db(),secret='test-secret-1234567890',time=Date.UTC(2026,9,20);store.works.set('pixiv:7',{...work('7'),visibility:'public'});
 for(const [who,id] of [['a','7'],['b','8']])await submitReport(store,{source:'pixiv',source_post_id:id,reason:'other'},{fingerprint:who,secret,now:time});
 const q=await listReportQueue(store);const x=q.reports.find(r=>r.source_post_id==='7'),legacy=q.reports.find(r=>r.source_post_id==='8');
 await reviewReport(store,{id:x.id,action:'hide',expected_revision:x.revision});assert.equal(store.works.get('pixiv:7').visibility,'hidden');
 await assert.rejects(reviewReport(store,{id:legacy.id,action:'hide',expected_revision:legacy.revision}),/legacy_work_not_in_blob/);
 assert.equal((await listReportQueue(store)).reports.length,1);
});
test('dense work pages skip already handled rows without leaving nearly empty 100-card screens',async()=>{
 const store=db();for(let i=0;i<270;i++){
  const w=work(i);if(i%3===0)w.review_status='approved';
  store.docs.set(`catalog/v2/live/items/pixiv/${String(i).padStart(4,'0')}.json`,{work:w});store.works.set('pixiv:'+i,w);
 }
 const first=await listQualityQueue(store,{source:'pixiv',limit:100});
 assert.equal(first.works.length,100);assert(first.scanned>=149);assert(first.next_cursor);
 const second=await listQualityQueue(store,{source:'pixiv',limit:100,cursor:first.next_cursor});
 assert.equal(second.works.length,80);assert.equal(second.next_cursor,null);
 assert.equal(new Set([...first.works,...second.works].map(x=>x.source_post_id)).size,180);
});
test('dense report pages skip resolved cases and preserve cursor',async()=>{
 const store=db(),base=Date.UTC(2026,9,20);
 for(let i=0;i<220;i++){
  const hash=i.toString(16).padStart(64,'0'),id='20261020_'+hash;
  store.docs.set('catalog/v2/user-reports/items/20261020/'+hash+'.json',{
   schema:1,id,source:'pixiv',source_post_id:String(i),reason:'broken_image',revision:1,
   reported_at:new Date(base+i*1000).toISOString(),status:i%2===0?'dismissed':'pending'});
 }
 const first=await listReportQueue(store,{limit:100});
 assert.equal(first.reports.length,100);assert(first.next_cursor);assert(first.scanned>=199);
 const second=await listReportQueue(store,{limit:100,cursor:first.next_cursor});
 assert.equal(second.reports.length,10);assert.equal(second.next_cursor,null);
 assert.equal(new Set([...first.reports,...second.reports].map(x=>x.id)).size,110);
});
