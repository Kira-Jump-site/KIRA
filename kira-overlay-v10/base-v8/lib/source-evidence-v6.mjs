/** Real documented upstream field mapping. Never guess popularity from pixels. */
export const EVIDENCE_VERSION='2026-10-18.7';
const nonempty=x=>typeof x==='string'?x.trim():'';
const num=x=>x===null||x===undefined||x===''||!Number.isFinite(Number(x))||Number(x)<0?null:Number(x);
const strings=x=>(Array.isArray(x)?x:typeof x==='string'?x.split(/\s+/):[]).map(v=>typeof v==='string'?v:v?.name||v?.tag||v?.tag_name||'').filter(Boolean);
const first=(...args)=>args.map(nonempty).find(Boolean)||'';
function stripTags(html){return String(html||'').replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim()}
export function extractBooruIdentity(post,source){
 const artistTags=strings(post.tag_string_artist||post.tag_string_artist_tags),
    typed=Object.freeze({artist:artistTags,character:strings(post.tag_string_character),ip:strings(post.tag_string_copyright),general:strings(post.tag_string_general),meta:strings(post.tag_string_meta)});
 let uploader=first(post.uploader?.name,post.uploader?.username,post.uploader_name);
 const uploaderId=String(post.uploader?.id??post.uploader_id??post.creator_id??post.owner_id??'');
 if(!uploader&&typeof post.owner==='string')uploader=post.owner;
 // Bare `tags` is never sufficient proof of artist identity.
 return {source_artist_name:artistTags.join(', '),artist_evidence:artistTags.length?'typed_artist_tag':'unknown',
 uploader_name:uploader,uploader_id:uploaderId,source_tag_groups:typed,original_source_url:nonempty(post.source)||null,
 source_score_raw:num(post.score),favorites_raw:num(post.fav_count),likes_raw:num(post.up_score),
 title:first(post.title)};
}
export function extractNekosiaItems(data){
 if(data?.success===false)return [];
 // Current published v1 documents the singleton object, even though `count`
 // is the number of matching filtered images and NOT an array of images.
 const candidates=Array.isArray(data)?data:Array.isArray(data?.images)?data.images:
  Array.isArray(data?.data)?data.data:data?.image?[data]:data?.data?.image?[data.data]:[];
 return candidates.map(x=>{
   const src=x.image||{},size=x.metadata?.original||{},m=x.metadata?.compressed||{},at=x.attribution?.artist||{};
   const id=String(x.id||'');if(!id||!src.original?.url)return null;
   return {id,thumbnail:src.compressed?.url||src.original?.url,preview:src.original.url,
     width:num(size.width),height:num(size.height),preview_width:num(m.width),preview_height:num(m.height),
     title:nonempty(x.anime?.character)||nonempty(x.anime?.title)||'',
     artist:nonempty(at.username),artist_url:nonempty(at.profile),original_source_url:nonempty(x.source?.url)||null,
     tags:strings(x.tags),source_tag_groups:{character:x.anime?.character?[x.anime.character]:[],ip:x.anime?.title?[x.anime.title]:[],general:strings(x.tags)},
     source_score_raw:null,favorites_raw:null,content_rating:x.rating||'unknown'};
 }).filter(Boolean);
}
export function extractBilibiliNode(node){
 const d=node?.modules?.module_dynamic||{},a=node?.modules?.module_author||{},stat=node?.modules?.module_stat||{};
 const item=node?.basic||{},text=first(item.title,d.major?.opus?.title,d.desc?.text,d.major?.opus?.summary?.text,d.major?.opus?.summary?.text);
 const posts=d.major?.draw?.items||d.major?.opus?.pics||[];
 const tags=[...new Set([...text.matchAll(/#([^#\r\n]{1,40})#/g)].map(x=>x[1].trim()))].slice(0,30);
 return {id:String(node.id_str||node.id||''),title:text.slice(0,300),uploader_name:nonempty(a.name),uploader_id:String(a.mid||''),
   original_artist_name:'',original_artist_evidence:'unknown',tags,images:posts.map((p,i)=>({index:i,url:first(p.src,p.url),width:num(p.width),height:num(p.height)})).filter(x=>x.url),
   likes_raw:num(stat.like?.count??stat.like??node.stat?.like),comments_raw:num(stat.comment?.count??stat.comment),reposts_raw:num(stat.forward?.count??stat.forward),published_at:num(a.pub_ts),
   reposted:a.type==='AUTHOR_TYPE_PGC'||node.type==='DYNAMIC_TYPE_FORWARD'};
}
export function extractEshuushuuDetail(html){
 const data=stripTags(html);const titleTag=/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]||'';
 const rawTitle=stripTags(titleTag).replace(/\s*[-|]\s*(?:Image\s*#?\d+\s*[-|]\s*)?e-shuushuu.*$/i,'').replace(/^Image\s*#?\d+\s*[-|]*/i,'').trim();
 const match=/(?:Rating\s*:?\s*)(\d+(?:\.\d+)?)\s*\/\s*10\s*\(\s*(\d+)\s*vote/i.exec(data);
 const fav=/(?:Favorites\s*:?\s*)([\d,]+)/i.exec(data);
 const uploader=/(?:Uploaded by\s+)(.{1,100}?)(?:\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}|\s+Tags\b|\s+Image Information\b)/i.exec(data);
 const size=/(?:Dimensions\s*:?\s*)([\d,]+)\s*[×x]\s*([\d,]+)/i.exec(data);
 // Uploader lives in a /users/id anchor under "Uploaded by" on the current Svelte site.
 const uploadAt=html.indexOf('Uploaded by');
 const uploadedSection=uploadAt<0?'':html.slice(uploadAt,uploadAt+2500);
 const uploaderAnchor=/<a\b[^>]*class=["'][^"']*username-link[^"']*["'][^>]*>([^<]+)<\/a>/i.exec(uploadedSection);
 const pixivRef=/<a\b[^>]*href=["'](https:\/\/(?:www\.)?pixiv\.net\/artworks\/\d+)["']/i.exec(html);
 return {title:'',display_title:rawTitle,title_provenance:rawTitle?'site_generated_from_tags':'missing',source_score_raw:match?num(match[1]):null,source_vote_count:match?num(match[2]):null,
  favorites_raw:fav?num(fav[1].replace(/,/g,'')):null,source_vote_count:match?num(match[2]):null,original_source_url:pixivRef?.[1]||null,
  uploader_name:uploaderAnchor?stripTags(uploaderAnchor[1]):uploader?uploader[1].replace(/\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}.*$/i,'').trim():'',
  width:size?num(size[1].replace(/,/g,'')):null,height:size?num(size[2].replace(/,/g,'')):null};
}
export function zerochanParams({page=1,mode='new',tag='',range=1}={}){
 const params=new URLSearchParams({p:String(page),l:'40'});
 params.set('s',mode==='popular'||mode==='popular_alt'?'fav':'id');
 if(mode==='popular')params.set('t',String(range));
 if(mode==='popular_alt')params.set('t','0');
 if(mode!=='new')params.set('d','large');
 params.set('json','');
 const clean=tag.trim();
 if(clean&&!/^[\p{L}\p{N} _+,-]{1,80}$/u.test(clean))throw Error('unsupported_zerochan_tag');
 const path=clean?'/'+clean.split(/\s+/).join('+'):'/';
 return {url:'https://www.zerochan.net'+path+'?'+params.toString(),requires_user_agent:true,source_documentation:'https://www.zerochan.net/api'};
}
export function selectRealPopularity(work){
 const source=work.source;
 const metrics={score:num(work.source_score_raw),favorites:num(work.favorites_raw),likes:num(work.likes_raw),views:num(work.views_raw)};
 const choose=(...fields)=>fields.map(f=>[f,metrics[f]]).find(([,value])=>value!==null)||[null,null];
 let [signal,value]=({
 safebooru:()=>choose('score'),safedonmai:()=>choose('favorites','score'),cosbooru:()=>choose('score','favorites'),
 konachan:()=>choose('score'),nekosia:()=>[null,null],e_shuushuu:()=>choose('favorites','score'),
 pixiv:()=>choose('favorites','likes'),pixiv_yuki:()=>choose('favorites','likes'),
 miyoushe_cos:()=>choose('likes','favorites'),wallhaven:()=>choose('favorites','views'),
 bilibili_opus:()=>choose('likes','favorites'),zerochan:()=>choose('favorites')
 })[source]?.()||[null,null];
 return {signal,value,rankable:value!==null};
}
/** Gallery page anchors can change attribute ordering between site revisions. */
export function extractEshuushuuCards(html,{limit=20}={}){
 const found=new Map();
 for(const match of String(html).matchAll(/<a\b([^>]*\bhref=["']\/images\/(\d+)\/?["'][^>]*)>([\s\S]*?)<\/a>/gi)){
  const id=match[2],inside=match[3];
  const thumb=/<img\b[^>]*\bsrc=["'](https:\/\/cdn\.e-shuushuu\.net\/thumbs\/[^"']+)["']/i.exec(inside)?.[1];
  if(thumb&&!found.has(id))found.set(id,[id,thumb]);
  if(found.size>=limit)break;
 }
 // Historical cards sometimes use a quoted, preloaded full thumbnail outside the link.
 return [...found.values()];
}
/** Different Booru engines overload `s`: Gel/Moebooru = safe, Danbooru = sensitive. */
export function decodeBooruRating(raw,kind){
 const r=String(raw??'').trim().toLowerCase();
 if(['dan','don'].includes(kind)){
  if(['g','general'].includes(r))return 'safe';
  if(['s','sensitive','q','questionable','suggestive'].includes(r))return 'sensitive';
  if(['e','explicit'].includes(r))return 'explicit';
  return 'unknown';
 }
 if(['s','safe','g','general','0'].includes(r))return 'safe';
 if(['q','questionable','sensitive','suggestive','1'].includes(r))return 'sensitive';
 if(['e','explicit','2'].includes(r))return 'explicit';
 return 'unknown';
}
