/** Runs only after the overlay is applied to a full ae1ec9d worktree. */
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {normalizeWork,queryBlobCatalog} from '../lib/blob-catalog.mjs';
import {reviewWork} from '../lib/moderation-v9.mjs';
import {newlyDiscovered,isApprovedPublic} from '../lib/review-state-v9.mjs';
class FakeBlob {
 db=new Map();
 async get(k){return this.db.has(k)?structuredClone(this.db.get(k)):null}
 // Important: mock DOES NOT implement unsupported onlyIfNew, like documented Blob overwrites.
 async setJSON(k,v){this.db.set(k,structuredClone(v))}
 async list({prefix,limit,cursor}){const keys=[...this.db.keys()].filter(k=>k.startsWith(prefix)).sort();const offset=Number(cursor)||0;const selected=keys.slice(offset,offset+(limit||2500));return {blobs:selected.map(key=>({key})),cursor:offset+selected.length<keys.length?String(offset+selected.length):null}}
}
const req=id=>new Request(`https://kira.example/api/catalog?source=safebooru&id=${id}`);
const work=()=>newlyDiscovered({source:'safebooru',source_post_id:'v9_123',title:'valid title',rating:'safe',images:[{image_index:0,thumbnail_url:'https://safebooru.org/a.jpg',preview_url:'https://safebooru.org/b.jpg',width:1300,height:1500}],raw_tags:['hatsune_miku']});
test('no v9 work is public before explicit review, even safe+large',async()=>{
 const store=new FakeBlob(),entry=normalizeWork(work());
 await store.setJSON('catalog/v2/meta/safebooru.json',{schema:2,count:0,pages:0});
 await store.setJSON('catalog/v2/live/items/safebooru/v9_123.json',{schema:3,work:entry});
 await store.setJSON('catalog/v2/live/recent/safebooru.json',{schema:2,source:'safebooru',works:[entry]});
 const before=await(await queryBlobCatalog(store,req('v9_123'))).json();assert.equal(before.works.length,0);
 const verifier=async w=>({verified:true,checked_at:123,images:w.images.map(i=>({...i,media_status:'verified'}))});
 const approved=await reviewWork(store,{source:'safebooru',source_post_id:'v9_123',action:'approve',expected_revision:'live'},{verify:verifier});
 assert.equal(approved.review_status,'approved');
 const after=await(await queryBlobCatalog(store,req('v9_123'))).json();assert.equal(after.works.length,1);assert.equal(isApprovedPublic(after.works[0]),true);
 await reviewWork(store,{source:'safebooru',source_post_id:'v9_123',action:'reject',expected_revision:approved.revision,reason:'wrong category'});
 const hidden=await(await queryBlobCatalog(store,req('v9_123'))).json();assert.equal(hidden.works.length,0);
});
