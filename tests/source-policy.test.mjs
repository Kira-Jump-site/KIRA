import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {sourceQuery,sourceSchedule,SOURCE_POLICIES} from '../lib/source-policy.mjs';
import {discoverSource} from '../lib/source-adapters.mjs';
test('fourteen independent source policies',()=>{assert.equal(Object.keys(SOURCE_POLICIES).length,14)});
test('verified popular and independent schedules',()=>{
 // The schedule must follow each source's declared capability, not a stale list.
 for(const [s,p] of Object.entries(SOURCE_POLICIES)){
  if(['konachan','yande'].includes(s)){
   // Ranked Moebooru lanes always request order:score plus a date window.
   assert.equal(sourceSchedule(s,0).mode,'popular',s);
   assert.match(sourceSchedule(s,0).rankingTag,/order:score date:>=/);
   continue;
  }
  assert.equal(sourceSchedule(s,0).mode,'new',s);
  assert.equal(sourceSchedule(s,1).mode,p.hot?'popular':'new',s);
  if(p.hotAlternate)assert.equal(sourceSchedule(s,3).mode,'popular_alt',s);
 }
});
test('tag alias and unsupported search never silently ignored',()=>{
 assert.equal(sourceQuery('safedonmai','character:hatsune_miku').value,'hatsune_miku');
 assert.equal(sourceQuery('wallhaven','ip:genshin_impact').value,'genshin impact');
 assert.equal(sourceQuery('pixiv','character:hatsune_miku').supported,false);
 assert.equal(sourceQuery('e_shuushuu','miku').supported,false);
});
test('booru source specific popular mode feeds upstream and retains author role',async()=>{
 // Danbooru-family engines use g/s/e, where s means sensitive. Gel/Moebooru use s for safe.
 for(const [source,needle,rating] of [['safebooru','sort:score:desc','s'],['safedonmai','order:rank','g'],['cosbooru','order:score','g'],['konachan','order:score','s']]){
 let url;const fetcher=async u=>{url=new URL(u);return new Response(JSON.stringify([{id:1001,rating,preview_url:'https://konachan.net/t.jpg',sample_url:'https://konachan.net/f.jpg',tag_string_artist:'creator',score:20,tags:'hatsune_miku',tag_string:'hatsune_miku',preview_file_url:'https://cos.booru.nl/t.jpg',large_file_url:'https://cos.booru.nl/f.jpg'}]))};
 const r=await discoverSource(source,{mode:'popular',fetcher});
 assert.ok(url.searchParams.get('tags').includes(needle),source);
 assert.equal(r.works.length,1,source);
 assert.equal(r.works[0].author,'creator');
 assert.equal(r.works[0].author_role,'tagged_artist');
 }
});
