/* Import public Bilibili Opus media into a user's local KIRA gallery.
 * Never uploads source images, shares private submissions, or fabricates content.
 */
const KEY='kira.bilibili.opus.works.v1';
const CDN=new Set(['i0.hdslb.com','i1.hdslb.com','i2.hdslb.com']);
const media=(raw)=>{
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password||!CDN.has(u.hostname)||
    !/^\/bfs\/new_dyn\/[a-f0-9]{32,64}\.(?:png|jpe?g|webp)(?:@\d+w_\d+h_0e_0c\.webp)?$/i.test(u.pathname)||
    u.search||u.hash)return null;
  return u.href;
 }catch{return null}
};
const numericId=(opus,index)=>{
 // Stable 32-bit identity within the dedicated Bilibili local namespace.
 let hash=2166136261;
 for(const char of opus+':'+index){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619)}
 return 970000000000000+(hash>>>0);
};
export function convertOpusToWorks(payload){
 if(!payload||payload.source!=='bilibili'||!/^\d{6,24}$/.test(String(payload.opus_id||''))||
   payload.kind!=='opus_images'||!Array.isArray(payload.images))return [];
 const opus=String(payload.opus_id),link='https://www.bilibili.com/opus/'+opus;
 const author=String(payload.author||'').slice(0,90),title=String(payload.title||'').slice(0,145);
 return payload.images.slice(0,16).flatMap((item,index)=>{
  const slot=Number.isSafeInteger(item?.image_index)&&item.image_index>=0&&item.image_index<16?item.image_index:index;
  const w=Number(item?.width),h=Number(item?.height);
  if(!Number.isFinite(w)||!Number.isFinite(h)||w<600||h<600||w>12000||h>12000)return [];
  const preview=media(item.url),thumb=media(item.thumbnail_url);
  if(!preview||!thumb)return [];
  return [{id:numericId(opus,slot),pid:numericId(opus,slot)-970000000000000,
   source:'bilibili_opus',page:index,title:title||'B站图文 '+opus,
   author,tags:['bilibili','opus','插画'],width:w,height:h,
   thumbnail_url:thumb,preview_url:preview,original_url:null,
   pixiv_url:link,source_url:link,r18:false,external:true,opus_id:opus}];
 });
}
export function readLocalOpusWorks(storage){
 try{
  const data=JSON.parse(storage.getItem(KEY)||'[]');
  return Array.isArray(data)?data.filter(x=>x&&x.source==='bilibili_opus'&&
   media(x.thumbnail_url)&&media(x.preview_url)&&Number.isSafeInteger(x.pid)&&
   x.r18===false).slice(-100):[];
 }catch{return []}
}
export function storeLocalOpusWorks(items,storage){
 const prior=readLocalOpusWorks(storage);
 const ids=new Set(items.map(x=>x.id));
 const next=[...prior.filter(x=>!ids.has(x.id)),...items].slice(-100);
 storage.setItem(KEY,JSON.stringify(next));
 return next;
}

export function sameBilibiliImage(a,b){
 const first=media(a),second=media(b);
 if(!first||!second)return false;
 const ua=new URL(first),ub=new URL(second);
 return ua.pathname===ub.pathname;
}
