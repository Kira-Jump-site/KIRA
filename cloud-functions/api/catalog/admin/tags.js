import {getStore} from '@edgeone/pages-blob';
import {json} from '../../../../lib/catalog.mjs';
import {requireAdmin} from '../../../../lib/admin-auth-v9.mjs';
import {loadActiveKnowledge,proposeEntity,approveSourceMapping,importNekosiaVocabulary,importDanbooruAliasCandidates,saveKnowledgeSnapshot,rollbackKnowledge} from '../../../../lib/tag-knowledge-v9.mjs';
export async function onRequest({request,env}){
 if(!['GET','POST'].includes(request.method))return json({ok:false,error:'method_not_allowed'},405);
 const auth=await requireAdmin(request,env||process.env);if(!auth.ok)return json({ok:false,error:auth.error},auth.status);
 const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
 try{
  const current=await loadActiveKnowledge(store);
  if(request.method==='GET')return json({ok:true,snapshot:current});
  const b=await request.json();
  if(b.action==='rollback')return json({ok:true,snapshot:await rollbackKnowledge(store,b.version)});
  let next=b.action==='add_entity'?proposeEntity(current,{...b.payload,reviewer:'KIRA_ADMIN'}):b.action==='approve_mapping'?approveSourceMapping(current,{...b.payload,reviewer:'KIRA_ADMIN'}):null;
  if(b.action==='import_nekosia'){
   const response=await fetch('https://api.nekosia.cat/api/v1/tags',{signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error('nekosia_http_'+response.status);
   const text=await response.text();if(text.length>500000)throw Error('nekosia_response_too_large');
   next=importNekosiaVocabulary(current,JSON.parse(text));
  }
  if(b.action==='import_danbooru_alias_candidates')next=importDanbooruAliasCandidates(current,b.rows||[]);

  if(!next)return json({ok:false,error:'invalid_action'},422);
  if(!/^[a-zA-Z0-9_.-]{3,100}$/.test(String(b.version||'')))return json({ok:false,error:'version_required'},400);
  const committed=await saveKnowledgeSnapshot(store,current,next,{version:b.version,reviewer:'KIRA_ADMIN'});
  return json({ok:true,version:committed.version,entity_count:committed.entities.length,relation_count:committed.relations.length});
 }catch(e){const code=String(e?.message||'tag_error');const status=code.includes('conflict')?409:/invalid|missing|unconfirmed/.test(code)?422:503;return json({ok:false,error:status===503?'tag_backend_unavailable':code},status)}
}
