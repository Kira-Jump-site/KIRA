/** Cursor-paginated, bounded review queue. Never silently pulls preview/original bytes. */
import {findWork} from './review-store-doubles.mjs';
const PREFIX='catalog/v2/live/items/';
export async function listQualityQueue(store,{source,cursor='',limit=100}={}){
 if(!/^[a-z0-9_]{2,50}$/.test(String(source))||typeof cursor!=='string'||cursor.length>2048||!Number.isSafeInteger(limit)||limit<1||limit>100)
  throw Error('invalid_queue_query');
 const prefix=PREFIX+source+'/';
 const works=[];
 let nextCursor=cursor||'',scanned=0,rounds=0;
 // A page with many already-reviewed items should still fill up to 100 cards.
 // Bounded to 12 listings / 500 raw keys to avoid unbounded Blob reads.
 while(works.length<limit&&rounds++<12&&scanned<500){
  const count=Math.min(limit-works.length,500-scanned);
  const page=await store.list({prefix,limit:count,cursor:nextCursor||undefined,paginate:false,consistency:'strong'});
  if(!Array.isArray(page?.blobs))throw Error('invalid_queue_index');
  const keys=page.blobs.map(x=>x.key).filter(k=>typeof k==='string'&&k.startsWith(prefix)&&k.endsWith('.json'));
  scanned+=page.blobs.length;
  for(let n=0;n<keys.length;n+=10){
   const slice=await Promise.all(keys.slice(n,n+10).map(async key=>{
    const entity=await store.get(key,{type:'json',consistency:'strong'}),w=entity?.work;
    if(!w||w.source!==source||!w.source_post_id)return null;
    const versioned=await findWork(store,source,w.source_post_id);
    const current=versioned?.work||w;
    if(current.visibility!=='pending'||current.review_status==='rejected'||current.review_status==='approved')return null;
    if(current.quality_admission?.eligible!==true)return null;
    return {...current,revision:versioned?.revision||'live'};
   }));
   works.push(...slice.filter(Boolean));
  }
  const after=page.cursor||'';
  if(!after||after===nextCursor){nextCursor='';break;}
  nextCursor=after;
 }
 return {ok:true,source,works,scanned,next_cursor:nextCursor||null,page_size:limit};
}
