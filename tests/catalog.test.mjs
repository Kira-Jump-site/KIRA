import{test}from'node:test';import{strict as a}from'node:assert';import{readFileSync}from'node:fs';import{handleCatalog}from'../lib/catalog.mjs';
const rows=JSON.parse(readFileSync('public/assets/catalog-api/safebooru.json','utf8'));
const call=u=>handleCatalog(new Request('https://kira.test'+u),()=>rows);
test('real source has 3070 indexed works',()=>a.equal(rows.length,3070));
test('cursor loads new, not recycled works',async()=>{const x=await(await call('/api/catalog?source=safebooru&limit=60&order=random&seed=12345')).json();const y=await(await call('/api/catalog?source=safebooru&limit=60&order=random&seed=12345&cursor='+x.next_cursor)).json();a.equal(new Set([...x.works,...y.works].map(v=>v.source_post_id)).size,120)});
test('invalid source is rejected',async()=>a.equal((await call('/api/catalog?source=unknown')).status,400));
