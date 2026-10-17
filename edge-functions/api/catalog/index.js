import {handleCatalog} from '../../../lib/catalog.mjs';
export async function onRequest({request}){
 return handleCatalog(request,async source=>{
  const url=new URL('/assets/catalog-api/'+source+'.json',request.url);
  const r=await fetch(url,{cache:'default'});if(!r.ok)throw Error('catalog_http_'+r.status);
  return r.json();
 });
}
