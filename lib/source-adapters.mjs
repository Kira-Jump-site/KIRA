/**
 * KIRA verified public source parsers.
 * Every adapter fetches its own fixed upstream; no user-selected host or proxy.
 * Works are kept as entities with image[] children, while /api/discover exposes
 * a per-image flattened response for compatibility with the original reader.
 */
import {SOURCES} from './catalog.mjs';
import {sourceQuery,sourceSchedule,sourceDiscoveryLane} from './source-policy.mjs';
import {displayThumbnail,displayPreview} from './image-delivery.mjs';
import {normalizeWorkTags} from './tag-ontology-v5.mjs';
import {fetchNekosiaRegistry,toNekosiaSearch} from './source-tag-registry-v8.mjs';
import {extractBooruIdentity,extractNekosiaItems,extractBilibiliNode,extractEshuushuuDetail,extractEshuushuuCards,zerochanParams,decodeBooruRating} from './source-evidence-v6.mjs';
import {parseWallhavenDetail,parseZerochanDetail,parseEshuushuuTags,parseEshuushuuTagGroups} from './source-details-v7.mjs';
import {signWbi,parseWbiKeys} from './wbi-sign-v16.mjs';

const TIMEOUT_MS=10500;
const urlOf=value=>{
 if(typeof value!=='string'||value.length>2048)return null;
 try{
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
  return u.href;
 }catch{return null}
};
const tagsOf=value=>(Array.isArray(value)?value:String(value||'').split(/[,\s]+/))
 .map(x=>typeof x==='string'?x:(x&&typeof x==='object'?x.tag||x.name||x.tag_name||'':'')).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,80);
