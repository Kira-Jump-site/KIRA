/** Mandatory post-build contract: KIRA moderation pages are deployable. */
import {access,readFile} from 'node:fs/promises';
const required=['dist/review.html','dist/reports.html','dist/assets/review.js','dist/assets/reports.js',
'dist/lib/quality-admission-v10.mjs','dist/lib/review-queue-v10.mjs',
'dist/cloud-functions/api/catalog/admin/queue.js',
'dist/cloud-functions/api/catalog/admin/bulk-review.js',
'dist/cloud-functions/api/catalog/admin/reports.js'];
const missing=[];
for(const path of required)try{await access(path)}catch{missing.push(path)}
if(missing.length)throw Error('KIRA moderation deploy artifact missing: '+missing.join(', '));
for(const [name,js] of [['review','/assets/review.js'],['reports','/assets/reports.js']]){
 const html=await readFile('dist/'+name+'.html','utf8');
 if(!html.includes(js))throw Error('KIRA '+name+'.html is missing '+js);
}
console.log('KIRA moderation pages and API assets verified in dist');
