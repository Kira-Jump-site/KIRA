/**
 * KIRA verified public source parsers.
 * Every adapter fetches its own fixed upstream; no user-selected host or proxy.
 * Works are kept as entities with image[] children, while /api/discover exposes
 * a per-image flattened response for compatibility with the original reader.
 */
import {SOURCES} from './catalog.mjs';
import {sourceQuery,sourceSchedule} from './source-policy.mjs';

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
 .filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,80);
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
 author_role:values.author_role||'unknown',
 published_at:values.published_at||0,indexed_at:Math.floor(Date.now()/1000),
 rating,kind:values.kind||'illustration',
 visibility:rating==='safe'?'public':'pending',
 tags:tagsOf(values.tags),raw_tags:tagsOf(values.tags),
 raw_rating:values.raw_rating??null,content_type:values.kind||'unknown',
 content_type_evidence:values.kind==='cosplay'?'source_tag_or_cosplay_text':null,
 content_type_confidence:values.kind==='cosplay'?0.8:null,
 source_published_at:values.published_at||null,adapter_version:'source-adapters:2026-10-18',
 source_score_raw:optionalNumber(values.score),favorites_raw:optionalNumber(values.favorites),
 likes_raw:optionalNumber(values.likes),views_raw:optionalNumber(values.views),images};
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
  const safe=ratingOf(p.rating);
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
  const host=source==='safebooru'?'https://safebooru.org/index.php?page=post&s=view&id=':
   source==='konachan'?'https://konachan.net/post/show/':source==='safedonmai'?'https://safebooru.donmai.us/posts/':'https://cos.booru.nl/posts/';
  return item(source,id,{canonical_url:host+id,author:p.tag_string_artist||p.tag_string_artist_tags||'',uploader:p.uploader?.name||p.uploader_name||'',
 uploader_id:p.uploader?.id||p.uploader_id||'',author_role:p.tag_string_artist?'tagged_artist':'unknown',title:p.title||'',tags,
   published_at:dateOf(p.created_at||p.change||p.updated_at),rating:safe,raw_rating:p.rating,score:p.score,favorites:p.fav_count,kind:tags.some(t=>/^(cosplay|cosplayer|cosplay_photo|cosplay_photography)$/i.test(t))?'cosplay':'illustration'},[img]);
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
async function getNekosia({page,tag,fetcher,mode='new'}){
 const u=new URL('https://api.nekosia.cat/api/v1/images/cute');
 u.searchParams.set('count','20');u.searchParams.set('rating','safe');
 if(tag)u.searchParams.set('additionalTags',tag.split(/\s+/).slice(0,3).join(','));
 const data=await response(u,fetcher);
 const rows=Array.isArray(data.images)?data.images:data.image?[data]:data.id?[data]:[];
 if(!data.success||!rows.length)throw new SourceFailure('upstream_empty_or_rejected',503);
 return rows.map(x=>{
  const value=x.image||x;
  const id=String(x.id||x.image_id||value.id||'');
  const image=oneImage(value.compressed?.url||value.original?.url,value.original?.url||value.compressed?.url,
   value.original?.width||value.width,value.original?.height||value.height);
  return item('nekosia',id,{canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),rating:'safe',
   author:x.attribution?.artist?.username||'',
 author_id:x.attribution?.artist?.id||'',author_role:'attribution_artist',
 title:x.title||'',tags:x.tags?.tags||x.tags||[],kind:'illustration'},image?[image]:[]);
 }).filter(Boolean);
}
function yukiItem(data,source){
 if(!data||!data.id||!data.urls||data.isAvailable===false)return null;
 const u=data.urls;
 const imageUrl=u=>typeof u==='string'?u.replace(/^https:\/\/pixiv\.yuki\.sh\/image\//,'https://i.pixiv.re/'):u;
 const img=oneImage(imageUrl(u.thumb||u.small||u.regular),imageUrl(u.regular||u.original),data.width,data.height);
 return item(source,data.id,{canonical_url:'https://www.pixiv.net/artworks/'+data.id,title:data.title,
  author:data.user?.name||'',author_id:data.user?.id||'',author_role:'pixiv_artist',tags:data.tags,
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
 const results=await Promise.allSettled(Array.from({length:4},()=>response(u,fetcher)));
 const works=results.filter(v=>v.status==='fulfilled'&&v.value?.success).map(v=>yukiItem(v.value.data,source)).filter(Boolean);
 const seen=new Set();return works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id));
}
async function getEshuushuu({page,tag,fetcher}){
 if(tag)throw new SourceFailure('e_shuushuu_tag_search_not_verified',422);
 const index=new URL('https://e-shuushuu.net/');
 index.searchParams.set('page',String(page));
 const html=await response(index,fetcher,'text/html');
 const matches=[...html.matchAll(/<a href="\/images\/(\d+)"[^>]*data-image-id="\d+"[^>]*><img src="(https:\/\/cdn\.e-shuushuu\.net\/thumbs\/[^"]+)"/g)].slice(0,12);
 if(!matches.length)throw new SourceFailure('upstream_gallery_layout_changed',503);
 let next=0;const out=[];
 async function run(){
  while(next<matches.length){
   const m=matches[next++];
   try{
    const detail=await response('https://e-shuushuu.net/images/'+m[1],fetcher,'text/html');
    const full=detail.match(/class="full-image[^"]*" src="(https:\/\/cdn\.e-shuushuu\.net\/large\/[^"]+)"/);
    const size=detail.match(/class="full-image[^"]*" src="[^"]+"[^>]*width="(\d+)" height="(\d+)"/);
    const title=detail.match(/<title>([^<]+)<\/title>/);
    const rating=detail.match(/(?:rating:|"rating"\s*:)(\d+)/);
    const fullsize=detail.match(/(?:^|,)url:"(https:\/\/cdn\.e-shuushuu\.net\/fullsize\/[^"]+)"/);
    const img=oneImage(m[2],fullsize?.[1]||full?.[1],Number(size?.[1])||1,Number(size?.[2])||1);
    // Rating 0 in the first-party image detail data denotes safe.
    const w=item('e_shuushuu',m[1],{canonical_url:'https://e-shuushuu.net/images/'+m[1],
     title:title?.[1]?.replace(/&amp;/g,'&')||'',rating:rating?.[1]==='0'?'safe':'unknown',
     tags:tag?[tag]:[]},img?[img]:[]);
    if(w)out.push(w);
   }catch{/* Individual detail can fail without losing the entire page. */}
  }
 }
 await Promise.all(Array.from({length:Math.min(3,matches.length)},()=>run()));
 if(!out.length)throw new SourceFailure('upstream_gallery_details_failed',503);
 return out.sort((a,b)=>Number(b.source_post_id)-Number(a.source_post_id));
}
async function getMiyoushe({page,tag,cursor,fetcher}){
 const u=new URL('https://bbs-api.miyoushe.com/painter/wapi/searchPosts');
 u.searchParams.set('keyword',tag||'cosplay');u.searchParams.set('size','20');
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
    typeof x==='string'?x:x.url||x.original||x.cover,0,0,i)).filter(Boolean);
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
    title,author:p.user?.nickname||'',author_id:post.uid||'',author_role:'post_creator',published_at:dateOf(post.created_at),
    tags:topics?topics.split(/[,，]+/).map(x=>x.trim()).filter(Boolean):['cosplay'],kind:'cosplay',rating:'unknown'},all);
  if(w)works.push(w);
 }
 return {works,next_cursor:data.data.is_last?null:
  (/^[0-9]{1,8}$/.test(String(data.data.last_id||''))?String(data.data.last_id):null)};
}
async function getWallhaven({page,tag,fetcher,mode='new'}){
 const url=new URL('https://wallhaven.cc/api/v1/search');
 url.searchParams.set('q',['anime',tag].filter(Boolean).join(' '));
 url.searchParams.set('categories','010');
 url.searchParams.set('purity','100');
 url.searchParams.set('sorting',mode==='popular'?'toplist':mode==='popular_alt'?'favorites':'date_added');
 if(mode==='popular')url.searchParams.set('topRange','1M');
 url.searchParams.set('page',String(page));
 const data=await response(url,fetcher);
 if(!Array.isArray(data.data))throw new SourceFailure('upstream_invalid_wallhaven');
 return data.data.slice(0,maxResults).map(p=>{
  if(p.purity!=='sfw'||p.category!=='anime')return null;
  const thumb=p.thumbs?.large||p.thumbs?.original||p.thumbs?.small;
  const image=oneImage(thumb,p.path,p.dimension_x,p.dimension_y);
  return item('wallhaven',p.id,{canonical_url:p.url,title:'',rating:'safe',
   uploader:p.uploader?.username||'',uploader_id:p.uploader?.username||'',author_role:'unknown',
   tags:tag?[tag]:['anime'],published_at:dateOf(p.created_at),favorites:p.favorites,views:p.views,raw_rating:p.purity},image?[image]:[]);
 }).filter(Boolean);
}
async function getZerochan({page,tag,fetcher}){
 const u=new URL(tag?'https://www.zerochan.net/'+encodeURIComponent(tag):'https://www.zerochan.net/');
 u.searchParams.set('p',String(page));u.searchParams.set('json','');
 const raw=await response(u,fetcher);
 const rows=Array.isArray(raw)?raw:Array.isArray(raw.items)?raw.items:Array.isArray(raw.results)?raw.results:[];
 if(!rows.length)throw new SourceFailure('zerochan_upstream_unavailable',503);
 return rows.slice(0,30).map(p=>{
  const img=oneImage(p.thumbnail||p.thumbnail_url,p.medium||p.large||p.full||p.url,p.width,p.height);
  return item('zerochan',p.id,{canonical_url:'https://www.zerochan.net/'+p.id,rating:'unknown'},img?[img]:[]);
 }).filter(Boolean);
}
async function getBilibili({tag,fetcher}){
 const id=/^(?:https?:\/\/(?:www\.|m\.)?bilibili\.com\/opus\/)?(\d{10,22})(?:[/?#].*)?$/.exec(tag||'')?.[1];
 if(!id){
  const ids=['2433445','2051740842','284805222']; // recovered historic Bilibili author UIDs
  const uid=ids[(Math.max(1,Number(arguments[0]?.page||1))-1)%ids.length];
  const u=new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space');
  u.searchParams.set('host_mid',uid);u.searchParams.set('features','itemOpusStyle');
  const data=await response(u,fetcher);
  if(data.code!==0||!Array.isArray(data.data?.items))throw new SourceFailure('bilibili_space_access_restricted',503);
  const works=[];
  for(const node of data.data.items){
   const opus=String(node.id_str||node.id||'');
   const module=node.modules?.module_dynamic||{};
   const pics=module.major?.draw?.items||module.major?.opus?.pics||[];
   const images=pics.slice(0,32).map((x,i)=>oneImage(String(x.src||x.url||'').replace(/^http:\/\//,'https://'),String(x.src||x.url||'').replace(/^http:\/\//,'https://'),x.width,x.height,i)).filter(Boolean);
   const w=item('bilibili_opus',opus,{canonical_url:'https://www.bilibili.com/opus/'+opus,
    rating:'unknown',author_id:uid,author_role:'feed_account',title:module.desc?.text||module.major?.opus?.summary?.text||''},images);
   if(w)works.push(w);
  }
  return works;
 }
 const u=new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/detail');u.searchParams.set('id',id);
 const data=await response(u,fetcher);
 if(data.code!==0||!data.data?.item)throw new SourceFailure('upstream_bilibili_detail_unavailable',503);
 const node=data.data.item,module=node.modules?.module_dynamic||{};
 const imgs=module.major?.draw?.items||module.major?.opus?.pics||[];
 const secureBiliImage=u=>typeof u==='string'?u.replace(/^http:\/\/(i[012]\.hdslb\.com\/bfs\/new_dyn\/)/,'https://$1'):u;
 const images=imgs.slice(0,32).map((x,i)=>{
  const url=secureBiliImage(x.src||x.url);
  return oneImage(url,url,x.width,x.height,i);
 }).filter(Boolean);
 const works=item('bilibili_opus',id,{canonical_url:'https://www.bilibili.com/opus/'+id,
  title:module.desc?.text||module.major?.opus?.summary?.text||'',author:node.modules?.module_author?.name||'',
  author_id:node.modules?.module_author?.mid||'',author_role:'opus_poster',published_at:dateOf(node.modules?.module_author?.pub_ts),
  rating:'unknown'},images);
 return works?[works]:[];
}
export const DISCOVERABLE_SOURCES=new Set(['safebooru','safedonmai','cosbooru','konachan','nekosia','e_shuushuu','pixiv_yuki','pixiv','miyoushe_cos','wallhaven','bilibili_opus','zerochan']);
export async function discoverSource(source,{page=1,tag='',cursor='',mode='new',fetcher=fetch}={}){
 if(!SOURCES.has(source))throw new SourceFailure('unsupported_source',400);
 if(!Number.isSafeInteger(page)||page<1||page>50||typeof tag!=='string'||tag.length>100)
  throw new SourceFailure('invalid_query',400);
 if(!['new','popular','popular_alt'].includes(mode))throw new SourceFailure('unsupported_mode',400);
 const policy=sourceSchedule(source,1);
 if(mode!=='new'&&!policy.popular_supported)throw new SourceFailure('unverified_popular_mode',422);
 const translated=sourceQuery(source,tag.trim());
 if(tag&&!translated.supported)throw new SourceFailure('source_tag_not_supported_'+translated.reason,422);
 const args={page,tag:translated.value,cursor,fetcher,source,mode};
 let works,nextCursor=null;
 switch(source){
  case 'safebooru':works=await getSafebooru(args);break;
  case 'safedonmai':works=await getSafedonmai(args);break;
  case 'cosbooru':works=await getCosbooru(args);break;
  case 'konachan':works=await getKonachan(args);break;
  case 'nekosia':works=await getNekosia(args);break;
  case 'e_shuushuu':works=await getEshuushuu(args);break;
  case 'pixiv_yuki':case 'pixiv':works=await getPixiv(args);break;
  case 'miyoushe_cos':{const data=await getMiyoushe(args);works=data.works;nextCursor=data.next_cursor;break;}
  case 'wallhaven':works=await getWallhaven(args);break;
  case 'zerochan':works=await getZerochan(args);break;
  case 'bilibili_opus':works=await getBilibili(args);break;
  default:throw new SourceFailure('unsupported_source',400);
 }
 const seen=new Set();works=works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id));
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
  width:image.width,height:image.height,thumbnail_url:image.thumbnail_url,preview_url:image.preview_url,
  source_url:w.canonical_url,created_at:w.published_at,indexed_at:w.indexed_at,
  rating:w.rating,kind:w.kind,visibility:w.visibility
 })));
}
