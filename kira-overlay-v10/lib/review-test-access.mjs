/**
 * Passwordless preview moderation uses the REAL EdgeOne Blob review data.
 * Every preview mutation is redirected to the isolated shadow namespace.
 * No dependence on browser Fetch Metadata, Origin, or custom headers.
 */
const ROUTES=new Set(['queue','review','bulk-review','reports']);
export function isPreviewReviewRequest(request,route){
 if(!ROUTES.has(route))return false;
 let url;try{url=new URL(request.url)}catch{return false}
 const host=url.hostname.toLowerCase();
 const preview=host==='localhost'||host.endsWith('.edgeone.dev')||host.endsWith('.pages.dnsoe5.com');
 if(!preview)return false;
 if(url.protocol!=='https:'&&host!=='localhost')return false;
 if(url.pathname!=='/api/catalog/admin/'+route)return false;
 const site=request.headers.get('sec-fetch-site');
 if(site&&!['same-origin','none'].includes(site))return false;
 const origin=request.headers.get('origin');
 if(origin){try{if(new URL(origin).origin!==url.origin)return false}catch{return false}}
 return true;
}
