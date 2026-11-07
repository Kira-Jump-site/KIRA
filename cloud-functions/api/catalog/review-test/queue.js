/** KIRA real-data review test, never writes to the production gallery. */
import {getStore} from '@edgeone/pages-blob';
import {json as baseJson,SOURCES} from '../../../../lib/catalog.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
const json=(body,status=200)=>{const r=baseJson(body,status);r.headers.set('Cache-Control','private, no-store');return r};
const backing=()=>createReviewTestStore(getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'}));
const fail=(message,status=503)=>json({ok:false,error:message},status);
import {listQualityQueue} from '../../../../lib/review-queue-v10.mjs';
export async function onRequest({request}){
 if(request.method!=='GET')return fail('method_not_allowed',405);
 const q=new URL(request.url).searchParams,source=q.get('source')||'';
 if(!SOURCES.has(source))return fail('invalid_source',422);
 const limit=Number(q.get('limit')||100),cursor=q.get('cursor')||'';
 if(!Number.isSafeInteger(limit)||limit<1||limit>100||cursor.length>2048)return fail('invalid_queue_query',422);
 try{return json({...await listQualityQueue(backing(),{source,cursor,limit}),test_mode:'isolated_real_blob'});}
 catch(e){console.error('kira_test_queue',e?.name||'error');return fail('review_queue_unavailable')}
}
