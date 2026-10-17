import {SOURCES,json} from './catalog.mjs';
import {getLiveRecent} from './live-read.mjs';
import {getCatalogOverlay} from './blob-catalog.mjs';

const PREFIX='catalog/v2/live/items/';
const isPublic=w=>w?.visibility==='public'&&['safe','general'].includes(w.rating);

/**
 * Durable, lazily paginated older live works.
 * A recent-window cache is not the complete catalog: immutable work blobs survive
 * even after the 240-work public hot index evicts them.
 * Each request reads at most 60 work blobs; no unbounded Blob listing.
 */
export async function queryLiveArchive(store,request){
 const url=new URL(request.url),source=url.searchParams.get('source')||'';
 if(!SOURCES.has(source))return json({ok:false,error:'unsupported_source'},400);
 const requested=Number(url.searchParams.get('limit')||30);
 if(!Number.isSafeInteger(requested)||requested<1||requested>60)
  return json({ok:false,error:'invalid_limit'},400);
 const cursor=url.searchParams.get('cursor')||'';
 if(cursor.length>1024)return json({ok:false,error:'invalid_cursor'},400);
 const prefix=PREFIX+source+'/';
 const listed=await store.list({prefix,limit:requested,paginate:false,
  ...(cursor?{cursor}:{}),consistency:'strong'});
 if(!Array.isArray(listed?.blobs))throw Error('invalid_blob_archive_list');
 const hot=new Set((await getLiveRecent(store,source)).map(w=>String(w.source_post_id)));
 const changes=await getCatalogOverlay(store,source);
 const works=[];
 const inspected=await Promise.all(listed.blobs.map(async blob=>{
  const key=blob.key;
  if(typeof key!=='string'||!key.startsWith(prefix)||!key.endsWith('.json')||key.slice(prefix.length).includes('/'))return null;
  const entity=await store.get(key,{type:'json',consistency:'strong'});
  const work=entity?.work;
  if(!work||work.source!==source||typeof work.source_post_id!=='string')return null;
  if(hot.has(work.source_post_id))return null;
  return changes.get(work.source_post_id)||work;
 }));
 for(const work of inspected)if(isPublic(work))works.push(work);
 const next=typeof listed.cursor==='string'&&listed.cursor&&listed.cursor!==cursor?listed.cursor:null;
 return json({ok:true,source,works,total:works.length,next_cursor:next,
  scanned:listed.blobs.length,backend:'edgeone-blob-archive',order:'object-key'});
}
