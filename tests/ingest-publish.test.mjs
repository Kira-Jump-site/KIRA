import{test}from'node:test';
import{strict as assert}from'node:assert';
import{getCatalogOverlay,saveWork}from'../lib/blob-catalog.mjs';
import{ingestSource}from'../lib/live-ingest.mjs';
class Store{
 constructor(){this.db=new Map()}
 async setJSON(key,data,options={}){
  if(options.onlyIfNew&&this.db.has(key)){const e=Error('already_exists');e.code='PRECONDITION_FAILED';throw e}
  this.db.set(key,structuredClone(data));
 }
 async get(key){return this.db.has(key)?structuredClone(this.db.get(key)):null}
 async list({prefix}){return {blobs:[...this.db.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key}))}}
}
test('source discovery -> durable pending -> admin review -> public feed -> hide',async()=>{
 const s=new Store(),p='https://upload-bbs.miyoushe.com/a.jpg';
 const upstream={retcode:0,data:{list:[{post:{post_id:'99887666',subject:'Cosplay 正片',uid:'1688',images:[p,p]},user:{nickname:'coser'}}]}};
 const report=await ingestSource(s,'miyoushe_cos',{now:1792250300000,fetcher:async()=>new Response(JSON.stringify(upstream))});
 assert.equal(report.new_posts,1);assert.equal(report.pending_review,1);
 const before=await getCatalogOverlay(s,'miyoushe_cos');
 assert.equal(before.get('99887666').visibility,'pending');
 const approved=await saveWork(s,{...before.get('99887666'),rating:'safe',visibility:'public'},{expected_revision:'live'});
 assert.equal(approved.work.visibility,'public');
 const after=await getCatalogOverlay(s,'miyoushe_cos');
 assert.equal(after.get('99887666').images.length,2);assert.equal(after.get('99887666').visibility,'public');
 await saveWork(s,{source:'miyoushe_cos',source_post_id:'99887666'},{action:'hide',expected_revision:approved.revision});
 const hidden=await getCatalogOverlay(s,'miyoushe_cos');
 assert.equal(hidden.get('99887666').visibility,'hidden');
});
