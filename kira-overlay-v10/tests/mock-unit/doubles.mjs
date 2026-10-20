const revisions=new WeakMap();
export const loadActiveKnowledge=async()=>({schema:1,version:'test',entities:[],relations:[]});
export const reindexWorkWithKnowledge=w=>w;
export async function findWork(store,source,id){const key=source+':'+id;const w=store.items.get(key);return w?{work:structuredClone(w.work),revision:w.revision}:null}
export async function saveWork(store,work,{expected_revision}={}){
 const key=work.source+':'+work.source_post_id,previous=store.items.get(key);if((previous?.revision||'absent')!==expected_revision)throw Error('revision_conflict');const revision='rev-'+(++store.n);store.items.set(key,{work:structuredClone(work),revision});return {work:structuredClone(work),revision};
}
export async function getCatalogOverlay(store,source){return new Map([...store.items.values()].filter(x=>x.work.source===source).map(x=>[x.work.source_post_id,x.work]));}
export async function sampleWorkMedia(){throw Error('network test must inject verifier')}
