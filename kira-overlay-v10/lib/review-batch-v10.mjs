/** No public callers. Route must authenticate BEFORE calling. */
export async function applyReviewBatch(items,{action,review}, {max=20}={}){
 if(!['approve','reject','hide','keep','followup'].includes(action)||!Array.isArray(items)||!items.length||items.length>max)throw Error('invalid_review_batch');
 const seen=new Set(),results=[];
 for(const item of items){
  const key=item.id?String(item.id):String(item.source)+'|'+String(item.source_post_id);
  if(seen.has(key)){results.push({ok:false,id:item.id,source:item.source,source_post_id:item.source_post_id,error:'duplicate_work'});continue}
  seen.add(key);
  try{results.push(await review({...item,action}));}
  catch(e){results.push({ok:false,id:item.id,source:item.source,source_post_id:item.source_post_id,error:String(e?.message||'review_failed').slice(0,100)})}
 }
 return {ok:true,results,total:items.length,completed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length};
}
