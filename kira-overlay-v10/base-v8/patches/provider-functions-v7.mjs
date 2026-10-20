/** Source-specific network discovery, intended to replace exact adapter functions via patcher.
 * Imported into the adapter file by source code (not as separate runtime module).
 * All calls use the adapter's existing `response()` timeout/error wrapper.
 */
export const sourceFunctionBodies = {
getWallhaven: `async function getWallhaven({page,tag,fetcher,mode='new'}){
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
`,
getZerochan: `async function getZerochan({page,tag,fetcher,mode='new'}){
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
  const ids=[...new Set([...html.matchAll(/\\bdata-id=["'](\\d{5,12})["']/g)].map(m=>m[1]))].slice(0,12);
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
`
,getBilibili: String.raw`async function getBilibili({tag,fetcher,authorSlot=0}){
 // Verified 2026-10-18: old /feed/space returns HTTP 412;
 // /opus/feed/space returns {items:[{opus_id,content,cover,stat}]}.
 // Every candidate must be resolved through /detail?id= for actual multi-image
 // images, publisher identity, topic, and per-post interaction metadata.
 const direct=/^(?:https?:\/\/(?:www\.|m\.)?bilibili\.com\/opus\/)?(\d{10,22})(?:[/?#].*)?$/.exec(tag||'')?.[1];
 const ids=['2433445','2051740842','284805222'];
 let candidates=[];
 if(direct)candidates=[direct];
 else{
  const uid=ids[Math.abs(authorSlot)%ids.length];
  const u=new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/opus/feed/space');
  u.searchParams.set('host_mid',uid);
  const feed=await response(u,fetcher);
  if(feed.code!==0||!Array.isArray(feed.data?.items))throw new SourceFailure('bilibili_opus_feed_invalid',503);
  candidates=[...new Set(feed.data.items.map(x=>String(x.opus_id||'')).filter(x=>/^\d{10,22}$/.test(x)))].slice(0,6);
 }
 if(!candidates.length)throw new SourceFailure('bilibili_opus_feed_empty',503);
 let cursor=0;const out=new Array(candidates.length);
 async function worker(){while(cursor<candidates.length){const index=cursor++,opus=candidates[index];
  try{
   const u=new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/detail');u.searchParams.set('id',opus);
   const data=await response(u,fetcher);
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
`

};
