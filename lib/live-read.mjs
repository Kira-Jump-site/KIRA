/**
 * Lightweight live read module for Edge Functions.
 * Never imports the network discovery or media-health modules.
 */
const ROOT='catalog/v2/';
const keyOf=(source,id)=>ROOT+'live/items/'+source+'/'+encodeURIComponent(id)+'.json';
export async function getLiveRecent(store,source){
 const saved=await store.get(ROOT+'live/recent/'+source+'.json',{type:'json',consistency:'strong'});
 if(!saved)return [];
 if(saved.schema!==2||!Array.isArray(saved.works))throw Error('invalid_live_index');
 return saved.works;
}
export async function getLiveItem(store,source,id){
 const found=await store.get(keyOf(source,id),{type:'json',consistency:'strong'});
 return found?.work||null;
}
