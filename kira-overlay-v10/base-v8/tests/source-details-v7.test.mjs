import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {parseWallhavenDetail,parseZerochanDetail,parseEshuushuuTags} from '../lib/source-details-v7.mjs';
test('wallhaven detail resolves actual image tags, source and uploader but not artist',()=>{
 const d=parseWallhavenDetail({data:{id:'94x38z',category:'anime',purity:'sfw',tags:[{id:1,name:'Anime'},{id:2,name:'Hatsune Miku'}],source:'https://www.pixiv.net/artworks/222',uploader:{username:'user'},favorites:100,views:2000,dimension_x:2560,dimension_y:1600}},'94x38z');
 assert.deepEqual(d.raw_tags,['Anime','Hatsune Miku']);assert.equal(d.source_artist_name,'');assert.equal(d.uploader_name,'user');assert.equal(d.title,'');assert.equal(d.favorites_raw,100);
});
test('wallhaven metadata not accepted for wrong ID or unsafe purity',()=>{
 assert.equal(parseWallhavenDetail({data:{id:'x',category:'anime',purity:'sfw'}},'y'),null);
 assert.equal(parseWallhavenDetail({data:{id:'x',category:'anime',purity:'sketchy'}},'x'),null);
});
test('zerochan metadata uses actual fav and distinguishes primary tag from original title',()=>{
 const r=parseZerochanDetail({id:3793685,primary:'Hatsune Miku',tags:['Hatsune Miku','VOCALOID'],fav:42,full:'https://static.zerochan.net/3793685.jpg',width:1748,height:2480},'3793685');
 assert.equal(r.favorites_raw,42);assert.equal(r.title,'');assert.equal(r.display_title,'Hatsune Miku');assert.equal(r.source_artist_name,'');assert.equal(r.detail_verified,true);
});
test('zerochan reject mismatched details and insecure image url',()=>{
 assert.equal(parseZerochanDetail({id:2},1),null);
 const r=parseZerochanDetail({id:2,full:'http://evil.test/p.png'},2);assert.equal(r.image_url,null);
});
test('e-shuushuu tags extracted only from detail Tags section, never comments',()=>{
 const h='<h2>Tags</h2><div><a href="/tags/10">初音ミク</a><a class="t" href="/tags/20">blue hair</a></div><h2>Image Information</h2><a href="/tags/123">FakeCommentTag</a>';
 assert.deepEqual(parseEshuushuuTags(h),['初音ミク','blue hair']);
});
test('2026 E-Shuushuu Svelte detail keeps artist/source/character/general distinct',async()=>{
 const {parseEshuushuuTagGroups}=await import('../lib/source-details-v7.mjs');
 const h='<div class="tag-group">'+[
  ['3','Qingli Ye'],['2','The Idolm@ster Cinderella Girls'],['4','Shimamura Uzuki'],['1','brown hair']]
  .map(([type,tag],i)=>`<span class="split-tag-badge"><a href="/search?tags=${i}" data-tag-id="${i}" data-tag-type="${type}">${tag}</a><a href="/tags/${i}" aria-label="View tag page: ${tag}">›</a></span>`).join('')+
  '</div><div class="comments"><a href="/tags/999" data-tag-id="999" data-tag-type="1">FakeComment</a></div>';
 const groups=parseEshuushuuTagGroups(h.split('<div class="comments">')[0]);
 assert.deepEqual(groups.artist,['Qingli Ye']);assert.deepEqual(groups.ip,['The Idolm@ster Cinderella Girls']);
 assert.deepEqual(groups.character,['Shimamura Uzuki']);assert.deepEqual(groups.general,['brown hair']);
});
