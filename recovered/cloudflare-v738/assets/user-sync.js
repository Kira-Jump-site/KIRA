'use strict';
const DEVICE_KEY='kira.sync.device.v1';
const OUTBOX_KEY='kira.sync.outbox.v1';
const SEQ_KEY='kira.sync.local-seq.v1';
const SESSION_MARKER='kira.user.session.v1';
const SERVER_SEQ_KEY='kira.sync.server-seq.v1';
const MAX_OUTBOX=1000;

function storage(){try{return localStorage}catch{return null}}
export function getDeviceId(){
 const s=storage();if(!s)return '';
 let id=s.getItem(DEVICE_KEY)||'';
 if(/^[a-f0-9]{32}$/.test(id))return id;
 const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
 id=[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
 try{s.setItem(DEVICE_KEY,id)}catch{}
 return id;
}
function readOutbox(){
 const s=storage();if(!s)return [];
 try{const value=JSON.parse(s.getItem(OUTBOX_KEY)||'[]');return Array.isArray(value)?value:[]}catch{return []}
}
function writeOutbox(events){
 const s=storage();if(!s)return;
 try{s.setItem(OUTBOX_KEY,JSON.stringify(events.slice(-MAX_OUTBOX)))}catch{}
}
function nextSeq(){
 const s=storage();let n=0;
 try{n=Number(s?.getItem(SEQ_KEY)||0)||0;n++;s?.setItem(SEQ_KEY,String(n))}catch{n=Date.now()}
 return n;
}
function eventId(){
 return typeof crypto.randomUUID==='function'?crypto.randomUUID():getDeviceId()+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
}
function enqueue(kind,entity,payload){
 if(typeof kind!=='string'||typeof entity!=='string'||entity.length>260)return null;
 const family=kind.split('.')[0],events=readOutbox().filter(e=>!(e?.entity===entity&&String(e?.kind||'').split('.')[0]===family));
 const event={event_id:eventId(),device_id:getDeviceId(),local_seq:nextSeq(),kind,entity,at:Date.now(),payload};
 events.push(event);writeOutbox(events);return event;
}
export function recordFavoriteMutation(work,active){
 const source=String(work?.source||'').slice(0,40);
 const post=String(work?.sourcePostId||work?.pid||'').slice(0,120);
 const image=Number.isSafeInteger(work?.imageIndex)?work.imageIndex:0;
 if(!source||!post)return null;
 return enqueue(active?'favorite.add':'favorite.remove','favorite:'+source+':'+post+':'+image,{source,source_post_id:post,image_index:image});
}
export function recordFollowMutation(artistKey,active){
 const key=String(artistKey||'').slice(0,180);if(!key)return null;
 return enqueue(active?'follow.add':'follow.remove','follow:'+key,{artist_key:key});
}
export function pendingUserMutations(){return readOutbox().slice()}
export function serverSyncSeq(){try{return Math.max(0,Number(storage()?.getItem(SERVER_SEQ_KEY)||0)||0)}catch{return 0}}
export function setServerSyncSeq(value){const n=Number(value);if(!Number.isSafeInteger(n)||n<0)return;try{storage()?.setItem(SERVER_SEQ_KEY,String(n))}catch{}}
export async function pullUserSync(endpoint='/api/user/sync'){
 const s=storage();if(!s||!s.getItem(SESSION_MARKER))return {ok:false,status:'local_only',events:[]};
 const after=serverSyncSeq();
 let response;try{response=await fetch(endpoint+'?after='+after,{credentials:'include',cache:'no-store',signal:AbortSignal.timeout(7000)})}
 catch{return {ok:false,status:'offline',events:[]}}
 if(!response.ok)return {ok:false,status:'server_'+response.status,events:[]};
 const data=await response.json().catch(()=>null);
 if(!data?.ok||!Array.isArray(data.events))return {ok:false,status:'invalid_response',events:[]};
 if(Number.isSafeInteger(data.server_seq)&&data.server_seq>=after)setServerSyncSeq(data.server_seq);
 return {ok:true,status:'pulled',events:data.events,server_seq:data.server_seq??after};
}
export async function flushUserSync(endpoint='/api/user/sync'){
 const s=storage();if(!s||!s.getItem(SESSION_MARKER))return {ok:false,status:'local_only',pending:readOutbox().length};
 const events=readOutbox().slice(0,100);if(!events.length)return {ok:true,status:'idle',pending:0};
 let response;
 try{response=await fetch(endpoint,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({device_id:getDeviceId(),events}),signal:AbortSignal.timeout(7000)})}
 catch{return {ok:false,status:'offline',pending:readOutbox().length}}
 if(!response.ok)return {ok:false,status:'server_'+response.status,pending:readOutbox().length};
 const data=await response.json().catch(()=>null);if(!data?.ok)return {ok:false,status:'invalid_response',pending:readOutbox().length};
 const ack=new Set(Array.isArray(data.acked)?data.acked:events.map(e=>e.event_id));
 writeOutbox(readOutbox().filter(e=>!ack.has(e.event_id)));
 return {ok:true,status:'synced',pending:readOutbox().length,server_seq:data.server_seq??null};
}
