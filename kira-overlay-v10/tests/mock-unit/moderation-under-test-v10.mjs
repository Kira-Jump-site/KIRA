/** KIRA v9 invariant: new discoveries stay private until an authenticated admin approves. */
import {loadActiveKnowledge,reindexWorkWithKnowledge} from './review-store-doubles.mjs';
import {findWork,saveWork,getCatalogOverlay} from './review-store-doubles.mjs';
import {sampleWorkMedia} from './review-store-doubles.mjs';
import {REVIEW_POLICY_VERSION} from './review-store-doubles.mjs';
export {newlyDiscovered,isApprovedPublic,REVIEW_POLICY_VERSION} from './review-store-doubles.mjs';
export async function verifyAllMedia(work,{fetcher=fetch}={}){
 if(!Array.isArray(work.images)||!work.images.length||work.images.length>32)throw Error('invalid_media_count');
 // Images were already probed when entering the quality-gated queue. Reuse
 // trustworthy recent proof rather than 100x repeat HEAD+GET on bulk review.
 const nowS=Math.floor(Date.now()/1000);
 if(work.media_status==='verified'&&work.images.every(i=>i.media_status==='verified'&&
   Number.isFinite(Number(i.media_checked_at))&&Number(i.media_checked_at)>nowS-21600&&Number(i.media_checked_at)<=nowS+300))
  return {verified:true,checked_at:nowS,checked:0,failed:0,images:work.images};
 const result=await sampleWorkMedia([work],{fetcher,maxWorks:1,maxImages:64});
 const outcomes=new Map();
 for(const x of result.details||[]){const idx=Number(x.image_index);if(!outcomes.has(idx))outcomes.set(idx,new Set());if(x.ok)outcomes.get(idx).add(x.kind)}
 const verified=work.images.every(img=>outcomes.get(img.image_index)?.has('thumbnail')&&outcomes.get(img.image_index)?.has('preview'));
 const checkedAt=Math.floor(Date.now()/1000);
 return {verified,checked_at:checkedAt,checked:result.checked,failed:result.failed,
  images:work.images.map(img=>({...img,media_status:outcomes.get(img.image_index)?.size===2?'verified':'failed',media_checked_at:checkedAt}))};
}
/** Auth must be checked at the HTTP boundary. `reviewWork` must never be exported on a public unauthenticated route. */
export async function reviewWork(store,{source,source_post_id,action,expected_revision,reason='',rating=null,canonical_tag_ids=null,reviewer='admin'}={}, {verify=verifyAllMedia,now=Date.now()}={}){
 if(!['approve','reject','hide','retag'].includes(action))throw Error('invalid_review_action');
 if(typeof expected_revision!=='string'||expected_revision.length>180)throw Error('revision_required');
 const previous=await findWork(store,source,source_post_id);
 if(!previous)throw Error('work_not_found');
 if(previous.revision!==expected_revision)throw Error('revision_conflict');
 const work=structuredClone(previous.work);
 if(action==='retag'){
   if(!Array.isArray(canonical_tag_ids)||canonical_tag_ids.length>80)throw Error('invalid_tag_ids');
   const snapshot=await loadActiveKnowledge(store);
   const valid=new Set(snapshot.entities.map(e=>e.id));
   if(canonical_tag_ids.some(id=>!valid.has(id)))throw Error('unconfirmed_tag_id');
   const fresh=reindexWorkWithKnowledge(work,snapshot);
   work.normalized_tag_ids=[...new Set([...fresh.normalized_tag_ids,...canonical_tag_ids])];
   work.admin_confirmed_tag_ids=[...new Set(canonical_tag_ids)];
   work.tag_dictionary_version=snapshot.version;
 }else if(action==='approve'){
   if(work.quality_admission?.eligible!==true)throw Error('quality_admission_required');
   const media=await verify(work);
   if(!media.verified)throw Error('media_not_verified');
   work.images=media.images;work.media_status='verified';work.media_checked_at=media.checked_at;
   const selected=rating||work.rating;
   if(!['safe','general'].includes(selected))throw Error('explicit_admin_rating_required');
   if(work.source==='miyoushe_cos'&&work.content_type!=='cosplay')throw Error('cosplay_identity_not_verified');
   work.rating=selected;work.visibility='public';work.review_status='approved';
   work.review_policy_version=REVIEW_POLICY_VERSION;
 }else{
   work.visibility=action==='reject'?'hidden':'hidden';work.review_status=action==='reject'?'rejected':'hidden';
   work.review_policy_version=REVIEW_POLICY_VERSION;
 }
 if(action!=='retag'){
  work.reviewed_at=new Date(now).toISOString();work.reviewed_by=reviewer;
  work.review_decision={action,reason:String(reason).slice(0,600),reviewer,decided_at:work.reviewed_at};
 }
 // Reuse existing revisioned event journal, rather than introducing a second publisher.
 const result=await saveWork(store,work,{action:'upsert',expected_revision});
 return {ok:true,action,source,source_post_id,visibility:result.work.visibility,review_status:result.work.review_status,revision:result.revision};
}
/** Per-source cursor; bounds work reads, returns pending records only. */
export async function listReviewQueue(store,{source,cursor='',limit=30}={}){
 if(!/^[a-z0-9_]{2,50}$/.test(String(source||''))||!Number.isSafeInteger(limit)||limit<1||limit>60||cursor.length>1024)throw Error('invalid_queue_query');
 const prefix='catalog/v2/live/items/'+source+'/';
 const listed=await store.list({prefix,limit,paginate:false,...(cursor?{cursor}:{}) ,consistency:'strong'});
 if(!Array.isArray(listed?.blobs))throw Error('invalid_queue_index');
 const overlay=await getCatalogOverlay(store,source);
 const docs=await Promise.all(listed.blobs.map(async x=>{
   if(typeof x.key!=='string'||!x.key.startsWith(prefix)||!x.key.endsWith('.json'))return null;
   const current=await store.get(x.key,{type:'json',consistency:'strong'});
   const w=current?.work;if(!w)return null;
   return overlay.get(w.source_post_id)||w;
 }));
 const pending=docs.filter(w=>w?.visibility==='pending'&&w.review_status!=='rejected');
 const works=await Promise.all(pending.map(async w=>{const current=await findWork(store,w.source,w.source_post_id);return {...w,revision:current?.revision||'live'};}));
 return {ok:true,source,works,scanned:listed.blobs.length,next_cursor:listed.cursor||null};
}
