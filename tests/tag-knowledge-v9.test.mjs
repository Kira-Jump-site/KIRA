import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {createSeedSnapshot,validateSnapshot,resolveWorkKnowledge,approveSourceMapping,proposeEntity,sourceQueryForTag,saveKnowledgeSnapshot,loadActiveKnowledge,rollbackKnowledge,reindexWorkWithKnowledge,importNekosiaVocabulary,importDanbooruAliasCandidates} from '../lib/tag-knowledge-v9.mjs';
class Store{db=new Map();async get(k){return structuredClone(this.db.get(k)||null)}async setJSON(k,v){this.db.set(k,structuredClone(v))}}
const seed=createSeedSnapshot();
test('seed data validates and keeps stable KIRA IDs',()=>{assert.equal(validateSnapshot(seed).schema,1);assert.ok(seed.entities.length>40)});
test('approved curated multilingual synonyms are one entity',()=>{
 const rows=resolveWorkKnowledge({source:'safebooru',raw_tags:['hatsune_miku','初音未来','初音ミク']},seed);
 assert.deepEqual(rows.normalized_tag_ids,['character:hatsune_miku']);assert.equal(rows.unresolved_tag_facts.length,0);
});
test('unknown typed and ordinary labels are preserved but never auto-merged',()=>{
 const a=resolveWorkKnowledge({source:'safebooru',source_tag_groups:{character:['new_game_char'],general:['rare_x']},raw_tags:['rare_x']},seed);
 const b=resolveWorkKnowledge({source:'konachan',raw_tags:['new_game_char','rare_x']},seed);
 assert.equal(a.normalized_tag_ids.length,0);assert.equal(b.normalized_tag_ids.length,0);
 assert.ok(a.unresolved_tag_facts.some(x=>x.raw_tag==='new_game_char'));assert.ok(a.search_tokens.includes('safebooru:rare_x'));
});
test('related is not exact and cannot automatically unify',()=>{
 const withTag=proposeEntity(seed,{id:'character:rarea',category:'character',aliases:['Rare A'],evidence:'manual review',reviewer:'Admin'});
 const related=approveSourceMapping(withTag,{source:'zerochan',raw_tag:'rare friend',target_tag_id:'character:rarea',type:'related_to',evidence:'wiki related characters',reviewer:'Admin'});
 const work=resolveWorkKnowledge({source:'zerochan',raw_tags:['rare friend']},related);
 assert.ok(!work.normalized_tag_ids.includes('character:rarea'));assert.ok(work.unresolved_tag_facts.length>0);
});
test('explicit source mapping resolves and queries only correct provider',()=>{
 const withTag=proposeEntity(seed,{id:'character:rarea',category:'character',aliases:['Rare A'],evidence:'manual',reviewer:'Admin'});
 const mapped=approveSourceMapping(withTag,{source:'zerochan',raw_tag:'レアA',target_tag_id:'character:rarea',type:'translated_label',evidence:'verified character encyclopedia URL',reviewer:'Admin'});
 assert.ok(resolveWorkKnowledge({source:'zerochan',raw_tags:['レアA']},mapped).normalized_tag_ids.includes('character:rarea'));
 assert.equal(sourceQueryForTag(mapped,'zerochan','character:rarea').source_tag,'レアA');
 assert.equal(sourceQueryForTag(mapped,'cosbooru','character:rarea').supported,false);
});
test('conflicting mappings fail closed',()=>{
 const a=proposeEntity(seed,{id:'character:rarea',category:'character',aliases:['rarea'],evidence:'manual',reviewer:'Admin'});
 const b=proposeEntity(a,{id:'character:rareb',category:'character',aliases:['rareb'],evidence:'manual',reviewer:'Admin'});
 const c=approveSourceMapping(b,{source:'zerochan',raw_tag:'foo',target_tag_id:'character:rarea',type:'exact_alias',evidence:'proof-a',reviewer:'Admin'});
 assert.throws(()=>approveSourceMapping(c,{source:'zerochan',raw_tag:'foo',target_tag_id:'character:rareb',type:'exact_alias',evidence:'proof-b',reviewer:'Admin'}),/conflict/);
});
test('immutable snapshots read back, update and roll back; no redownload',async()=>{
 const db=new Store(),current=await loadActiveKnowledge(db);
 const withTag=proposeEntity(current,{id:'character:new_ch',category:'character',aliases:['新角色'],evidence:'admin documentation',reviewer:'Admin'});
 const next=await saveKnowledgeSnapshot(db,current,withTag,{version:'KIRA_2026_10_20_2',reviewer:'Admin'});
 assert.equal((await loadActiveKnowledge(db)).version,next.version);
 const rec=reindexWorkWithKnowledge({source:'miyoushe_cos',raw_tags:['新角色'],images:[{image_index:0}]},next);
 assert.ok(rec.normalized_tag_ids.includes('character:new_ch'));
 await rollbackKnowledge(db,next.parent_version);
 assert.equal((await loadActiveKnowledge(db)).version,current.version);
});

test('Nekosia native catalog builds typed source-only terms without claiming global synonyms',()=>{
 const x=importNekosiaVocabulary(seed,{success:true,tags:['blue-hair','rare-eye'],anime:['New Franchise'],characters:['New Character']});
 assert.equal(x.source_terms.length,4);
 const w=resolveWorkKnowledge({source:'nekosia',raw_tags:['rare-eye']},x);
 assert.equal(w.normalized_tag_ids.length,0);assert.equal(w.unresolved_tag_facts[0].native_tag_verified,true);
});
test('Danbooru aliases are candidate evidence only, not automatic same-entity claims',()=>{
 const s=importDanbooruAliasCandidates(seed,[{id:51,status:'active',approver_id:31,antecedent_name:'uncertain_a',consequent_name:'character_other'},{id:52,status:'retired',approver_id:3,antecedent_name:'retired',consequent_name:'other'}]);
 assert.equal(s.relations.length,1);assert.equal(s.relations[0].status,'pending');
 const w=resolveWorkKnowledge({source:'safedonmai',raw_tags:['uncertain_a']},s);assert.equal(w.normalized_tag_ids.length,0);
});
