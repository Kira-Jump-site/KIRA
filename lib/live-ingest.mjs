import {normalizeWork} from './blob-catalog.mjs';
import {discoverSource,SourceFailure} from './source-adapters.mjs';
import {sampleWorkMedia} from './media-health.mjs';
import {isLegacyWork} from './legacy-ids.mjs';

import {getLiveRecent,getLiveItem} from './live-read.mjs';
export {getLiveRecent,getLiveItem} from './live-read.mjs';
const ROOT='catalog/v2/';
const MAX_RECENT=240,MAX_PAGE=50;
const keyOf=(source,id)=>ROOT+'live/items/'+source+'/'+encodeURIComponent(id)+'.json';
const newest=(a,b)=>(b.indexed_at||0)-(a.indexed_at||0)||b.source_post_id.localeCompare(a.source_post_id);
const isSafe=w=>w.visibility==='public'&&['safe','general'].includes(w.rating);
export async function ingestSource(store,source,{page=1,tag='',fetcher=fetch,now=Date.now(),ignoreCooldown=false,mediaFetcher=null,preparsed=null}={}){
 // Source-level time-bucket lease: only one upstream task per 5-minute bucket.
 // Immutable keyed records make retries/reconciliation safe after partial failures.
 const bucket=Math.floor(now/300000);
 const leaseKey=ROOT+'ingest/slots/'+source+'/'+bucket+'.json';
 if(!ignoreCooldown){
  try{await store.setJSON(leaseKey,{source,bucket,started_at:now},{onlyIfNew:true})}
  catch(e){
   if(e?.code==='PRECONDITION_FAILED'||/already|precondition|exists/i.test(String(e?.message||''))){
    return {ok:true,source,new_posts:0,skipped:'cooldown',retry_after_seconds:300-Math.floor((now%300000)/1000)};
   }
   throw e;
  }
 }
 // For ordinary visitor refreshes, rotate through actual upstream pages instead
 // of fetching page one forever. Admin-selected page/tag remain explicit.
 const rotate=!preparsed&&!tag&&page===1;
 const stateKey=ROOT+'ingest/state/'+source+'.json';
 const state=rotate?await store.get(stateKey,{type:'json',consistency:'strong'}):null;
 const nextPage=rotate&&Number.isSafeInteger(state?.next_page)&&state.next_page>=1&&state.next_page<=MAX_PAGE?state.next_page:page;
 const sourceCursor=rotate&&typeof state?.cursor==='string'&&/^[0-9]{1,8}$/.test(state.cursor)?state.cursor:'';
 const parsed=preparsed||await discoverSource(source,{page:nextPage,tag,cursor:sourceCursor,fetcher});
 // Real upstream calls sample actual image HEAD responses, not JSON alone.
 // Mocked fetchers intentionally opt out so deterministic unit tests stay offline.
 const media=(mediaFetcher||fetcher===fetch)?await sampleWorkMedia(parsed.works,{fetcher:mediaFetcher||fetch}):{checked:0,passed:0,failed:0,details:[]};
 const unhealthyIds=new Set(media.details.filter(x=>!x.ok).map(x=>x.source_post_id));
 const previous=await getLiveRecent(store,source);
 const base=await store.get(ROOT+'lookup/'+source+'.json',{type:'json',consistency:'strong'});
 const priorIds=new Set(previous.map(x=>x.source_post_id));
 const incoming=[];
 let inserted=0,reused=0,rejected=0;
 for(const work of parsed.works.slice(0,40)){
  let normalized;
  try{normalized=normalizeWork(work)}catch{rejected++;continue}
  if(unhealthyIds.has(normalized.source_post_id)){
   normalized.visibility='pending';
   normalized.media_status='sample_failed';
  }
  if(isLegacyWork(source,normalized.source_post_id)||Object.prototype.hasOwnProperty.call(base||{},normalized.source_post_id))continue;
  const key=keyOf(source,normalized.source_post_id);
  const entity={schema:2,work:normalized,created_at:now};
  let stored=normalized;
  try{
   await store.setJSON(key,entity,{onlyIfNew:true});
   const verified=await store.get(key,{type:'json',consistency:'strong'});
   if(verified?.work?.source_post_id!==normalized.source_post_id)throw Error('live_item_readback_failed');
   inserted++;
  }catch(e){
   if(e?.code!=='PRECONDITION_FAILED'&&!/exists|precondition/i.test(String(e?.message||'')))throw e;
   const existed=await store.get(key,{type:'json',consistency:'strong'});
   if(!existed?.work)throw Error('inconsistent_live_item');
   stored=existed.work;reused++;
  }
  // Idempotent index repair: an earlier partial write can be promoted on retry.
  if(!priorIds.has(stored.source_post_id))incoming.push(stored);
 }
 const byId=new Map(previous.map(x=>[x.source_post_id,x]));
 for(const w of incoming)byId.set(w.source_post_id,w);
 const all=[...byId.values()].sort(newest);
 const recent=all.slice(0,MAX_RECENT);
 if(incoming.length){
  const doc={schema:2,source,updated_at:now,works:recent};
  await store.setJSON(ROOT+'live/recent/'+source+'.json',doc);
  const verify=await getLiveRecent(store,source);
  for(const w of incoming){
   if(recent.some(x=>x.source_post_id===w.source_post_id)&&!verify.some(x=>x.source_post_id===w.source_post_id))
    throw Error('live_index_readback_conflict');
  }
 }
 if(media.checked){
  await store.setJSON(ROOT+'ingest/health/'+source+'.json',
   {schema:1,source,checked_at:now,checked:media.checked,passed:media.passed,failed:media.failed,details:media.details});
 }
 if(rotate){
  const nextState={schema:2,next_page:nextPage>=MAX_PAGE?1:nextPage+1,
   cursor:source==='miyoushe_cos'?parsed.next_cursor||'':'',updated_at:now};
  if(source==='miyoushe_cos'&&!parsed.next_cursor){nextState.next_page=1;}
  await store.setJSON(stateKey,nextState);
 }
 return {ok:true,source,page:nextPage,new_posts:inserted,previously_stored:reused,pending_review:incoming.filter(x=>!isSafe(x)).length,
  published:incoming.filter(isSafe).length,skipped_invalid:rejected,indexed:recent.length,
  media_checked:media.checked,media_passed:media.passed,media_failed:media.failed,unhealthy_ids:[...unhealthyIds],next_cursor:parsed.next_cursor||null};
}
