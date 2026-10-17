export const SOURCES=new Set(['safebooru','cosbooru','konachan','nekosia','e_shuushuu','pixiv_yuki','pixiv','miyoushe_cos','bilibili_opus','wallhaven','safedonmai','zerochan']);
export const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'}});
const h=s=>{let a=2166136261;for(const x of s)a=Math.imul(a^x.charCodeAt(),16777619)>>>0;return a};
export async function handleCatalog(req,load){
 const u=new URL(req.url),s=u.searchParams.get('source')||'bilibili_opus',limit=Number(u.searchParams.get('limit')||30);
 if(req.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 if(!SOURCES.has(s))return json({ok:false,error:'unsupported_source'},400);
 if(!Number.isSafeInteger(limit)||limit<1||limit>60)return json({ok:false,error:'invalid_limit'},400);
 let a;try{a=await load(s)}catch(e){return json({ok:false,error:'catalog_unavailable',detail:String(e).slice(0,120)},503)}
 if(!Array.isArray(a))return json({ok:false,error:'catalog_invalid'},503);
 const id=u.searchParams.get('id');
 if(id){if(!/^[\w-]{1,120}$/.test(id))return json({ok:false,error:'invalid_id'},400);const rows=a.filter(x=>x.source_post_id===id).slice(0,1);return json({ok:true,source:s,total:rows.length,works:rows,next_cursor:null})}
 const random=u.searchParams.get('order')==='random',cur=u.searchParams.get('cursor');let offset=0,snapshot=Math.floor(Date.now()/1000),seed=0;
 if(random){
  seed=Number(u.searchParams.get('seed'));if(!Number.isSafeInteger(seed)||seed<1||seed>=2147483647)return json({ok:false,error:'invalid_random_seed'},400);
  if(cur){const m=/^r:(\d{1,5}):(\d{10})$/.exec(cur);if(!m)return json({ok:false,error:'invalid_random_cursor'},400);offset=+m[1];snapshot=+m[2];}
  a=a.filter(x=>(x.indexed_at||0)<=snapshot).sort((a,b)=>h(a.source_post_id+':'+seed)-h(b.source_post_id+':'+seed)||a.source_post_id.localeCompare(b.source_post_id));
 }else{
  if(cur){const m=/^(\d{1,12}):([\w-]{1,120})$/.exec(cur);if(!m)return json({ok:false,error:'invalid_cursor'},400);a=a.filter(x=>x.indexed_at<+m[1]||x.indexed_at===+m[1]&&x.source_post_id<m[2]);}
  a=a.sort((a,b)=>b.indexed_at-a.indexed_at||b.source_post_id.localeCompare(a.source_post_id));
 }
 const page=a.slice(offset,offset+limit);
 const next=page.length===limit&&offset+limit<a.length?(random?'r:'+(offset+limit)+':'+snapshot:page.at(-1).indexed_at+':'+page.at(-1).source_post_id):null;
 return json({ok:true,source:s,total:page.length,works:page,next_cursor:next});
}
