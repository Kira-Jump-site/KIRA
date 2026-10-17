import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {normalizeTags,resolveTag,reindexWorkTags,matchesTags} from '../lib/tag-dictionary.mjs';
import {rankSourceCandidates,SOURCE_CAPABILITIES} from '../lib/quality-ranking.mjs';
import {enrichWorkV3} from '../lib/metadata-schema.mjs';
test('source capability matrix has 12 entries',()=>{assert.equal(Object.keys(SOURCE_CAPABILITIES).length,12);assert.equal(SOURCE_CAPABILITIES.pixiv.tag_query,null)});
test('multilingual aliases and unknown tags',()=>{const a=normalizeTags('safebooru',['hatsune_miku','unknown_zz']);assert.ok(a.normalized_tag_ids.includes('character:hatsune_miku'));assert.equal(resolveTag('初音ミク'),resolveTag('初音未来'));assert.ok(a.search_tokens.includes('safebooru:unknown_zz'));assert.equal(matchesTags(a,['初音未来']),true);assert.ok(reindexWorkTags({source:'safebooru',tags:['初音ミク']}).normalized_tag_ids.length)});
test('v3 preserves multi-image indices and missing metrics',()=>{const w=enrichWorkV3({source:'miyoushe_cos',kind:'cosplay',rating:'unknown',images:[{image_index:0},{image_index:5}]});assert.equal(w.image_count,2);assert.equal(w.images[1].image_index,5);assert.equal(w.source_score_raw,null);assert.equal(w.content_type,'cosplay')});
test('quality favours higher real source scores',()=>{const b={source:'safebooru',images:[{width:1900,height:1200}]};const ranked=rankSourceCandidates([{...b,source_post_id:'low',source_score_raw:2},{...b,source_post_id:'high',source_score_raw:200}]);assert.equal(ranked[0].source_post_id,'high')});
