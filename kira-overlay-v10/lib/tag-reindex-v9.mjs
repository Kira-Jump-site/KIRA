/** Metadata-only reindex: reuses immutable source records and revisioned edits. */
import {SOURCES} from './catalog.mjs';
import {findWork,saveWork} from './blob-catalog.mjs';
import {loadActiveKnowledge,reindexWorkWithKnowledge} from './tag-knowledge-v9.mjs';
export async function reindexSourceBatch(store,source,{cursor='',limit=20}={}){
 if(!SOURCES.has(source)||!Number.isInteger(limit)||limit<1||limit>40||typeof cursor!=='string'||cursor.length>1024)throw Error('invalid_reindex_request');
 const knowledge=await loadActiveKnowledge(store),prefix='catalog/v2/live/items/'+source+'/';
 const entries=await store.list({prefix,limit,paginate:false,...(cursor?{cursor}:{}) ,consistency:'strong'});
 if(!Array.isArray(entries?.blobs))throw Error('invalid_reindex_listing');
 const results=[];
 for(const blob of entries.blobs){
  if(typeof blob.key!=='string'||!blob.key.startsWith(prefix)||!blob.key.endsWith('.json')||blob.key.slice(prefix.length).includes('/'))continue;
  const id=decodeURIComponent(blob.key.slice(prefix.length,-5));
  try{
   const old=await findWork(store,source,id);if(!old){results.push({id,status:'missing'});continue}
   const changed=reindexWorkWithKnowledge(old.work,knowledge);
   const before=JSON.stringify({ids:old.work.normalized_tag_ids||[],unresolved:old.work.unresolved_tag_facts||[],version:old.work.tag_dictionary_version});
   const after=JSON.stringify({ids:changed.normalized_tag_ids||[],unresolved:changed.unresolved_tag_facts||[],version:changed.tag_dictionary_version});
   if(before===after){results.push({id,status:'unchanged'});continue}
   const updated=await saveWork(store,changed,{action:'upsert',expected_revision:old.revision});
   results.push({id,status:'updated',revision:updated.revision});
  }catch(e){results.push({id,status:'failed',error:String(e.message||'error').slice(0,100)})}
 }
 return {ok:true,source,dictionary_version:knowledge.version,scanned:entries.blobs.length,updated:results.filter(x=>x.status==='updated').length,
  failed:results.filter(x=>x.status==='failed').length,results,next_cursor:entries.cursor||null};
}
