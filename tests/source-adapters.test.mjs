import{test}from'node:test';
import{strict as assert}from'node:assert';
import{discoverSource,flattenForReader}from'../lib/source-adapters.mjs';
import{ingestSource,getLiveRecent}from'../lib/live-ingest.mjs';
class FakeBlob{
 constructor(){this.data=new Map()}
 async setJSON(k,v,{onlyIfNew}={}){
  if(onlyIfNew&&this.data.has(k)){let e=Error('conditional key exists');e.code='PRECONDITION_FAILED';throw e}
  this.data.set(k,structuredClone(v));
 }
 async get(k,{type}={}){if(!this.data.has(k))return null;const v=this.data.get(k);return type==='json'?structuredClone(v):v}
 async list({prefix}){return {blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
}
function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})}
const safePost=id=>({id,preview_url:'https://safebooru.org/thumbnails/a.jpg',sample_url:'https://safebooru.org/samples/a.jpg',rating:'s',tags:'miku blue_hair',width:1200,height:1900});
const safefetch=async()=>response([safePost(101),{...safePost(102),rating:'e'}]);
test('safebooru parses and filters unsafe records',async()=>{
 const result=await discoverSource('safebooru',{fetcher:safefetch});
 assert.equal(result.works.length,1);assert.equal(result.works[0].source_post_id,'101');
 assert.equal(flattenForReader(result.works)[0].source,'safebooru');
});
test('cosbooru parses Danbooru photo metadata',async()=>{
 const p={id:402,rating:'g',tag_string:'anime character',preview_file_url:'https://cos.booru.nl/t.jpg',large_file_url:'https://cos.booru.nl/l.jpg'};
 const d=await discoverSource('cosbooru',{fetcher:async()=>response([p])});
 assert.equal(d.works.length,1);
 assert.equal(d.works[0].kind,'illustration');
});
test('nekosia parses API image object with safe rating',async()=>{
 const d=await discoverSource('nekosia',{fetcher:async()=>response({success:true,images:[{id:'66a77347a4b979c761eb0cde',image:{original:{url:'https://cdn.nekosia.cat/image.png',width:1200,height:1900},compressed:{url:'https://cdn.nekosia.cat/s.jpg'}},attribution:{artist:{username:'artist'}}}]})});
 assert.equal(d.works.length,1);assert.equal(d.works[0].author,'artist');
});
test('pixiv_yuki random recommends without claiming tag search',async()=>{
 const data={success:true,data:{id:'12345678',title:'test',width:800,height:1300,urls:{thumb:'https://i.pixiv.re/t.jpg',regular:'https://i.pixiv.re/l.jpg'},user:{name:'creator'}}};
 const fetcher=async()=>response(data);
 const d=await discoverSource('pixiv_yuki',{fetcher});
 assert.equal(d.works.length,1);assert.equal(d.works[0].visibility,'pending');
 await assert.rejects(discoverSource('pixiv_yuki',{tag:'hatsune_miku',fetcher}),/only_pixiv_id_lookup_supported/);
});
test('miyoushe parses multiple pictures under one work',async()=>{
 const doc={retcode:0,data:{list:[{post:{post_id:'77333345',subject:'cosplay 正片',created_at:1787000000,images:['https://upload-bbs.miyoushe.com/a.jpg','https://upload-bbs.miyoushe.com/b.jpg']},user:{nickname:'coser'}}]}};
 const d=await discoverSource('miyoushe_cos',{fetcher:async()=>response(doc)});
 assert.equal(d.works.length,1);assert.deepEqual(d.works[0].images.map(x=>x.image_index),[0,1]);
 assert.equal(d.next_cursor,null);
});
test('bilibili parses opus detail with multiple drawings',async()=>{
 const doc={code:0,data:{item:{modules:{module_author:{name:'画师'},module_dynamic:{major:{draw:{items:[{src:'http://i0.hdslb.com/bfs/new_dyn/a.jpg',width:1000,height:1400},{src:'http://i0.hdslb.com/bfs/new_dyn/b.jpg',width:1500,height:1600}]}}}}}}};
 const d=await discoverSource('bilibili_opus',{tag:'1256589349307285508',fetcher:async()=>response(doc)});
 assert.equal(d.works.length,1);assert.equal(d.works[0].images.length,2);assert.ok(d.works[0].images[0].preview_url.startsWith('https://'));
});
test('konachan 403 is reported, not disguised as successful results',async()=>{
 await assert.rejects(discoverSource('konachan',{fetcher:async()=>response({},403)}),/upstream_http_403/);
});
test('E-Shuushuu parses real site card and full-image page',async()=>{
 const list='<figure><a href="/images/1121120" class="image-link" data-image-id="1121120"><img src="https://cdn.e-shuushuu.net/thumbs/x.webp" alt="Image"/></a></figure>';
 const detail='<title>anime image</title><img class="full-image svelte-test" src="https://cdn.e-shuushuu.net/large/x.jpg" width="4000" height="4000"/>rating:0,image_id:1121120';
 const fetcher=async u=>new Response(String(u).includes('/images/1121120')?detail:list);
 const d=await discoverSource('e_shuushuu',{fetcher});
 assert.equal(d.works.length,1);assert.equal(d.works[0].rating,'safe');
 assert.equal(d.works[0].images[0].preview_url,'https://cdn.e-shuushuu.net/large/x.jpg');
});
test('EdgeOne ingestion persists once and shares a source cooldown',async()=>{
 const s=new FakeBlob();
 const one=await ingestSource(s,'safebooru',{fetcher:safefetch,now:1792238000000});
 assert.equal(one.new_posts,1);assert.equal(one.published,1);
 assert.equal((await getLiveRecent(s,'safebooru')).length,1);
 const two=await ingestSource(s,'safebooru',{fetcher:safefetch,now:1792238000001});
 assert.equal(two.skipped,'cooldown');assert.equal(two.new_posts,0);
 const reread=await s.get('catalog/v2/live/items/safebooru/101.json',{type:'json'});
 assert.equal(reread.work.source_post_id,'101');
});
test('ingestion deduplicates already archived source identities',async()=>{
 const s=new FakeBlob();
 await s.setJSON('catalog/v2/lookup/safebooru.json',{'101':0});
 const r=await ingestSource(s,'safebooru',{fetcher:safefetch,now:1792238300000});
 assert.equal(r.new_posts,0);assert.equal((await getLiveRecent(s,'safebooru')).length,0);
});

