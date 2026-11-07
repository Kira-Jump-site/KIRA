import {json,cachedJson,SOURCES} from '../../lib/catalog.mjs';
import {getStore} from '@edgeone/pages-blob';
import {getCatalogOverlay} from '../../lib/blob-catalog.mjs';
import {readSnapshot} from '../../lib/snapshot-catalog.mjs';
import {flattenForReader} from '../../lib/source-adapters.mjs';
import {isApprovedPublic} from '../../lib/review-state-v9.mjs';
import {loadActiveKnowledge,resolveWorkKnowledge} from '../../lib/tag-knowledge-v9.mjs';
export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const u=new URL(request.url),source=u.searchParams.get('source')||'',page=Number(u.searchParams.get('page')||1),tag=u.searchParams.get('tag')||'';
 if(!SOURCES.has(source)||!Number.isSafeInteger(page)||page<1||page>50||tag.length>160)return json({ok:false,error:'invalid_request'},400);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  // Fast path: one source snapshot served from EdgeOne CDN cache.
  const snapshot=await readSnapshot(store,source);
  let found,backend,version=null;
  if(snapshot){
   found=snapshot.works.filter(isApprovedPublic);
   backend='static-snapshot';version=snapshot.version;
  }else{
   // Transitional fallback for sources not yet snapshotted; removed after the reset.
   const overlay=await getCatalogOverlay(store,source);
   found=[...overlay.values()].filter(isApprovedPublic);
   backend='approved-blob-overlay';
  }
  if(tag){
   const knowledge=await loadActiveKnowledge(store);
   const desired=resolveWorkKnowledge({source,raw_tags:[tag]},knowledge).normalized_tag_ids;
   found=found.filter(w=>desired.some(id=>(w.normalized_tag_ids||[]).includes(id))||(w.raw_tags||[]).some(x=>String(x).toLowerCase()===tag.toLowerCase()));
  }
  found.sort((a,b)=>(b.indexed_at||0)-(a.indexed_at||0));
  const slice=found.slice((page-1)*30,page*30),works=flattenForReader(slice);
  const miyoushe=source.startsWith('miyoushe_');
  const body={ok:true,source,page,works,posts:works,items:works,page_mode:miyoushe?'keyword_cursor':'number',next_cursor:page*30<found.length?(miyoushe?String(page+1):'p:'+(page+1)):null,backend,version,upstream_works:0};
  return snapshot?cachedJson(body,{maxAge:20,sMaxAge:60}):json(body);
 }catch(e){console.error('kira_public_discover_read_failed',e?.name||'UNKNOWN');return json({ok:false,error:'catalog_unavailable'},503)}
}
