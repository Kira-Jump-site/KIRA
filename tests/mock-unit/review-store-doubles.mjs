export async function findWork(store,source,id){const k=source+':'+id;const work=store.works?.get(k);return work?{work:structuredClone(work),revision:store.revisions?.get(k)||'live'}:null}
/** Mirrors one revision-index scan from lib/blob-catalog.mjs against the mock store. */
export async function loadCatalogChangeHeads(store,source){
 const prefix='catalog/v2/events/'+source+'/';
 const listed=await store.list({prefix,consistency:'strong'});
 const blobs=Array.isArray(listed?.blobs)?listed.blobs:[];
 if(blobs.length>2500)throw Error('event_compaction_required');
 const latest=new Map();
 for(const blob of blobs){
  const m=new RegExp('^'+prefix.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'([^/]+)/([0-9]{13}-[a-f0-9-]{36})\\.json$').exec(String(blob.key||''));
  if(!m)continue;
  const id=decodeURIComponent(m[1]);
  if(!/^[a-zA-Z0-9_.:-]{1,120}$/.test(id))continue;
  const older=latest.get(id);if(!older||m[2]>older.rev)latest.set(id,{rev:m[2],key:blob.key});
 }
 const out=new Map();
 for(const [id,head] of latest){const event=await store.get(head.key);if(event?.work?.source_post_id===id)out.set(id,event)}
 return out;
}
export async function saveWork(store,work,{expected_revision}){const k=work.source+':'+work.source_post_id;const r=store.revisions?.get(k)||'live';if(r!==expected_revision)throw Error('revision_conflict');store.works.set(k,structuredClone(work));store.revisions.set(k,'rev-'+Math.random());return {work,revision:store.revisions.get(k)}}
export function isApprovedPublic(work){return work&&work.visibility==='public'&&['safe','general'].includes(work.rating)}

export const REVIEW_POLICY_VERSION=1;
export const newlyDiscovered=work=>({...work,review_policy_version:1,visibility:'pending',review_status:'pending'});
export const loadActiveKnowledge=async()=>({entities:[]});
export const reindexWorkWithKnowledge=w=>w;
export const getCatalogOverlay=async()=>new Map();
export async function sampleWorkMedia(){throw Error('unexpected_media_network_call')}
