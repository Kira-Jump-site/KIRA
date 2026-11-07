import {test} from 'node:test';
import assert from 'node:assert/strict';
import {planWholeWorkMedia} from '../lib/media-batch-planner-v15.mjs';
import {sampleWorkMedia} from '../lib/media-health.mjs';
const works=(ns)=>ns.map((n,i)=>({source:'bilibili_opus',source_post_id:String(i),
 images:Array.from({length:n},(_,image_index)=>({image_index,thumbnail_url:'https://i0.hdslb.com/bfs/new_dyn/'+i+'-'+image_index+'.jpg',preview_url:'https://i0.hdslb.com/bfs/new_dyn/'+i+'-'+image_index+'.jpg'}))}));
test('planner never truncates a multiframe work when remaining quota is too small',()=>{
 const result=planWholeWorkMedia(works([5,8,6,2]),{maxWorks:4,maxImages:12});
 assert.deepEqual(result.selected.map(x=>x.source_post_id),['0','2']);
 assert.deepEqual([...result.deferredIds],['1','3']);
 assert.equal(result.selectedImages,11);
});
test('planner records unsupported or empty galleries separately from media-budget deferrals',()=>{
 const r=planWholeWorkMedia(works([0,33,3]),{maxImages:2});
 assert.equal(r.invalidIds.size,2);assert.deepEqual([...r.deferredIds],['2']);
});
test('shared thumb and preview URLs are network-checked once but require both verified roles',async()=>{
 let calls=0;
 const fetcher=async (_url,init)=>{calls++;
  assert.equal(init.method,'HEAD');return new Response(null,{status:200,headers:{'content-type':'image/jpeg'}});
 };
 const got=await sampleWorkMedia(works([2]),{fetcher,maxWorks:4,maxImages:4});
 assert.equal(got.checked,4);assert.equal(got.passed,4);assert.equal(calls,2);
 const signals=new Set(got.details.map(x=>x.kind));assert.deepEqual(signals,new Set(['thumbnail','preview']));
});
