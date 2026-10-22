const PROD=new Set(['kira.casto.top','www.kira.casto.top']);
const ROUTES=new Set(['queue','review','bulk-review','reports']);
/** No password for a preview review test; never authorizes production domains. */
export function isPreviewReviewRequest(request,route){
 if(!ROUTES.has(route)||request.headers.get('x-kira-review-test')!=='1')return false;
 let url;try{url=new URL(request.url)}catch{return false}
 if(url.protocol!=='https:'&&url.hostname!=='localhost')return false;
 if(PROD.has(url.hostname)||url.hostname.endsWith('.casto.top'))return false;
 if(url.pathname!=='/api/catalog/admin/'+route)return false;
 const site=request.headers.get('sec-fetch-site');if(site&&site!=='same-origin')return false;
 const origin=request.headers.get('origin');
 if(origin){try{if(new URL(origin).origin!==url.origin)return false}catch{return false}}
 return site==='same-origin'||Boolean(origin);
}
