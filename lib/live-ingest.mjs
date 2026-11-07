import {normalizeWork} from './blob-catalog.mjs';
import {loadActiveKnowledge,resolveWorkKnowledge,sourceQueryForTag} from './tag-knowledge-v9.mjs';
import {newlyDiscovered} from './review-state-v9.mjs';
import {preselectQualityPool,qualityAdmission} from './quality-admission-v10.mjs';
import {isLegacyWork} from './legacy-ids.mjs';
import {planWholeWorkMedia} from './media-batch-planner-v15.mjs';
import {discoverSource,SourceFailure} from './source-adapters.mjs';
import {sampleWorkMedia} from './media-health.mjs';
// Static pre-reset records may be re-imported as fresh EdgeOne v3 objects after review.
import {enrichWorkV3} from './metadata-schema.mjs';
import {evaluateSourcePool,sourceMetric,mediaGate,updatePopularityBaseline} from './source-popularity-v5.mjs';
import {sourceSchedule,sourceDiscoveryLane} from './source-policy.mjs';

import {getLiveRecent,getLiveItem} from './live-read.mjs';
export {getLiveRecent,getLiveItem} from './live-read.mjs';
const ROOT='catalog/v2/';
const MAX_RECENT=240,MAX_PAGE=50;
const keyOf=(source,id)=>ROOT+'live/items/'+source+'/'+encodeURIComponent(id)+'.json';
const newest=(a,b)=>(b.indexed_at||0)-(a.indexed_at||0)||b.source_post_id.localeCompare(a.source_post_id);
const isSafe=w=>w.visibility==='public'&&['safe','general'].includes(w.rating);
const AUTO_PUBLISH_SOURCES=new Set(['konachan','yande','nekosia','miyoushe_cos','miyoushe_art','e_shuushuu']);
export async function ingestSource(store,source,{page=1,tag='',fetcher=fetch,now=Date.now(),ignoreCooldown=false,mediaFetcher=null,preparsed=null,preverified=false}={}){
 // Source-level time-bucket lease: only one upstream task per 5-minute bucket.
 // Immutable keyed records make retries/reconciliation safe after partial failures.
 const bucket=Math.floor(now/300000);
 const leaseKey=ROOT+'ingest/slots/'+source+'/'+bucket+'.json';
 if(!ignoreCooldown){
  const lease=await store.get(leaseKey,{type:'json',consistency:'strong'});
  if(lease)return {ok:true,source,new_posts:0,skipped:'cooldown',retry_after_seconds:300-Math.floor((now%300000)/1000)};
  await store.setJSON(leaseKey,{source,bucket,started_at:now});
 }
 // For ordinary visitor refreshes, rotate through actual upstream pages instead
 // of fetching page one forever. Admin-selected page/tag remain explicit.
 const rotate=!preparsed&&!tag&&page===1;
 const stateKey=ROOT+'ingest/state/'+source+'.json';
 const state=rotate?await store.get(stateKey,{type:'json',consistency:'strong'}):null;
 const cycle=rotate&&Number.isSafeInteger(state?.cycle)?state.cycle:0;
 const policy=sourceSchedule(source,cycle);
 const lane=sourceDiscoveryLane(source,cycle);
 const popular=rotate&&policy.mode!=='new';
 const selectedPage=popular?state?.popular_page:state?.next_page;
 const nextPage=rotate&&Number.isSafeInteger(selectedPage)&&selectedPage>=1&&selectedPage<=MAX_PAGE?selectedPage:page;
 const sourceCursor=rotate&&typeof state?.cursor==='string'&&/^[0-9]{1,8}$/.test(state.cursor)?state.cursor:'';
 const knowledge=await loadActiveKnowledge(store);
 const requestedTag=tag.includes(':')?(sourceQueryForTag(knowledge,source,tag).source_tag||tag):tag;
 // Ranked Moebooru lanes carry their own date/order tag; user-selected tags win.
 const sourceTag=requestedTag||lane.rankingTag||'';
 const parsed=preparsed||await discoverSource(source,{page:nextPage,tag:sourceTag,cursor:sourceCursor,mode:popular?policy.mode:'new',cycle,fetcher,rawTag:Boolean(!requestedTag&&lane.rankingTag)});
 const baselineKey=ROOT+'quality/baselines/'+source+'.json';
 const baseline=await store.get(baselineKey,{type:'json',consistency:'strong'});
 const previous=await getLiveRecent(store,source);
 const indexedIds=new Set(previous.map(w=>w.source_post_id));
 const enriched=parsed.works.map(w=>enrichWorkV3(w,{fetchedAt:now}));
 const preselected=preselectQualityPool(evaluateSourcePool(enriched,{maxItems:64,
  referenceDistributions:baseline?.histograms||{}}));
 const candidates=preselected.filter(w=>!indexedIds.has(w.source_post_id)&&!isLegacyWork(source,w.source_post_id));
 const skippedExisting=preselected.length-candidates.length;
 const mediaPlan=preverified?{selected:candidates,selectedImages:candidates.reduce((n,w)=>n+(w.images?.length||0),0),deferredIds:new Set(),invalidIds:new Set(),summary:{}} : planWholeWorkMedia(candidates,{maxWorks:64,maxImages:160});
 // Real upstream calls sample actual image HEAD responses, not JSON alone.
 // Mocked fetchers intentionally opt out so deterministic unit tests stay offline.
 const needsMediaCheck=!preverified&&Boolean(mediaFetcher||fetcher===fetch);
 const media=needsMediaCheck?await sampleWorkMedia(mediaPlan.selected,{fetcher:mediaFetcher||fetch,maxWorks:64,maxImages:160}):
  {checked:0,passed:0,failed:0,details:[]};
 const unhealthyIds=new Set(media.details.filter(x=>!x.ok).map(x=>x.source_post_id));
 const checkedByImage=new Map();
 for(const row of media.details){
  const k=row.source_post_id+':'+row.image_index;
  if(!checkedByImage.has(k))checkedByImage.set(k,new Set());
  if(row.ok)checkedByImage.get(k).add(row.kind);
 }
  const probedSize=new Map(media.details.filter(x=>x.kind==='preview'&&x.ok&&x.detected_width&&x.detected_height).map(x=>[x.source_post_id+':'+x.image_index,x]));
  // Historical static lookup is intentionally not a blocklist after D1 reset.
 const priorIds=new Set(previous.map(x=>x.source_post_id));
 const incoming=[];
 let inserted=0,reused=0,rejected=0;
 for(const work of candidates){
  if(mediaPlan.deferredIds.has(work.source_post_id)||mediaPlan.invalidIds.has(work.source_post_id))continue;
  let normalized;
   try{normalized=normalizeWork(work);normalized=newlyDiscovered({...normalized,...resolveWorkKnowledge(normalized,knowledge)});}catch{rejected++;continue}
  if(preverified){
   normalized.media_status='verified';
   normalized.images=normalized.images.map(img=>({...img,media_status:'verified',media_checked_at:Math.floor(now/1000)}));
  }else if(needsMediaCheck){
   const verified=normalized.images.every(img=>{
    const kinds=checkedByImage.get(normalized.source_post_id+':'+img.image_index);
    return kinds?.has('thumbnail')&&kinds?.has('preview');
   });
   normalized.media_status=verified?'verified':unhealthyIds.has(normalized.source_post_id)?'sample_failed':'unverified';
   normalized.images=normalized.images.map(img=>({...img,
    width:Number(img.width)>1?img.width:(probedSize.get(normalized.source_post_id+':'+img.image_index)?.detected_width||1),
    height:Number(img.height)>1?img.height:(probedSize.get(normalized.source_post_id+':'+img.image_index)?.detected_height||1),
    dimensions_provenance:Number(img.width)>1&&Number(img.height)>1?'upstream_original':'verified_preview_header',
    media_status:checkedByImage.get(normalized.source_post_id+':'+img.image_index)?.size===2?'verified':'unchecked',
    media_checked_at:checkedByImage.has(normalized.source_post_id+':'+img.image_index)?Math.floor(now/1000):null}));
   if(!verified)normalized.visibility='pending';
  }
  // Fresh data may reuse an old D1/static ID; Blob immutable keys prevent duplicate writes.
  // Never store candidates whose actual thumbnail/preview has not passed
  // bounded HEAD+GET verification. Keep health failures in the source report.
  if((!preverified&&!needsMediaCheck)||normalized.media_status!=='verified'){rejected++;continue;}
  const admission=qualityAdmission({...work,...normalized});
  normalized.quality_admission=admission;
  if(!admission.eligible){rejected++;continue;}
  // Owner decision: ranked sources enter the public library automatically.
  // Unknown ratings from source-moderated feeds are recorded, not silently lost.
  if(AUTO_PUBLISH_SOURCES.has(source)){
   if(normalized.rating==='unknown'){normalized.auto_rating_policy='source_moderated_safe';normalized.rating='safe'}
   normalized.visibility='public';
   normalized.review_policy_version=1;
   normalized.review_status='approved';
   normalized.review_decision={action:'approve',reason:'auto_ranked_ingest',policy:'auto',at:Math.floor(now/1000)};
   normalized.reviewed_at=Math.floor(now/1000);
   normalized.reviewed_by='AUTO_INGEST';
   normalized.media_status='verified';
   normalized.images=normalized.images.map(img=>({...img,media_status:'verified'}));
   normalized.auto_ingest={policy:'ranked_source',at:Math.floor(now/1000)};
  }
  if(source==='pixiv'||source==='pixiv_yuki'){
   const sibling=source==='pixiv'?'pixiv_yuki':'pixiv';
   if(await getLiveItem(store,sibling,normalized.source_post_id))continue;
  }
  const key=keyOf(source,normalized.source_post_id);
  const entity={schema:3,work:normalized,created_at:now};
   let stored=normalized;
   const already=await store.get(key,{type:'json',consistency:'strong'});
   if(already?.work){stored=already.work;reused++;}
   else{
    await store.setJSON(key,entity);
    const check=await store.get(key,{type:'json',consistency:'strong'});
    if(check?.work?.source_post_id!==normalized.source_post_id)throw Error('live_item_readback_failed');
    inserted++;
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
 const histograms=updatePopularityBaseline(baseline?.histograms||{},incoming);
 if(Object.keys(histograms).length)await store.setJSON(baselineKey,{schema:2,source,updated_at:now,histograms});
 if(media.checked){
  await store.setJSON(ROOT+'ingest/health/'+source+'.json',
   {schema:1,source,checked_at:now,checked:media.checked,passed:media.passed,failed:media.failed,details:media.details});
 }
 if(rotate){
  const nextState={schema:3,next_page:popular?(state?.next_page||1):(nextPage>=MAX_PAGE?1:nextPage+1),
   popular_page:popular?(nextPage>=MAX_PAGE?1:nextPage+1):(state?.popular_page||1),
   cycle:cycle+1,cursor:source==='miyoushe_cos'?parsed.next_cursor||'':'',updated_at:now};
  if(source==='miyoushe_cos'&&!parsed.next_cursor){nextState.next_page=1;}
  await store.setJSON(stateKey,nextState);
 }
 return {ok:true,source,page:nextPage,mode:popular?policy.mode:'new',candidates:candidates.length,new_posts:inserted,previously_stored:reused,pending_review:incoming.filter(x=>!isSafe(x)).length,
  published:incoming.filter(isSafe).length,skipped_invalid:rejected,indexed:recent.length,
  media_checked:media.checked,media_passed:media.passed,media_failed:media.failed,skipped_existing:skippedExisting,media_budget_deferred:mediaPlan.deferredIds.size,media_invalid_gallery:mediaPlan.invalidIds.size,unhealthy_ids:[...unhealthyIds],next_cursor:parsed.next_cursor||null};
}
