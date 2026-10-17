import {json} from '../../lib/catalog.mjs';
import {getStore} from '@edgeone/pages-blob';
import {ingestSource} from '../../lib/live-ingest.mjs';
import {discoverSource,flattenForReader,SourceFailure} from '../../lib/source-adapters.mjs';

export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const u=new URL(request.url),source=u.searchParams.get('source')||'';
 const rawPage=u.searchParams.get('page')||'1',page=Number(rawPage),tag=u.searchParams.get('tag')||'',cursor=u.searchParams.get('cursor')||'';
 try{
  const result=await discoverSource(source,{page,tag,cursor});
  // Do NOT fetch the upstream again to save it: persist the exact parsed batch.
  // First writer wins a five-minute source lease. Other calls still return discovery.
  let persistence={ok:false,stored:false,reason:'storage_unavailable'};
  try{
   const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
   const saved=await ingestSource(store,source,{page,tag,preparsed:result});
   persistence={ok:true,stored:!saved.skipped,skipped:saved.skipped||null,
     new_posts:saved.new_posts||0,public_added:saved.published||0,
     pending_review:saved.pending_review||0,media_checked:saved.media_checked||0,
     media_failed:saved.media_failed||0};
   const broken=new Set(saved.unhealthy_ids||[]);
   if(broken.size)result.works=result.works.map(w=>broken.has(w.source_post_id)?{...w,visibility:'pending'}:w);
  }catch(e){
   console.error('discover_edgeone_ingest_failed',e?.code||e?.name||'UNKNOWN');
  }
  const works=flattenForReader(result.works.filter(w=>w.visibility==='public'&&w.rating==='safe'));
  return new Response(JSON.stringify({ok:true,...result,works,posts:works,items:works,persistence,
    unreviewed_count:result.works.length-result.works.filter(w=>w.visibility==='public'&&w.rating==='safe').length}),{
   headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'public, s-maxage=90, stale-while-revalidate=60'}});
 }catch(e){
  const status=e instanceof SourceFailure?e.status:503;
  return json({ok:false,source,page,error:e instanceof SourceFailure?e.message:'upstream_temporarily_unavailable'},status);
 }
}
