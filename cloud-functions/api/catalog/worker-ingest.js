import {getStore} from '@edgeone/pages-blob';
import {json} from '../../../lib/catalog.mjs';
import {ingestSource,getLiveRecent} from '../../../lib/live-ingest.mjs';
import {refreshSnapshot} from '../../../lib/snapshot-catalog.mjs';
import {REPLENISH_SOURCES} from '../../../lib/replenish.mjs';

/**
 * Cloudflare Worker bridge.
 *
 * EdgeOne's China egress is reliable for Miyoushe but inconsistent for some
 * foreign APIs/CDNs. The Worker fetches and media-checks a small batch from a
 * source, then authenticates here. We trust the signed batch's media evidence,
 * deduplicate/rank it with the existing ingest path, publish it, and rebuild the
 * source snapshot. No upstream request is made from EdgeOne on this path.
 */
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const secret=String(env?.KIRA_INGEST_SECRET||process.env.KIRA_INGEST_SECRET||'');
 const supplied=String(request.headers.get('x-kira-ingest-secret')||'');
 if(secret.length<24||supplied.length!==secret.length||supplied!==secret)
  return json({ok:false,error:'unauthorized'},401);
 if(Number(request.headers.get('content-length')||0)>512*1024)return json({ok:false,error:'payload_too_large'},413);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_body'},400)}
 const source=String(body?.source||'');
 if(!REPLENISH_SOURCES.includes(source))return json({ok:false,error:'invalid_source'},400);
 const works=Array.isArray(body?.works)?body.works:[];
 if(works.length<1||works.length>40)return json({ok:false,error:'invalid_works'},400);
 for(const w of works){
  if(!w||w.source!==source||typeof w.source_post_id!=='string'||!w.source_post_id||
     !Array.isArray(w.images)||w.images.length<1||w.images.length>32)
   return json({ok:false,error:'invalid_work'},400);
 }
 try{
  const now=Date.now();
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const report=await ingestSource(store,source,{
   now,ignoreCooldown:true,preverified:true,preparsed:{works,next_cursor:null}
  });
  const snapshot=await refreshSnapshot(store,source,{now});
  const recent=await getLiveRecent(store,source);
  return json({ok:true,source,report,snapshot,recent:recent.length});
 }catch(e){
  console.error('kira_worker_ingest_failed',source,e?.code||e?.name||'UNKNOWN');
  return json({ok:false,source,error:'worker_ingest_failed'},503);
 }
}
