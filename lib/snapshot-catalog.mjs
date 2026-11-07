import {getCatalogOverlay} from './blob-catalog.mjs';
import {isApprovedPublic} from './review-state-v9.mjs';

/**
 * Static catalogue snapshot.
 *
 * Browsing must not read one Blob object per work. Each source owns one small
 * JSON snapshot served from the CDN; ingestion rewrites it only when a batch
 * actually changes the public inventory.
 */
const ROOT='catalog/v3/';
const snapshotKey=source=>ROOT+source+'/snapshot.json';
export const SNAPSHOT_ROOT=ROOT;

export async function readSnapshot(store,source){
 const value=await store.get(snapshotKey(source),{type:'json',consistency:'strong'});
 if(!value||value.schema!==1||value.source!==source||!Array.isArray(value.works))return null;
 return value;
}

export function mergePublicWorks(prior,overlay,{limit=240}={}){
 const byId=new Map();
 for(const w of prior||[]){
  if(w?.source_post_id&&isApprovedPublic(w))byId.set(String(w.source_post_id),w);
 }
 for(const w of overlay?.values?.()||[]){
  if(w?.source_post_id&&isApprovedPublic(w))byId.set(String(w.source_post_id),w);
 }
 return [...byId.values()]
  .sort((a,b)=>(b.indexed_at||0)-(a.indexed_at||0)||String(b.source_post_id).localeCompare(String(a.source_post_id)))
  .slice(0,limit);
}

export async function refreshSnapshot(store,source,{limit=240,now=Date.now()}={}){
 const prior=await readSnapshot(store,source);
 const overlay=await getCatalogOverlay(store,source);
 const works=mergePublicWorks(prior?.works,overlay,{limit});
 const version=(now>>>0).toString(36)+'-'+works.length.toString(36);
 const value={schema:1,source,version,updated_at:now,count:works.length,works};
 await store.setJSON(snapshotKey(source),value);
 return {source,version,count:works.length,key:snapshotKey(source)};
}
