/** KIRA real-data review test, never writes to the production gallery. */
import {getStore} from '@edgeone/pages-blob';
import {json as baseJson,SOURCES} from '../../../../lib/catalog.mjs';
import {createReviewTestStore} from '../../../../lib/review-test-store.mjs';
const json=(body,status=200)=>{const r=baseJson(body,status);r.headers.set('Cache-Control','private, no-store');return r};
const backing=()=>createReviewTestStore(getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'}));
const fail=(message,status=503)=>json({ok:false,error:message},status);
import {admitLegacyInShadow} from '../../../../lib/review-test-store.mjs';
const ROOT='catalog/v2/';
export async function onRequest({request}){
 if(request.method!=='GET')return fail('method_not_allowed',405);
 const q=new URL(request.url).searchParams,source=q.get('source')||'';
 if(!SOURCES.has(source))return fail('invalid_source',422);
 const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
 const get=key=>store.get(key,{type:'json',consistency:'strong'}).catch(()=>null);
 try{
  const [daily,health,recent,state]=await Promise.all([
   get(ROOT+'replenish/latest/'+source+'.json'),get(ROOT+'ingest/health/'+source+'.json'),
   get(ROOT+'live/recent/'+source+'.json'),get(ROOT+'ingest/state/'+source+'.json')
  ]);
  const works=Array.isArray(recent?.works)?recent.works:[];
  const counts={recent:works.length,awaiting_review:0,missing_quality_evidence:0,missing_media_evidence:0,reviewed:0,old_unreviewed_public:0};
  for(const raw of works){
   const w=admitLegacyInShadow(raw);
   if(w.review_status==='approved'||w.review_status==='rejected'||w.review_status==='hidden'){counts.reviewed++;continue}
   if(raw.visibility==='public'&&Number(raw.review_policy_version||0)<1){counts.old_unreviewed_public++;}
   if(w.media_status!=='verified'){counts.missing_media_evidence++;continue}
   if(w.quality_admission?.eligible!==true){counts.missing_quality_evidence++;continue}
   if(w.visibility==='pending'||Number(w.review_policy_version||0)<1)counts.awaiting_review++;
  }
  return json({ok:true,source,test_mode:'read_only_status',snapshot_at:Date.now(),counts,
    latest:daily?{completed_at:daily.completed_at,ok:daily.ok,added:daily.added,pending:daily.pending,goal_pending:daily.goal_pending,quality_shortfall:daily.quality_shortfall,pages:daily.pages,errors:daily.errors,details:Array.isArray(daily.details)?daily.details.slice(-5):[]}:null,
    media:health?{checked_at:health.checked_at,checked:health.checked,passed:health.passed,failed:health.failed}:null,
    cursor:state?{cycle:state.cycle,next_page:state.next_page,updated_at:state.updated_at}:null});
 }catch(e){console.error('kira_preview_diagnostics',e?.name||'error');return fail('diagnostics_unavailable')}
}
