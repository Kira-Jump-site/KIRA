import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {sourceFunctionBodies} from '../patches/provider-functions-v7.mjs';
import {parseWallhavenDetail,parseZerochanDetail} from '../lib/source-details-v7.mjs';
import {zerochanParams} from '../lib/source-evidence-v6.mjs';
const common={SourceFailure:Error,dateOf:()=>123,
  oneImage:(thumb,preview,width,height)=>thumb&&preview?{image_index:0,thumbnail_url:thumb,preview_url:preview,width,height}:null,
  item:(source,id,values,images)=>images.length?{source,source_post_id:id,...values,images,visibility:'public'}:null};
function createAdapter(name,response){
 const args=['response','parseWallhavenDetail','parseZerochanDetail','zerochanParams','SourceFailure','dateOf','oneImage','item'];
 const f=new Function(...args,sourceFunctionBodies[name]+`\nreturn ${name};`);
 return f(response,parseWallhavenDetail,parseZerochanDetail,zerochanParams,common.SourceFailure,common.dateOf,common.oneImage,common.item);
}
test('wallhaven source lane fetches real detail path to recover tags+uploader',async()=>{
 const urls=[];const adapter=createAdapter('getWallhaven',async u=>{urls.push(String(u));if(String(u).includes('/w/a12345'))return {data:{id:'a12345',category:'anime',purity:'sfw',tags:[{name:'Hatsune Miku'}],favorites:95,views:444,uploader:{username:'UP'}}};return {data:[{id:'a12345',category:'anime',purity:'sfw',thumbs:{large:'https://th.wallhaven.cc/a.jpg'},path:'https://w.wallhaven.cc/a.jpg',dimension_x:2800,dimension_y:1900,favorites:93}]}});
 const list=await adapter({page:1,mode:'popular',fetcher:async()=>{}});
 assert.equal(list.length,1);assert.deepEqual(list[0].tags,['Hatsune Miku']);assert.equal(list[0].uploader,'UP');assert.equal(list[0].author_role,'unknown');assert.equal(list[0].favorites,95);assert.ok(urls[0].includes('sorting=toplist'));assert.ok(urls[1].includes('/w/a12345'));
});
test('wallhaven broken detail remains pending (not silently publishable)',async()=>{
 const adapter=createAdapter('getWallhaven',async u=>{if(String(u).includes('/w/'))throw Error('unavailable');return {data:[{id:'a12345',category:'anime',purity:'sfw',thumbs:{large:'https://th.wallhaven.cc/a.jpg'},path:'https://w.wallhaven.cc/a.jpg'}]}});
 const r=await adapter({page:1});assert.equal(r[0].visibility,'pending');assert.equal(r[0].metadata_status,'detail_unverified');
});
test('zerochan source lane retrieves per-entry favorite count and tag list',async()=>{
 const urls=[];const adapter=createAdapter('getZerochan',async u=>{urls.push(String(u));if(String(u).includes('/3793685?json'))return {id:3793685,primary:'Hatsune Miku',tags:['Hatsune Miku','VOCALOID'],fav:42,full:'https://static.zerochan.net/3793685.jpg',small:'https://static.zerochan.net/s.jpg',width:1920,height:2400};return {items:[{id:3793685,medium:'https://static.zerochan.net/3793685-medium.jpg',thumbnail:'https://static.zerochan.net/3793685-thumb.jpg'}]}});
 const r=await adapter({page:1,mode:'popular'});assert.equal(r.length,1);assert.equal(r[0].favorites,42);assert.deepEqual(r[0].tags,['Hatsune Miku','VOCALOID']);assert.equal(r[0].title,'');assert.equal(r[0].display_title,'Hatsune Miku');assert.ok(urls[0].includes('s=fav'));
});
test('zerochan detail failure does not invent a title or source rating',async()=>{
 const adapter=createAdapter('getZerochan',async u=>{if(String(u).includes('/3793685?json'))throw Error('unavailable');return {items:[{id:3793685,medium:'https://static.zerochan.net/m.jpg',thumbnail:'https://static.zerochan.net/t.jpg'}]}});
 const r=await adapter({page:1});assert.equal(r.length,1);assert.equal(r[0].title,'');assert.equal(r[0].favorites,null);assert.equal(r[0].visibility,'pending');
});

