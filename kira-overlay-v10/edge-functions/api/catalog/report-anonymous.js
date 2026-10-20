import {getStore} from '@edgeone/pages-blob';
import {submitReport} from '../../../lib/report-moderation-v10.mjs';
import {SOURCES,json} from '../../../lib/catalog.mjs';
export async function onRequest({request,env}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 const origin=request.headers.get('origin');
 if(origin){try{if(new URL(origin).origin!==new URL(request.url).origin)return json({ok:false,error:'cross_site_report_disallowed'},403)}catch{return json({ok:false,error:'invalid_origin'},403)}}
 if(Number(request.headers.get('content-length')||0)>1800)return json({ok:false,error:'payload_too_large'},413);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_body'},400)}
 if(!SOURCES.has(body?.source))return json({ok:false,error:'invalid_source'},422);
 const secret=env?.KIRA_REPORT_SALT||globalThis.process?.env?.KIRA_REPORT_SALT||'';
 if(secret.length<16)return json({ok:false,error:'report_storage_unavailable'},503);
 // Trust only EdgeOne-provided client IP headers; x-forwarded-for is a fallback,
 // NOT a strong guarantee against header spoofing. Production needs WAF throttling.
 const ip=request.headers.get('eo-client-ip')||request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')||'';
 if(!ip||ip.length>128)return json({ok:false,error:'client_identity_unavailable'},503);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const result=await submitReport(store,body,{fingerprint:ip,secret});
  return json(result,202);
 }catch(e){
  const message=String(e?.message||'');return json({ok:false,error:message==='report_rate_limited'?'report_rate_limited':message==='invalid_report'?'invalid_report':'report_unavailable'},message==='report_rate_limited'?429:message==='invalid_report'?422:503);
 }
}
