/**
 * Bounded sampling for an upstream source batch.
 * Validation never follows arbitrary URLs: every image must belong to a fixed,
 * source-specific CDN allowlist. A successful JSON response is not a media pass.
 */
const HOSTS={
 safebooru:['safebooru.org'],
 safedonmai:['cdn.donmai.us','safebooru.donmai.us'],
 cosbooru:['cos.booru.nl'],
 konachan:['konachan.net','konachan.com'],
 nekosia:['cdn.nekosia.cat'],
 e_shuushuu:['cdn.e-shuushuu.net'],
 pixiv_yuki:['i.pixiv.re','i.pixiv.cat','i.pixiv.nl','i.pximg.net','i-cf.pximg.net'],
 pixiv:['i.pixiv.re','i.pixiv.cat','i.pixiv.nl','i.pximg.net','i-cf.pximg.net'],
 miyoushe_cos:['upload-bbs.miyoushe.com'],
 bilibili_opus:['i0.hdslb.com','i1.hdslb.com','i2.hdslb.com'],
 wallhaven:['th.wallhaven.cc','w.wallhaven.cc'],
 zerochan:['s1.zerochan.net','s2.zerochan.net','s3.zerochan.net','static.zerochan.net','www.zerochan.net']
};
export function allowMediaUrl(source,url){
 try{
  const u=new URL(url);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
   (HOSTS[source]||[]).includes(u.hostname)&&u.href.length<=2048;
 }catch{return false}
}
export async function probeMedia(source,url,{fetcher=fetch,timeoutMs=4500}={}){
 if(!allowMediaUrl(source,url))return {ok:false,error:'untrusted_media_origin'};
 try{
  const res=await fetcher(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  const mime=(res.headers.get('content-type')||'').split(';')[0].toLowerCase();
  const ok=res.ok&&/^image\/(?:jpeg|png|webp|avif|gif)$/.test(mime);
  return {ok,http_status:res.status,mime,error:ok?null:'non_image_or_http_error'};
 }catch(e){return {ok:false,error:e?.name==='TimeoutError'?'media_timeout':'media_fetch_failed'}}
}
export async function sampleWorkMedia(works,{fetcher=fetch,maxWorks=2}={}){
 const selected=works.slice(0,maxWorks);
 const checks=[];
 for(const work of selected)for(const img of work.images?.slice(0,1)||[]){
  checks.push({source:work.source,source_post_id:work.source_post_id,kind:'thumbnail',url:img.thumbnail_url});
  checks.push({source:work.source,source_post_id:work.source_post_id,kind:'preview',url:img.preview_url});
 }
 const result=await Promise.all(checks.map(async({source,source_post_id,url,kind})=>({...await probeMedia(source,url,{fetcher}),kind,source_post_id})));
 return {checked:result.length,passed:result.filter(x=>x.ok).length,
  failed:result.filter(x=>!x.ok).length,details:result.map(x=>({
   source_post_id:x.source_post_id,kind:x.kind,ok:x.ok,http_status:x.http_status??null,mime:x.mime??null,error:x.error??null
  }))};
}
