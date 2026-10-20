import {getStore} from '@edgeone/pages-blob';
import {SOURCES,json} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {listQualityQueue} from '../../../../lib/review-queue-v10.mjs';
export async function onRequest({request,env}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const auth=await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 const u=new URL(request.url),source=u.searchParams.get('source')||'';
 if(!SOURCES.has(source))return json({ok:false,error:'invalid_source'},422);
 try{return json(await listQualityQueue(getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'}),{
  source,cursor:u.searchParams.get('cursor')||'',limit:Number(u.searchParams.get('limit')||100)}));}
 catch(e){return json({ok:false,error:/^invalid_/.test(String(e?.message))?e.message:'review_queue_unavailable'},/^invalid_/.test(String(e?.message))?422:503)}
}
