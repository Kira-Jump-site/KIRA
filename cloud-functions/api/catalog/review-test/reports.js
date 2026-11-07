/** KIRA real-data review test, never writes to the production gallery. */
import {getStore} from '@edgeone/pages-blob';
import {json as baseJson,SOURCES} from '../../../../lib/catalog.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
const json=(body,status=200)=>{const r=baseJson(body,status);r.headers.set('Cache-Control','private, no-store');return r};
const backing=()=>createReviewTestStore(getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'}));
const fail=(message,status=503)=>json({ok:false,error:message},status);
import {listReportQueue,reviewReport} from '../../../../lib/report-moderation-v10.mjs';
import {applyReviewBatch} from '../../../../lib/review-batch-v10.mjs';
export async function onRequest({request}){
 if(request.method!=='GET'&&request.method!=='POST')return fail('method_not_allowed',405);
 const store=backing();
 try{
  if(request.method==='GET'){
   const q=new URL(request.url).searchParams,limit=Number(q.get('limit')||100),cursor=q.get('cursor')||'';
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor.length>2048)return fail('invalid_report_query',422);
   return json({...await listReportQueue(store,{cursor,limit}),test_mode:'isolated_real_blob'});
  }
  if(Number(request.headers.get('content-length')||0)>16000)return fail('payload_too_large',413);
  const body=await request.json();
  if(Array.isArray(body?.items)){
   if(!['keep','hide','followup'].includes(body.action)||body.items.length>20)return fail('invalid_report_batch',422);
   return json(await applyReviewBatch(body.items,{action:body.action,review:item=>reviewReport(store,item)}));
  }
  return json(await reviewReport(store,body));
 }catch(e){const msg=String(e?.message||'');return fail(/^(invalid_|report_revision_conflict|report_not_found|legacy_work_not_in_blob)/.test(msg)?msg:'report_review_unavailable',/^(invalid_|report_revision_conflict|report_not_found|legacy_work_not_in_blob)/.test(msg)?422:503)}
}
