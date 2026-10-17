import {getStore} from '@edgeone/pages-blob';
import {json,SOURCES} from '../../../lib/catalog.mjs';
export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const results=await Promise.all([...SOURCES].map(async source=>{
   try{
    const r=await store.get('catalog/v2/replenish/latest/'+source+'.json',{type:'json',consistency:'strong'});
    return {source,ok:r?.ok??false,added:r?.added??0,published:r?.published??0,pages:r?.pages??0,completed_at:r?.completed_at||null,error:r?.errors?.[0]||null};
   }catch{return {source,ok:false,error:'status_unavailable'}}
  }));
  return json({ok:true,sources:results});
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
