/** KIRA v9 versioned, evidence-bound tag knowledge. Does not consume unlicensed datasets.
 * Unknown or ambiguous source labels are kept as unresolved facts, never a fabricated global ID.
 */
import {TAG_ALIASES} from './tag-ontology-v5.mjs';
export const KNOWLEDGE_SCHEMA=1;
export const SEED_VERSION='kira-seed-2026-10-20.1';
export const CATEGORY_IDS=new Set(['franchise','character','artist','uploader','coser','photographer','content_type','appearance','clothing','pose','setting','other']);
export const RELATION_TYPES=new Set(['exact_alias','translated_label','related_to','source_only','needs_review']);
export const DICTIONARY_ROOT='catalog/v3/tags/';
const SOURCE_ROOT='catalog/v3/tags/snapshots/';
const MAX_ENTITIES=50000,MAX_RELATIONS=300000,MAX_SOURCE_TERMS=50000;
const norm=x=>String(x??'').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/[\s-]+/g,'_');
const cleanString=(x,max=160)=>typeof x==='string'?x.trim().slice(0,max):'';
const validId=x=>typeof x==='string'&&/^[a-z0-9_:-]{2,150}$/.test(x);
const suffix=v=>norm(v).replace(/[^\p{L}\p{N}_]/gu,'').slice(0,100);
const categories={ip:'franchise',type:'content_type',medium:'content_type',scene:'setting',composition:'other',theme:'other',character:'character',appearance:'appearance',clothing:'clothing',pose:'pose'};
const nowISO=()=>new Date().toISOString();
function seedEntities(){
 return TAG_ALIASES.map(({id,aliases})=>({id,category:categories[id.split(':')[0]]||'other',names:{und:aliases[0]||id},aliases:[...new Set(aliases)],external_refs:[],evidence:[{origin:'kira_curated_seed',ref:'tag-ontology-v5',status:'approved'}]}));
}
export function createSeedSnapshot(){return {schema:KNOWLEDGE_SCHEMA,version:SEED_VERSION,created_at:'2026-10-20',parent_version:null,entities:seedEntities(),relations:[],source_terms:[],reviewed:true,provenance:'KIRA curated v8 aliases; no external dataset copied'}};
export function validateSnapshot(s){
 if(s?.schema!==1||typeof s.version!=='string'||!/^[-a-zA-Z0-9_.]{3,100}$/.test(s.version)||!Array.isArray(s.entities)||!Array.isArray(s.relations))throw Error('invalid_tag_snapshot');
 if(s.entities.length>MAX_ENTITIES||s.relations.length>MAX_RELATIONS||(s.source_terms||[]).length>MAX_SOURCE_TERMS)throw Error('tag_snapshot_too_large');
 const ids=new Set();
 for(const e of s.entities){if(!validId(e?.id)||!CATEGORY_IDS.has(e.category)||ids.has(e.id)||!Array.isArray(e.aliases)||e.aliases.length>120||!e.aliases.every(a=>typeof a==='string'&&a.length<170))throw Error('invalid_or_duplicate_tag_entity');ids.add(e.id)}
 for(const r of s.relations){if(!RELATION_TYPES.has(r?.type)||!cleanString(r.source,80)||!cleanString(r.raw_tag,170)||!['approved','pending','rejected'].includes(r.status)||!cleanString(r.evidence,400)||r.target_tag_id&&!ids.has(r.target_tag_id))throw Error('invalid_tag_relation');if(r.status==='approved'&&['exact_alias','translated_label'].includes(r.type)&&!r.target_tag_id)throw Error('approved_alias_missing_target')}
 return s;
}
function makeAliasIndex(snapshot){
 const map=new Map();
 const add=(key,id,evidence)=>{const n=norm(key);if(!n)return;const prev=map.get(n)||[];if(!prev.some(x=>x.id===id))prev.push({id,evidence});map.set(n,prev)};
 for(const e of snapshot.entities){add(e.id,e.id,'canonical_id');for(const name of e.aliases||[])add(name,e.id,'curated_alias');for(const name of Object.values(e.names||{}))add(name,e.id,'curated_name')}
 return map;
}
const tagString=x=>typeof x==='string'?x:typeof x==='object'&&x?(x.tag||x.name||x.tag_name||x.tagName||''):'';
function listTags(x){if(Array.isArray(x))return x.map(tagString).filter(Boolean);if(typeof x==='string')return x.split(/[\s,，]+/).filter(Boolean);return []}
function rawFacts(work){
 const out=[],seen=new Set();
 const add=(tag,axis='unknown',externalId=null)=>{tag=cleanString(tag,160);if(!tag)return;const key=axis+'|'+tag+'|'+(externalId||'');if(seen.has(key))return;seen.add(key);out.push({raw_tag:tag,source_category:axis,source_tag_id:externalId})};
 for(const [axis,tags] of Object.entries(work.source_tag_groups||{}))for(const t of listTags(tags))add(t,axis);
 for(const x of (Array.isArray(work.source_tags_structured)?work.source_tags_structured:[])){
   const t=tagString(x);if(t)add(t,x.category||x.type||'unknown',x.id||null);
 }
 for(const t of listTags(work.raw_tags||work.tags||[]))add(t,'unknown');
 return out;
}
function pickRelation(relations,source,fact){
 const key=norm(fact.raw_tag);return relations.filter(r=>r.source===source&&norm(r.raw_tag)===key&&(!r.source_tag_id||r.source_tag_id===fact.source_tag_id)&&(!r.source_category||r.source_category===fact.source_category));
}
export function resolveWorkKnowledge(work,snapshot=createSeedSnapshot()){
 validateSnapshot(snapshot);
 const source=cleanString(work.source,80),facts=rawFacts(work),aliases=makeAliasIndex(snapshot),ids=new Set(),tokens=new Set(),unresolved=[],resolved=[];
 for(const f of facts){
   const relation=pickRelation(snapshot.relations,source,f);
   const approved=relation.filter(r=>r.status==='approved'&&r.target_tag_id&&['exact_alias','translated_label'].includes(r.type));
   const suggested=aliases.get(norm(f.raw_tag))||[];
   const idsFromRelation=[...new Set(approved.map(r=>r.target_tag_id))];
   const canAutoLink=!relation.some(r=>r.type==='needs_review'||r.type==='source_only'||r.status==='rejected');
   const candidates=idsFromRelation.length?idsFromRelation:canAutoLink?[...new Set(suggested.map(x=>x.id))]:[];
   const target=candidates.length===1?candidates[0]:null;
   tokens.add(norm(f.raw_tag));tokens.add(source+':'+norm(f.raw_tag));
   if(target){ids.add(target);resolved.push({...f,canonical_tag_id:target,relation:idsFromRelation.length?'source_approved_relation':'curated_seed_alias',evidence:idsFromRelation.length?approved[0].evidence:'KIRA curated alias'})}
   else unresolved.push({...f,status:relation.length?'needs_review':'source_only',native_tag_verified:(snapshot.source_terms||[]).some(t=>t.source===source&&norm(t.name)===norm(f.raw_tag)),suggested_tag_ids:candidates.length>1?candidates:[],reason:candidates.length>1?'ambiguous_alias':'no_approved_mapping'});
 }
 return {raw_tags:[...new Set(facts.map(x=>x.raw_tag))],source_tag_facts:facts,normalized_tag_ids:[...ids],confirmed_tag_relations:resolved,unresolved_tag_facts:unresolved,search_tokens:[...tokens,...ids],tag_dictionary_version:snapshot.version,tag_mapping_status:unresolved.length?'partial':'confirmed'};
}
export function proposeEntity(snapshot,{id,category,names={},aliases=[],evidence,reviewer}){
 validateSnapshot(snapshot);if(!CATEGORY_IDS.has(category)||!validId(id)||snapshot.entities.some(e=>e.id===id)||!cleanString(evidence,400)||!cleanString(reviewer,80))throw Error('invalid_entity_proposal');
 const entry={id,category,names,aliases,evidence:[{origin:'admin',ref:evidence,status:'approved',reviewer}]};
 return {...snapshot,entities:[...snapshot.entities,entry]};
}
export function approveSourceMapping(snapshot,input){
 validateSnapshot(snapshot);
 const {source,raw_tag,target_tag_id,type,evidence,reviewer,source_category=null,source_tag_id=null}=input||{};
 if(!cleanString(source,80)||!cleanString(raw_tag,160)||!snapshot.entities.some(e=>e.id===target_tag_id)||!['exact_alias','translated_label','related_to'].includes(type)||!cleanString(evidence,400)||!cleanString(reviewer,80))throw Error('invalid_mapping_proposal');
 const conflicting=snapshot.relations.some(r=>r.status==='approved'&&r.source===source&&norm(r.raw_tag)===norm(raw_tag)&&r.source_category===source_category&&r.target_tag_id!==target_tag_id&&['exact_alias','translated_label'].includes(r.type));
 if(conflicting&&type!=='related_to')throw Error('mapping_conflict_needs_review');
 return {...snapshot,relations:[...snapshot.relations,{source,raw_tag,target_tag_id,type,evidence,reviewer,source_category,source_tag_id,status:'approved',created_at:nowISO()}]};
}
export async function loadActiveKnowledge(store){
 const pointer=await store.get(DICTIONARY_ROOT+'active.json',{type:'json',consistency:'strong'});
 if(!pointer)return createSeedSnapshot();
 if(pointer.schema!==1||!/^[-a-zA-Z0-9_.]{3,100}$/.test(pointer.version))throw Error('invalid_dictionary_pointer');
 const snapshot=await store.get(SOURCE_ROOT+pointer.version+'.json',{type:'json',consistency:'strong'});
 if(!snapshot||snapshot.version!==pointer.version)throw Error('dictionary_snapshot_missing');
 return validateSnapshot(snapshot);
}
export async function saveKnowledgeSnapshot(store,previous,updated,{version,reviewer}){
 validateSnapshot(previous);validateSnapshot(updated);
 if(!/^[-a-zA-Z0-9_.]{3,100}$/.test(version)||version===previous.version||!cleanString(reviewer,80))throw Error('invalid_dictionary_version');
 const current=await loadActiveKnowledge(store);if(current.version!==previous.version)throw Error('dictionary_revision_conflict');
 const next={...updated,version,parent_version:previous.version,created_at:nowISO(),reviewer,reviewed:true};
 validateSnapshot(next);
 const key=SOURCE_ROOT+version+'.json';
 const oldKey=SOURCE_ROOT+previous.version+'.json';
 if(!(await store.get(oldKey,{type:'json',consistency:'strong'})))await store.setJSON(oldKey,previous);
 if(await store.get(key,{type:'json',consistency:'strong'}))throw Error('tag_version_already_exists');
 await store.setJSON(key,next);
 if((await store.get(key,{type:'json',consistency:'strong'}))?.version!==version)throw Error('dictionary_write_readback_failed');
 // Versioned payload first, pointer last: readers always see a complete snapshot.
 await store.setJSON(DICTIONARY_ROOT+'active.json',{schema:1,version,previous:previous.version,updated_at:nowISO()});
 if((await loadActiveKnowledge(store)).version!==version)throw Error('dictionary_activation_failed');
 return next;
}
export async function rollbackKnowledge(store,version){
 if(!/^[-a-zA-Z0-9_.]{3,100}$/.test(version))throw Error('invalid_dictionary_version');
 const old=await store.get(SOURCE_ROOT+version+'.json',{type:'json',consistency:'strong'});
 if(!old&&version!==SEED_VERSION)throw Error('dictionary_snapshot_missing');const target=old||createSeedSnapshot();validateSnapshot(target);
 const active=await loadActiveKnowledge(store);
 await store.setJSON(DICTIONARY_ROOT+'active.json',{schema:1,version,previous:active.version,updated_at:nowISO()});
 return target;
}
export function sourceQueryForTag(snapshot,source,canonicalId){
 validateSnapshot(snapshot);const matches=snapshot.relations.filter(r=>r.source===source&&r.target_tag_id===canonicalId&&r.status==='approved'&&['exact_alias','translated_label'].includes(r.type));
 return matches.length===1?{supported:true,source_tag:matches[0].raw_tag,evidence:matches[0].evidence}: {supported:false,reason:matches.length?'ambiguous_source_alias':'no_verified_source_alias'};
}
export function reindexWorkWithKnowledge(work,snapshot){return {...work,...resolveWorkKnowledge(work,snapshot)}};

