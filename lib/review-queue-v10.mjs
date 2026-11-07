/** Cursor-paginated, bounded review queue ordered by source quality evidence. */
import {loadCatalogChangeHeads} from './blob-catalog.mjs';
const PREFIX='catalog/v2/live/items/';
const CURSOR='q17:';
// One bounded source window is ranked per request. The daily target is 120 pending
// works per source, so 500 indexed keys leaves headroom while keeping admin Blob
// reads bounded.
const MAX_KEYS=500,MAX_LISTINGS=12;
const num=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
/** Media size is a tie-breaker inside one source; it never replaces admission. */
function mediaSize(work){
 let area=Infinity,short=Infinity;
 for(const img of work.images||[]){
  const w=num(img.width),h=num(img.height);
  if(!w||!h)continue;
  area=Math.min(area,w*h);short=Math.min(short,Math.min(w,h));
 }
 return {area:Number.isFinite(area)?Math.round(area):0,short:Number.isFinite(short)?Math.round(short):0};
}
/** Rank evidence strength first (ranked > small sample > unrankable > unrated),
 * then the source-relative percentile, then verified media size. */
function queueRank(work){
 const pct=num(work.popularity_percentile),status=work.popularity_status;
 let tier=4;
 if(status==='ranked'&&pct!==null)tier=0;
 else if(status==='insufficient_reference'&&pct!==null)tier=1;
 else if(status==='cohort_unrankable')tier=2;
 else if(status==='unrated')tier=3;
 const size=mediaSize(work);
 return {tier,pct,area:size.area,short:size.short,
  pos:num(work.source_candidate_position)??9999,
  indexed:num(work.indexed_at)??0,id:String(work.source_post_id)};
}
function compareRank(a,b){
 if(a.tier!==b.tier)return a.tier-b.tier;
 // Missing percentiles are never invented; only tiers 0-1 carry one.
 if(a.tier<=1&&a.pct!==b.pct)return (b.pct??-1)-(a.pct??-1);
 if(a.area!==b.area)return b.area-a.area;
 if(a.short!==b.short)return b.short-a.short;
 if(a.pos!==b.pos)return a.pos-b.pos;
 if(a.indexed!==b.indexed)return b.indexed-a.indexed;
 return a.id<b.id?-1:a.id>b.id?1:0;
}
function encodeCursor(rank){
 return CURSOR+[rank.tier,rank.pct===null?'':rank.pct,rank.area,rank.short,
  rank.pos===9999?'':rank.pos,rank.indexed,encodeURIComponent(rank.id)].join('|');
}
function decodeCursor(cursor){
 if(!cursor.startsWith(CURSOR))throw Error('invalid_queue_cursor');
 const parts=cursor.slice(CURSOR.length).split('|');
 if(parts.length!==7||!parts[6]||parts[6].length>300)throw Error('invalid_queue_cursor');
 const tier=Number(parts[0]);
 if(!Number.isInteger(tier)||tier<0||tier>4)throw Error('invalid_queue_cursor');
 const pct=parts[1]===''?null:Number(parts[1]);
 if(pct!==null&&(!Number.isFinite(pct)||pct<0||pct>1))throw Error('invalid_queue_cursor');
 if(tier<=1&&pct===null)throw Error('invalid_queue_cursor');
 const area=Number(parts[2]),short=Number(parts[3]);
 if(!Number.isSafeInteger(area)||area<0||!Number.isSafeInteger(short)||short<0)throw Error('invalid_queue_cursor');
 const pos=parts[4]===''?9999:Number(parts[4]);
 if(!Number.isSafeInteger(pos)||pos<0)throw Error('invalid_queue_cursor');
 const indexed=Number(parts[5]);
 if(!Number.isSafeInteger(indexed)||indexed<0)throw Error('invalid_queue_cursor');
 let id;try{id=decodeURIComponent(parts[6])}catch{throw Error('invalid_queue_cursor')}
 if(!id||id.length>200)throw Error('invalid_queue_cursor');
 return {tier,pct,area,short,pos,indexed,id};
}
export async function listQualityQueue(store,{source,cursor='',limit=100}={}){
 if(!/^[a-z0-9_]{2,50}$/.test(String(source))||typeof cursor!=='string'||cursor.length>2048||!Number.isSafeInteger(limit)||limit<1||limit>100)
  throw Error('invalid_queue_query');
 const after=cursor?decodeCursor(cursor):null;
 const prefix=PREFIX+source+'/';
 const heads=await loadCatalogChangeHeads(store,source);
 const candidates=[];
 let scanCursor='',scanned=0,rounds=0;
 // Rank the whole bounded source window once, then page by the last returned key.
 // This is what makes page 1 show the best works rather than the lowest IDs.
 while(rounds++<MAX_LISTINGS&&scanned<MAX_KEYS){
  const count=Math.min(MAX_KEYS-scanned,250);
  const page=await store.list({prefix,limit:count,cursor:scanCursor||undefined,paginate:false,consistency:'strong'});
  if(!Array.isArray(page?.blobs))throw Error('invalid_queue_index');
  if(!page.blobs.length)break;
  const keys=page.blobs.map(x=>x.key).filter(k=>typeof k==='string'&&k.startsWith(prefix)&&k.endsWith('.json'));
  scanned+=page.blobs.length;
  for(let n=0;n<keys.length;n+=10){
   const slice=await Promise.all(keys.slice(n,n+10).map(async key=>{
    const entity=await store.get(key,{type:'json',consistency:'strong'}),w=entity?.work;
    if(!w||w.source!==source||!w.source_post_id)return null;
    const versioned=heads.get(w.source_post_id);
    const current=versioned?.work||w;
    if(current.visibility!=='pending'||current.review_status==='rejected'||current.review_status==='approved')return null;
    if(current.quality_admission?.eligible!==true||current.media_status!=='verified'||!Array.isArray(current.images)||!current.images.length||current.images.some(img=>img.media_status!=='verified'))return null;
    return {work:{...current,revision:versioned?.revision||'live'},rank:queueRank(current)};
   }));
   candidates.push(...slice.filter(Boolean));
  }
  const next=page.cursor||'';
  if(!next||next===scanCursor)break;
  scanCursor=next;
 }
 candidates.sort((a,b)=>compareRank(a.rank,b.rank));
 const remaining=after?candidates.filter(x=>compareRank(x.rank,after)>0):candidates;
 const selected=remaining.slice(0,limit);
 return {ok:true,source,works:selected.map(x=>x.work),scanned,
  next_cursor:selected.length===limit&&remaining.length>limit?encodeCursor(selected[selected.length-1].rank):null,
  page_size:limit,ordering:'quality_v17'};
}
