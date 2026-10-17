export const QUALITY_RULE_VERSION='2026-10-18.1';
export const SOURCE_CAPABILITIES=Object.freeze({
safebooru:{tag_query:'api_tags',popular_sort:null,newest:true,cursor:'page'},
safedonmai:{tag_query:'api_tags',popular_sort:null,newest:true,cursor:'page'},
cosbooru:{tag_query:'api_tags',popular_sort:null,newest:true,cursor:'page'},
konachan:{tag_query:'api_tags',popular_sort:null,newest:true,cursor:'page'},
nekosia:{tag_query:'additionalTags_unverified',popular_sort:null,newest:false,cursor:null},
e_shuushuu:{tag_query:null,popular_sort:null,newest:true,cursor:'page'},
pixiv_yuki:{tag_query:null,popular_sort:null,newest:false,cursor:null},
pixiv:{tag_query:null,popular_sort:null,newest:false,cursor:null},
miyoushe_cos:{tag_query:'keyword_search_not_strict_tag',popular_sort:null,newest:true,cursor:'last_id',multi_image:true},
wallhaven:{tag_query:'search_q',popular_sort:'toplist',newest:true,cursor:'page'},
bilibili_opus:{tag_query:null,popular_sort:null,newest:true,cursor:'uid_feed',multi_image:true},
zerochan:{tag_query:'path_tag_unverified',popular_sort:null,newest:true,cursor:'page'}});
const clamp=v=>Math.max(0,Math.min(1,v));
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
function hot(w){const fields=[['source_score_raw',.5],['favorites_raw',.3],['likes_raw',.18],['views_raw',.02]];
const found=fields.filter(([k])=>num(w[k])!==null);
return found.length?found.reduce((s,[k,weight])=>s+weight*Math.log1p(num(w[k])),0)/found.reduce((s,[,weight])=>s+weight,0):null}
function rankMap(works){const groups=new Map();for(const w of works){const ts=Number(w.source_published_at||w.published_at||0);
const key=w.source+':'+(ts>0?Math.floor(ts/(30*86400)):'unknown');
if(!groups.has(key))groups.set(key,[]);groups.get(key).push(w)}
const result=new Map();for(const w of works){const ts=Number(w.source_published_at||w.published_at||0);
let cohort=groups.get(w.source+':'+(ts>0?Math.floor(ts/(30*86400)):'unknown'));
if(cohort.length<4)cohort=works.filter(x=>x.source===w.source);
const values=cohort.map(hot).filter(x=>x!==null).sort((a,b)=>a-b),value=hot(w);
result.set(w,value===null||values.length<2?null:values.filter(x=>x<=value).length/values.length)}
return result}
function pixels(w){const sizes=(w.images||[]).map(i=>Number(i.width)>1&&Number(i.height)>1?Number(i.width)*Number(i.height):null).filter(x=>x!==null);
return sizes.length?clamp((Math.log2(Math.max(1,Math.min(...sizes)))-15)/9):null}
export function scoreWorks(works,{desiredTags=[],now=Date.now()}={}){
const ranks=rankMap(works);
return works.map(w=>{const timestamp=Number(w.source_published_at||w.published_at||0);
const wanted=Array.isArray(desiredTags)?desiredTags:[],ids=new Set(w.normalized_tag_ids||[]),tokens=new Set(w.search_tokens||[]);
const dim={pixels:pixels(w),popularity:ranks.get(w),
relevance:wanted.length?wanted.filter(x=>ids.has(x)||tokens.has(x)).length/wanted.length:null,
availability:w.media_status==='verified'?1:w.media_status==='failed'||w.media_status==='sample_failed'?0:null,
freshness:timestamp>0?Math.exp(-Math.max(0,now/1000-timestamp)/(150*86400)):null};
const weights={pixels:.35,popularity:.30,relevance:.20,availability:.10,freshness:.05};
const valid=Object.keys(dim).filter(k=>dim[k]!==null);
const coverage=valid.reduce((s,k)=>s+weights[k],0);
return {...w,source_rank_percentile:dim.popularity===null?null:Math.round(dim.popularity*100)/100,
quality_score:coverage?Math.round(10000*valid.reduce((s,k)=>s+weights[k]*dim[k],0)/coverage)/100:null,
quality_confidence:Math.round(coverage*100)/100,quality_rule_version:QUALITY_RULE_VERSION}})}
export function rankSourceCandidates(works,{limit=24,desiredTags=[],now=Date.now()}={}){
return scoreWorks(works,{desiredTags,now}).sort((a,b)=>(b.quality_score??-1)-(a.quality_score??-1)||
Number(b.published_at||0)-Number(a.published_at||0)).slice(0,limit)}
