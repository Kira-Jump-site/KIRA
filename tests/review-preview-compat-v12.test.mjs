import test from 'node:test';
import assert from 'node:assert/strict';
import {isPreviewReviewRequest} from '../lib/review-test-access.mjs';
import {listQualityQueue} from '../lib/review-queue-v10.mjs';
import {createReviewTestStore} from '../lib/review-test-store.mjs';
const preview='https://kira-ygsp3iba.edgeone.dev';
test('EdgeOne preview permits no-password GET and POST without browser metadata',()=>{
 for(const route of ['queue','review','reports','bulk-review']){
  assert.equal(isPreviewReviewRequest(new Request(preview+'/api/catalog/admin/'+route),route),true);
 }
});
test('production and explicit foreign origins are rejected',()=>{
 for(const h of ['kira.casto.top','beta.casto.top','edgeone.dev.evil.com']){
  assert.equal(isPreviewReviewRequest(new Request('https://'+h+'/api/catalog/admin/queue'),'queue'),false);
 }
 assert.equal(isPreviewReviewRequest(new Request(preview+'/api/catalog/admin/queue',{headers:{Origin:'https://attacker.example'}}),'queue'),false);
 assert.equal(isPreviewReviewRequest(new Request(preview+'/api/catalog/admin/queue',{headers:{'Sec-Fetch-Site':'cross-site'}}),'queue'),false);
 assert.equal(isPreviewReviewRequest(new Request(preview+'/api/catalog/admin/refill'),'refill'),false);
});
test('page of works reads one revision index',async()=>{
 const entries=['a','b','c'].map(id=>({key:'catalog/v2/live/items/wallhaven/'+id+'.json'}));
 let count=0;
 const store={
  async list({prefix}){if(prefix.startsWith('catalog/v2/events/')){count++;return {blobs:[]}}return {blobs:entries,cursor:null}},
  async get(key){return {work:{source:'wallhaven',source_post_id:key.split('/').pop().replace('.json',''),visibility:'pending',quality_admission:{eligible:true}}}}
 };
 const result=await listQualityQueue(store,{source:'wallhaven',limit:100});
 assert.equal(result.works.length,3);assert.equal(count,1);
});
test('shadow writes are persisted and do not mutate published records',async()=>{
 const raw=new Map();
 const store=createReviewTestStore({async get(k){return raw.get(k)||null},async setJSON(k,v){raw.set(k,v)},async list(){return {blobs:[]}}});
 const key='catalog/v2/events/wallhaven/test/123-12345678-1234-1234-1234-123456789abc.json';
 await store.setJSON(key,{review_status:'approved'});
 assert.equal((await store.get(key)).review_status,'approved');
 assert.equal(raw.has(key),false);
 assert.ok([...raw.keys()][0].startsWith('catalog/v2/review-test/v1/'));
 await assert.rejects(store.setJSON('catalog/v2/live/items/wallhaven/test.json',{}),/test_write_disallowed/);
});
