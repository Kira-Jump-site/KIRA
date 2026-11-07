/** User reporting / moderation; isolated from new-work admission. */
import {findWork,saveWork} from './blob-catalog.mjs';
import {isApprovedPublic} from './review-state-v9.mjs';
const PREFIX='catalog/v2/user-reports/';
const REASONS=new Set(['low_quality','wrong_tags','broken_image','duplicate','inappropriate','copyright','other']);
const safeId=x=>/^[a-zA-Z0-9_.:-]{1,120}$/.test(String(x||''));
const normText=(s,max=300)=>String(s||'').trim().slice(0,max);
const utcDay=now=>new Date(now).toISOString().slice(0,10).replace(/-/g,'');
async function hmac(secret,body){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body)))).map(n=>n.toString(16).padStart(2,'0')).join('')}
export async function submitReport(store,input,{fingerprint,secret,now=Date.now()}={}){
 const source=String(input?.source||''),source_post_id=String(input?.source_post_id||input?.id||'');
 const reason=String(input?.reason||'other'),description=normText(input?.description||input?.detail);
 if(!/^[a-z0-9_]{2,50}$/.test(source)||!safeId(source_post_id)||!REASONS.has(reason)||!fingerprint||typeof secret!=='string'||secret.length<16)throw Error('invalid_report');
 const day=utcDay(now),token=await hmac(secret,fingerprint),hash=await hmac(secret,[day,source,source_post_id,reason,token].join('|'));
 // One identical report per reporter/work/reason/day, no IP stored in plaintext.
 const key=PREFIX+'items/'+day+'/'+hash+'.json',existing=await store.get(key,{type:'json',consistency:'strong'});
 if(existing)return {ok:true,accepted:true,duplicate:true};
 const limitKey=PREFIX+'rate/'+day+'/'+token.slice(0,32)+'.json';
 const limit=await store.get(limitKey,{type:'json',consistency:'strong'});
 if(Number(limit?.count||0)>=20)throw Error('report_rate_limited');
 const report={schema:1,id:day+'_'+hash,source,source_post_id,reason,description,
  status:'pending',reported_at:new Date(now).toISOString(),revision:1};
 await store.setJSON(key,report);
 const checked=await store.get(key,{type:'json',consistency:'strong'});
 if(checked?.id!==report.id)throw Error('report_write_conflict');
 await store.setJSON(limitKey,{count:Number(limit?.count||0)+1,updated_at:now});
 return {ok:true,accepted:true,duplicate:false};
}
export async function listReportQueue(store,{cursor='',limit=100}={}){
 if(typeof cursor!=='string'||cursor.length>2048||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('invalid_report_query');
 const prefix=PREFIX+'items/',reports=[];
 let nextCursor=cursor||'',scanned=0,rounds=0;
 while(reports.length<limit&&rounds++<12&&scanned<500){
  const rows=await store.list({prefix,limit:Math.min(limit-reports.length,500-scanned),cursor:nextCursor||undefined,paginate:false,consistency:'strong'});
  if(!Array.isArray(rows?.blobs))throw Error('invalid_report_index');
  scanned+=rows.blobs.length;
  for(let i=0;i<rows.blobs.length;i+=10){
   const chunk=await Promise.all(rows.blobs.slice(i,i+10).map(async ({key})=>{
    if(typeof key!=='string'||!key.startsWith(prefix)||!key.endsWith('.json'))return null;
    const report=await store.get(key,{type:'json',consistency:'strong'});
    if(!report||report.status!=='pending')return null;
    const current=await findWork(store,report.source,report.source_post_id);
    const w=current?.work;return {...report,revision:Number(report.revision)||1,
     work:w?{title:String(w.title||''),thumbnail_url:w.images?.[0]?.thumbnail_url||null,preview_url:w.images?.[0]?.preview_url||null,image_count:w.images?.length||0,visibility:w.visibility,rating:w.rating,
       source_post_id:w.source_post_id,source:w.source}:null};
   }));
   reports.push(...chunk.filter(Boolean));
  }
  const after=rows.cursor||'';
  if(!after||after===nextCursor){nextCursor='';break;}
  nextCursor=after;
 }
 // Stable within-page recency; pagination remains on immutable Blob key order.
 reports.sort((a,b)=>String(b.reported_at).localeCompare(String(a.reported_at)));
 return {ok:true,reports,scanned,next_cursor:nextCursor||null,page_size:limit};
}
export async function reviewReport(store,{id,action,expected_revision,reason=''}={}, {now=Date.now()}={}){
 if(!/^\d{8}_[a-f0-9]{64}$/.test(String(id||''))||!['keep','hide','followup'].includes(action)||!Number.isInteger(expected_revision))throw Error('invalid_report_decision');
 const day=id.slice(0,8),key=PREFIX+'items/'+day+'/'+id.slice(9)+'.json';
 const previous=await store.get(key,{type:'json',consistency:'strong'});
 if(!previous)throw Error('report_not_found');
 if(previous.status!=='pending'||previous.revision!==expected_revision)throw Error('report_revision_conflict');
 if(action==='hide'){
  const original=await findWork(store,previous.source,previous.source_post_id);
  if(!original)throw Error('legacy_work_not_in_blob');
  if(isApprovedPublic(original.work)){
   const hidden={...original.work,visibility:'hidden',review_status:'hidden',
    report_action:{report_id:id,action:'hide',at:new Date(now).toISOString()}};
   await saveWork(store,hidden,{action:'upsert',expected_revision:original.revision});
  }
 }
 const next={...previous,status:action==='keep'?'dismissed':action==='hide'?'resolved_hidden':'needs_followup',
  revision:previous.revision+1,decision:{action,reason:normText(reason,500),reviewed_at:new Date(now).toISOString()}};
 await store.setJSON(key,next);
 const checked=await store.get(key,{type:'json',consistency:'strong'});
 if(checked?.revision!==next.revision)throw Error('report_write_conflict');
 return {ok:true,id,action,status:next.status,revision:next.revision};
}
