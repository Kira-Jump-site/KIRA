import {normalizeWorkTags} from './tag-ontology-v5.mjs';
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
const str=(v,n=2000)=>typeof v==='string'?v.slice(0,n):'';
export function enrichWorkV3(work,{fetchedAt=Date.now()}={}){
if(!work||!Array.isArray(work.images))throw Error('invalid_work_for_v3');
const meta=work.tag_dictionary_version&&Array.isArray(work.normalized_tag_ids)?{
   raw_tags:work.raw_tags||[], normalized_tag_ids:[...new Set([...(work.normalized_tag_ids||[]),...(work.admin_confirmed_tag_ids||[])])],
   normalized_tags:work.normalized_tags||[], search_tokens:work.search_tokens||[],
   tag_dictionary_version:work.tag_dictionary_version,
   source_tag_facts:work.source_tag_facts||[],unresolved_tag_facts:work.unresolved_tag_facts||[],
   confirmed_tag_relations:work.confirmed_tag_relations||[],tag_mapping_status:work.tag_mapping_status||'partial'
  }:normalizeWorkTags(work);
const data={...work,...meta,schema_version:3,adapter_version:str(work.adapter_version,80)||'source-adapters:v2',
fetched_at:num(work.fetched_at)??Math.floor(fetchedAt/1000),
source_published_at:num(work.source_published_at??work.published_at)||null,
source_author_id:str(work.source_author_id??work.author_id,180),
source_author_name:str(work.source_artist_name??work.source_author_name??work.author,180),
 uploader_name:str(work.uploader_name,180),uploader_id:str(work.uploader_id,180),
 original_source_url:str(work.original_source_url,2000)||null,
raw_title:str(work.raw_title??work.title,300),raw_description:str(work.raw_description),
content_type:['cosplay','illustration','photo','other','unknown'].includes(work.content_type)?work.content_type:work.kind==='cosplay'?'cosplay':'unknown',
content_type_evidence:work.content_type_evidence||null,content_type_confidence:num(work.content_type_confidence),
raw_rating:work.raw_rating??null,raw_snapshot_ref:work.raw_snapshot_ref??null,image_count:work.images.length,
images:work.images.map(i=>({...i,original_url:i.original_url||null,mime_type:i.mime_type||null,
media_status:i.media_status||'unchecked',media_checked_at:num(i.media_checked_at),url_source:i.url_source||'upstream'}))};
for(const f of ['source_score_raw','favorites_raw','likes_raw','views_raw'])data[f]=num(work[f]);
return data;
}
export const backfillWorkV3=work=>enrichWorkV3(work);
