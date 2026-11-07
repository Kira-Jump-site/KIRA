/**
 * Display-only image delivery. Original URLs in storage remain untouched.
 * China-direct failures observed on 2026-11-07:
 * - Miyoushe serves 10MB originals as thumbnail/preview; OSS resize variants work.
 * - Nekosia CDN returns 403 from mainland China; wsrv.nl resized WebP works.
 * - Yande preview requires no-referrer (the frontend already sends that).
 */
const MIYOUSHE='upload-bbs.miyoushe.com';
const NEKOSIA='cdn.nekosia.cat';
const PROXY='wsrv.nl';

function miyoushe(url,kind){
 try{
  const u=new URL(url);
  if(u.hostname!==MIYOUSHE)return null;
  const process=kind==='thumb'
   ?'image/resize,w_480/format,webp/quality,q_75'
   :'image/resize,w_1280/format,webp/quality,q_82';
  u.searchParams.set('x-oss-process',process);
  return u.href;
 }catch{return null}
}
function nekosia(url,kind){
 if(!url)return null;
 if(/:\/\/wsrv\.nl\//.test(url)||/:\/\/images\.weserv\.nl\//.test(url))return url;
 const w=kind==='thumb'?480:1280;
 const q=kind==='thumb'?75:82;
 return 'https://'+PROXY+'/?url='+encodeURIComponent(url)+'&w='+w+'&output=webp&q='+q;
}
export function displayThumbnail(source,url){
 if(!url)return url;
 if(source==='miyoushe_cos'||source==='miyoushe_art')return miyoushe(url,'thumb')||url;
 if(source==='nekosia')return nekosia(url,'thumb')||url;
 return url;
}
export function displayPreview(source,url){
 if(!url)return url;
 if(source==='miyoushe_cos'||source==='miyoushe_art')return miyoushe(url,'preview')||url;
 if(source==='nekosia')return nekosia(url,'preview')||url;
 return url;
}
export function displayImage(source,url,kind='thumb'){
 return kind==='preview'?displayPreview(source,url):displayThumbnail(source,url);
}
