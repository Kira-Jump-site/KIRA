/**
 * Low-stock / native EdgeOne scheduled replenishment.
 * Never reads or writes Cloudflare D1. All leases and reports live in EdgeOne Blob.
 * Each source is independently leased to prevent hundreds of concurrent visitors
 * from causing hundreds of upstream requests.
 */
import {DISCOVERABLE_SOURCES} from './source-adapters.mjs';
import {getLiveRecent,ingestSource} from './live-ingest.mjs';
import {SOURCE_POLICIES} from './source-policy.mjs';
import {dailyQuota} from './quality-admission-v10.mjs';
const ROOT='catalog/v2/replenish/';
const PERIOD_MS=3*3600*1000;
// Active production sources after the 2026-11 owner decisions. Legacy sources
// remain readable in the catalogue but are no longer replenished.
export const REPLENISH_SOURCES=['konachan','yande','miyoushe_cos','miyoushe_art','nekosia','e_shuushuu'];
const safePublic=w=>w.visibility==='public'&&['safe','general'].includes(w.rating);
export async function replenishSource(store,source,{
 now=Date.now(),remaining=null,reason='daily',tag='',fetcher=fetch,mediaFetcher=null,maxPages=16,minAvailable=48,targetNew=120
}={}){
 if(!DISCOVERABLE_SOURCES.has(source))throw Error('unsupported_source');
 if(!['daily','low_stock','manual'].includes(reason))throw Error('invalid_reason');
 if(reason==='low_stock'&&(!Number.isSafeInteger(remaining)||remaining<0||remaining>100000))
  throw Error('invalid_remaining');
 if(reason==='low_stock'&&remaining>=minAvailable)
  return {ok:true,source,reason,skipped:'healthy_inventory',remaining};
 // A global per-source, 3h bucket lease protects upstream requests and Blob quotas.
 const slot=Math.floor(now/PERIOD_MS),lease=ROOT+'leases/'+source+'/'+slot+'.json';
 const existingLease=await store.get(lease,{type:'json',consistency:'strong'});
 if(existingLease)return {ok:true,source,reason,skipped:'cooldown',retry_after_seconds:Math.ceil((PERIOD_MS-now%PERIOD_MS)/1000)};
 await store.setJSON(lease,{schema:1,source,slot,reason,created_at:now});
 const result={schema:2,ok:false,source,reason,
  started_at:now,added:0,published:0,pending:0,pages:0,errors:[],details:[]};
 try{
  const profile=SOURCE_POLICIES[source];
  const quota=dailyQuota(source);
  const cap=Math.max(1,Math.min(quota.max_pages,Math.trunc(maxPages)));
  const initial=await getLiveRecent(store,source);
  const priorPublic=initial.filter(safePublic).length;
  // Keep normal page rotation for boorus; use a single fetch when a source
  // provides a changing head that cannot be paginated reliably.
  const budgetStart=Date.now();
  for(let n=0;n<cap;n++){
   if(Date.now()-budgetStart>90000){result.errors.push('runtime_budget_exhausted');break;}
   const response=await ingestSource(store,source,{page:1,tag,ignoreCooldown:true,fetcher,mediaFetcher});
   result.pages++;
   const added=response.new_posts||0,published=response.published||0;
   result.added+=added;result.published+=published;
   result.pending+=response.pending_review||0;
   result.details.push({page:response.page||n+1,mode:response.mode||'new',candidates:response.candidates||0,added,published,media_checked:response.media_checked||0,media_failed:response.media_failed||0,skipped:response.skipped||null,filtered:response.skipped_invalid||0,skipped_existing:response.skipped_existing||0,media_budget_deferred:response.media_budget_deferred||0});
   // Only stop early for non-numeric feeds if two consecutive batches are empty.
   if(result.added>=targetNew)break;
   if(result.details.slice(-2).length===2&&result.details.slice(-2).every(x=>x.candidates===0))break;
  }
  result.ok=true;
  result.goal_pending=targetNew;result.quality_shortfall=Math.max(0,targetNew-result.pending);
  result.inventory_public_recent=priorPublic+result.published;
  result.source_capability={tag_query:profile.tag,popular_sort:profile.hot,primary_strategy:profile.mode};
 }catch(e){
  result.errors.push(String(e?.code||e?.message||e?.name||'upstream_unavailable').slice(0,160));
 }
 result.completed_at=Date.now();
 await store.setJSON(ROOT+'latest/'+source+'.json',result);
 return result;
}