test('miyoushe cursor pagination uses last_id rather than ineffective page param',async()=>{
 let upstreamUrl='';
 const document={retcode:0,data:{list:[],last_id:'4',is_last:false}};
 const d=await discoverSource('miyoushe_cos',{page:3,cursor:'3',fetcher:async u=>{upstreamUrl=String(u);return response(document)}});
 assert.equal(new URL(upstreamUrl).searchParams.get('last_id'),'3');
 assert.equal(d.next_cursor,'4');
 assert.equal(d.page_mode,'keyword_cursor');
});

test('e_shuushuu refuses ignored tag search instead of repeating the same images',async()=>{
 await assert.rejects(discoverSource('e_shuushuu',{tag:'hatsune_miku',fetcher:async()=>response([])}),/e_shuushuu_tag_search_not_verified/);
});

test('refresh rotates pages and preserves source work identities',async()=>{
 const s=new FakeBlob(),seen=[];
 const upstream=async url=>{
  const u=new URL(url);const page=Number(u.searchParams.get('pid'))+1;seen.push(page);
  return response([safePost(100+page)]);
 };
 const one=await ingestSource(s,'safebooru',{fetcher:upstream,now:1792238000000});
 const two=await ingestSource(s,'safebooru',{fetcher:upstream,now:1792238310000});
 assert.deepEqual(seen,[1,2]);assert.equal(one.new_posts,1);assert.equal(two.new_posts,1);
 assert.deepEqual((await getLiveRecent(s,'safebooru')).map(w=>w.source_post_id).sort(),['101','102']);
});

