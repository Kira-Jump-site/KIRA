import {getStore} from '@edgeone/pages-blob';
import {queryLiveArchive} from '../../../lib/live-archive.mjs';
import {json} from '../../../lib/catalog.mjs';

export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  return await queryLiveArchive(store,request);
 }catch(e){
  console.error('kira_archive_read_failed',e?.code||e?.name||'UNKNOWN');
  return json({ok:false,error:'archive_temporarily_unavailable'},503);
 }
}
