/** Evidence-based admission, BEFORE moderation. No made-up ratings for missing signals. */
import {mediaGate} from './source-popularity-v5.mjs';
export const ADMISSION_VERSION='2026-10-20.10';
// These are curated upstream feeds, not popularity-scored; do not invent a score.
const CURATED_UNRATED=new Set(['nekosia','pixiv','pixiv_yuki','bilibili_opus','e_shuushuu','miyoushe_cos','zerochan']);
const MIN_NATIVE_RANKED_PERCENTILE=.70;
export function preselectQualityPool(works,{max=64}={}){
 if(!Array.isArray(works))throw Error('invalid_candidate_pool');
 // Upstream ranked percentile is source/metric relative, not a universal absolute score.
 // When the cohort is too small, retain the TOP ranked works of that page as probes.
 const rated=works.filter(w=>w.popularity_status!=='unrated');
 const weak=works.filter(w=>w.popularity_status==='unrated'&&CURATED_UNRATED.has(w.source));
 const ranked=rated.filter(w=>w.popularity_status==='ranked'&&Number(w.popularity_percentile)>=MIN_NATIVE_RANKED_PERCENTILE);
 const smallSample=rated.filter(w=>w.popularity_status==='insufficient_reference');
 const limited=[...ranked,...smallSample.slice(0,Math.max(2,Math.ceil(smallSample.length/3)))];
 return [...limited,...weak].slice(0,Math.max(0,Math.min(64,max)));
}
export function qualityAdmission(work){
 if(!['safe','general',null,undefined,'unknown','unrated'].includes(work.rating))return {eligible:false,stage:'safety',reason:'unsafe_source_rating',version:ADMISSION_VERSION};
 // The media-only gate uses a temporary value for dimensions/CDN checks; never changes
 // the saved rating. Unknown source rating MUST be confirmed by admin before approval.
 const gate=mediaGate({...work,rating:'safe'},{minShortSide:700});
 if(!gate.eligible)return {eligible:false,stage:'media',reason:gate.reason,version:ADMISSION_VERSION};
 if(work.popularity_status==='ranked'){
  if(!Number.isFinite(work.popularity_percentile)||work.popularity_percentile<MIN_NATIVE_RANKED_PERCENTILE)
   return {eligible:false,stage:'ranking',reason:'below_source_percentile',version:ADMISSION_VERSION};
  return {eligible:true,stage:'complete',rule:'source_relative_popularity_and_verified_media',version:ADMISSION_VERSION};
 }
 if(work.popularity_status==='insufficient_reference'){
  if(work.observed_popularity_value===null||work.observed_popularity_value===undefined)
   return {eligible:false,stage:'ranking',reason:'missing_observed_signal',version:ADMISSION_VERSION};
  return {eligible:true,stage:'complete',rule:'upstream_order_small_sample_and_verified_media',version:ADMISSION_VERSION};
 }
 if(work.popularity_status==='unrated'&&CURATED_UNRATED.has(work.source)){
  const minArea=1500000;
  if(!(work.images||[]).every(i=>Number(i.width)*Number(i.height)>=minArea))
   return {eligible:false,stage:'ranking',reason:'unrated_curated_requires_large_media',version:ADMISSION_VERSION};
  return {eligible:true,stage:'complete',rule:'unrated_feed_verified_large_media_requires_admin_judgement',version:ADMISSION_VERSION};
 }
 return {eligible:false,stage:'ranking',reason:'no_credible_quality_evidence',version:ADMISSION_VERSION};
}
export function dailyQuota(source){
 const smallFeed=['nekosia','pixiv','pixiv_yuki','bilibili_opus'].includes(source);
 return {goal_pending:120,max_pages:smallFeed?20:16,max_items_per_fetch:64,source};
}
