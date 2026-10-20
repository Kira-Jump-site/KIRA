import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {evaluateSourcePool, sourceMetric, updatePopularityBaseline} from '../lib/source-popularity-v5.mjs';
const w=(id,score,ts=100)=>({source:'safebooru',source_post_id:String(id),source_score_raw:score,
 source_published_at:ts,images:[],rating:'safe'});
test('under-12 source sample still prefers real source score not newest',()=>{
 const pool=[w('high',100,100),w('low',1,999999),w('medium',50,900000)];
 const ranked=evaluateSourcePool(pool,{maxItems:3});
 assert.deepEqual(ranked.map(x=>x.source_post_id),['high','medium','low']);
 assert.ok(ranked.every(x=>x.popularity_status==='insufficient_reference'&&x.quality_score===null));
});
test('short previous histogram merges with discovery candidates, never raw score from another metric',()=>{
 const pool=Array.from({length:12},(_,i)=>w(String(i),i+10,1000+i));
 const ranked=evaluateSourcePool(pool,{referenceDistributions:{'safebooru:source_score_raw':[Math.log1p(9)]},maxItems:12});
 assert.equal(ranked.length,12);
 assert.ok(ranked.every(x=>x.popularity_status==='ranked'));
 assert.equal(ranked[0].source_post_id,'11');
});
test('fallback metric remains separate from prior distribution and cannot use its numeric scale',()=>{
 const pool=[...Array.from({length:7},(_,i)=>({source:'safedonmai',source_post_id:'f'+i,favorites_raw:i+1})),
 ...Array.from({length:7},(_,i)=>({source:'safedonmai',source_post_id:'s'+i,source_score_raw:10000+i}))];
 const v=evaluateSourcePool(pool,{maxItems:14});
 assert.equal(v.length,14);
 assert.deepEqual(v.slice(0,7).map(x=>x.source_post_id),['f6','f5','f4','f3','f2','f1','f0']);
 assert.equal(v[7].source_post_id,'s6');
});
test('history is stored under source:metric, 0 is a real score and negatives absent',()=>{
 const h=updatePopularityBaseline({},[w('a',0),w('b',-1)]);
 assert.equal(h['safebooru:source_score_raw'].length,1);
 assert.equal(sourceMetric(w('a',0)).observed,true);
 assert.equal(sourceMetric(w('b',-1)).observed,false);
});
test('unrated provider recommendations preserve upstream candidate priority',()=>{
 const works=[{source:'pixiv',source_post_id:'recommended',published_at:1},{source:'pixiv',source_post_id:'newer',published_at:999999}];
 const result=evaluateSourcePool(works,{maxItems:2});
 assert.deepEqual(result.map(x=>x.source_post_id),['recommended','newer']);
 assert.ok(result.every(x=>x.quality_score===null));
});
test('e-shuushuu 5+ vote rating is not thrown away when favorites=0',()=>{
 const w={source:'e_shuushuu',source_post_id:'123',favorites_raw:0,source_score_raw:9.2,source_vote_count:40};
 const m=sourceMetric(w);assert.equal(m.metric,'bayesian_rating');
 const insufficient=sourceMetric({...w,source_vote_count:1});assert.equal(insufficient.metric,'favorites_raw');
});
test('tagged priority compares multilingual canonical IDs, never raw Chinese text only',()=>{
 const good={...w('miku',35),normalized_tag_ids:['character:hatsune_miku'],search_tokens:['hatsune_miku']};
 const unrelated={...w('other',100),normalized_tag_ids:['ip:genshin_impact'],search_tokens:['genshin_impact']};
 const result=evaluateSourcePool([unrelated,good],{desiredTags:['初音未来'],maxItems:10});
 assert.deepEqual(result.map(x=>x.source_post_id),['miku']);
});