test('Wallhaven SFW anime is accepted, non-anime and NSFW rejected',async()=>{
 const data={data:[
  {id:'e8vm9o',purity:'sfw',category:'anime',url:'https://wallhaven.cc/w/e8vm9o',
   path:'https://w.wallhaven.cc/full/e8/wallhaven-e8vm9o.jpg',
   thumbs:{large:'https://th.wallhaven.cc/lg/e8/e8vm9o.jpg'},dimension_x:2132,dimension_y:1199},
  {id:'oops',purity:'nsfw',category:'anime',path:'https://w.wallhaven.cc/test.jpg',thumbs:{large:'https://th.wallhaven.cc/test.jpg'}}
 ]};
 let requested;
 const r=await discoverSource('wallhaven',{fetcher:async url=>{requested=new URL(url);return response(data)}});
 assert.equal(r.works.length,1);assert.equal(r.works[0].source_post_id,'e8vm9o');
 assert.equal(r.works[0].rating,'safe');
 assert.equal(requested.searchParams.get('purity'),'100');
 assert.equal(requested.searchParams.get('categories'),'010');
});

test('media probe rejects SSRF origins and accepts real image MIME',async()=>{
 const {probeMedia}=await import('../lib/media-health.mjs');
 let requests=0;
 const fetcher=async()=>{requests++;return new Response(null,{status:200,headers:{'Content-Type':'image/jpeg'}})};
 assert.equal((await probeMedia('wallhaven','https://127.0.0.1/private',{fetcher})).ok,false);
 assert.equal(requests,0);
 assert.equal((await probeMedia('wallhaven','https://w.wallhaven.cc/full/a.jpg',{fetcher})).ok,true);
 assert.equal(requests,1);
 assert.equal((await probeMedia('wallhaven','https://w.wallhaven.cc/full/a.jpg',{fetcher:async()=>new Response('<html/>',{status:200,headers:{'Content-Type':'text/html'}})})).ok,false);
});

test('failed thumbnail probe prevents an otherwise safe work being published',async()=>{
 const store=new FakeBlob(),date=1792238000000;
 const report=await ingestSource(store,'safebooru',{fetcher:async()=>response([safePost(765)]),now:date,
  mediaFetcher:async()=>new Response('<html/>',{status:200,headers:{'Content-Type':'text/html'}})});
 const saved=await getLiveRecent(store,'safebooru');
 assert.equal(report.media_failed,2);assert.equal(report.published,0);
 assert.equal(saved[0].visibility,'pending');assert.equal(saved[0].media_status,'sample_failed');
});

test('preparsed discovery persists without a second upstream fetch',async()=>{
 const db=new FakeBlob();let calls=0;
 const fetched=await discoverSource('safebooru',{fetcher:async()=>{calls++;return response([safePost(321)])}});
 const result=await ingestSource(db,'safebooru',{preparsed:fetched,fetcher:async()=>{calls++;throw Error('unexpected duplicate fetch')},now:1792238000000});
 assert.equal(calls,1);
 assert.equal(result.new_posts,1);
 assert.equal((await getLiveRecent(db,'safebooru'))[0].source_post_id,'321');
 const state=await db.get('catalog/v2/ingest/state/safebooru.json',{type:'json'});
 assert.equal(state,null); // GET /api/discover did not silently advance a page it did not fetch.
});

test('recovered 8745-work identity index prevents duplicate ingestion',async()=>{
 const {LEGACY_TOTAL,isLegacyWork}=await import('../lib/legacy-ids.mjs');
 const {readFile}=await import('node:fs/promises');
 assert.equal(LEGACY_TOTAL,8745);
 assert.equal(isLegacyWork('bilibili_opus','1256589349307285508'),true);
 const work=JSON.parse(await readFile('public/assets/catalog-api/safebooru.json','utf8'))[0];
 assert.equal(isLegacyWork('safebooru',work.source_post_id),true);
 assert.equal(isLegacyWork('wallhaven','e8vm9o'),false);
});

test('miyoushe only collects actual cosplay, not fanart or ordinary posts from cosplay search',async()=>{
 const a=(id,subject,topics=[])=>({post:{post_id:String(id),subject,uid:'1',images:['https://upload-bbs.miyoushe.com/cos.jpg']},topics});
 const data={retcode:0,data:{list:[
  a(1,'角色 Cosplay 正片 摄影'),
  a(2,'今天画的同人插画 cosplay'),
  a(3,'鸣潮角色同人图'),
  a(4,'无关内容'),
  a(5,'绘画教程 Cosplay 正片')
 ],is_last:true}};
 const r=await discoverSource('miyoushe_cos',{fetcher:async()=>new Response(JSON.stringify(data))});
 assert.deepEqual(r.works.map(w=>w.source_post_id),['1']);
 assert.equal(r.works[0].images.length,1);
});
