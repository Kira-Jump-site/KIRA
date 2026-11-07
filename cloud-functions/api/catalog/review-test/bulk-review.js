/** KIRA real-data review test, never writes to the production gallery. */
import {getStore} from '@edgeone/pages-blob';
import {json as baseJson,SOURCES} from '../../../../lib/catalog.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
const json=(body,status=200)=>{const r=baseJson(body,status);r.headers.set('Cache-Control','private, no-store');return r};
const backing=()=>createReviewTestStore(getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'}));
const fail=(message,status=503)=>json({ok:false,error:message},status);
import {reviewWork} from '../../../../lib/moderation-v9.mjs';
import {applyReviewBatch} from '../../../../lib/review-batch-v10.mjs';
export async function onRequest({request}){
 if(request.method!=='POST')return fail('method_not_allowed',405);
 if(Number(request.headers.get('content-length')||0)>24000)return fail('payload_too_large',413);
 let body;try{body=await request.json()}catch{return fail('invalid_json',400)}
 if(!['approve','reject'].includes(body?.action)||!Array.isArray(body.items)||!body.items.length||body.items.length>20||body.items.some(x=>!SOURCES.has(x.source)||!/^[a-zA-Z0-9_.:-]{1,120}$/.test(String(x.source_post_id||''))||typeof x.expected_revision!=='string'))return fail('invalid_batch',422);
 const store=backing();
 try{return json(await applyReviewBatch(body.items,{action:body.action,review:item=>reviewWork(store,{...item,reviewer:'PREVIEW_SHADOW_TEST'})}));}
 catch(e){return fail('bulk_review_unavailable')}
}
