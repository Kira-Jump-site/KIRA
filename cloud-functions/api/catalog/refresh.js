import {getStore} from '@edgeone/pages-blob';
import {json} from '../../../lib/catalog.mjs';
import {REPLENISH_SOURCES,replenishSource} from '../../../lib/replenish.mjs';

/**
 * User-triggered low-stock refill.
 *
 * The browser calls this only when its local unviewed inventory for a source
 * drops below the threshold. A short global lease per source turns hundreds of
 * simultaneous visitors into at most one upstream batch. Scheduled runs still
 * use their own 3h lease in /api/cron/replenish.
 */
export async function onRequest({request}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 if(Number(request.headers.get('content-length')||0)>1024)return json({ok:false,error:'payload_too_large'},413);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_body'},400)}
 const source=String(body?.source||'');
 const remaining=Number(body?.remaining);
 if(!REPLENISH_SOURCES.includes(source))return json({ok:false,error:'invalid_source'},400);
 if(!Number.isSafeInteger(remaining)||remaining<0||remaining>100000)return json({ok:false,error:'invalid_remaining'},400);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const result=await replenishSource(store,source,{
   reason:'low_stock',remaining,maxPages:1,targetNew:20,leasePeriodMs:10*60*1000
  });
  if(result?.skipped==='cooldown'||result?.skipped==='healthy_inventory')return json(result,202);
  return json(result);
 }catch(e){
  console.error('kira_low_stock_refill_failed',source,e?.code||e?.name||'UNKNOWN');
  return json({ok:false,source,error:'refill_unavailable'},503);
 }
}
