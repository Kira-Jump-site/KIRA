import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {sourceQuery,sourceSchedule,SOURCE_POLICIES} from '../lib/source-policy.mjs';
import {discoverSource} from '../lib/source-adapters.mjs';
test('twelve independent source policies',()=>{assert.equal(Object.keys(SOURCE_POLICIES).length,12)});
test('verified popular and independent schedules',()=>{
 for(const s of ['safebooru','safedonmai','cosbooru','konachan','wallhaven'])assert.equal(sourceSchedule(s,1).mode,'popular');
 for(const s of ['pixiv','pixiv_yuki','miyoushe_cos','bilibili_opus','zerochan','nekosia'])assert.equal(sourceSchedule(s,1).mode,'new');
 assert.equal(sourceSchedule('safedonmai',3).mode,'popular_alt');
});
test('tag alias and unsupported search never silently ignored',()=>{
 assert.equal(sourceQuery('safedonmai','character:hatsune_miku').value,'hatsune_miku');
 assert.equal(sourceQuery('wallhaven','ip:genshin_impact').value,'genshin impact');
 assert.equal(sourceQuery('pixiv','character:hatsune_miku').supported,false);
 assert.equal(sourceQuery('e_shuushuu','miku').supported,false);
});
test('booru source specific popular mode feeds upstream and retains author role',async()=>{
 for(const [source,needle] of [['safebooru','sort:score:desc'],['safedonmai','order:rank'],['cosbooru','order:score'],['konachan','order:score']]){
 let url;const fetcher=async u=>{url=new URL(u);return new Response(JSON.stringify([{id:1001,rating:'s',preview_url:'https://konachan.net/t.jpg',sample_url:'https://konachan.net/f.jpg',tag_string_artist:'creator',score:20,tags:'hatsune_miku',tag_string:'hatsune_miku',preview_file_url:'https://cos.booru.nl/t.jpg',large_file_url:'https://cos.booru.nl/f.jpg'}]))};
 const r=await discoverSource(source,{mode:'popular',fetcher});
 assert.ok(url.searchParams.get('tags').includes(needle),source);
 assert.equal(r.works[0].author,'creator');
 assert.equal(r.works[0].author_role,'tagged_artist');
 }
});
