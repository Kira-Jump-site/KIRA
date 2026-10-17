import { safeExternalUrl } from './storage-model.js';
const KEY='kira.archive.intents.v1';
export function readIntents(storage) {
  try {
    const parsed=JSON.parse(storage.getItem(KEY)||'[]');
    return Array.isArray(parsed)?parsed.filter(x=>Number.isSafeInteger(x?.id)).slice(-500):[];
  } catch { return []; }
}
export function recordFavoriteIntent(work,storage) {
  if (!Number.isSafeInteger(work?.id)||work.id<=0) throw TypeError('invalid work');
  const old=readIntents(storage).filter(x=>x.id!==work.id);
  const entry={
    id:work.id,source:String(work.source||'').slice(0,60),
    sourceId:String(work.pid||'').slice(0,100),
    sourceUrl:safeExternalUrl(work.originLink),
    previewUrl:safeExternalUrl(work.preview),
    title:String(work.title||'').slice(0,180),
    artist:String(work.artist||'').slice(0,100),
    state:'pending',createdAt:Date.now(),originalSaved:false
  };
  storage.setItem(KEY,JSON.stringify([...old,entry].slice(-500)));
  return entry;
}
export function cancelFavoriteIntent(id,storage) {
  storage.setItem(KEY,JSON.stringify(readIntents(storage).filter(x=>x.id!==id)));
}
