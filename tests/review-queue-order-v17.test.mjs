import test from 'node:test';
import assert from 'node:assert/strict';
import {listQualityQueue} from '../lib/review-queue-v10.mjs';
const PREFIX='catalog/v2/live/items/';
function backend(works){
 const docs=new Map(works.map(w=>[PREFIX+w.source+'/'+w.source_post_id+'.json',{schema:3,work:w}]));
 return {docs,async get(key){return docs.get(key)||null},
  async setJSON(key,value){docs.set(key,value)},
  async list({prefix='',limit=100,cursor}={}){
   const keys=[...docs.keys()].filter(key=>key.startsWith(prefix)).sort();
   const offset=Number(cursor||0);
   const slice=keys.slice(offset,offset+limit);
   return {blobs:slice.map(key=>({key})),cursor:offset+slice.length<keys.length?String(offset+slice.length):null};
  }};
}
const work=(id,{status='ranked',pct=0.8,width=1200,height=1600,position=0}={})=>({
 source:'cosbooru',source_post_id:String(id),rating:'safe',visibility:'pending',review_status:'pending',
 quality_admission:{eligible:true},media_status:'verified',popularity_status:status,
 popularity_percentile:pct,source_candidate_position:position,indexed_at:1000,
 images:[{image_index:0,width,height,media_status:'verified',thumbnail_url:'https://cdn.example/t.jpg',preview_url:'https://cdn.example/p.jpg'}]
});
test('queue ranks popular evidence first, then large verified media, never invented percentiles',async()=>{
 const store=backend([
  work('r90',{pct:0.9,width:800,height:1200}),
  work('r75',{pct:0.75,width:5000,height:7000}),
  work('i60',{status:'insufficient_reference',pct:0.6,width:1000,height:1500}),
  work('u1',{status:'cohort_unrankable',pct:null,width:1000,height:1500}),
  work('u2',{status:'cohort_unrankable',pct:null,width:2000,height:3000}),
  work('n1',{status:'unrated',pct:null,width:3000,height:4000}),
  work('n2',{status:'unrated',pct:null,width:900,height:900})
 ]);
 const q=await listQualityQueue(store,{source:'cosbooru',limit:100});
 assert.deepEqual(q.works.map(w=>w.source_post_id),['r90','r75','i60','u2','u1','n1','n2']);
 assert.equal(q.ordering,'quality_v17');
});
test('quality pages are contiguous, cursor-keyed and lossless',async()=>{
 const works=[];for(let i=0;i<205;i++)works.push(work(String(i).padStart(4,'0'),{pct:i/204,width:700+i,height:1000+i}));
 const store=backend(works);
 const first=await listQualityQueue(store,{source:'cosbooru',limit:100});
 assert.equal(first.works.length,100);assert.match(first.next_cursor,/^q17:/);
 const second=await listQualityQueue(store,{source:'cosbooru',limit:100,cursor:first.next_cursor});
 assert.equal(second.works.length,100);assert.match(second.next_cursor,/^q17:/);
 const third=await listQualityQueue(store,{source:'cosbooru',limit:100,cursor:second.next_cursor});
 assert.equal(third.works.length,5);assert.equal(third.next_cursor,null);
 const all=[...first.works,...second.works,...third.works].map(w=>w.source_post_id);
 assert.equal(new Set(all).size,205);
 const pcts=[...first.works,...second.works,...third.works].map(w=>w.popularity_percentile);
 for(let i=1;i<pcts.length;i++)assert.ok(pcts[i]<=pcts[i-1],'page order must not interleave');
 assert.equal(first.works[0].source_post_id,'0204');
});
test('invalid or foreign cursors fail closed',async()=>{
 const store=backend([work('1')]);
 for(const cursor of ['not-a-cursor','q17:bad','q17:0|abc|1|1||1|x','q17:9|0.5|1|1||1|x']){
  await assert.rejects(listQualityQueue(store,{source:'cosbooru',limit:10,cursor}),/invalid_queue_cursor/);
 }
});
test('equal evidence falls back to a stable source identity order',async()=>{
 const store=backend([work('b'),work('a')]);
 const q=await listQualityQueue(store,{source:'cosbooru',limit:100});
 assert.deepEqual(q.works.map(w=>w.source_post_id),['a','b']);
});
