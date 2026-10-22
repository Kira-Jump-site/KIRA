import {getStore} from '@edgeone/pages-blob';
import {json,SOURCES} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {isPreviewReviewRequest} from '../../../../lib/review-test-access.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
import {reviewWork} from '../../../../lib/moderation-v9.mjs';
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const testing=isPreviewReviewRequest(request,'review');
 const auth=testing?{ok:true}:await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 const contentLength=Number(request.headers.get('content-length')||0);
 if(contentLength>16000)return json({ok:false,error:'payload_too_large'},413);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 if(!SOURCES.has(body?.source)||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(String(body?.source_post_id||'')))return json({ok:false,error:'invalid_work'},400);
 if(!['approve','reject','hide','retag'].includes(body?.action)||typeof body.expected_revision!=='string')return json({ok:false,error:'invalid_action_or_revision'},400);
 try{
  const liveStore=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const store=testing?createReviewTestStore(liveStore):liveStore;
  return json(await reviewWork(store,{...body,reviewer:'KIRA_ADMIN'}));
 }catch(e){
  const code=String(e?.message||'review_failed');
  const status=/revision_conflict/.test(code)?409:/media_not_verified|explicit_admin_rating_required|cosplay_identity_not_verified|unconfirmed_tag_id|quality_admission_required/.test(code)?422:/work_not_found/.test(code)?404:503;
  return json({ok:false,error:status===503?'review_temporarily_unavailable':code},status);
 }
}
