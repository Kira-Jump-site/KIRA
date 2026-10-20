import{test}from'node:test';import{strict as assert}from'node:assert';
import{normalizeWorkTags}from'../lib/tag-ontology-v5.mjs';
import{sourceMetric}from'../lib/source-popularity-v5.mjs';
// Public API observation retrieved 2026-10-18 from https://api.nekosia.cat/api/v1/images/catgirl
const response={id:'66aa7043a013664688154e8d',category:'catgirl',image:{original:{url:'https://cdn.nekosia.cat/images/catgirl/66aa7043a013664688154e8d.jpg'}},metadata:{original:{width:1536,height:2048}},rating:'safe',tags:['catgirl','cat-ears','animal-ears','cute','young-girl','miko','yellow-ribbon'],source:{url:'https://www.pixiv.net/en/artworks/115400499'},attribution:{artist:{username:'葉桜ひなた',profile:'https://www.pixiv.net/en/users/85767213'}}};
test('public Nekosia observation retains original artist/source and original dimensions',()=>{
 const src={source:'nekosia',source_post_id:response.id,source_tag_groups:{general:response.tags},raw_tags:response.tags,images:[{width:response.metadata.original.width,height:response.metadata.original.height}]};
 const tags=normalizeWorkTags(src);
 assert.equal(response.attribution.artist.username,'葉桜ひなた');assert.equal(response.source.url,'https://www.pixiv.net/en/artworks/115400499');
 assert.equal(src.images[0].width,1536);assert.ok(tags.normalized_tag_ids.includes('source:nekosia:general:catgirl'));
 assert.equal(sourceMetric(src).value,null);
});