test('zerochan real HTTP 500 JSON listing falls back to HTML IDs then verified JSON details',async()=>{
 const urls=[];const response=async(u)=>{const url=String(u);urls.push(url);
  if(url.includes('/3793685?json'))return {id:3793685,primary:'Hatsune Miku',tags:['Hatsune Miku'],small:'https://static.zerochan.net/s.jpg',full:'https://static.zerochan.net/f.jpg',width:2400,height:3200};
  if(url.includes('json='))throw new Error('upstream_http_500');
  if(url.includes('?')&&!url.includes('json='))return '<div data-id="3793685"><a class="thumb" href="/3793685">test</a></div>';
  throw Error('unexpected '+url);
 };
 class SourceFailure extends Error {}
 const args=['response','parseWallhavenDetail','parseZerochanDetail','zerochanParams','SourceFailure','dateOf','oneImage','item'];
 const f=new Function(...args,sourceFunctionBodies.getZerochan+'\nreturn getZerochan;');
 const adapter=f(async(...a)=>{try{return await response(...a)}catch(e){throw new SourceFailure(e.message)}},parseWallhavenDetail,parseZerochanDetail,zerochanParams,SourceFailure,common.dateOf,common.oneImage,common.item);
 const works=await adapter({page:1,mode:'popular'});
 assert.equal(works.length,1);assert.equal(works[0].source_post_id,'3793685');assert.deepEqual(works[0].tags,['Hatsune Miku']);
 assert.equal(urls.filter(x=>x.includes('/3793685?json')).length,1);
 assert.ok(urls.some(x=>x.includes('s=fav')&&!x.includes('json=')&&!x.includes('d=large')));
});
test('Bilibili migrated opus/feed/space shape resolves 2-image post and real poster/likes',async()=>{
 const {extractBilibiliNode}=await import('../lib/source-evidence-v6.mjs');
 const requestPaths=[];
 const response=async url=>{const path=String(url);requestPaths.push(path);
  if(path.includes('/opus/feed/space'))return {code:0,data:{items:[{opus_id:'1259246611190513671',content:'崩坏星穹铁道:托帕',stat:{like:'221'},cover:{url:'http://i0.hdslb.com/x.jpg'}}]}};
  if(path.includes('/detail?id='))return {code:0,data:{item:{id_str:'1259246611190513671',type:'DYNAMIC_TYPE_DRAW',modules:{
   module_author:{name:'二次元的太太',mid:284805222,pub_ts:1792029599},
   module_stat:{like:{count:221}},module_dynamic:{desc:{text:'托帕 #崩坏星穹铁道#'},major:{draw:{items:[
    {src:'http://i0.hdslb.com/bfs/new_dyn/one.png',width:1800,height:2600},
    {src:'http://i1.hdslb.com/bfs/new_dyn/two.png',width:1900,height:2400}]}}}}
  }}};
  throw Error('unexpected endpoint '+path);
 };
 const callback=new Function('response','extractBilibiliNode','SourceFailure','oneImage','item',sourceFunctionBodies.getBilibili+'\nreturn getBilibili;');
 const adapter=callback(response,extractBilibiliNode,Error,common.oneImage,common.item);
 const result=await adapter({tag:'',authorSlot:2});
 assert.equal(result.length,1);assert.equal(result[0].images.length,2);assert.equal(result[0].uploader,'二次元的太太');
 assert.equal(result[0].author,'');assert.equal(result[0].likes,221);
 assert.ok(result[0].tags.includes('崩坏星穹铁道'));
 assert.ok(requestPaths[0].includes('/opus/feed/space'));assert.ok(requestPaths[1].includes('/detail?id='));
 assert.ok(result[0].images[0].preview_url.startsWith('https://i0.hdslb.com'));
});
