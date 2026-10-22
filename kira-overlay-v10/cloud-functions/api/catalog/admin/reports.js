import {getStore} from '@edgeone/pages-blob';
import {json} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {isPreviewReviewRequest} from '../../../../lib/review-test-access.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
import {listReportQueue,reviewReport} from '../../../../lib/report-moderation-v10.mjs';
import {applyReviewBatch} from '../../../../lib/review-batch-v10.mjs';
export async function onRequest({request,env}){
 const testing=isPreviewReviewRequest(request,'reports');
 const auth=testing?{ok:true}:await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 const liveStore=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const store=testing?createReviewTestStore(liveStore):liveStore;
 try{
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams;
   return json(await listReportQueue(store,{cursor:q.get('cursor')||'',limit:Number(q.get('limit')||100)}));
  }
  if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
  if(Number(request.headers.get('content-length')||0)>16000)return json({ok:false,error:'payload_too_large'},413);
  const body=await request.json();
  if(Array.isArray(body?.items)){
   const result=await applyReviewBatch(body.items,{action:body.action,review:item=>reviewReport(store,item)},{max:20});
   return json(result);
  }
  return json(await reviewReport(store,body));
 }catch(e){const msg=String(e?.message||'');const client= /^(invalid_|report_revision_conflict|report_not_found|legacy_work_not_in_blob)/.test(msg);
  return json({ok:false,error:client?msg:'report_review_unavailable'},client?msg==='report_revision_conflict'?409:422:503)}
}
