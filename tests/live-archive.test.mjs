import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {queryLiveArchive} from '../lib/live-archive.mjs';

class Store{
 constructor(){this.rows=new Map()}
 async get(k){return structuredClone(this.rows.get(k)||null)}
 async setJSON(k,v){this.rows.set(k,structuredClone(v))}
 async list({prefix,limit,cursor}){
  const keys=[...this.rows.keys()].filter(k=>k.startsWith(prefix)).sort();
  const offset=cursor?Number(cursor):0;
  return {blobs:keys.slice(offset,offset+limit).map(key=>({key,etag:'x'})),
   cursor:keys.length>offset+limit?String(offset+limit):undefined,directories:[]};
 }
}
const work=(id,visibility='public')=>({source:'wallhaven',source_post_id:String(id),
 visibility,rating:'safe',indexed_at:100,images:[{image_index:0,thumbnail_url:'https://w.wallhaven.cc/a.jpg'}]});
test('archive retrieves older-than-hot items with bounded reads and stable cursor',async()=>{
 const s=new Store(),prefix='catalog/v2/';
 const hot=Array.from({length:240},(_,i)=>work('hot'+i));
 await s.setJSON(prefix+'live/recent/wallhaven.json',{schema:2,works:hot});
 for(let i=0;i<275;i++){
  const item=i<240?hot[i]:work('cold'+i,i===250?'pending':'public');
  await s.setJSON(prefix+'live/items/wallhaven/'+item.source_post_id+'.json',{schema:2,work:item});
 }
 let cursor='',count=0,rounds=0;
 do{
  const u=new URL('https://kira.test/api/catalog/archive?source=wallhaven&limit=40');
  if(cursor)u.searchParams.set('cursor',cursor);
  const response=await queryLiveArchive(s,new Request(u));
  assert.equal(response.status,200);
  const x=await response.json();
  assert.ok(x.scanned<=40);
  assert.ok(x.works.every(w=>w.source_post_id.startsWith('cold')));
  assert.ok(x.works.every(w=>w.visibility==='public'));
  count+=x.works.length;cursor=x.next_cursor||'';
  rounds++;assert.ok(rounds<12);
 }while(cursor);
 assert.equal(count,34);
});
test('archive rejects unknown source and refuses unbounded requests',async()=>{
 const s=new Store();
 let r=await queryLiveArchive(s,new Request('https://kira.test/api/catalog/archive?source=unknown'));
 assert.equal(r.status,400);
 r=await queryLiveArchive(s,new Request('https://kira.test/api/catalog/archive?source=wallhaven&limit=1000'));
 assert.equal(r.status,400);
});
