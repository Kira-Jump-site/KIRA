/** Review sandbox: reads actual EdgeOne Blob catalog, writes ONLY shadow decisions.
 * Existing production moderation events and public works remain untouched. */
export const TEST_PREFIX='catalog/v2/review-test/v1/';
const EVENTS='catalog/v2/events/',REPORTS='catalog/v2/user-reports/';
const map=key=>key.startsWith(EVENTS)?TEST_PREFIX+'events/'+key.slice(EVENTS.length):key.startsWith(REPORTS)?TEST_PREFIX+'user-reports/'+key.slice(REPORTS.length):null;
const rows=x=>Array.isArray(x?.blobs)?x.blobs:[];
async function aliasList(real,q,prefix){
 const found=await real.list({...q,prefix,consistency:'strong'});
 return rows(found).map(e=>({...e,key:e.key.replace(prefix,q.prefix)}));
}
export function createReviewTestStore(real){
 if(!real||typeof real.get!=='function'||typeof real.list!=='function'||typeof real.setJSON!=='function')throw Error('invalid_blob_store');
 return {
 async get(key,opts){const alternate=map(key);if(alternate){const x=await real.get(alternate,opts);if(x!==null&&x!==undefined)return x;}return real.get(key,opts);},
 async setJSON(key,value,opts){const dest=map(key);if(!dest)throw Error('test_write_disallowed');return real.setJSON(dest,value,opts);},
 async list(q={}){
  const prefix=String(q.prefix||'');
  if(prefix.startsWith(EVENTS)){
   const [prod,test]=await Promise.all([real.list({...q,consistency:'strong'}),aliasList(real,{...q,cursor:undefined},TEST_PREFIX+'events/'+prefix.slice(EVENTS.length))]);
   const byKey=new Map();for(const item of [...rows(prod),...test])byKey.set(item.key,item);
   return {blobs:[...byKey.values()].sort((a,b)=>a.key.localeCompare(b.key)),cursor:null};
  }
  if(prefix.startsWith(REPORTS)){
   const limit=Number.isSafeInteger(q.limit)?Math.max(1,Math.min(q.limit,100)):100;
   const cursor=String(q.cursor||'');
   if(cursor&&!/^test:[0-9]{1,4}$/.test(cursor))throw Error('invalid_test_cursor');
   const offset=cursor?Number(cursor.slice(5)):0;
   if(offset>400)throw Error('test_cursor_limit');
   const count=Math.min(501,offset+limit+1);
   const [prod,test]=await Promise.all([
    real.list({...q,limit:count,cursor:undefined,paginate:false,consistency:'strong'}),
    aliasList(real,{...q,limit:count,cursor:undefined,paginate:false},TEST_PREFIX+'user-reports/'+prefix.slice(REPORTS.length))
   ]);
   const byKey=new Map();for(const item of [...rows(prod),...test])byKey.set(item.key,item);
   const all=[...byKey.values()].sort((a,b)=>a.key.localeCompare(b.key));
   return {blobs:all.slice(offset,offset+limit),cursor:all.length>offset+limit?'test:'+(offset+limit):null};
  }
  return real.list(q);
 }
 };
}
