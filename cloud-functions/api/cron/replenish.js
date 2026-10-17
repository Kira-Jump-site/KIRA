import {getStore} from '@edgeone/pages-blob';
import {json} from '../../../lib/catalog.mjs';
import {REPLENISH_SOURCES,replenishSource} from '../../../lib/replenish.mjs';
export async function onRequest({request}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 if(Number(request.headers.get('content-length')||0)>1024)return json({ok:false,error:'payload_too_large'},413);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_body'},400)}
 const source=String(body?.source||'');
 if(!REPLENISH_SOURCES.includes(source))return json({ok:false,error:'invalid_source'},400);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  return json(await replenishSource(store,source,{reason:'daily',maxPages:source==='e_shuushuu'?2:4,targetNew:80}));
 }catch(e){console.error('kira_cron_failed',source,e?.code||e?.name||'UNKNOWN');return json({ok:false,source,error:'replenishment_failed'},503)}
}
