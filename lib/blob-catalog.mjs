import {SOURCES,json} from './catalog.mjs';
import {getLiveRecent,getLiveItem} from './live-read.mjs';
import {enrichWorkV3} from './metadata-schema.mjs';

const ROOT='catalog/v2/';
const validId = s => typeof s==='string' && /^[a-zA-Z0-9_.:-]{1,120}$/.test(s) && s!=='.' && s!=='..';
const safeSource = s => SOURCES.has(s);
const read = (store,key) => store.get(key,{type:'json',consistency:'strong'});
const path = (s,id) => ROOT+'events/'+s+'/'+encodeURIComponent(id)+'/';
const number = (v,min,max,fallback) => Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):fallback;
const hash = s => {let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return h};
const keyFor = (src,page) => ROOT+'pages/'+src+'/'+String(page).padStart(4,'0')+'.json';
const isPublic = w => w && w.visibility==='public' && ['safe','general'].includes(w.rating);
const sortNewest = (a,b) => (b.indexed_at||0)-(a.indexed_at||0)||String(b.source_post_id).localeCompare(String(a.source_post_id));
function parseCursor(s){
 if(!s)return null;
 const m=/^v2:([nr]):([0-9]{1,10}):([0-9]{1,5}):([0-9]{1,3}):([0-9]{1,5})$/.exec(s);
 if(!m)throw Error('invalid_cursor');
 return {mode:m[1],seed:+m[2],page:+m[3],at:+m[4],overlay:+m[5]};
}
function stride(pages,seed){
 if(pages<2)return 1;
 const gcd=(a,b)=>b?gcd(b,a%b):a;
 let n=1+seed%(pages-1);while(gcd(n,pages)!==1)n++;
 return n;
}
export function normalizeWork(input,{existing=false}={}){
 const source=String(input?.source||''),id=String(input?.source_post_id||'');
 if(!safeSource(source)||!validId(id))throw Error('invalid_work_identity');
 if(!Array.isArray(input.images)||input.images.length<1||input.images.length>32)throw Error('invalid_images');
 const cleanUrl = value=>{
  let u;try{u=new URL(String(value||''))}catch{throw Error('invalid_image_url')}if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>2048)throw Error('invalid_image_url');return u.href;
 };
 const seenIndexes=new Set();
 const images=input.images.map(img=>{
  const idx=Number(img?.image_index);
  if(!img||!Number.isSafeInteger(idx)||idx<0||idx>1000000||seenIndexes.has(idx))
   throw Error('invalid_image_index');
  seenIndexes.add(idx);
  return {...img,image_index:idx,thumbnail_url:cleanUrl(img.thumbnail_url),preview_url:cleanUrl(img.preview_url)};
 }).sort((a,b)=>a.image_index-b.image_index);
 const rating=['safe','general','sensitive','explicit','unknown'].includes(input.rating)?input.rating:'unknown';
 const visibility=['public','hidden','pending','deleted'].includes(input.visibility)?input.visibility:'pending';
 return enrichWorkV3({...input,source,source_post_id:id,canonical_url:String(input.canonical_url||'').slice(0,2048),
  title:String(input.title||'').slice(0,300),author:String(input.author||'').slice(0,180),
  author_id:String(input.author_id||'').slice(0,180),
  published_at:number(input.published_at,0,9999999999,0),indexed_at:number(input.indexed_at,0,9999999999,Math.floor(Date.now()/1000)),
  kind:input.kind==='cosplay'?'cosplay':'illustration',tags:Array.isArray(input.tags)?[...new Set(input.tags.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,80)).filter(Boolean))].slice(0,80):[],
  images,rating,visibility:!existing&&rating==='unknown'&&visibility==='public'?'pending':visibility});
}
async function changeHeads(store,source){
 const {blobs}=await store.list({prefix:ROOT+'events/'+source+'/',consistency:'strong'});
 if(blobs.length>2500)throw Error('event_compaction_required');
 const map=new Map();
 for(const blob of blobs){
  const match=new RegExp('^'+ROOT+'events/'+source+'/([^/]+)/([0-9]{13}-[a-f0-9-]{36})\\.json$').exec(blob.key);
  if(!match)continue;
  const id=decodeURIComponent(match[1]);
  if(!validId(id))continue;
  const older=map.get(id);if(!older||match[2]>older.rev)map.set(id,{rev:match[2],key:blob.key});
 }
 const out=new Map();
 await Promise.all([...map].map(async ([id,v])=>{const event=await read(store,v.key);if(event?.work?.source_post_id===id)out.set(id,event)}));
 return out;
}
export async function getCatalogOverlay(store,source){
 if(!safeSource(source))throw Error('invalid_source');
 const recent=await getLiveRecent(store,source);
 const merged=new Map(recent.map(w=>[w.source_post_id,w]));
 const edits=await changeHeads(store,source);
 for(const [id,e] of edits)merged.set(id,e.work);
 return merged;
}
export async function findWork(store,source,id){
 if(!safeSource(source)||!validId(id))throw Error('invalid_work_identity');
 const heads=await changeHeads(store,source);
 if(heads.has(id)){const e=heads.get(id);return {work:e.work,revision:e.revision};}
 const live=await getLiveItem(store,source,id);
 if(live)return {work:live,revision:'live'};
 const positions=await read(store,ROOT+'lookup/'+source+'.json');
 const page=positions?.[id];if(!Number.isSafeInteger(page))return null;
 const data=await read(store,keyFor(source,page));
 const work=data?.find(w=>w.source_post_id===id);
 return work?{work,revision:'base'}:null;
}
export async function saveWork(store,input,{action='upsert',expected_revision=null}={}){
 if(!['upsert','hide','restore','delete'].includes(action))throw Error('invalid_action');
 const source=String(input?.source||''),id=String(input?.source_post_id||'');
 if(!safeSource(source)||!validId(id))throw Error('invalid_work_identity');
 // Edits require a revision precondition, including creation (expected_revision = 'absent').
 // This prevents accidental blind overwrites. Blob lacks atomic compare-and-swap for revisions.
 if(expected_revision===null)throw Error('revision_required');
 const prior=await findWork(store,source,id);
 const observed=prior?.revision||'absent';
 if(observed!==expected_revision)throw Error('revision_conflict');
 if(!prior&&action!=='upsert')throw Error('work_not_found');
 let work;
 if(action==='upsert'){
  work=normalizeWork({...prior?.work,...input,source,source_post_id:id},{existing:!!prior});
 }else{
  work={...prior.work,visibility:action==='hide'?'hidden':action==='delete'?'deleted':'public'};
  if(work.visibility==='public'&&!['safe','general'].includes(work.rating))throw Error('rating_review_required');
 }
 const revision=String(Date.now()).padStart(13,'0')+'-'+crypto.randomUUID();
 const event={revision,previous_revision:observed,action,work,updated_at:new Date().toISOString()};
 const key=path(source,id)+revision+'.json';
 await store.setJSON(key,event,{onlyIfNew:true});
 const verification=await read(store,key);
 if(verification?.revision!==revision)throw Error('write_verification_failed');
 const latest=await findWork(store,source,id);
 if(latest?.revision!==revision)throw Error('concurrent_write_conflict');
 return {work,revision,previous_revision:observed};
}
export async function queryBlobCatalog(store,req){
 const url=new URL(req.url),source=url.searchParams.get('source')||'bilibili_opus';
 if(!safeSource(source))return json({ok:false,error:'unsupported_source'},400);
 const meta=await read(store,ROOT+'meta/'+source+'.json');
 if(!meta)return null;
 if(meta.schema!==2||!Number.isSafeInteger(meta.pages)||meta.pages>5000)throw Error('invalid_blob_metadata');
 const limit=number(url.searchParams.get('limit')||30,1,60,-1);
 if(limit===-1)return json({ok:false,error:'invalid_limit'},400);
 const id=url.searchParams.get('id');
 if(id){
  if(!validId(id))return json({ok:false,error:'invalid_id'},400);
  const item=await findWork(store,source,id),works=item&&isPublic(item.work)?[item.work]:[];
  return json({ok:true,source,works,total:works.length,next_cursor:null,backend:'edgeone-blob'});
 }
 const mode=url.searchParams.get('order')==='random'?'r':'n';
 const seed=mode==='r'?number(url.searchParams.get('seed'),1,2147483646,-1):0;
 if(seed<0)return json({ok:false,error:'invalid_random_seed'},400);
 let pos;try{pos=parseCursor(url.searchParams.get('cursor'))}catch{return json({ok:false,error:'invalid_cursor'},400)}
 if(pos&&(pos.mode!==mode||pos.seed!==seed||pos.page>meta.pages||pos.at>60))
  return json({ok:false,error:'cursor_mismatch'},400);
 const merged=await getCatalogOverlay(store,source);
 const changed=new Set(merged.keys());
 const overlay=[...merged.values()].filter(isPublic).sort(sortNewest);
 if(mode==='r')overlay.sort((a,b)=>hash(a.source_post_id+':'+seed)-hash(b.source_post_id+':'+seed));
 let overlayAt=pos?.overlay||0,page=pos?.page||0,at=pos?.at||0;
 const works=[];
 while(overlayAt<overlay.length&&works.length<limit)works.push(overlay[overlayAt++]);
 const pages=meta.pages,step=stride(pages,seed),start=mode==='r'&&pages?seed%pages:0;
 while(works.length<limit&&page<pages){
  const current=mode==='r'?(start+page*step)%pages:page;
  const data=await read(store,keyFor(source,current));
  if(!Array.isArray(data))throw Error('missing_blob_page_'+current);
  if(mode==='r')data.sort((a,b)=>hash(a.source_post_id+':'+seed)-hash(b.source_post_id+':'+seed));
  while(at<data.length&&works.length<limit){
   const work=data[at++];
   if(!changed.has(work.source_post_id)&&isPublic(work))works.push(work);
  }
  if(at>=data.length){page++;at=0;}
 }
 const next=(overlayAt<overlay.length||page<pages)?'v2:'+mode+':'+seed+':'+page+':'+at+':'+overlayAt:null;
 return json({ok:true,source,works,total:works.length,next_cursor:next,backend:'edgeone-blob',index_count:meta.count});
}
