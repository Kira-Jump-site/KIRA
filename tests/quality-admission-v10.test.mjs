import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {qualityAdmission,preselectQualityPool,dailyQuota} from '../lib/quality-admission-v10.mjs';
const sample=(extra={})=>({source:'safebooru',rating:'safe',content_type:'illustration',media_status:'verified',
 images:[{image_index:0,media_status:'verified',width:1500,height:1800}],popularity_status:'ranked',popularity_percentile:.88,...extra});
test('ranked high-quality media enters review',()=>{const r=qualityAdmission(sample());assert.equal(r.eligible,true);assert.equal(r.rule,'source_relative_popularity_and_verified_media')});
test('bottom-of-source popularity cannot enter review despite large resolution',()=>assert.equal(qualityAdmission(sample({popularity_percentile:.2})).eligible,false));
test('unverified media cannot enter review despite perfect popularity',()=>assert.equal(qualityAdmission(sample({media_status:'unverified',popularity_percentile:1})).eligible,false));
test('undersize images never enter review',()=>assert.equal(qualityAdmission(sample({images:[{media_status:'verified',width:640,height:2000}]})).eligible,false));
test('unscored untrusted source is rejected instead of inventing a rating',()=>assert.equal(qualityAdmission(sample({source:'konachan',popularity_status:'unrated'})).eligible,false));
test('curated Pixiv candidates require verified large media, not fabricated score',()=>{const x=sample({source:'pixiv',popularity_status:'unrated',popularity_percentile:null});assert.equal(qualityAdmission(x).eligible,true);assert.equal(qualityAdmission({...x,images:[{media_status:'verified',width:700,height:900}]}).eligible,false)});
test('Miyoushe cosplay-only constraint applies',()=>assert.equal(qualityAdmission(sample({source:'miyoushe_cos',content_type:'illustration'})).eligible,false));
test('prefilter keeps only ranked candidates above source-relative median and credible small samples',()=>{
 const pool=preselectQualityPool([sample({popularity_percentile:.9}),sample({popularity_percentile:.05}),sample({source:'nekosia',popularity_status:'unrated',popularity_percentile:null}),sample({source:'konachan',popularity_status:'unrated',popularity_percentile:null})]);
 assert.equal(pool.length,2);assert(pool.some(x=>x.source==='nekosia'));assert(!pool.some(x=>x.source==='konachan'));
});
test('daily budget is per source and requests up to 120 admitted, never guarantees quota',()=>{for(const source of ['safebooru','pixiv','wallhaven']){const q=dailyQuota(source);assert.equal(q.goal_pending,120);assert(q.max_pages>=16)}});
