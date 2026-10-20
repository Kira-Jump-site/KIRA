import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {extractBooruIdentity,extractNekosiaItems,extractBilibiliNode,extractEshuushuuDetail,zerochanParams,selectRealPopularity} from '../lib/source-evidence-v6.mjs';

test('Booru artist comes only from typed artist tags, not general tag list',()=>{
 const w=extractBooruIdentity({tags:'blue_hair 1girl hatsune_miku',score:45,owner:'uploader42'},'safebooru');
 assert.equal(w.source_artist_name,'');assert.equal(w.artist_evidence,'unknown');assert.equal(w.uploader_name,'uploader42');assert.equal(w.source_score_raw,45);
 const typed=extractBooruIdentity({tag_string_artist:'artist_name',tag_string_general:'blue_hair',tag_string_character:'hatsune_miku',score:12},'safedonmai');
 assert.equal(typed.source_artist_name,'artist_name');assert.deepEqual(typed.source_tag_groups.general,['blue_hair']);assert.deepEqual(typed.source_tag_groups.character,['hatsune_miku']);
});
test('Nekosia documented singleton includes correct nested metadata and attribution, no fake score/title',()=>{
 const upstream={success:true,count:832,id:'66a77347a4b979c761eb0cde',rating:'safe',image:{original:{url:'https://cdn.nekosia.cat/images/catgirl/a.png'},compressed:{url:'https://cdn.nekosia.cat/images/catgirl/a-compressed.jpg'}},
 metadata:{original:{width:1536,height:2304},compressed:{width:1280,height:1920}},category:'catgirl',tags:['catgirl','cat-ears'],source:{url:'https://www.pixiv.net/en/artworks/112464629'},
 attribution:{artist:{username:'AutoINS',profile:'https://www.pixiv.net/en/users/87833254'}}};
 const items=extractNekosiaItems(upstream);assert.equal(items.length,1);assert.equal(items[0].width,1536);assert.equal(items[0].height,2304);
 assert.equal(items[0].original_source_url,'https://www.pixiv.net/en/artworks/112464629');assert.equal(items[0].artist,'AutoINS');assert.equal(items[0].title,'');assert.equal(items[0].source_score_raw,null);
 assert.deepEqual(extractNekosiaItems({...upstream,success:false}),[]);
});
test('Nekosia array response remains compatible with older data',()=>{assert.equal(extractNekosiaItems({success:true,images:[{id:'a',image:{original:{url:'https://cdn.nekosia.cat/a.png'}}}]}).length,1)});
test('Bilibili dynamic module extracts real poster, interaction and hashtag without claiming original artist',()=>{
 const node={id_str:'1256589349307285508',modules:{module_author:{name:'投稿者',mid:123,pub_ts:1791410907},module_stat:{like:{count:'456'}},module_dynamic:{desc:{text:'#原神# #cos正片# 妮露摄影'},major:{draw:{items:[{src:'https://i0.hdslb.com/test.jpg',width:2000,height:3100}]}}}}};
 const v=extractBilibiliNode(node);assert.equal(v.uploader_name,'投稿者');assert.equal(v.original_artist_name,'');assert.equal(v.likes_raw,456);
 assert.deepEqual(v.tags,['原神','cos正片']);assert.equal(v.images.length,1);
});
test('E-Shuushuu official detail text recognizes real rating, votes and favorites',()=>{
 const html='<html><head><title>Ai, Akira E. Ferrari - Image #118080 - e-shuushuu</title></head><body><h2>Uploaded by</h2> solwyvern March 2, 2006 <div>Image Information ID: #118080 Dimensions: 4,310 × 3,030 File Size: 3.44 MB Format: JPEG Rating: 9.2 / 10 (1 vote) Favorites: 9</div></body></html>';
 const v=extractEshuushuuDetail(html);assert.equal(v.title,'');assert.equal(v.title_provenance,'site_generated_from_tags');assert.equal(v.source_score_raw,9.2);assert.equal(v.source_vote_count,1);assert.equal(v.favorites_raw,9);
 assert.equal(v.width,4310);assert.equal(v.height,3030);assert.equal(v.uploader_name,'solwyvern');
});
test('Zerochan verified upstream popularity and tag/size controls',()=>{
 const fresh=new URL(zerochanParams({page:3}).url);assert.equal(fresh.searchParams.get('s'),'id');assert.equal(fresh.searchParams.get('p'),'3');
 const hot=new URL(zerochanParams({mode:'popular',tag:'Genshin Impact'}).url);assert.equal(hot.searchParams.get('s'),'fav');assert.equal(hot.searchParams.get('t'),'1');assert.equal(hot.searchParams.get('d'),'large');assert.ok(hot.pathname.endsWith('/Genshin+Impact'));
});
test('No popularity data => null, pixels cannot become score',()=>{
 assert.equal(selectRealPopularity({source:'nekosia',images:[{width:8192,height:8192}]}).rankable,false);
 assert.equal(selectRealPopularity({source:'safebooru',source_score_raw:8,images:[{width:1,height:1}]}).value,8);
 assert.equal(selectRealPopularity({source:'zerochan',favorites_raw:19}).signal,'favorites');
});
import {extractEshuushuuCards} from '../lib/source-evidence-v6.mjs';
test('e-shuushuu cards robust to differing <a> attribute ordering',()=>{
 const html=`<a class="photo" href="/images/118080"><img loading="lazy" alt="Image 118080" src="https://cdn.e-shuushuu.net/thumbs/2008-118080.webp"></a>`;
 assert.deepEqual(extractEshuushuuCards(html),[['118080','https://cdn.e-shuushuu.net/thumbs/2008-118080.webp']]);
});
import {decodeBooruRating} from '../lib/source-evidence-v6.mjs';
test('Booru engines distinguish sensitive Danbooru s from safe Gelbooru s',()=>{
 assert.equal(decodeBooruRating('s','don'),'sensitive');
 assert.equal(decodeBooruRating('s','dan'),'sensitive');
 assert.equal(decodeBooruRating('g','don'),'safe');
 assert.equal(decodeBooruRating('s','gel'),'safe');
 assert.equal(decodeBooruRating('s','moe'),'safe');
 assert.equal(decodeBooruRating('q','moe'),'sensitive');
});