const ratingOf=value=>{
 const r=String(value??'').toLowerCase();
 if(['s','safe','g','general','0'].includes(r))return 'safe';
 if(['q','questionable','sensitive','suggestive','1'].includes(r))return 'sensitive';
 if(['e','explicit','2'].includes(r))return 'explicit';
 return 'unknown';
};
const dateOf=value=>{
 if(typeof value==='number')return Math.max(0,Math.floor(value));
 const d=Date.parse(String(value||''));return Number.isFinite(d)?Math.floor(d/1000):0;
};
export class SourceFailure extends Error{
 constructor(code,status=502){super(code);this.name='SourceFailure';this.status=status}
}
const maxResults=30;
const oneImage=(thumbnail,preview,width,height,index=0)=>{
 const thumb=urlOf(thumbnail),full=urlOf(preview)||thumb;
 return thumb&&full?{image_index:index,thumbnail_url:thumb,preview_url:full,original_url:null,width:Number(width)||1,height:Number(height)||1}:null;
};
const optionalNumber=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
function item(source,postid,values,images){
 const id=String(postid??'');
 if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(id)||!images?.length)return null;
 const rating=values.rating||'unknown';
 return {source,source_post_id:id,canonical_url:values.canonical_url||'',title:String(values.title||'').slice(0,250),
 author:String(values.author||'').slice(0,120),author_id:String(values.author_id||'').slice(0,120),
 uploader_name:String(values.uploader||'').slice(0,120),uploader_id:String(values.uploader_id||'').slice(0,120),
 author_role:values.author_role||'unknown',source_artist_name:String(values.source_artist_name||values.author||'').slice(0,180),
 uploader_role:'source_uploader',original_source_url:values.original_source_url||null,source_tag_groups:values.source_tag_groups||{},display_title:String(values.display_title||'').slice(0,300),title_provenance:values.title_provenance||'upstream_explicit',
 published_at:values.published_at||0,indexed_at:Math.floor(Date.now()/1000),
 rating,kind:values.kind||'illustration',
 visibility:rating==='safe'?'public':'pending',
 tags:tagsOf(values.tags),raw_tags:tagsOf(values.tags),source_tags_structured:Array.isArray(values.tags)?values.tags.slice(0,80):[],tags_translated:tagsOf(values.tags_translated),
 raw_rating:values.raw_rating??null,content_type:values.kind||'unknown',
 content_type_evidence:values.kind==='cosplay'?'source_tag_or_cosplay_text':null,
 content_type_confidence:values.kind==='cosplay'?0.8:null,
 source_published_at:values.published_at||null,adapter_version:'source-adapters:2026-10-18',
 source_score_raw:optionalNumber(values.score),favorites_raw:optionalNumber(values.favorites),
 likes_raw:optionalNumber(values.likes),views_raw:optionalNumber(values.views),source_vote_count:optionalNumber(values.source_vote_count),images};
}
async function response(url,fetcher,accept='application/json'){
 let r;
 try{r=await fetcher(url,{signal:AbortSignal.timeout(TIMEOUT_MS),headers:{Accept:accept,'User-Agent':'KIRA-JUMP/1.0 (+https://kira.casto.top)'}})}
 catch(e){throw new SourceFailure(e?.name==='TimeoutError'?'upstream_timeout':'upstream_connection_failed',503)}
 if(!r.ok)throw new SourceFailure('upstream_http_'+r.status,r.status===429?429:502);
 const text=await r.text();
 if(text.length>2500000)throw new SourceFailure('upstream_response_too_large');
 if(accept.startsWith('text/html'))return text;
 try{return JSON.parse(text)}catch{throw new SourceFailure('upstream_invalid_json')}
}
function booru(source,posts,kind){
 if(!Array.isArray(posts))throw new SourceFailure('upstream_invalid_shape');
 return posts.slice(0,maxResults).map(p=>{
  const safe=decodeBooruRating(p.rating,kind);
  if(safe!=='safe')return null; // Public discovery must not silently show unreviewed items.
  const id=String(p.id||'');
  const thumb=kind==='gel'||kind==='moe'?p.preview_url:
   kind==='don'?(p.media_asset?.variants?.find(v=>v.type==='360x360')?.url||p.preview_file_url):
   p.preview_file_url;
  const full=kind==='gel'||kind==='moe'?(p.sample_url||p.file_url):
   kind==='don'?(p.media_asset?.variants?.find(v=>v.type==='sample')?.url||p.large_file_url||p.file_url):
   (p.large_file_url||p.file_url);
  const img=oneImage(thumb||full,full,p.image_width||p.width,p.image_height||p.height);
  if(!img)return null;
  const tags=tagsOf(p.tags||p.tag_string);
   const artistTags=tagsOf(p.tag_string_artist);
   const tagged={artist:artistTags,character:tagsOf(p.tag_string_character),copyright:tagsOf(p.tag_string_copyright),
     general:tagsOf(p.tag_string_general),meta:tagsOf(p.tag_string_meta)};
  const host=source==='safebooru'?'https://safebooru.org/index.php?page=post&s=view&id=':
   source==='konachan'?'https://konachan.net/post/show/':source==='safedonmai'?'https://safebooru.donmai.us/posts/':'https://cos.booru.nl/posts/';
  return item(source,id,{canonical_url:host+id,author:artistTags.join(', '),source_artist_name:artistTags.join(', '),uploader:p.uploader?.name||p.uploader_name||p.owner||'',
 uploader_id:p.uploader?.id||p.uploader_id||p.creator_id||'',author_role:artistTags.length?'tagged_artist':'unknown',
   title:p.title||'',tags,source_tag_groups:tagged,original_source_url:p.source||null, ...extractBooruIdentity(p,source),
   published_at:dateOf(p.created_at||p.change||p.updated_at),rating:safe,raw_rating:p.rating,score:p.score,favorites:p.fav_count,likes:p.up_score,kind:tags.some(t=>/^(cosplay|cosplayer|cosplay_photo|cosplay_photography)$/i.test(t))?'cosplay':'illustration'},[img]);
 }).filter(Boolean);
}
async function getSafebooru({page,tag,fetcher,mode='new'}){
 const u=new URL('https://safebooru.org/index.php');
 for(const [k,v] of Object.entries({page:'dapi',s:'post',q:'index',json:'1',limit:'40',pid:String(page-1)}))u.searchParams.set(k,v);
 u.searchParams.set('tags',[tag,mode==='popular'?'sort:score:desc':''].filter(Boolean).join(' '));
 return booru('safebooru',await response(u,fetcher),'gel');
}
async function getCosbooru({page,tag,fetcher,mode='new'}){
 const u=new URL('https://cos.booru.nl/posts.json');
 u.searchParams.set('page',String(page));u.searchParams.set('limit','35');
 // Force general rating at the upstream, then re-check each item locally.
 u.searchParams.set('tags',[tag,'rating:g',mode==='popular'?'order:score':mode==='popular_alt'?'order:favcount':''].filter(Boolean).join(' ').trim());
 return booru('cosbooru',await response(u,fetcher),'dan');
}
async function getSafedonmai({page,tag,fetcher,mode='new'}){
 const u=new URL('https://safebooru.donmai.us/posts.json');
 u.searchParams.set('page',String(page));u.searchParams.set('limit','40');
 u.searchParams.set('tags',[tag,'rating:general',mode==='popular'?'order:rank':mode==='popular_alt'?'order:favcount':''].filter(Boolean).join(' ').trim());
 return booru('safedonmai',await response(u,fetcher),'don');
}
async function getKonachan({page,tag,fetcher,mode='new'}){
 const u=new URL('https://konachan.net/post.json');
 u.searchParams.set('page',String(page));u.searchParams.set('limit','35');
 u.searchParams.set('tags',[tag,'rating:safe',mode==='popular'?'order:score':mode==='popular_alt'?'order:mpixels':''].filter(Boolean).join(' '));
 try{return booru('konachan',await response(u,fetcher),'moe')}
 catch(e){
  if(!(e instanceof SourceFailure)||!/upstream_http_(403|429|502|503)/.test(e.message))throw e;
  u.hostname='konachan.com';
  return booru('konachan',await response(u,fetcher),'moe');
 }
}
async function getYande({page,tag,fetcher,mode='new'}){
 const u=new URL('https://yande.re/post.json');
 u.searchParams.set('page',String(page));u.searchParams.set('limit','35');
 u.searchParams.set('tags',[tag,'rating:safe',mode==='popular'?'order:score':mode==='popular_alt'?'order:mpixels':''].filter(Boolean).join(' '));
 return booru('yande',await response(u,fetcher),'moe');
}
async function getMiyousheArt({page,tag,fetcher,keyword='插画'}){
 const u=new URL('https://bbs-api.miyoushe.com/painter/wapi/searchPosts');
 u.searchParams.set('keyword',tag||keyword);u.searchParams.set('size','20');
 u.searchParams.set('last_id',String(Math.max(0,Number(page||1)-1)));
 const data=await response(u,fetcher);
 if(data.retcode!==0||!Array.isArray(data.data?.list))throw new SourceFailure('upstream_invalid_miyoushe_art_payload',503);
 const works=[];
 const cosplay=/cosplay|coser|cos\s*正片|cos\s*服|cos\s*照|出\s*cos|摄影正片|角色扮演|cos\s*写真/i;
 for(const p of data.data.list){
  const post=p.post||{},id=String(post.post_id||'');
  const all=(Array.isArray(p.image_list)&&p.image_list.length?p.image_list:[])
   .map((x,i)=>oneImage(typeof x==='string'?x:x.url||x.small||x.cover,
    typeof x==='string'?x:x.url||x.original||x.cover,
    typeof x==='string'?0:x.width,typeof x==='string'?0:x.height,i)).filter(Boolean);
  const topics=Array.isArray(p.topics)?p.topics.map(x=>x.name||x.topic_name||x.title||'').filter(Boolean):[];
  const text=(post.subject||'')+' '+(post.content||'')+' '+topics.join(' ');
  if(!all.length||!id||cosplay.test(text))continue;
  const w=item('miyoushe_art',id,{canonical_url:'https://www.miyoushe.com/ys/article/'+id,
   title:post.subject||'',author:'',uploader:p.user?.nickname||'',uploader_id:post.uid||'',author_id:'',author_role:'unknown',
   source_tag_groups:{general:topics},published_at:dateOf(post.created_at),
   tags:topics.length?topics:['插画'],kind:'illustration',rating:'unknown',
   likes_raw:Number(p.stat?.like_num)||0,views_raw:Number(p.stat?.view_num)||0},all);
  if(w)works.push(w);
 }
 return works;
}
async function getNekosia({page,tag,fetcher,category='cute',mode='new'}){
 const allowed=['cute','girl','vtuber','blue-archive','maid','catgirl'];
  if(!allowed.includes(category))throw new SourceFailure('nekosia_unverified_category',422);
  const u=new URL('https://api.nekosia.cat/api/v1/images/'+category);
 u.searchParams.set('count','20');u.searchParams.set('rating','safe');
 if(tag){
  const taxonomy=await fetchNekosiaRegistry({fetcher});
  const query=toNekosiaSearch(tag,taxonomy);
  if(!query.supported)throw new SourceFailure('nekosia_tag_not_found_in_upstream',422);
  u.searchParams.set('additionalTags',query.additionalTags);
 }
 const data=await response(u,fetcher);
 const rows=extractNekosiaItems(data);
 if(!data.success||!rows.length)throw new SourceFailure('upstream_empty_or_rejected',503);
 return rows.map(x=>{
  const value=x;
  const id=String(x.id||x.image_id||value.id||'');
  const image=oneImage(x.thumbnail,x.preview,x.width||1,x.height||1);
  if(image){image.thumbnail_url=displayThumbnail('nekosia',image.thumbnail_url);image.preview_url=displayPreview('nekosia',image.preview_url)}
  return item('nekosia',id,{canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),rating:x.content_rating==='safe'?'safe':'unknown',
   author:x.artist||'',original_source_url:x.original_source_url||null,
   source_tag_groups:x.source_tag_groups,
 author_id:x.attribution?.artist?.id||'',author_role:'attribution_artist',
 title:'',tags:x.tags||[],kind:'illustration'},image?[image]:[]);
 }).filter(Boolean);
}
function yukiItem(data,source){
 if(!data||!data.id||!data.urls||data.isAvailable===false)return null;
 const u=data.urls;
 const imageUrl=u=>typeof u==='string'?u.replace(/^https:\/\/pixiv\.yuki\.sh\/image\//,'https://i.pixiv.re/'):u;
 const img=oneImage(imageUrl(u.thumb||u.small||u.regular),imageUrl(u.regular||u.original),data.width,data.height);
 return item(source,data.id,{canonical_url:'https://www.pixiv.net/artworks/'+data.id,title:data.title,
  author:data.user?.name||'',author_id:data.user?.id||'',author_role:'pixiv_artist',tags:data.tags,
   source_tag_groups:{general:tagsOf(data.tags)},original_source_url:'https://www.pixiv.net/artworks/'+data.id,
  published_at:dateOf(data.createDate),favorites:data.totalBookmarks,views:data.totalView,
  rating:Number(data.xRestrict)===0&&Number.isInteger(Number(data.sanityLevel))&&Number(data.sanityLevel)<=5?'safe':'unknown'},img?[img]:[]);
}
async function getPixiv({source,tag,fetcher}){
 if(tag&&!/^[0-9]{4,16}$/.test(tag))throw new SourceFailure('only_pixiv_id_lookup_supported',422);
 // Pixiv and pixiv_yuki use the same verified recommendation feed for discovery.
 if(tag){
  const u=new URL('https://pixiv.yuki.sh/api/illust');u.searchParams.set('id',tag);
  const d=await response(u,fetcher);
  return [yukiItem(d.data,source)].filter(Boolean);
 }
 // Officially supported public random recommendation. No fabricated tag search.
 const u='https://pixiv.yuki.sh/api/recommend?type=json&size=regular&proxy=i.pixiv.re';
 const results=await Promise.allSettled(Array.from({length:12},()=>response(u,fetcher)));
 const works=results.filter(v=>v.status==='fulfilled'&&v.value?.success).map(v=>yukiItem(v.value.data,source)).filter(Boolean);
 const seen=new Set();return works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id));
}
async function getEshuushuu({page,tag,fetcher,mode='new'}){
 if(tag)throw new SourceFailure('e_shuushuu_tag_search_not_verified',422);
 const index=new URL(mode==='popular'?'https://e-shuushuu.net/images/top':'https://e-shuushuu.net/images');
 index.searchParams.set('page',String(page));
 const html=await response(index,fetcher,'text/html');
 const matches=extractEshuushuuCards(html,{limit:12});
 if(!matches.length)throw new SourceFailure('upstream_gallery_layout_changed',503);
 let next=0;const out=[];
 async function run(){
  while(next<matches.length){
   const m=matches[next++];
   try{
    const detail=await response('https://e-shuushuu.net/images/'+m[0],fetcher,'text/html');
    const full=detail.match(/class="full-image[^"]*" src="(https:\/\/cdn\.e-shuushuu\.net\/large\/[^"]+)"/);
    const size=detail.match(/class="full-image[^"]*" src="[^"]+"[^>]*width="(\d+)" height="(\d+)"/);
    const title=detail.match(/<title>([^<]+)<\/title>/);
    const rating=detail.match(/(?:rating:|"rating"\s*:)(\d+)/);
     const evidence=extractEshuushuuDetail(detail);
    const fullsize=detail.match(/(?:^|,)url:"(https:\/\/cdn\.e-shuushuu\.net\/fullsize\/[^"]+)"/);
    const img=oneImage(m[1],fullsize?.[1]||full?.[1],Number(size?.[1])||1,Number(size?.[2])||1);
    // Rating 0 in the first-party image detail data denotes safe.
    const w=item('e_shuushuu',m[0],{canonical_url:'https://e-shuushuu.net/images/'+m[0],
     title:evidence.title||'',display_title:evidence.display_title,title_provenance:evidence.title_provenance,uploader:evidence.uploader_name,score:evidence.source_score_raw,favorites:evidence.favorites_raw,
      // e-shuushuu exposes no per-image safety field; rating is a 0-10 quality score.
      rating:'unknown',
     tags:parseEshuushuuTags(detail),source_tag_groups:parseEshuushuuTagGroups(detail),
       source_artist_name:parseEshuushuuTagGroups(detail).artist.join(', '),
       author:parseEshuushuuTagGroups(detail).artist.join(', '),author_role:'typed_artist_tag',
       original_source_url:evidence.original_source_url,source_vote_count:evidence.source_vote_count},img?[img]:[]);
    if(w)out.push(w);
   }catch{/* Individual detail can fail without losing the entire page. */}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,matches.length)},()=>run()));
 if(!out.length)throw new SourceFailure('upstream_gallery_details_failed',503);
 return out.sort((a,b)=>Number(b.source_post_id)-Number(a.source_post_id));
}
async function getMiyoushe({page,tag,cursor,fetcher,keyword='cosplay'}){
 const u=new URL('https://bbs-api.miyoushe.com/painter/wapi/searchPosts');
 u.searchParams.set('keyword',tag||keyword);u.searchParams.set('size','20');
 const lastId=cursor||String(page-1);
 if(!/^[0-9]{1,8}$/.test(lastId))throw new SourceFailure('invalid_miyoushe_cursor',400);
 u.searchParams.set('last_id',lastId);
 const data=await response(u,fetcher);
 if(data.retcode!==0||!Array.isArray(data.data?.list))throw new SourceFailure('upstream_invalid_miyoushe_payload',503);
 const works=[];
 for(const p of data.data.list){
  const post=p.post||{},id=String(post.post_id||'');
  const all=(Array.isArray(p.image_list)&&p.image_list.length?p.image_list:post.images||[])
   .map((x,i)=>oneImage(typeof x==='string'?x:x.url||x.small||x.cover,
    typeof x==='string'?x:x.url||x.original||x.cover,
    typeof x==='string'?0:x.width,typeof x==='string'?0:x.height,i)).filter(Boolean);
  const title=post.subject||'';
  // The search keyword is NOT evidence that a post is a cosplay photograph.
  // Require genuine cosplay context in the posted title, topics, or description,
  // and exclude illustration/fanart even when upstream search returned it.
  const topics=Array.isArray(p.topics)?p.topics.map(x=>x.name||x.topic_name||x.title||'').join(' '):'';
  const text=(title+' '+topics+' '+(post.content||'')).slice(0,3000);
  const cosplay=/(cosplay|coser|cos\s*正片|cos\s*服|cos\s*照|出\s*cos|摄影正片|角色扮演|cos\s*写真)/i.test(text);
  const illustration=/(同人(画|图|插画|作品)?|绘画|画师|插画|板绘|手绘|原画|壁纸分享|ai绘画|ai\s*作画|二次创作|二创图)/i.test(text);
  if(!all.length||!id||!cosplay||illustration)continue;
  const w=item('miyoushe_cos',id,{canonical_url:'https://www.miyoushe.com/ys/article/'+id,
    title,author:'',uploader:p.user?.nickname||'',uploader_id:post.uid||'',author_id:'',author_role:'unknown',
     source_tag_groups:{type:['cosplay'],general:topics.split(/[，, ]+/).filter(Boolean)},published_at:dateOf(post.created_at),
    tags:topics?topics.split(/[,，]+/).map(x=>x.trim()).filter(Boolean):['cosplay'],kind:'cosplay',rating:'unknown'},all);
  if(w)works.push(w);
 }
 return {works,next_cursor:data.data.is_last?null:
  (/^[0-9]{1,8}$/.test(String(data.data.last_id||''))?String(data.data.last_id):null)};
}
async function getWallhaven({page,tag,fetcher,mode='new'}){
 const search=new URL('https://wallhaven.cc/api/v1/search');
 search.searchParams.set('q',['anime',tag].filter(Boolean).join(' '));
 search.searchParams.set('categories','010');search.searchParams.set('purity','100');
 search.searchParams.set('sorting',mode==='popular'?'toplist':mode==='popular_alt'?'favorites':'date_added');
 if(mode==='popular')search.searchParams.set('topRange','1M');
 search.searchParams.set('page',String(page));
 const data=await response(search,fetcher);
 if(!Array.isArray(data?.data))throw new SourceFailure('upstream_invalid_wallhaven');
 // Wallhaven search responses omit tag arrays: get the official single-wallpaper detail.
 const originals=data.data.filter(x=>x?.purity==='sfw'&&x?.category==='anime').slice(0,12);
 let next=0;const output=new Array(originals.length);
 async function worker(){while(next<originals.length){const i=next++,p=originals[i];
  let details=null;
  try{const obj=await response('https://wallhaven.cc/api/v1/w/'+encodeURIComponent(p.id),fetcher);
   details=parseWallhavenDetail(obj,p.id)}catch{} // One detail error cannot stall other sources.
  const preview=p.thumbs?.large||p.thumbs?.original||p.thumbs?.small;
  const image=oneImage(preview,p.path,p.dimension_x,p.dimension_y);
  const w=item('wallhaven',p.id,{canonical_url:p.url,title:'',rating:'safe',
   uploader:details?.uploader_name||p.uploader?.username||'',uploader_id:p.uploader?.username||'',
   original_source_url:details?.original_source_url||p.source||'',
   author_role:'unknown',tags:details?.raw_tags||[],source_tag_groups:details?.source_tag_groups||{},
   display_title:details?.display_title||'',title_provenance:details?.title_provenance||'missing',
   published_at:dateOf(p.created_at),favorites:details?.favorites_raw??p.favorites,
   views:details?.views_raw??p.views,raw_rating:p.purity},image?[image]:[]);
  if(w&&!details){w.visibility='pending';w.metadata_status='detail_unverified'}
  output[i]=w;
 }}
 await Promise.all(Array.from({length:Math.min(3,originals.length)},()=>worker()));
 return output.filter(Boolean);
}
async function getZerochan({page,tag,fetcher,mode='new'}){
 const req=zerochanParams({page,mode,tag});
 // The documented ?json listing can return HTTP 500 even when the human HTML
 // listing works. Real test (2026-10-18): /?p=1&s=fav&t=1 HTTP 200,
 // whereas its JSON equivalent returned 500. Recover IDs from the safe HTML
 // listing and resolve individual /id?json records; never parse images from
 // unreliable listing HTML as complete work metadata.
 let entries=[];
 try{const raw=await response(new URL(req.url),fetcher);
  entries=Array.isArray(raw)?raw:Array.isArray(raw.items)?raw.items:Array.isArray(raw.results)?raw.results:Array.isArray(raw.data)?raw.data:[];
 }catch(e){
  if(!(e instanceof SourceFailure)||e.message!=='upstream_http_500')throw e;
 }
 if(!entries.length){
  const htmlUrl=new URL(req.url);htmlUrl.searchParams.delete('json');
  htmlUrl.searchParams.delete('d'); // d=large may independently return 500.
  htmlUrl.searchParams.delete('l');
  const html=await response(htmlUrl,fetcher,'text/html');
  const ids=[...new Set([...html.matchAll(/\bdata-id=["'](\d{5,12})["']/g)].map(m=>m[1]))].slice(0,12);
  entries=ids.map(id=>({id}));
 }
 if(!entries.length)throw new SourceFailure('zerochan_listing_unavailable',503);
 const candidates=entries.slice(0,12);
 let next=0;const output=new Array(candidates.length);
 async function worker(){while(next<candidates.length){const i=next++,p=candidates[i];
  if(!/^[0-9]{1,12}$/.test(String(p.id||'')))continue;
  let detail=null;
  try{const rawDetail=await response('https://www.zerochan.net/'+p.id+'?json',fetcher);
   detail=parseZerochanDetail(rawDetail,p.id)}catch{}
  const img=oneImage(detail?.thumbnail_url||p.thumbnail||p.thumbnail_url||p.small,
    detail?.image_url||p.medium||p.large||p.full||p.url,detail?.width||p.width,detail?.height||p.height);
  const w=item('zerochan',p.id,{canonical_url:'https://www.zerochan.net/'+p.id,rating:'unknown',
   title:detail?.title||'',display_title:detail?.display_title||'',
   title_provenance:detail?.title_provenance||'missing',
   author:detail?.source_artist_name||'',author_role:detail?.artist_evidence||'unknown',
   uploader:p.uploader||'',tags:detail?.raw_tags||[],source_tag_groups:detail?.source_tag_groups||{},
   original_source_url:detail?.original_source_url||'',favorites:detail?.favorites_raw??p.fav??null},img?[img]:[]);
  if(w&&!detail){w.visibility='pending';w.metadata_status='detail_unverified'}
  output[i]=w;
 }}
 await Promise.all(Array.from({length:Math.min(2,candidates.length)},()=>worker()));
 return output.filter(Boolean);
}
const BILI_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
let bilibiliSessionCache=null;
async function bilibiliJson(fetcher,url,cookie=''){
 let r;
 try{r=await fetcher(url,{signal:AbortSignal.timeout(TIMEOUT_MS),headers:{Accept:'application/json','User-Agent':BILI_UA,Referer:'https://www.bilibili.com/',...(cookie?{Cookie:cookie}:{})}})}
 catch(e){throw new SourceFailure(e?.name==='TimeoutError'?'upstream_timeout':'upstream_connection_failed',503)}
 if(!r.ok)throw new SourceFailure('upstream_http_'+r.status,r.status===429?429:502);
 const text=await r.text();
 if(text.length>2500000)throw new SourceFailure('upstream_response_too_large');
 try{return JSON.parse(text)}catch{throw new SourceFailure('upstream_invalid_json')}
}
async function bilibiliAuth(fetcher){
 const now=Date.now();
 if(bilibiliSessionCache&&now-bilibiliSessionCache.at<55*60*1000&&bilibiliSessionCache.keys)return bilibiliSessionCache;
 let cookie='';
 try{const d=await bilibiliJson(fetcher,'https://api.bilibili.com/x/frontend/finger/spi');if(d?.code===0&&d.data?.b_3)cookie='buvid3='+d.data.b_3+'; buvid4='+(d.data.b_4||'')}catch{}
 let keys=null;
 try{keys=parseWbiKeys(await bilibiliJson(fetcher,'https://api.bilibili.com/x/web-interface/nav',cookie))}catch{}
 bilibiliSessionCache={cookie,keys,at:now};
 return bilibiliSessionCache;
}
async function getBilibili({tag,fetcher,authorSlot=0}){
 // Verified 2026-10-18: old /feed/space returns HTTP 412;
 // /opus/feed/space returns {items:[{opus_id,content,cover,stat}]}.
 // Every candidate must be resolved through /detail?id= for actual multi-image
 // images, publisher identity, topic, and per-post interaction metadata.
 const direct=/^(?:https?:\/\/(?:www\.|m\.)?bilibili\.com\/opus\/)?(\d{10,22})(?:[/?#].*)?$/.exec(tag||'')?.[1];
 const ids=['2433445','2051740842','284805222'];
 const auth=await bilibiliAuth(fetcher);
 let candidates=[];
 if(direct)candidates=[direct];
 else{
  const uid=ids[Math.abs(authorSlot)%ids.length];
  const u=new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space');
  u.searchParams.set('host_mid',uid);
  const feed=await bilibiliJson(fetcher,u.toString(),auth.cookie);
  if(feed.code!==0||!Array.isArray(feed.data?.items))throw new SourceFailure('bilibili_opus_feed_invalid',503);
  candidates=[...new Set(feed.data.items.map(x=>String(x.opus_id||'')).filter(x=>/^\d{10,22}$/.test(x)))].slice(0,6);
 }
 if(!candidates.length)throw new SourceFailure('bilibili_opus_feed_empty',503);
 let cursor=0;const out=new Array(candidates.length);
 async function worker(){while(cursor<candidates.length){const index=cursor++,opus=candidates[index];
  try{
   const query=auth.keys?signWbi({id:opus},auth.keys).query:'id='+encodeURIComponent(opus);
   const data=await bilibiliJson(fetcher,'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?'+query,auth.cookie);
   if(data.code!==0||!data.data?.item)continue;
   const parsed=extractBilibiliNode(data.data.item);
   if(parsed.reposted||!parsed.images.length)continue; // Unknown original attribution: do not promote forwarded posts.
   const images=parsed.images.slice(0,32).map(p=>{
    const src=p.url.replace(/^http:\/\/(i[012]\.hdslb\.com\/)/,'https://$1');
    return oneImage(src,src,p.width,p.height,p.index);
   }).filter(Boolean);
   const w=item('bilibili_opus',opus,{canonical_url:'https://www.bilibili.com/opus/'+opus,
     title:parsed.title,author:'',author_id:'',uploader:parsed.uploader_name,
     uploader_id:parsed.uploader_id,author_role:'unknown',kind:'illustration',
     likes:parsed.likes_raw,published_at:parsed.published_at,
     tags:parsed.tags,source_tag_groups:{general:parsed.tags}},images);
   if(w)out[index]=w;
  }catch{/* An inaccessible post must not poison other works or source stocks. */}
 }}
 await Promise.all(Array.from({length:Math.min(3,candidates.length)},()=>worker()));
 const works=out.filter(Boolean);
 if(!works.length)throw new SourceFailure('bilibili_opus_detail_failed',503);
 return works;
}
export const DISCOVERABLE_SOURCES=new Set(['safebooru','safedonmai','cosbooru','konachan','yande','nekosia','e_shuushuu','pixiv_yuki','pixiv','miyoushe_cos','miyoushe_art','wallhaven','bilibili_opus','zerochan']);
export async function discoverSource(source,{page=1,tag='',cursor='',mode='new',cycle=0,fetcher=fetch,rawTag=false}={}){
 if(!SOURCES.has(source))throw new SourceFailure('unsupported_source',400);
 if(!Number.isSafeInteger(page)||page<1||page>50||typeof tag!=='string'||tag.length>100)
  throw new SourceFailure('invalid_query',400);
 if(!['new','popular','popular_alt'].includes(mode))throw new SourceFailure('unsupported_mode',400);
 const policy=sourceSchedule(source,1);
 if(mode!=='new'&&!policy.popular_supported)throw new SourceFailure('unverified_popular_mode',422);
 const translated=rawTag?{value:tag.trim(),supported:true}:sourceQuery(source,tag.trim());
 if(!rawTag&&tag&&!translated.supported)throw new SourceFailure('source_tag_not_supported_'+translated.reason,422);
 const lane=sourceDiscoveryLane(source,cycle);
  const args={page,tag:translated.value,cursor,fetcher,source,mode,category:lane.category,keyword:lane.keyword,authorSlot:lane.authorSlot};
 let works,nextCursor=null;
 switch(source){
  case 'safebooru':works=await getSafebooru(args);break;
  case 'safedonmai':works=await getSafedonmai(args);break;
  case 'cosbooru':works=await getCosbooru(args);break;
  case 'konachan':works=await getKonachan(args);break;
  case 'yande':works=await getYande(args);break;
  case 'nekosia':works=await getNekosia(args);break;
  case 'e_shuushuu':works=await getEshuushuu(args);break;
  case 'pixiv_yuki':case 'pixiv':works=await getPixiv(args);break;
  case 'miyoushe_cos':{const data=await getMiyoushe(args);works=data.works;nextCursor=data.next_cursor;break;}
  case 'miyoushe_art':works=await getMiyousheArt(args);break;
  case 'wallhaven':works=await getWallhaven(args);break;
  case 'zerochan':works=await getZerochan(args);break;
  case 'bilibili_opus':works=await getBilibili(args);break;
  default:throw new SourceFailure('unsupported_source',400);
 }
 const seen=new Set();works=works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id)).map(w=>({...w,...normalizeWorkTags(w),source_discovery_mode:mode}));
 return {source,page,tag,mode,works,live:true,page_mode:source==='miyoushe_cos'?'keyword_cursor':'number',
  next_cursor:nextCursor,upstream_works:works.length};
}
export function flattenForReader(works){
 return works.flatMap(w=>w.images.map(image=>({
  id:w.source+':'+w.source_post_id+':'+image.image_index,source:w.source,source_post_id:w.source_post_id,
  pid:/^\d{1,10}$/.test(w.source_post_id)?Number(w.source_post_id):
   100000+[...w.source_post_id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261)%9900000,
  page:image.image_index,
  image_index:image.image_index,title:w.title,author:w.author,tags:w.tags,
  width:image.width,height:image.height,thumbnail_url:displayThumbnail(w.source,image.thumbnail_url),preview_url:displayPreview(w.source,image.preview_url),
  source_url:w.canonical_url,created_at:w.published_at,indexed_at:w.indexed_at,
  rating:w.rating,kind:w.kind,visibility:w.visibility
 })));
}
