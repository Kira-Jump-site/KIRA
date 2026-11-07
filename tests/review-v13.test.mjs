import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createReviewTestStore,admitLegacyInShadow} from '../lib/review-test-store.mjs';
import {listQualityQueue} from '../lib/review-queue-v10.mjs';
import {reviewWork} from '../lib/moderation-v9.mjs';
const PREFIX='catalog/v2/live/items/';
const mk=(id,verified=true,legacy=false)=>({schema:3,work:{source:'cosbooru',source_post_id:id,
 title:'Preview '+id,author:'',author_id:'',rating:'safe',kind:'cosplay',content_type:'cosplay',
 visibility:legacy?'public':'pending',review_status:legacy?undefined:'pending',review_policy_version:legacy?undefined:1,
 media_status:verified?'verified':'unverified',popularity_status:'ranked',popularity_percentile:0.95,
 quality_admission:legacy?undefined:{eligible:true,version:'unit-test'},
 images:[{image_index:0,width:1200,height:1600,media_status:verified?'verified':'unchecked',thumbnail_url:'https://example.com/thumb.jpg',preview_url:'https://example.com/preview.jpg'}]}});
function backend(){
 const db=new Map();
 for(const [id,valid,legacy] of [['a',true,false],['b',true,true],['c',false,false]])db.set(PREFIX+'cosbooru/'+id+'.json',mk(id,valid,legacy));
 let eventLists=0;
 return {db,counts:()=>eventLists,store:{
  async get(key){return db.get(key)||null},
  async setJSON(key,value){db.set(key,value)},
  async list({prefix,limit=500}={}){
   if(prefix?.startsWith('catalog/v2/events/'))eventLists++;
   return {blobs:[...db.keys()].filter(key=>key.startsWith(prefix||'')).slice(0,limit).map(key=>({key})),cursor:null};
  }
 }};
}
test('production candidates get legacy admission only when actual media and ranking proof exist',()=>{
 const good=admitLegacyInShadow(mk('b',true,true).work);
 assert.equal(good.visibility,'pending');assert.equal(good.quality_admission.eligible,true);
 const bad=admitLegacyInShadow(mk('x',false,true).work);
 assert.equal(bad.visibility,'public');assert.equal(bad.quality_admission,undefined);
});
test('shadow review queue reads real candidates, excludes unverified, 1 revision scan',async()=>{
 const b=backend(),store=createReviewTestStore(b.store);
 const q=await listQualityQueue(store,{source:'cosbooru',limit:100});
 assert.deepEqual(q.works.map(x=>x.source_post_id),['a','b']);
 assert.equal(b.counts(),1);
 assert.equal(q.works[1].revision,'live');
});
test('review action really persists under shadow prefix and leaves production live work untouched',async()=>{
 const b=backend(),store=createReviewTestStore(b.store);
 const r=await reviewWork(store,{source:'cosbooru',source_post_id:'a',action:'approve',expected_revision:'live',rating:'safe'},
  {verify:async w=>({verified:true,images:w.images,checked_at:Math.floor(Date.now()/1000),checked:0,failed:0})});
 assert.equal(r.ok,true);assert.equal(r.review_status,'approved');
 assert.equal(b.db.get(PREFIX+'cosbooru/a.json').work.visibility,'pending');
 const shadowKeys=[...b.db.keys()].filter(k=>k.startsWith('catalog/v2/review-test/v1/'));
 assert.equal(shadowKeys.length,1);
 const list=await listQualityQueue(store,{source:'cosbooru',limit:100});
 assert.deepEqual(list.works.map(w=>w.source_post_id),['b']);
});
test('no production writes on the reports test route',async()=>{
 const b=backend(),store=createReviewTestStore(b.store);
 await assert.rejects(store.setJSON(PREFIX+'cosbooru/hacked.json',{work:mk('hacked').work}),/test_write_disallowed/);
 for(const [page,route] of [['reports','reports']]){
  const script=readFileSync(new URL('../public/assets/'+page+'.js',import.meta.url),'utf8');
  assert.ok(script.includes('/api/catalog/review-test/'+route),'missing test route');
  assert.ok(!script.includes('Authorization:\'Bearer '));
 }
});

test('Nekosia official v1 metadata.original dimensions survive source adapter',async()=>{
 const {discoverSource}=await import('../lib/source-adapters.mjs');
 const image={success:true,images:[{
   id:'66bc6b7481a59a1cf2c79db5',
   image:{compressed:{url:'https://nekosia.example/compressed.jpg'},original:{url:'https://nekosia.example/original.jpg'}},
   metadata:{original:{width:1800,height:1200}},tags:['white-hair'],rating:'safe',
   attribution:{artist:{username:'artist'}}
 }]};
 const fetcher=async()=>new Response(JSON.stringify(image),{status:200,headers:{'content-type':'application/json'}});
 const found=await discoverSource('nekosia',{page:1,fetcher});
 assert.equal(found.works.length,1);
 assert.equal(found.works[0].images[0].width,1800);
 assert.equal(found.works[0].images[0].height,1200);
});
