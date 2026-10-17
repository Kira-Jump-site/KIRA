import {test} from 'node:test';import {strict as assert} from 'node:assert';
import {normalizeWork,findWork,saveWork,queryBlobCatalog} from '../lib/blob-catalog.mjs';
class Store{
 constructor(){this.data=new Map()}
 async set(k,v){this.data.set(k,v)}
 async setJSON(k,v,{onlyIfNew}={}){if(onlyIfNew&&this.data.has(k))throw Error('already_exists');this.data.set(k,structuredClone(v))}
 async get(k,{type}={}){const v=this.data.get(k);return v===undefined?null:type==='json'?structuredClone(v):v}
 async list({prefix}={}){return {blobs:[...this.data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}
}
const image={image_index:0,thumbnail_url:'https://i0.hdslb.com/a.jpg',preview_url:'https://i0.hdslb.com/b.jpg'};
const row=(id,visibility='public')=>({source:'bilibili_opus',source_post_id:id,indexed_at:Number(id),rating:'safe',visibility,images:[image]});
async function setup(){const s=new Store();await s.setJSON('catalog/v2/pages/bilibili_opus/0000.json',[row('101'),row('100')]);await s.setJSON('catalog/v2/lookup/bilibili_opus.json',{'101':0,'100':0});await s.setJSON('catalog/v2/meta/bilibili_opus.json',{schema:2,count:2,pages:1});return s}
test('upsert, strong read, hide and restore preserve history',async()=>{
 const s=await setup(),newWork=await saveWork(s,row('200'),{expected_revision:'absent'});
 assert.equal((await findWork(s,'bilibili_opus','200')).revision,newWork.revision);
 const hidden=await saveWork(s,{source:'bilibili_opus',source_post_id:'200'},{action:'hide',expected_revision:newWork.revision});
 const page=await(await queryBlobCatalog(s,new Request('https://kira.test/api/catalog?source=bilibili_opus'))).json();
 assert.equal(page.works.some(x=>x.source_post_id==='200'),false);
 await saveWork(s,{source:'bilibili_opus',source_post_id:'200'},{action:'restore',expected_revision:hidden.revision});
 await assert.rejects(saveWork(s,{source:'bilibili_opus',source_post_id:'200'},{action:'delete',expected_revision:hidden.revision}),/conflict/);
});
test('cursor visits base and changes without duplicate IDs',async()=>{
 const s=await setup();await saveWork(s,row('300'),{expected_revision:'absent'});
 const one=await(await queryBlobCatalog(s,new Request('https://kira.test/api/catalog?source=bilibili_opus&limit=2'))).json();
 const two=await(await queryBlobCatalog(s,new Request('https://kira.test/api/catalog?source=bilibili_opus&limit=2&cursor='+one.next_cursor))).json();
 assert.deepEqual([...one.works,...two.works].map(x=>x.source_post_id),['300','101','100']);assert.equal(two.next_cursor,null);
});
test('known image discovery source may publish without inventing a rating',async()=>{
 const s=await setup(),w=await saveWork(s,{...row('400'),rating:'unknown'},{expected_revision:'absent'});
 assert.equal(w.work.visibility,'pending');
});
test('rejects non-HTTPS external thumbnails',()=>{
 assert.throws(()=>normalizeWork({...row('500'),images:[{...image,thumbnail_url:'http://example.com/a.jpg'}]}),/invalid_image_url/);
});
test('version conflict and authorization preconditions',async()=>{
 const s=await setup();await assert.rejects(saveWork(s,row('100')),/revision_required/);
 await assert.rejects(saveWork(s,row('100'),{expected_revision:'absent'}),/revision_conflict/);
});

test('non-contiguous image indexes preserve source identity',()=>{const w=normalizeWork({...row('510'),images:[{...image,image_index:3},{...image,image_index:9}]});assert.deepEqual(w.images.map(i=>i.image_index),[3,9])});
