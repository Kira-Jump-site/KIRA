import {getStore} from '@edgeone/pages-blob';
import {json,SOURCES} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {replenishSource} from '../../../../lib/replenish.mjs';
import {dailyQuota} from '../../../../lib/quality-admission-v10.mjs';
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const auth=await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_body'},400)}
 if(!SOURCES.has(body?.source))return json({ok:false,error:'invalid_source'},422);
 const quota=dailyQuota(body.source);
 try{const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  return json(await replenishSource(store,body.source,{reason:'manual',tag:typeof body.tag==='string'?body.tag.slice(0,120):'',maxPages:quota.max_pages,targetNew:quota.goal_pending}));
 }catch(e){return json({ok:false,error:'refill_unavailable'},503)}
}
