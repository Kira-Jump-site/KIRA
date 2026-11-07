import {getStore} from '@edgeone/pages-blob';
import {handleCatalog,json} from '../../../lib/catalog.mjs';
import {queryBlobCatalog,getCatalogOverlay} from '../../../lib/blob-catalog.mjs';
import {isApprovedPublic} from '../../../lib/review-state-v9.mjs';
import {readSnapshot} from '../../../lib/snapshot-catalog.mjs';

async function legacy(request,store){
 return handleCatalog(request,async source=>{
  // Only the new snapshot is a public catalogue. Legacy static/D1 rows are gone
  // after the reset; a missing snapshot is an honest empty source.
  if(!store)return [];
  const snapshot=await readSnapshot(store,source);
  return snapshot?snapshot.works:[];
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
