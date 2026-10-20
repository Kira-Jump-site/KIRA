import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('100-item admission UI uses thumbnails in card grid and explicit preview on modal open',()=>{
 const html=f('public/review.html'),js=f('public/assets/review.js');
 assert.match(html,/<option selected value="100">100\/页<\/option>/);
 assert.match(js,/state\.selected=new Set\(state\.items\.map\(identity\)\)/);
 assert.match(js,/const imgs=imageList\(w\),thumb=safeURL\(imgs\[0\]\?\.thumbnail_url\)/);
 assert.match(js,/img\.loading='lazy'/);
 const gridBody=js.split('function render(){')[1].split('function setBusy')[0];
 assert.doesNotMatch(gridBody,/preview_url/);
 assert.match(js,/function displayPreview\(\)/);
 assert.match(js,/preview\.src=url/);
 assert.match(js,/imageButton\.onclick=\(\)=>openDetail\(w\)/);
 assert.match(js,/items\.slice\(i,i\+20\)/);
});
test('report moderation page uses thumbnails and loads preview only in detail',()=>{
 const html=f('public/reports.html'),js=f('public/assets/reports.js');
 assert.match(html,/<option selected value="100">100\/页<\/option>/);
 assert.match(js,/state\.selected=new Set\(state\.rows\.map\(r=>r\.id\)\)/);
 const gridBody=js.split('function render(){')[1].split('function busy')[0];
 assert.match(gridBody,/thumbnail_url/);assert.doesNotMatch(gridBody,/preview_url/);
 assert.match(js,/thumb\.onclick=\(\)=>openDetail\(r\)/);
 assert.match(js,/i\.removeAttribute\('src'\);if\(full\)i\.src=full/);
});
