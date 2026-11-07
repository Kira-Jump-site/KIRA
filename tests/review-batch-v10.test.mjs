import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {applyReviewBatch} from '../lib/review-batch-v10.mjs';
test('100-work page splits into bounded 20-work calls while preserving per-item ratings',async()=>{let called=0;const all=Array.from({length:100},(_,n)=>({source:'pixiv',source_post_id:String(n),rating:'safe'}));let passed=0;
 for(let n=0;n<100;n+=20){const out=await applyReviewBatch(all.slice(n,n+20),{action:'approve',review:async r=>{called++;assert.equal(r.rating,'safe');return {ok:true,...r}}});passed+=out.completed}
 assert.equal(passed,100);assert.equal(called,100)});
test('reject actions never become approve and errors do not stop other items',async()=>{const out=await applyReviewBatch([{source:'a',source_post_id:'1'},{source:'a',source_post_id:'2'}],{action:'reject',review:async r=>r.source_post_id==='1'?Promise.reject(Error('conflict')):{...r,ok:true}});
 assert.equal(out.completed,1);assert.equal(out.failed,1);assert.equal(out.results[0].error,'conflict')});
test('duplicate source IDs in same batch are not processed twice',async()=>{let count=0;const rows=[{source:'a',source_post_id:'1'},{source:'a',source_post_id:'1'}];const out=await applyReviewBatch(rows,{action:'approve',review:async r=>{count++;return {ok:true,...r}}});assert.equal(count,1);assert.equal(out.failed,1)});
test('report IDs must be independent, not deduplicated as undefined source ID',async()=>{let count=0;const out=await applyReviewBatch([{id:'a'},{id:'b'}],{action:'keep',review:async r=>{count++;return {ok:true,...r}}});assert.equal(count,2);assert.equal(out.completed,2)});
test('batch has hard 20-item server-side maximum',async()=>{await assert.rejects(applyReviewBatch(Array.from({length:21},(_,i)=>({source:'a',source_post_id:String(i)})),{action:'approve',review:async()=>({ok:true})}),/invalid_review_batch/)});
