import {getStore} from '@edgeone/pages-blob';
import {handleCatalog,json} from '../../../lib/catalog.mjs';
import {queryBlobCatalog,getCatalogOverlay} from '../../../lib/blob-catalog.mjs';

async function legacy(request,store){
 return handleCatalog(request,async source=>{
  const r=await fetch(new URL('/assets/catalog-api/'+source+'.json',request.url),{cache:'default'});
  if(!r.ok&&r.status!==404)throw Error('catalog_http_'+r.status);
  const old=r.status===404?[]:await r.json();
  if(!store)return old;
  try{
   const overlay=await getCatalogOverlay(store,source);
   const byId=new Map(old.map(w=>[w.source_post_id,w]));
   for(const [id,w] of overlay){
    if(w.visibility==='public'&&['safe','general'].includes(w.rating))byId.set(id,w);
    else byId.delete(id);
   }
   return [...byId.values()];
  }catch(e){console.warn('live_index_read_failed',String(e).slice(0,100));return old}
 
 });
}
export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 let store;
 try{store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});}
 catch(e){console.warn('kira_blob_not_initialized',String(e).slice(0,100));return legacy(request);}
 let activation;
 try{activation=await store.get('catalog/v2/active.json',{type:'json',consistency:'strong'});}
 catch(e){console.warn('kira_blob_activation_unavailable',String(e).slice(0,100));return legacy(request);}
 if(activation?.schema!==2||activation?.active!==true)return legacy(request,store);
 try{
  const result=await queryBlobCatalog(store,request);
  if(result)return result;
  return legacy(request,store);
 }catch(e){
  console.error('kira_blob_catalog_failure',String(e).slice(0,120));
  return json({ok:false,error:'blob_catalog_unavailable'},503);
 }
}
