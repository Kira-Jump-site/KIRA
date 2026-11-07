/** KIRA real-data review test, never writes to the production gallery. */
import {getStore} from '@edgeone/pages-blob';
import {json as baseJson,SOURCES} from '../../../../lib/catalog.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
const json=(body,status=200)=>{const r=baseJson(body,status);r.headers.set('Cache-Control','private, no-store');return r};
const backing=()=>createReviewTestStore(getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'}));
const fail=(message,status=503)=>json({ok:false,error:message},status);
import {reviewWork} from '../../../../lib/moderation-v9.mjs';
export async function onRequest({request}){
 if(request.method!=='POST')return fail('method_not_allowed',405);
 if(Number(request.headers.get('content-length')||0)>16000)return fail('payload_too_large',413);
 let body;try{body=await request.json()}catch{return fail('invalid_json',400)}
 if(!SOURCES.has(body?.source)||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(String(body?.source_post_id||''))||
 !['approve','reject','hide','retag'].includes(body?.action)||typeof body.expected_revision!=='string')return fail('invalid_review_action',422);
 try{return json(await reviewWork(backing(),{...body,reviewer:'PREVIEW_SHADOW_TEST'}));}
 catch(e){const error=String(e?.message||'error');const status=/revision_conflict/.test(error)?409:/^(invalid_|media_not_verified|quality_admission_required|explicit_admin_rating_required|cosplay_identity_not_verified|unconfirmed_tag_id)/.test(error)?422:503;return fail(status===503?'review_unavailable':error,status)}
}
