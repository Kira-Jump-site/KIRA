/**
 * KIRA foreign-source relay (Cloudflare Worker).
 *
 * EdgeOne occasionally cannot fetch foreign APIs/CDNs. This Worker fetches a
 * small batch from Konachan/Yande/Nekosia, checks a thumbnail per work, then
 * posts a signed batch to EdgeOne. EdgeOne only writes/normalizes/dedupes; it
 * does not fetch the foreign source itself.
 *
 * Deploy secrets/vars:
 *   KIRA_INGEST_SECRET  (secret, must match EdgeOne env)
 *   KIRA_INGEST_URL     (plain text; default production ingest endpoint)
 * Cron: every 10 minutes. Manual: GET /run with Authorization: Bearer <secret>.
 */
const UA='KIRA-source-relay/1.0 (+https://kira.casto.top)';
const MAX_WORKS=10;
const SOURCE_URLS={
 konachan:tags=>'https://konachan.net/post.json?limit=20&tags='+encodeURIComponent(tags),
 yande:tags=>'https://yande.re/post.json?limit=20&tags='+encodeURIComponent(tags),
 nekosia:()=>'https://api.nekosia.cat/api/v1/images/cute?count=20&rating=safe'
};
const LANE='order:score rating:safe date:>=2026-01-01';

async function getJson(url){
 const r=await fetch(url,{headers:{'User-Agent':UA,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!r.ok)throw Error('upstream_'+r.status);
 return r.json();
}
function booruWork(source,post){
 const id=String(post?.id||'');if(!id)return null;
 const tags=String(post?.tags||'').trim().split(/\s+/).filter(Boolean);
 const image={
  image_index:0,
  thumbnail_url:String(post.preview_url||''),
  preview_url:String(post.sample_url||post.file_url||post.preview_url||''),
  original_url:String(post.file_url||post.sample_url||post.preview_url||''),
  width:Number(post.width)||1,height:Number(post.height)||1,
  media_status:'verified'
 };
 if(!image.thumbnail_url||!image.preview_url)return null;
 const artist=String(post.tag_string_artist||post.artist||'').trim();
 return {
  source,source_post_id:id,
  canonical_url:source==='konachan'?'https://konachan.net/post/show/'+id:'https://yande.re/post/show/'+id,
  title:'',author:artist,author_id:'',uploader:String(post.author||post.uploader||'').trim(),
  author_role:artist?'tagged_artist':'unknown',
  tags,raw_tags:tags,rating:'safe',kind:'illustration',
  published_at:Number(post.created_at)||0,source_score_raw:Number(post.score)||0,
  favorites_raw:Number(post.fav_count)||0,images:[image]
 };
}
function nekosiaWork(x){
 const id=String(x?.id||x?.image_id||'');if(!id)return null;
 const thumb=x?.image?.compressed?.url||x?.image?.original?.url;
 const preview=x?.image?.original?.url||thumb;
 if(!thumb||!preview)return null;
 const tags=Array.isArray(x.tags)?x.tags.filter(t=>typeof t==='string'):[];
 const artist=String(x?.attribution?.artist?.username||x?.artist||'').trim();
 return {
  source:'nekosia',source_post_id:id,canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),
  title:'',author:artist,author_id:'',uploader:'',author_role:artist?'attribution_artist':'unknown',
  tags,raw_tags:tags,rating:x.content_rating==='safe'?'safe':'unknown',kind:'illustration',
  published_at:0,likes_raw:Number(x?.statistics?.likes)||0,
  images:[{image_index:0,thumbnail_url:thumb,preview_url:preview,original_url:preview,
   width:Number(x?.metadata?.original?.width)||1,height:Number(x?.metadata?.original?.height)||1,
   media_status:'verified'}]
 };
}
async function mediaOk(url){
 try{
  const r=await fetch(url,{method:'HEAD',headers:{'User-Agent':UA},signal:AbortSignal.timeout(8000)});
  const mime=(r.headers.get('content-type')||'').split(';')[0].toLowerCase();
  return r.ok&&/^image\//.test(mime);
 }catch{return false}
}
async function collect(source){
 const url=source==='nekosia'?SOURCE_URLS.nekosia():SOURCE_URLS[source](LANE);
 const data=await getJson(url);
 const raw=source==='nekosia'?(Array.isArray(data?.images)?data.images:[]):(Array.isArray(data)?data:[]);
 const works=[];
 for(const row of raw){
  const w=source==='nekosia'?nekosiaWork(row):booruWork(source,row);
  if(!w||works.length>=MAX_WORKS)continue;
  if(!(await mediaOk(w.images[0].thumbnail_url)))continue;
  works.push(w);
 }
 return works;
}
async function run(env){
 const endpoint=env.KIRA_INGEST_URL||'https://kira.casto.top/api/catalog/worker-ingest';
 const secret=env.KIRA_INGEST_SECRET;
 if(!secret)return {ok:false,error:'missing_secret'};
 const results=[];
 for(const source of ['konachan','yande','nekosia']){
  try{
   const works=await collect(source);
   if(!works.length){results.push({source,ok:false,error:'no_works'});continue}
   const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-KIRA-Ingest-Secret':secret,'User-Agent':UA},
    body:JSON.stringify({source,works}),signal:AbortSignal.timeout(25000)});
   const body=await r.json().catch(()=>({}));
   results.push({source,ok:r.ok&&body.ok,http:r.status,added:body.report?.new_posts||0,published:body.report?.published||0,snapshot:body.snapshot?.count??null,error:body.error||null});
  }catch(e){results.push({source,ok:false,error:String(e.message||e).slice(0,120)})}
 }
 return {ok:results.some(x=>x.ok),at:new Date().toISOString(),results};
}
export default {
 async scheduled(event,env,ctx){ctx.waitUntil(run(env))},
 async fetch(request,env){
  const u=new URL(request.url);
  if(u.pathname==='/run'){
   const auth=request.headers.get('Authorization')||'';
   if(auth!=='Bearer '+String(env.KIRA_INGEST_SECRET||''))return new Response('unauthorized',{status:401});
   return Response.json(await run(env));
  }
  return Response.json({ok:true,service:'kira-source-relay'});
 }
};
