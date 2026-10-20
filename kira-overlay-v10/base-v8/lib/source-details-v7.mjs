/** Provider detail data extraction; no heuristic picture-title/artist invention. */
export const SOURCE_DETAILS_VERSION='2026-10-18.7';
const num=v=>v===null||v===undefined||v===''||!Number.isFinite(Number(v))||Number(v)<0?null:Number(v);
const str=v=>typeof v==='string'?v.trim():'';
const uri=v=>{try{const u=new URL(v);return u.protocol==='https:'&&u.username===''&&u.password===''?u.href:null}catch{return null}};
const htmlEntities=x=>String(x||'').replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"').replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v));
export function parseWallhavenDetail(raw,expectedId){
 const x=raw?.data||raw;
 if(!x||String(x.id)!==String(expectedId)||x.purity!=='sfw'||x.category!=='anime')return null;
 const tags=Array.isArray(x.tags)?x.tags.map(t=>str(t?.name||t)).filter(Boolean):[];
 return {source_post_id:String(x.id),raw_tags:tags,source_tag_groups:{general:tags},
  uploader_name:str(x.uploader?.username),source_artist_name:'',
  original_source_url:uri(x.source),title:'',display_title:tags.slice(0,3).join(' · '),title_provenance:'site_tag_summary',
  favorites_raw:num(x.favorites),views_raw:num(x.views),dimension_x:num(x.dimension_x),dimension_y:num(x.dimension_y),
  detail_verified:true,detail_provenance:'wallhaven:/api/v1/w/:id'};
}
export function parseZerochanDetail(raw,expectedId){
 const x=raw?.item||raw?.data||raw;
 if(!x||String(x.id)!==String(expectedId))return null;
 const tags=(Array.isArray(x.tags)?x.tags:typeof x.tags==='string'?x.tags.split(','):[]).map(t=>str(t?.name||t)).filter(Boolean);
 const title=str(x.title),primary=str(x.primary),creator=str(x.artist);
 return {source_post_id:String(x.id),raw_tags:tags,source_tag_groups:{general:tags},
   title,display_title:title||primary,title_provenance:title?'source_explicit_title':primary?'source_primary_tag':'missing',
   source_artist_name:creator,artist_evidence:creator?'source_artist_field':'unknown',
   original_source_url:uri(x.source),favorites_raw:num(x.fav??x.favorites??x.fav_count),
   image_url:uri(x.full||x.large||x.medium),thumbnail_url:uri(x.small||x.thumbnail||x.medium),
   width:num(x.width),height:num(x.height),detail_verified:true,detail_provenance:'zerochan:/id?json'};
}
/** Directly read Svelte data-tag-type instead of the "›" /tags navigation links.
 * Verified Oct 18 2026 from a real page: type 3 artist, 2 IP/source,
 * 4 character, 1 general. Typed provenance, not guessed labels.
 */
export function parseEshuushuuTagGroups(html){
 const result={artist:[],ip:[],character:[],general:[]};
 const lookup={'3':'artist','2':'ip','4':'character','1':'general'};
 for(const m of String(html||'').matchAll(/<a\b([^>]*\bdata-tag-id=["']\d+["'][^>]*)>([\s\S]*?)<\/a>/gi)){
  const id=/\bdata-tag-type=["'](\d+)["']/.exec(m[1])?.[1],axis=lookup[id];if(!axis)continue;
  const label=htmlEntities(m[2].replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
  if(label&&label.length<=100&&!result[axis].includes(label))result[axis].push(label);
 }
 return result;
}
export function parseEshuushuuTags(html){
 const groups=parseEshuushuuTagGroups(html);
 const typed=Object.values(groups).flat();
 if(typed.length)return [...new Set(typed)].slice(0,80);
 // Legacy pre-Svelte details used heading + ordinary links. Only parse inside
 // the explicit Tags section, never global navigation/comments.
 const body=String(html||'');
 const start=body.search(/<h[1-6][^>]*>\s*Tags\s*<\/h[1-6]>/i);
 if(start<0)return [];
 const after=body.slice(start+1,Math.min(body.length,start+15000));
 const end=after.search(/<h[1-6][^>]*>\s*Image Information\s*<\/h[1-6]>/i);
 const section=end<0?after:after.slice(0,end);
 const out=new Set();
 for(const m of section.matchAll(/<a\b[^>]*href=["']\/tags\/\d+["'][^>]*>([\s\S]*?)<\/a>/gi)){
   const tag=htmlEntities(m[1].replace(/<[^>]*>/g,' ')).trim();
   if(tag&&tag.length<100)out.add(tag);
 }
 return [...out].slice(0,80);
}
export function popularityCandidateId(source,w){
 if(!w?.source_post_id)return null;
 const n=Number(w.favorites_raw??w.source_score_raw??w.likes_raw);
 return {source,id:w.source_post_id,upstreamSignal:Number.isFinite(n)?n:null};
}
