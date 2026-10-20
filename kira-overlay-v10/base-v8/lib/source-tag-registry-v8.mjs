/** Verified Nekosia v1 /tags taxonomy. All source literals remain reversible;
 * cross-source equivalence is never invented from spelling alone. */
import {canonicalTag, TAG_MODEL_VERSION, TAG_ALIASES} from './tag-ontology-v5.mjs';
export const SOURCE_REGISTRY_VERSION='2026-10-18.8';
const safe=x=>typeof x==='string'?x.trim():'';
const clean=x=>safe(x).normalize('NFKC').toLowerCase().replace(/[\s-]+/g,'_');
const valid=x=>/^[\p{L}\p{N}_ .():'-]{1,120}$/u.test(x);
const AXES={tags:'general',anime:'ip',characters:'character'};
const curated=new Set(TAG_ALIASES.flatMap(x=>[x.id,...x.aliases].map(clean)));
export function normalizeNekosiaRegistry(data,{fetchedAt=new Date().toISOString()}={}){
 if(data?.success!==true||!Array.isArray(data.tags)||!Array.isArray(data.anime)||!Array.isArray(data.characters))
  throw Error('invalid_nekosia_taxonomy');
 const rows=[],seen=new Set();
 for(const [field,axis] of Object.entries(AXES))for(const raw of data[field]){
   const label=safe(raw);if(!valid(label))continue;
   const sourceKey=clean(label),nativeId='nekosia:'+axis+':'+sourceKey;
   if(seen.has(nativeId))continue;seen.add(nativeId);
   const mapped=canonicalTag(label,axis),isKnown=curated.has(sourceKey);
   // Known IDs may be reused across sources; all others retain origin namespace.
   const canonical_id=isKnown?mapped:'source:'+nativeId;
   rows.push({source:'nekosia',axis,native_tag:label,native_id:nativeId,
    canonical_id,evidence:isKnown?'curated_alias':'source_typed_taxonomy'});
 }
 const index={};for(const [i,row] of rows.entries())index[row.native_id]=i;
 return {schema:1,version:SOURCE_REGISTRY_VERSION,ontology:TAG_MODEL_VERSION,source:'nekosia',fetched_at:fetchedAt,
  total:rows.length,counts:Object.fromEntries(Object.entries(AXES).map(([field,axis])=>[axis,rows.filter(r=>r.axis===axis).length])),records:rows,index};
}
export async function fetchNekosiaRegistry({fetcher=fetch,timeoutMs=8500}={}){
 const endpoint='https://api.nekosia.cat/api/v1/tags';
 const result=await fetcher(endpoint,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(timeoutMs)});
 if(!result.ok)throw Error('nekosia_tag_catalog_http_'+result.status);
 const body=await result.text();if(body.length>750000)throw Error('taxonomy_payload_too_large');
 return normalizeNekosiaRegistry(JSON.parse(body));
}
export function resolveNativeTag(registry,query,{axis='general'}={}){
 if(registry?.source!=='nekosia'||!Array.isArray(registry.records))throw Error('invalid_registry');
 const key=clean(query),selectedAxis=typeof query==='string'&&query.startsWith('ip:')?'ip':typeof query==='string'&&query.startsWith('character:')?'character':axis;
 const own=registry.records.find(x=>x.axis===selectedAxis&&clean(x.native_tag)===key);
 if(own)return {supported:true,raw:own.native_tag,id:own.canonical_id,method:'native_tag_exact'};
 const aliases=registry.records.filter(x=>x.axis===selectedAxis&&x.canonical_id===query);
 if(aliases.length===1)return {supported:true,raw:aliases[0].native_tag,id:query,method:'curated_alias'};
 const exact=registry.records.filter(x=>clean(x.native_tag)===key);
 if(exact.length===1)return {supported:true,raw:exact[0].native_tag,id:exact[0].canonical_id,method:'native_unique_tag'};
 return {supported:false,raw:null,reason:'tag_not_in_upstream_taxonomy'};
}
export function toNekosiaSearch(query,registry,{blacklist=[]}={}){
 const requested=(Array.isArray(query)?query:[query]).filter(Boolean);
 if(requested.length>20||blacklist.length>20)throw Error('too_many_nekosia_tags');
 const resolved=requested.map(tag=>resolveNativeTag(registry,tag));
 if(resolved.some(x=>!x.supported))return {supported:false,error:'unsupported_source_tag',details:resolved};
 const bad=blacklist.map(tag=>resolveNativeTag(registry,tag));
 if(bad.some(x=>!x.supported))return {supported:false,error:'unsupported_blacklisted_tag',details:bad};
 return {supported:true,additionalTags:resolved.map(x=>x.raw).join(','),blacklistedTags:bad.map(x=>x.raw).join(',')};
}
