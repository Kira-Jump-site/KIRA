export async function findWork(store,source,id){const k=source+':'+id;const work=store.works?.get(k);return work?{work:structuredClone(work),revision:store.revisions?.get(k)||'live'}:null}
export async function saveWork(store,work,{expected_revision}){const k=work.source+':'+work.source_post_id;const r=store.revisions?.get(k)||'live';if(r!==expected_revision)throw Error('revision_conflict');store.works.set(k,structuredClone(work));store.revisions.set(k,'rev-'+Math.random());return {work,revision:store.revisions.get(k)}}
export function isApprovedPublic(work){return work&&work.visibility==='public'&&['safe','general'].includes(work.rating)}

export const REVIEW_POLICY_VERSION=1;
export const newlyDiscovered=work=>({...work,review_policy_version:1,visibility:'pending',review_status:'pending'});
export const loadActiveKnowledge=async()=>({entities:[]});
export const reindexWorkWithKnowledge=w=>w;
export const getCatalogOverlay=async()=>new Map();
export async function sampleWorkMedia(){throw Error('unexpected_media_network_call')}
