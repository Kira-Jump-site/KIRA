import test from 'node:test';
import assert from 'node:assert/strict';
import {md5hex,getMixinKey,parseWbiKeys,signWbi} from '../lib/wbi-sign-v16.mjs';
test('md5 vectors',()=>{
 assert.equal(md5hex(''),'d41d8cd98f00b204e9800998ecf8427e');
 assert.equal(md5hex('abc'),'900150983cd24fb0d6963f7d28e17f72');
 assert.equal(md5hex('The quick brown fox jumps over the lazy dog'),'9e107d9d372bb6826bd81d3542a419d6');
});
test('mixin key and signed query',()=>{
 const keys={img_key:'7cd084941338484aae1ad9425b84077c',sub_key:'4932caff0ff746eab6f01bf08b70ac45'};
 assert.equal(getMixinKey(keys.img_key+keys.sub_key).length,32);
 const {query,w_rid}=signWbi({id:'123456789'},keys,1700000000);
 assert.match(query,/^id=123456789&wts=1700000000&w_rid=[a-f0-9]{32}$/);
 assert.equal(w_rid.length,32);
});
test('parse nav keys',()=>{
 assert.deepEqual(parseWbiKeys({data:{wbi_img:{img_url:'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',sub_url:'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'}}}),
  {img_key:'7cd084941338484aae1ad9425b84077c',sub_key:'4932caff0ff746eab6f01bf08b70ac45'});
 assert.equal(parseWbiKeys({data:{wbi_img:{img_url:'x',sub_url:'y'}}}),null);
});
