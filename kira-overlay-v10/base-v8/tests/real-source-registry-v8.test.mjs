import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {normalizeNekosiaRegistry,fetchNekosiaRegistry,resolveNativeTag,toNekosiaSearch} from '../lib/source-tag-registry-v8.mjs';
const example={success:true,status:200,tags:['1girl','blue-hair','maid','unknown-label'],anime:['Arknights','Original Show'],characters:['Hatsune Miku','Original Character']};
test('Nekosia source taxonomy retains every typed native item',()=>{
 const r=normalizeNekosiaRegistry(example);assert.deepEqual(r.counts,{general:4,ip:2,character:2});
 assert.equal(r.records.length,8);assert.equal(r.records.find(x=>x.native_tag==='Arknights').canonical_id,'ip:arknights');
 assert.equal(r.records.find(x=>x.native_tag==='Hatsune Miku').canonical_id,'character:hatsune_miku');
 assert.equal(r.records.find(x=>x.native_tag==='Original Character').canonical_id,'source:nekosia:character:original_character');
});
test('real Nekosia tag cannot be guessed if not included in native taxonomy',()=>{
 const r=normalizeNekosiaRegistry(example);assert.equal(resolveNativeTag(r,'invented-character',{axis:'character'}).supported,false);
 assert.equal(resolveNativeTag(r,'blue-hair').supported,true);
 const good=toNekosiaSearch(['blue-hair','maid'],r,{blacklist:['1girl']});assert.equal(good.additionalTags,'blue-hair,maid');
 assert.equal(good.blacklistedTags,'1girl');assert.equal(toNekosiaSearch('not-a-tag',r).supported,false);
});
test('upstream list is validated and request uses only fixed official host',async()=>{
 let requested;const got=await fetchNekosiaRegistry({fetcher:async url=>{requested=url;return new Response(JSON.stringify(example))}});
 assert.equal(requested,'https://api.nekosia.cat/api/v1/tags');assert.equal(got.total,8);
 await assert.rejects(()=>fetchNekosiaRegistry({fetcher:async()=>new Response('{}')}),/invalid_nekosia_taxonomy/);
});
