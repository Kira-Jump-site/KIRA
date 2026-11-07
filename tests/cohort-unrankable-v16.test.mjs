import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateSourcePool} from '../lib/source-popularity-v5.mjs';
import {preselectQualityPool,qualityAdmission} from '../lib/quality-admission-v10.mjs';
const work=(id,{w=1600,h=1200}={})=>({source:'cosbooru',source_post_id:String(id),rating:'safe',source_score_raw:0,media_status:'verified',images:[{image_index:0,width:w,height:h,media_status:'verified'}]});
test('all-equal cohort is unrankable instead of bottom-ranked',()=>{
 const pool=evaluateSourcePool(Array.from({length:20},(_,i)=>work(i)),{maxItems:64});
 assert.equal(pool.length,20);
 assert.ok(pool.every(w=>w.popularity_status==='cohort_unrankable'));
 assert.ok(pool.every(w=>w.popularity_percentile===null));
 assert.equal(preselectQualityPool(pool).length,20);
});
test('unrankable admission still requires verified large media',()=>{
 const base={...work(1),popularity_status:'cohort_unrankable',observed_popularity_value:0};
 assert.equal(qualityAdmission(base).eligible,true);
 assert.equal(qualityAdmission({...base,images:[{image_index:0,width:450,height:890,media_status:'verified'}]}).reason,'low_resolution');
 assert.equal(qualityAdmission({...base,images:[{image_index:0,width:1600,height:1200,media_status:'unchecked'}]}).reason,'media_unverified');
});
test('a large batch is ranked within itself, not against a popular baseline',()=>{
 const history=Array.from({length:30},(_,i)=>Math.log1p(1000+i*100));
 const works=Array.from({length:30},(_,i)=>({...work(i),source_score_raw:i+1}));
 const pool=evaluateSourcePool(works,{referenceDistributions:{'cosbooru:source_score_raw':history}});
 const top=pool.find(w=>w.source_post_id==='29');
 assert.equal(top.popularity_status,'ranked');
 assert.ok(top.popularity_percentile>=0.95,`percentile ${top.popularity_percentile}`);
 assert.equal(pool.filter(w=>w.popularity_status==='ranked').length,30);
 assert.equal(preselectQualityPool(pool).length,9);
});
