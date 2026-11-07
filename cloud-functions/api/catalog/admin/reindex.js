import {getStore} from '@edgeone/pages-blob';
import {json,SOURCES} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {reindexSourceBatch} from '../../../../lib/tag-reindex-v9.mjs';
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const auth=await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 let b;try{b=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 if(!SOURCES.has(b?.source))return json({ok:false,error:'invalid_source'},422);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  return json(await reindexSourceBatch(store,b.source,{cursor:String(b.cursor||''),limit:Math.min(40,Number(b.limit)||20)}));
 }catch(e){return json({ok:false,error:'reindex_unavailable'},503)}
}
