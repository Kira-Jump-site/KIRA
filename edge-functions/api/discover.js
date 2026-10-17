import {json} from '../../lib/catalog.mjs';
export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const u=new URL(request.url),source=u.searchParams.get('source')||'',page=+u.searchParams.get('page')||1,tag=u.searchParams.get('tag')||'';
 if(source!=='safebooru')return json({ok:false,source,page,error:'upstream_not_verified'},503);
 if(!Number.isSafeInteger(page)||page<1||page>100||tag.length>100)return json({ok:false,error:'invalid_query'},400);
 try{
  const remote=new URL('https://safebooru.org/index.php');
  for(const [k,v] of Object.entries({page:'dapi',s:'post',q:'index',json:'1',limit:'60',pid:String(page-1)}))remote.searchParams.set(k,v);
  if(tag)remote.searchParams.set('tags',tag);
  const r=await fetch(remote,{signal:AbortSignal.timeout(9000),headers:{Accept:'application/json'}});
  if(!r.ok)return json({ok:false,source,page,error:'upstream_http_'+r.status},502);
  const posts=await r.json();if(!Array.isArray(posts))throw Error('invalid_response');
  const works=posts.filter(p=>['general','safe','s','g'].includes(String(p.rating).toLowerCase())&&p.preview_url&&p.sample_url).map(p=>({
   source,source_post_id:String(p.id),id:source+':'+p.id+':0',pid:Number(p.id),page:0,
   title:'Safebooru · #'+p.id,author:'',tags:String(p.tags||'').split(/\s+/).filter(Boolean).slice(0,100),
   width:Number(p.width)||1,height:Number(p.height)||1,thumbnail_url:p.preview_url,preview_url:p.sample_url,original_url:null,
   source_url:'https://safebooru.org/index.php?page=post&s=view&id='+p.id
  }));
  return json({ok:true,source,page,works,posts:works,items:works,live:true});
 }catch(e){return json({ok:false,source,page,error:'external_source_temporarily_unavailable',detail:String(e).slice(0,100)},502)}
}
