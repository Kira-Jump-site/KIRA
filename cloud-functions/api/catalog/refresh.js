import {getStore} from '@edgeone/pages-blob';
import {json} from '../../../lib/catalog.mjs';
import {REPLENISH_SOURCES,replenishSource} from '../../../lib/replenish.mjs';
export async function onRequest({request}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 if(Number(request.headers.get('content-length')||0)>1024)return json({ok:false,error:'payload_too_large'},413);
 try{
  const body=await request.json(),source=String(body?.source||'');
  if(!REPLENISH_SOURCES.includes(source))return json({ok:false,error:'source_not_refreshable'},422);
  const remaining=Number(body.remaining??0);
  if(!Number.isSafeInteger(remaining)||remaining<0||remaining>100000)return json({ok:false,error:'invalid_remaining'},400);
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  return json(await replenishSource(store,source,{reason:'low_stock',remaining,maxPages:3,targetNew:48}));
 }catch(e){console.error('kira_refill_failed',e?.code||e?.name||'UNKNOWN');return json({ok:false,error:'refresh_temporarily_unavailable'},503)}
}
