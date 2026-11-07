import {json,SOURCES} from '../../lib/catalog.mjs';
import {getStore} from '@edgeone/pages-blob';
import {getCatalogOverlay} from '../../lib/blob-catalog.mjs';
import {flattenForReader} from '../../lib/source-adapters.mjs';
import {isApprovedPublic} from '../../lib/review-state-v9.mjs';
import {loadActiveKnowledge,resolveWorkKnowledge} from '../../lib/tag-knowledge-v9.mjs';
export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const u=new URL(request.url),source=u.searchParams.get('source')||'',page=Number(u.searchParams.get('page')||1),tag=u.searchParams.get('tag')||'';
 if(!SOURCES.has(source)||!Number.isSafeInteger(page)||page<1||page>50||tag.length>160)return json({ok:false,error:'invalid_request'},400);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const overlay=await getCatalogOverlay(store,source),knowledge=await loadActiveKnowledge(store);
  const desired=tag?resolveWorkKnowledge({source,raw_tags:[tag]},knowledge).normalized_tag_ids:[];
  const found=[...overlay.values()].filter(isApprovedPublic).filter(w=>!tag||desired.some(id=>(w.normalized_tag_ids||[]).includes(id))||(w.raw_tags||[]).some(x=>String(x).toLowerCase()===tag.toLowerCase()));
  found.sort((a,b)=>(b.indexed_at||0)-(a.indexed_at||0));
  const slice=found.slice((page-1)*30,page*30),works=flattenForReader(slice);
  return json({ok:true,source,page,works,posts:works,items:works,page_mode:'number',next_cursor:null,backend:'approved-blob-only',upstream_works:0});
 }catch(e){console.error('kira_public_discover_read_failed',e?.name||'UNKNOWN');return json({ok:false,error:'catalog_unavailable'},503)}
}
