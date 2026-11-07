/** Admission media budget is counted in WHOLE WORKS, never in half-verified galleries. */
export const MEDIA_PLAN_VERSION='2026-10-23.15';
export function planWholeWorkMedia(works,{maxWorks=64,maxImages=160}={}){
 if(!Array.isArray(works)||!Number.isSafeInteger(maxWorks)||maxWorks<1||maxWorks>100||
   !Number.isSafeInteger(maxImages)||maxImages<1||maxImages>1000)throw Error('invalid_media_budget');
 const selected=[],deferredIds=new Set(),invalidIds=new Set();
 let images=0;
 for(const work of works){
  const id=String(work?.source_post_id||'');
  const n=Array.isArray(work?.images)?work.images.length:0;
  if(!id||n<1||n>32){invalidIds.add(id);continue}
  if(selected.length>=maxWorks||images+n>maxImages){deferredIds.add(id);continue}
  images+=n;selected.push(work);
 }
 return {selected,selectedImages:images,deferredIds,invalidIds,summary:{selected_works:selected.length,
   selected_images:images,deferred_works:deferredIds.size,invalid_works:invalidIds.size,maxImages,maxWorks}};
}
