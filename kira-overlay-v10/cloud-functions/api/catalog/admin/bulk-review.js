import {getStore} from '@edgeone/pages-blob';
import {SOURCES,json} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {isPreviewReviewRequest} from '../../../../lib/review-test-access.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
import {reviewWork} from '../../../../lib/moderation-v9.mjs';
import {applyReviewBatch} from '../../../../lib/review-batch-v10.mjs';
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const testing=isPreviewReviewRequest(request,'bulk-review');
 const auth=testing?{ok:true}:await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 if(Number(request.headers.get('content-length')||0)>24000)return json({ok:false,error:'payload_too_large'},413);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_body'},400)}
 if(!Array.isArray(body?.items)||body.items.length<1||body.items.length>20||!['approve','reject'].includes(body.action))return json({ok:false,error:'invalid_batch'},422);
 if(body.items.some(x=>!SOURCES.has(x.source)||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(String(x.source_post_id||''))||typeof x.expected_revision!=='string'))return json({ok:false,error:'invalid_batch_work'},422);
 try{const liveStore=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const store=testing?createReviewTestStore(liveStore):liveStore;
  return json(await applyReviewBatch(body.items,{action:body.action,review:item=>reviewWork(store,{...item,reviewer:'KIRA_ADMIN'})}));
 }catch(e){return json({ok:false,error:'bulk_review_unavailable'},503)}
}
