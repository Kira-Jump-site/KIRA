import{test}from'node:test';import{strict as assert}from'node:assert';import{sniffImage}from'../lib/media-dimensions-v6.mjs';
test('PNG pixel geometry verified from actual magic bytes',()=>{
 const b=Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,7,128,0,0,4,56]);
 assert.deepEqual(sniffImage(b),{type:'png',width:1920,height:1080});
});
test('JPEG scans SOF beyond APP0, not magic alone',()=>{
 const b=Uint8Array.from([255,216,255,224,0,4,9,8,255,192,0,17,8,7,128,4,56,3,1,17,0,2,17,0,3,17,0]);
 assert.deepEqual(sniffImage(b),{type:'jpeg',width:1080,height:1920});
});
test('bogus HTML with image/png MIME is not an image',()=>{assert.equal(sniffImage(new TextEncoder().encode('<html>')).type,null)});
