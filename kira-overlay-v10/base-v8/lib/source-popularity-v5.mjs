import {canonicalTag} from './tag-ontology-v5.mjs';
/** Verified upstream signals ONLY. Screen resolution, metadata completeness, age and image availability are NOT ratings. */
export const POPULARITY_VERSION='2026-10-18.8';
// Priors are per-source and per-METRIC, not a mixture of scores and bookmarks.
// A fallback metric begins a different reference distribution.
const SIGNALS={
 safebooru:['source_score_raw'], safedonmai:['favorites_raw','source_score_raw'],
 cosbooru:['source_score_raw','favorites_raw'], konachan:['source_score_raw'],
 nekosia:[], e_shuushuu:['favorites_raw','source_score_raw'],
 pixiv:['favorites_raw'],pixiv_yuki:['favorites_raw'],
 miyoushe_cos:['likes_raw','favorites_raw'],wallhaven:['favorites_raw','views_raw'],
 bilibili_opus:['likes_raw'],zerochan:['favorites_raw']
};
export const SOURCE_POPULARITY_SIGNALS=Object.freeze(SIGNALS);
const number=n=>(n===null||n===undefined||n===''||!Number.isFinite(Number(n))||Number(n)<0)?null:Number(n);
const order=(a,b)=>a-b;
const q=(arr,v)=>{if(arr.length<2)return null;const lower=arr.filter(x=>x<v).length, equal=arr.filter(x=>x===v).length;return (lower+equal/2)/(arr.length);};
export function sourceMetric(work){
 const preferred=SIGNALS[work.source];if(!preferred)throw Error('unknown_source');
 let selected=preferred.find(k=>number(work[k])!==null);
 // E-Shuushuu: zero favorites is a genuine observation, but a work with
 // adequate independent votes may still have a credible, Bayesian-stabilized
 // rating. Do not force it into an always-zero favorites lane.
 if(work.source==='e_shuushuu'&&selected==='favorites_raw'&&number(work.favorites_raw)===0&&
    number(work.source_score_raw)!==null&&number(work.source_vote_count)>=5)
    selected='source_score_raw';
 if(!selected)return {observed:false,value:null,metric:null,source_signals:{},method:'unrated'};
 const actual=number(work[selected]);
 // E-Shuushuu ratings on a single vote cannot trump favorites. If a rating is
 // the only signal, require >=5 votes and use a Bayesian stabilized rating.
 if(work.source==='e_shuushuu'&&selected==='source_score_raw'){
   const votes=number(work.source_vote_count);
   if(votes===null||votes<5)return {observed:false,value:null,metric:null,source_signals:{},method:'insufficient_votes'};
   const prior=7,priorVotes=10;
   return {observed:true,value:Math.log1p((votes*actual+prior*priorVotes)/(votes+priorVotes)),
    metric:'bayesian_rating',source_signals:{rating:actual,votes},method:'bayesian_rating'};
 }
 return {observed:true,value:Math.log1p(actual),metric:selected,source_signals:{[selected]:actual},method:selected};
}
export function evaluateSourcePool(works,{referenceDistributions={},minReference=12,desiredTags=[],maxItems=32,explorationQuota=2}={}){
 if(!Array.isArray(works))throw Error('invalid_pool');
 const measures=works.map((w,source_candidate_position)=>({...w,_metric:sourceMetric(w),source_candidate_position}));
 const scoped=new Map();
 for(const w of measures){if(!w._metric.observed)continue;
   const key=w.source+':'+w._metric.metric;if(!scoped.has(key))scoped.set(key,[]);scoped.get(key).push(w._metric.value);
 }
 const rated=measures.map(w=>{
   const key=w.source+':'+w._metric.metric;
   const history=referenceDistributions[key];
   const current=scoped.get(key)||[];
   const historyOk=Array.isArray(history)&&history.every(v=>number(v)!==null)?history:[];
   // A tiny persisted cohort must not hide a large, valid discovery batch.
   const samples=historyOk.length>=minReference?historyOk:[...historyOk,...current];
   const enough=w._metric.observed&&samples.length>=minReference;
   const pct=enough?q([...samples].sort(order),w._metric.value):null;
   const wanted=desiredTags.map(String);
   const ids=new Set(w.normalized_tag_ids||[]),tokens=new Set(w.search_tokens||[]);
   const matched=wanted.every(x=>{
    const canonical=canonicalTag(x);
    const token=String(x).normalize('NFKC').toLowerCase().replace(/[\s-]+/g,'_');
    return ids.has(x)||(canonical&&ids.has(canonical))||tokens.has(token);
   });
   const result={...w,popularity_metric:w._metric.metric,popularity_status:!w._metric.observed?'unrated':enough?'ranked':'insufficient_reference',
       popularity_percentile:pct,quality_score:pct===null?null:Math.round(pct*10000)/100,
       observed_popularity_value:w._metric.observed?w._metric.value:null,
       source_score_confidence:Math.min(1,samples.length/minReference),source_popularity_raw:w._metric.source_signals,
       source_popularity_method:w._metric.method,quality_rule_version:POPULARITY_VERSION,
       query_match:matched,quality_gate:mediaGate(w)};
   delete result._metric;return result;
 }).filter(x=>x.query_match);
 const cmp=(a,b)=>{
   // Never equate 'no percentile yet' with 'ignore the original upstream score'.
   // Values from DIFFERENT metrics are incomparable; each metric remains a
   // separate candidate lane and its score is only used within that lane.
   if(a.popularity_metric===b.popularity_metric){
    if(a.popularity_percentile!==null&&b.popularity_percentile!==null)
      return b.popularity_percentile-a.popularity_percentile||
        b.observed_popularity_value-a.observed_popularity_value;
    if(a.popularity_percentile===null&&b.popularity_percentile===null)
      return b.observed_popularity_value-a.observed_popularity_value;
    return a.popularity_percentile===null?1:-1;
   }
   // Prefer metrics in the source-declared order, not their numeric scale.
   const order=SIGNALS[a.source]||[];
   const ax=order.indexOf(a.popularity_metric==='bayesian_rating'?'source_score_raw':a.popularity_metric),
         bx=order.indexOf(b.popularity_metric==='bayesian_rating'?'source_score_raw':b.popularity_metric);
   if(a.source===b.source&&ax!==bx)return ax-bx;
   return Number(b.source_published_at||b.published_at||0)-Number(a.source_published_at||a.published_at||0);
 };
 const scored=rated.filter(x=>x.popularity_status!=='unrated').sort(cmp);
 // A source recommendation is itself a source-side ordering. For unrated feeds
 // (e.g. Pixiv Yuki, Nekosia) do not silently override it with upload date.
 const exploratory=rated.filter(x=>x.popularity_status==='unrated').sort((a,b)=>a.source_candidate_position-b.source_candidate_position);
 const capacity=Math.max(0,Math.min(80,Math.trunc(maxItems)));
 if(!scored.length)return exploratory.slice(0,capacity);
 const reserve=Math.min(exploratory.length,Math.max(0,Math.trunc(explorationQuota)),capacity);
 return [...scored.slice(0,capacity-reserve),...exploratory.slice(0,reserve)];
}
/** Group baseline by actual field. Never reuse score baselines for favorites or vice versa. */
export function updatePopularityBaseline(old,works,{maxSamples=300}={}){
 const hist={...old};
 for(const w of works){const m=sourceMetric(w);if(!m.observed)continue;
  const k=w.source+':'+m.metric;const arr=Array.isArray(hist[k])?hist[k]:[];
  hist[k]=[...arr,m.value].slice(-maxSamples);
 }
 return hist;
}
export function mediaGate(w,{minShortSide=700}={}){
 const img=w.images||[];
 if(!img.length)return {eligible:false,reason:'no_images'};
 if(img.some(x=>x.media_status==='failed'||x.media_status==='sample_failed'))return {eligible:false,reason:'media_failed'};
 if(img.some(x=>x.media_status!=='verified')||w.media_status!=='verified')return {eligible:false,reason:'media_unverified'};
 const area=img.every(x=>number(x.width)>0&&number(x.height)>0);
 if(!area)return {eligible:false,reason:'dimensions_unknown'};
 if(img.some(x=>Math.min(x.width,x.height)<minShortSide))return {eligible:false,reason:'low_resolution'};
 if(!['safe','general'].includes(w.rating))return {eligible:false,reason:'review_required'};
 if(w.source==='miyoushe_cos'&&w.content_type!=='cosplay')return {eligible:false,reason:'cosplay_unverified'};
 return {eligible:true,reason:null};
}
/** Prepare per-source independent target; never allow a fast source to consume others' allotment. */
export function inventoryTargets(inventory,{low=48,target=120,perSourceMaximum=240}={}){
 return Object.fromEntries(Object.keys(SIGNALS).map(source=>{const count=Math.max(0,Math.trunc(Number(inventory?.[source])||0));
  return [source,{available:count,low,target,need:count<low?Math.min(perSourceMaximum,Math.max(0,target-count)):0}];}));
}
