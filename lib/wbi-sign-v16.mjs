/** Bilibili WBI request signing (2026-10).
 *
 * The opus detail endpoint rejects unsigned requests with code -352 (risk
 * control). WBI signs the sorted query with a mixin key derived from the nav
 * endpoint's img/sub keys. Pure JS MD5 keeps this runtime-agnostic (Edge
 * Functions may not expose node:crypto).
 */
const MIXIN=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
const S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0);

function md5Bytes(bytes){
 const bitLen=bytes.length*8,total=(((bytes.length+1+8)>>6)+1)*64;
 const buf=new Uint8Array(total);buf.set(bytes);buf[bytes.length]=0x80;
 const dv=new DataView(buf.buffer);
 dv.setUint32(total-8,bitLen>>>0,true);dv.setUint32(total-4,Math.floor(bitLen/2**32),true);
 let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
 const M=new Uint32Array(16);
 for(let off=0;off<total;off+=64){
  for(let i=0;i<16;i++)M[i]=dv.getUint32(off+i*4,true);
  let A=a0,B=b0,C=c0,D=d0;
  for(let i=0;i<64;i++){
   let F,g;
   if(i<16){F=(B&C)|(~B&D);g=i}
   else if(i<32){F=(D&B)|(~D&C);g=(5*i+1)%16}
   else if(i<48){F=B^C^D;g=(3*i+5)%16}
   else{F=C^(B|~D);g=(7*i)%16}
   F=(F+A+K[i]+M[g])>>>0;
   A=D;D=C;C=B;B=(B+((F<<S[i])|(F>>>(32-S[i]))))>>>0;
  }
  a0=(a0+A)>>>0;b0=(b0+B)>>>0;c0=(c0+C)>>>0;d0=(d0+D)>>>0;
 }
 const out=new Uint8Array(16),ov=new DataView(out.buffer);
 ov.setUint32(0,a0,true);ov.setUint32(4,b0,true);ov.setUint32(8,c0,true);ov.setUint32(12,d0,true);
 return out;
}
export function md5hex(text){return [...md5Bytes(new TextEncoder().encode(text))].map(x=>x.toString(16).padStart(2,'0')).join('')}
export const getMixinKey=original=>MIXIN.map(n=>original[n]).join('').slice(0,32);
export function parseWbiKeys(nav){
 const img=nav?.data?.wbi_img?.img_url,sub=nav?.data?.wbi_img?.sub_url;
 if(typeof img!=='string'||typeof sub!=='string')return null;
 const name=u=>u.split('/').pop().split('.')[0];
 if(!/^[a-f0-9]{32}$/.test(name(img))||!/^[a-f0-9]{32}$/.test(name(sub)))return null;
 return {img_key:name(img),sub_key:name(sub)};
}
/** Returns a ready query string; values are encoded exactly once. */
export function signWbi(params,keys,nowSec=Math.floor(Date.now()/1000)){
 const mixin=getMixinKey(keys.img_key+keys.sub_key);
 const all={...params,wts:String(nowSec)};
 const query=Object.keys(all).sort()
  .map(k=>`${encodeURIComponent(k)}=${encodeURIComponent(String(all[k]).replace(/[!'()*]/g,''))}`)
  .join('&');
 return {query:query+'&w_rid='+md5hex(query+mixin),w_rid:md5hex(query+mixin),wts:all.wts};
}
