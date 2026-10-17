import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';
import {REPLENISH_SOURCES,replenishSource} from '../lib/replenish.mjs';
import {discoverSource} from '../lib/source-adapters.mjs';
class BlobStore{
 constructor(){this.data=new Map()}
 async setJSON(k,v,{onlyIfNew}={}){
  if(onlyIfNew&&this.data.has(k)){const e=Error('exists');e.code='PRECONDITION_FAILED';throw e}
  this.data.set(k,structuredClone(v))
 }
 async get(k){return structuredClone(this.data.get(k)||null)}
 async list({prefix}){return {blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
}
const item=id=>({id,preview_url:'https://safebooru.org/thumbnails/x.jpg',
 sample_url:'https://safebooru.org/samples/x.jpg',rating:'s',tags:'anime',width:1000,height:800});
test('daily schedule covers every enabled source exactly once',async()=>{
 const config=JSON.parse(await readFile('edgeone.json','utf8'));
 assert.equal(config.schedules.length,REPLENISH_SOURCES.length);
 assert.deepEqual(new Set(config.schedules.map(x=>x.payload.source)),new Set(REPLENISH_SOURCES));
 assert.ok(config.schedules.every(x=>x.path==='/api/cron/replenish'&&x.method==='POST'&&x.timezone==='Asia/Shanghai'));
});
test('low stock replenishment writes safe work once and throttles shared visitors',async()=>{
 const store=new BlobStore();
 let count=0;
 const fetcher=async()=>{count++;return new Response(JSON.stringify([item(99888881)]),{status:200})};
 const a=await replenishSource(store,'safebooru',{now:1792251000000,reason:'low_stock',remaining:10,fetcher,maxPages:3});
 assert.equal(a.ok,true);assert.equal(a.added,1);assert.equal(a.published,1);
 assert.equal((await store.get('catalog/v2/live/recent/safebooru.json')).works.length,1);
 const before=count;
 const b=await replenishSource(store,'safebooru',{now:1792251001000,reason:'low_stock',remaining:1,fetcher});
 assert.equal(b.skipped,'cooldown');
 assert.equal(count,before);
 const healthy=await replenishSource(store,'safebooru',{now:1792262000000,reason:'low_stock',remaining:60,fetcher});
 assert.equal(healthy.skipped,'healthy_inventory');
 assert.equal(count,before);
});
test('safedonmai parser accepts general and rejects explicit image responses',async()=>{
 const p={id:12399175,rating:'g',image_width:1000,image_height:800,
  media_asset:{variants:[{type:'360x360',url:'https://cdn.donmai.us/360x360/ab.jpg'}]},
  large_file_url:'https://cdn.donmai.us/sample/ab.jpg'};
 const fetcher=async()=>new Response(JSON.stringify([p,{...p,id:12399176,rating:'e'}]),{status:200});
 const r=await discoverSource('safedonmai',{fetcher});
 assert.equal(r.works.length,1);
 assert.equal(r.works[0].source_post_id,'12399175');
 assert.ok(r.works[0].images[0].thumbnail_url.includes('cdn.donmai.us'));
});
