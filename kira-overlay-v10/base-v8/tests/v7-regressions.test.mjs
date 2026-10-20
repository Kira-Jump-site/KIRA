import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {normalizeWorkTags,sourceTagged} from '../lib/tag-ontology-v5.mjs';
import {sourceMetric,evaluateSourcePool,updatePopularityBaseline,mediaGate,inventoryTargets} from '../lib/source-popularity-v5.mjs';
import {extractEshuushuuDetail,zerochanParams,decodeBooruRating,extractNekosiaItems} from '../lib/source-evidence-v6.mjs';
const item=(source,id,fields={})=>({source,source_post_id:String(id),images:[{image_index:0,media_status:'verified',width:1280,height:1800}],media_status:'verified',rating:'safe',...fields});

test('unknown homographs never merged across sources',()=>{
 const a=normalizeWorkTags({source:'nekosia',raw_tags:['mysterious_character']}),b=normalizeWorkTags({source:'zerochan',raw_tags:['mysterious_character']});
 assert.notDeepEqual(a.normalized_tag_ids,b.normalized_tag_ids);
 assert.ok(a.normalized_tag_ids.includes('source:nekosia:mysterious_character'));
});
test('known multilingual aliases are cross-source linked',()=>{
 const a=normalizeWorkTags({source:'pixiv',raw_tags:['初音ミク']}),b=normalizeWorkTags({source:'safebooru',tags:['hatsune_miku']});
 assert.ok(a.normalized_tag_ids.includes('character:hatsune_miku'));
 assert.ok(b.normalized_tag_ids.includes('character:hatsune_miku'));
});
test('Pixiv paired translated tags are preserved from native record',()=>{
 const m=normalizeWorkTags({source:'pixiv',source_tags_structured:[{name:'異世界',translated_name:'异世界'},{name:'オリジナル',translated_name:'原创'}],raw_tags:['異世界','オリジナル']});
 assert.equal(m.source_translations.length,2);
 assert.equal(m.source_translations[0].evidence,'pixiv_source_pair');
 assert.ok(m.search_tokens.includes('异世界'));
 assert.equal(sourceTagged(m,['异世界']),true);
});
test('Popularity does not use pixels, freshness, or metadata completeness',()=>{
 const fields={source_score_raw:123},x=item('konachan',1,{...fields,title:'',author:'',images:[{width:1000,height:1000,media_status:'verified'}]}),y=item('konachan',2,{...fields,title:'Perfect',author:'A',images:[{width:8000,height:10000,media_status:'verified'}]});
 assert.equal(sourceMetric(x).value,sourceMetric(y).value);
 assert.equal(evaluateSourcePool([x,y])[0].quality_score,null);
});
test('Unrated Nekosia never fabricates scores even with extreme pixel count',()=>{
 const w=item('nekosia',1,{images:[{width:9999,height:9999,media_status:'verified'}],favorites_raw:99999,source_score_raw:99999});
 assert.equal(sourceMetric(w).value,null);
 assert.equal(evaluateSourcePool([w])[0].popularity_status,'unrated');
});
test('E-Shuushuu one-vote rating is insufficient to rank without favorites',()=>{
 assert.equal(sourceMetric(item('e_shuushuu',1,{source_score_raw:9.9,source_vote_count:1})).value,null);
 assert.equal(sourceMetric(item('e_shuushuu',2,{source_score_raw:9.9,source_vote_count:30})).metric,'bayesian_rating');
 assert.equal(sourceMetric(item('e_shuushuu',3,{source_score_raw:9.2,source_vote_count:1,favorites_raw:20})).metric,'favorites_raw');
});
test('Source popularity history is key-separated by metric',()=>{
 const hist=updatePopularityBaseline({},[item('safedonmai',1,{source_score_raw:10}),item('safedonmai',2,{favorites_raw:12})]);
 assert.deepEqual(Object.keys(hist).sort(),['safedonmai:favorites_raw','safedonmai:source_score_raw']);
 assert.notDeepEqual(hist['safedonmai:favorites_raw'],hist['safedonmai:source_score_raw']);
});
test('No mixing scores and favorites in percentile distribution',()=>{
 const pool=[...Array.from({length:12},(_,i)=>item('safedonmai',i,{source_score_raw:i+1})),item('safedonmai',50,{favorites_raw:500})];
 const ranked=evaluateSourcePool(pool,{maxItems:30});
 assert.equal(ranked.find(x=>x.source_post_id==='50').popularity_status,'insufficient_reference');
 assert.ok(ranked.some(x=>x.quality_score!==null));
});
test('Coverage reserve retains some unscored discoveries while ranked dominate',()=>{
 const works=[...Array.from({length:20},(_,i)=>item('konachan',i,{source_score_raw:i+1})),item('konachan',50),item('konachan',51),item('konachan',52)];
 const selection=evaluateSourcePool(works,{maxItems:10,explorationQuota:2});
 assert.equal(selection.length,10);assert.equal(selection.filter(x=>x.popularity_status==='unrated').length,2);
});
test('Sensitive Danbooru rating never becomes public safe',()=>{
 assert.equal(decodeBooruRating('s','don'),'sensitive');assert.equal(decodeBooruRating('s','dan'),'sensitive');assert.equal(decodeBooruRating('g','don'),'safe');assert.equal(decodeBooruRating('s','gel'),'safe');
});
test('Media preview must be verified and short side passes minimum',()=>{
 assert.equal(mediaGate(item('pixiv',1,{media_status:'unchecked'})).eligible,false);
 assert.equal(mediaGate(item('pixiv',1,{images:[{image_index:0,width:640,height:4000,media_status:'verified'}]})).eligible,false);
 assert.equal(mediaGate(item('pixiv',1)).eligible,true);
});
test('Nekosia singleton retains artist source, image original dimensions',()=>{
 const v=extractNekosiaItems({success:true,id:'abc',image:{original:{url:'https://cdn.nekosia.cat/o.png'},compressed:{url:'https://cdn.nekosia.cat/t.jpg'}},metadata:{original:{width:3000,height:4000}},source:{url:'https://www.pixiv.net/artworks/111'},attribution:{artist:{username:'A'}},tags:['catgirl']});
 assert.equal(v.length,1);assert.equal(v[0].width,3000);assert.equal(v[0].artist,'A');assert.ok(v[0].original_source_url.includes('/111'));
});
test('Zerochan popularity filter uses official sorting vocabulary',()=>{
 const v=new URL(zerochanParams({mode:'popular_alt',page:3,tag:'Hatsune Miku'}).url);
 assert.equal(v.searchParams.get('s'),'fav');assert.equal(v.searchParams.get('t'),'0');assert.equal(v.searchParams.get('d'),'large');
});
test('12 sources have separate low-stock quota, not a shared waterfall',()=>{
 const v=inventoryTargets({safebooru:999,konachan:0,miyoushe_cos:10});
 assert.equal(v.safebooru.need,0);assert.equal(v.konachan.need,120);assert.equal(v.miyoushe_cos.need,110);assert.equal(Object.keys(v).length,12);
});
test('E-Shuushuu new Svelte uploader and low-vote rating are retained with correct role',()=>{
 const html='<section>Uploaded by<div class="uploader-info"><a href="/users/846201" class="username-link username">Housekino</a></div></section>'+
 '<div class="info-row"><dt>Rating:</dt><dd>8.3 / 10 (<a>1 vote</a>)</dd></div>'+
 '<div class="info-row"><dt>Favorites:</dt><dd>0</dd></div>'+
 '<a href="https://www.pixiv.net/artworks/119387233">source</a>';
 const result=extractEshuushuuDetail(html);
 assert.equal(result.uploader_name,'Housekino');assert.equal(result.source_vote_count,1);
 assert.equal(result.source_score_raw,8.3);assert.equal(result.favorites_raw,0);
 assert.equal(result.original_source_url,'https://www.pixiv.net/artworks/119387233');
});
