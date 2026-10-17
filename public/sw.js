/* KIRA! JUMP v8 — no cross-origin image interception.
 * Real Chromium: source HD works on EdgeOne with Service Workers disabled.
 * Native HTTP cache and in-memory preload remain. No third-party media proxy.
 */
'use strict';
const PREFIX='kira-preview-browser-';
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();
 await Promise.all(keys.filter(k=>k.startsWith(PREFIX)).map(k=>caches.delete(k)));
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{
 if(event.data?.type==='KIRA_CLEAR_PREVIEW_CACHE'){
  event.waitUntil(caches.keys().then(keys=>
   Promise.all(keys.filter(k=>k.startsWith(PREFIX)).map(k=>caches.delete(k)))).then(()=>
    event.source?.postMessage?.({type:'KIRA_CACHE_CLEARED'})));
 }
});
// Intentionally no fetch event listener. The browser requests images directly.
