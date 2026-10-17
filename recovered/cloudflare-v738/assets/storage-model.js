/**
 * KIRA cloud-only media model.
 * Ordinary discovery stores references; explicit uploads and likes require
 * an original-byte archival job. No Telegram tokens or source credentials here.
 */
export const MEDIA_STATE=Object.freeze({
  REFERENCE:'external_reference',
  PENDING:'pending',
  PRIMARY:'stored_primary',
  REPLICATED:'replicated',
  FAILED:'failed'
});
const VALID_STATES=new Set(Object.values(MEDIA_STATE));
const MAX_URL_LENGTH=2048;
export function safeExternalUrl(input){
  if(typeof input!=='string'||input.length>MAX_URL_LENGTH)return null;
  try{
    const url=new URL(input);
    if(url.protocol!=='https:'||url.username||url.password||!url.hostname||url.port)return null;
    if(/^(?:localhost|.*\.localhost|.*\.local)$/i.test(url.hostname))return null;
    if(/^(?:\d{1,3}\.){3}\d{1,3}$/.test(url.hostname))return null;
    if(url.hostname.includes(':'))return null; // Reject IPv6 literals.
    url.hash='';
    return url.href;
  }catch{return null}
}
function cleanText(value,max=300){return typeof value==='string'?value.slice(0,max):''}
function cleanTags(value){return Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,80)).filter(Boolean))].slice(0,64):[]}
export function normalizeExternalWork(work){
  if(!work||typeof work!=='object')throw new TypeError('work required');
  const source=cleanText(work.source,80).trim().toLowerCase();
  const sourceId=cleanText(String(work.sourcePostId??work.id??''),160).trim();
  const sourceUrl=safeExternalUrl(work.sourceUrl);
  if(!/^[a-z0-9_-]{2,80}$/.test(source)||!sourceId||!sourceUrl)throw new TypeError('invalid work identity');
  const width=Number.isSafeInteger(work.width)&&work.width>0?work.width:null;
  const height=Number.isSafeInteger(work.height)&&work.height>0?work.height:null;
  return {
    id:source+':'+sourceId,source,sourcePostId:sourceId,sourceUrl,
    thumbnailUrl:safeExternalUrl(work.thumbnailUrl),
    previewUrl:safeExternalUrl(work.previewUrl),
    originalUrl:safeExternalUrl(work.originalUrl),
    artist:cleanText(work.artist),title:cleanText(work.title),
    tags:cleanTags(work.tags),width,height,
    storageMode:MEDIA_STATE.REFERENCE
  };
}
export function createArchiveIntent(work,{kind,userId}={}){
  if(!['like','upload'].includes(kind))throw new TypeError('invalid archive kind');
  if(typeof userId!=='string'||!userId.trim())throw new TypeError('user required');
  const reference=normalizeExternalWork(work);
  // No upload/like can be declared saved until an authorized server verifies
  // the original bytes and a durable storage receipt.
  return {workId:reference.id,ownerId:userId,kind,
    originalUrl:reference.originalUrl,sourceUrl:reference.sourceUrl,
    state:MEDIA_STATE.PENDING,replicas:[],sha256:null};
}
export function transitionArchive(record,next,{sha256,replicas}={}){
  if(!record||!VALID_STATES.has(record.state))throw new TypeError('invalid record');
  const allowed={
    [MEDIA_STATE.PENDING]:[MEDIA_STATE.PRIMARY,MEDIA_STATE.FAILED],
    [MEDIA_STATE.PRIMARY]:[MEDIA_STATE.REPLICATED,MEDIA_STATE.FAILED],
    [MEDIA_STATE.REPLICATED]:[MEDIA_STATE.FAILED],
    [MEDIA_STATE.FAILED]:[MEDIA_STATE.PENDING]
  };
  if(!(allowed[record.state]||[]).includes(next))throw new TypeError('invalid state transition');
  const validHash=typeof sha256==='string'&&/^[a-f0-9]{64}$/.test(sha256);
  const receipts=Array.isArray(replicas)?replicas.filter(r=>r&&typeof r.provider==='string'&&typeof r.objectId==='string'&&r.objectId):[];
  if(next===MEDIA_STATE.PRIMARY&&(!validHash||receipts.length<1))throw new TypeError('primary receipt required');
  if(next===MEDIA_STATE.REPLICATED&&(!record.sha256||new Set(receipts.map(r=>r.provider)).size<2))throw new TypeError('two independent providers required');
  return {...record,state:next,sha256:validHash?sha256:record.sha256,replicas:receipts.length?receipts:record.replicas};
}
