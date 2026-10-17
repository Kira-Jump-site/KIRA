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
export async function probeMedia(source,url,{fetcher=fetch,timeoutMs=4500,verifyBytes=fetcher===fetch}={}){
 if(!allowMediaUrl(source,url))return {ok:false,error:'untrusted_media_origin'};
 try{
  const res=await fetcher(url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
  const mime=(res.headers.get('content-type')||'').split(';')[0].toLowerCase();
  const ok=res.ok&&/^image\/(?:jpeg|png|webp|avif|gif)$/.test(mime);
  if(!verifyBytes)return {ok,http_status:res.status,mime,error:ok?null:'non_image_or_http_error'};
  if(!ok)return {ok:false,http_status:res.status,mime,error:'non_image_or_http_error'};
  const get=await fetcher(url,{method:'GET',redirect:'error',headers:{Range:'bytes=0-127'},signal:AbortSignal.timeout(timeoutMs)});
  const gotMime=(get.headers.get('content-type')||'').split(';')[0].toLowerCase();
  if(!get.ok||!/^image\/(?:jpeg|png|webp|avif|gif)$/.test(gotMime))
   return {ok:false,http_status:get.status,mime:gotMime,error:'media_get_not_image'};
  const reader=get.body?.getReader();if(!reader)return {ok:false,http_status:get.status,error:'empty_media_body'};
  const chunk=await reader.read();await reader.cancel().catch(()=>{});
  const bytes=chunk.value||new Uint8Array();
  const signature=bytes.length>3&&(
   bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff||
   bytes[0]===0x89&&bytes[1]===0x50&&bytes[2]===0x4e&&bytes[3]===0x47||
   bytes[0]===0x47&&bytes[1]===0x49&&bytes[2]===0x46||
   bytes.length>11&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'||
   bytes.length>11&&String.fromCharCode(...bytes.slice(4,8))==='ftyp');
  return {ok:signature,http_status:get.status,mime:gotMime,error:signature?null:'media_magic_mismatch'};
 }catch(e){return {ok:false,error:e?.name==='TimeoutError'?'media_timeout':'media_fetch_failed'}}
}
export async function sampleWorkMedia(works,{fetcher=fetch,maxWorks=24,maxImages=32}={}){
 const selected=works.slice(0,maxWorks);
 const checks=[];let count=0;
 for(const work of selected)for(const img of work.images||[]){
  if(count>=maxImages)break;
  count++;
  checks.push({source:work.source,source_post_id:work.source_post_id,image_index:img.image_index,kind:'thumbnail',url:img.thumbnail_url});
  checks.push({source:work.source,source_post_id:work.source_post_id,image_index:img.image_index,kind:'preview',url:img.preview_url});
 }
 const result=new Array(checks.length);let next=0;
 async function worker(){while(next<checks.length){const i=next++,{source,source_post_id,url,kind,image_index}=checks[i];
 result[i]={...await probeMedia(source,url,{fetcher}),kind,source_post_id,image_index};}}
 await Promise.all(Array.from({length:Math.min(8,checks.length)},()=>worker()));
 return {checked:result.length,passed:result.filter(x=>x.ok).length,
  failed:result.filter(x=>!x.ok).length,details:result.map(x=>({
   source_post_id:x.source_post_id,image_index:x.image_index,kind:x.kind,ok:x.ok,http_status:x.http_status??null,mime:x.mime??null,error:x.error??null
  }))};
}
