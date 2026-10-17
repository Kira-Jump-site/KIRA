/**
 * Low-stock / native EdgeOne scheduled replenishment.
 * Never reads or writes Cloudflare D1. All leases and reports live in EdgeOne Blob.
 * Each source is independently leased to prevent hundreds of concurrent visitors
 * from causing hundreds of upstream requests.
 */
import {DISCOVERABLE_SOURCES} from './source-adapters.mjs';
import {getLiveRecent,ingestSource} from './live-ingest.mjs';
const ROOT='catalog/v2/replenish/';
const PERIOD_MS=3*3600*1000;
export const REPLENISH_SOURCES=[...DISCOVERABLE_SOURCES];
const safePublic=w=>w.visibility==='public'&&['safe','general'].includes(w.rating);
export async function replenishSource(store,source,{
 now=Date.now(),remaining=null,reason='daily',fetcher=fetch,maxPages=3,minAvailable=48,targetNew=60
}={}){
 if(!DISCOVERABLE_SOURCES.has(source))throw Error('unsupported_source');
 if(!['daily','low_stock','manual'].includes(reason))throw Error('invalid_reason');
 if(reason==='low_stock'&&(!Number.isSafeInteger(remaining)||remaining<0||remaining>100000))
  throw Error('invalid_remaining');
 if(reason==='low_stock'&&remaining>=minAvailable)
  return {ok:true,source,reason,skipped:'healthy_inventory',remaining};
 // A global per-source, 3h bucket lease protects upstream requests and Blob quotas.
 const slot=Math.floor(now/PERIOD_MS),lease=ROOT+'leases/'+source+'/'+slot+'.json';
 try{
  await store.setJSON(lease,{schema:1,source,slot,reason,created_at:now},{onlyIfNew:true});
 }catch(e){
  if(e?.code==='PRECONDITION_FAILED'||/already|precondition|exists/i.test(String(e?.message||'')))
   return {ok:true,source,reason,skipped:'cooldown',retry_after_seconds:Math.ceil((PERIOD_MS-now%PERIOD_MS)/1000)};
  throw e;
 }
 const result={schema:2,ok:false,source,reason,
  started_at:now,added:0,published:0,pending:0,pages:0,errors:[],details:[]};
 try{
  const cap=Math.max(1,Math.min(5,Math.trunc(maxPages)));
  const initial=await getLiveRecent(store,source);
  const priorPublic=initial.filter(safePublic).length;
  // Keep normal page rotation for boorus; use a single fetch when a source
  // provides a changing head that cannot be paginated reliably.
  for(let n=0;n<cap;n++){
   const response=await ingestSource(store,source,{page:1,ignoreCooldown:true,fetcher});
   result.pages++;
   const added=response.new_posts||0,published=response.published||0;
   result.added+=added;result.published+=published;
   result.pending+=response.pending_review||0;
   result.details.push({page:response.page||n+1,added,published,skipped:response.skipped||null});
   // Only stop early for non-numeric feeds if two consecutive batches are empty.
   if(result.added>=targetNew)break;
   if(result.details.slice(-2).length===2&&result.details.slice(-2).every(x=>x.added===0))break;
  }
  result.ok=true;
  result.inventory_public_recent=priorPublic+result.published;
 }catch(e){
  result.errors.push(String(e?.code||e?.message||e?.name||'upstream_unavailable').slice(0,160));
 }
 result.completed_at=Date.now();
 await store.setJSON(ROOT+'latest/'+source+'.json',result);
 return result;
}