/** Adapt a trusted source-native vocabulary without treating translations/related tags as global identity. */
export function importNekosiaVocabulary(snapshot,data,{retrievedAt=nowISO()}={}){
 validateSnapshot(snapshot);
 if(data?.success!==true||!Array.isArray(data.tags)||!Array.isArray(data.anime)||!Array.isArray(data.characters))throw Error('invalid_nekosia_response');
 const sources={tags:'other',anime:'franchise',characters:'character'},byKey=new Map((snapshot.source_terms||[]).map(t=>[t.source+'|'+t.category+'|'+norm(t.name),t]));
 for(const [field,category] of Object.entries(sources))for(const tag of data[field]){
  const name=cleanString(tag,150);if(!name||!suffix(name))continue;
  const key='nekosia|'+category+'|'+norm(name);
  byKey.set(key,{source:'nekosia',source_term_id:'nekosia:'+field+':'+suffix(name),name,category,provenance:'nekosia_api_v1_tags',retrieved_at:retrievedAt});
 }
 if(byKey.size>MAX_SOURCE_TERMS)throw Error('too_many_source_terms');
 return {...snapshot,source_terms:[...byKey.values()]};
}
/** Danbooru alias API records are candidate evidence; they do not auto-approve entity merges. */
export function importDanbooruAliasCandidates(snapshot,rows,{retrievedAt=nowISO()}={}){
 validateSnapshot(snapshot);if(!Array.isArray(rows)||rows.length>5000)throw Error('invalid_danbooru_alias_batch');
 const prior=new Set(snapshot.relations.map(r=>r.source+'|'+norm(r.raw_tag)+'|'+r.evidence));
 const additions=[];
 for(const row of rows){
  if(row?.status!=='active'||!row.approver_id)continue;
  const antecedent=cleanString(row.antecedent_name,160),consequent=cleanString(row.consequent_name,160);
  if(!antecedent||!consequent||!Number.isSafeInteger(Number(row.id)))continue;
  const evidence='danbooru:tag_aliases:'+row.id,identity='safedonmai|'+norm(antecedent)+'|'+evidence;
  if(prior.has(identity))continue;prior.add(identity);
  additions.push({source:'safedonmai',raw_tag:antecedent,source_tag_id:String(row.id),target_tag_id:null,type:'needs_review',status:'pending',evidence,
   external_consequent:consequent,approver_id:row.approver_id,created_at:retrievedAt});
 }
 return {...snapshot,relations:[...snapshot.relations,...additions]};
}
export {norm as normalizeTagLabel};
