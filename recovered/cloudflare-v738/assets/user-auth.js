'use strict';
const SESSION_MARKER='kira.user.session.v1';
const $=id=>document.getElementById(id);
async function request(path,options={}){
 const response=await fetch(path,{credentials:'include',cache:'no-store',...options});
 let data=null;try{data=await response.json()}catch{}
 return {response,data};
}
function setSessionMarker(active){
 try{if(active)localStorage.setItem(SESSION_MARKER,'1');else localStorage.removeItem(SESSION_MARKER)}catch{}
}
function dispatch(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}))}
async function snapshot(){
 const {response,data}=await request('/api/user/sync?snapshot=1');
 if(response.ok&&data?.ok){dispatch('kira:user-snapshot',data);return data}
 return null;
}
async function syncNow(){
 try{
  const m=await import('/assets/user-sync.js');
  const result=await m.flushUserSync();
  if(!result?.ok&&result?.status!=='idle')return null;
  return snapshot();
 }catch{return null}
}
export async function accountStatus(){
 let result=await request('/api/user/auth');
 if(result.response.status===401){
  const refreshed=await request('/api/user/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh'})});
  if(refreshed.response.ok)result=await request('/api/user/auth');
 }
 if(result.response.ok&&result.data?.ok){
  setSessionMarker(true);dispatch('kira:user-status',result.data);return result.data;
 }
 setSessionMarker(false);dispatch('kira:user-status',{ok:false,authenticated:false});return {ok:false,authenticated:false};
}
export async function signIn(email,password){
 const {response,data}=await request('/api/user/auth',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'signin',email,password})});
 if(response.ok&&data?.ok){setSessionMarker(true);dispatch('kira:user-status',data)}
 return {ok:response.ok&&data?.ok,data,status:response.status};
}
export async function signUp(email,password){
 const {response,data}=await request('/api/user/auth',{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({action:'signup',email,password})});
 if(response.ok&&data?.authenticated){setSessionMarker(true);dispatch('kira:user-status',data)}
 return {ok:response.ok&&data?.ok,data,status:response.status};
}
export async function signOut(){
 await request('/api/user/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'signout'})}).catch(()=>{});
 setSessionMarker(false);dispatch('kira:user-status',{ok:false,authenticated:false});
}
export async function pullAccountSnapshot(){return syncNow()}
export async function pullAccountDelta(){
 try{
  const m=await import('/assets/user-sync.js');
  const result=await m.pullUserSync();
  if(result?.ok)dispatch('kira:user-delta',result);
  return result;
 }catch{return null}
}
