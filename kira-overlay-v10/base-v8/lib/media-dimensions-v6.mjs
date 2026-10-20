/** Extract actual image geometry from CDN response bytes; no OCR or resizing. */
const u16=(b,n)=>b[n]<<8|b[n+1];
const u32=(b,n)=>(b[n]*16777216+b[n+1]*65536+b[n+2]*256+b[n+3]);
export function sniffImage(buffer){
 const b=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer||[]);
 if(b.length>=24&&b[0]===137&&b[1]===80&&b[2]===78&&b[3]===71){return {type:'png',width:u32(b,16),height:u32(b,20)}}
 if(b.length>=10&&b[0]===71&&b[1]===73&&b[2]===70){return {type:'gif',width:b[6]+b[7]*256,height:b[8]+b[9]*256}}
 if(b.length>=30&&String.fromCharCode(...b.subarray(0,4))==='RIFF'&&String.fromCharCode(...b.subarray(8,12))==='WEBP'){
  if(String.fromCharCode(...b.subarray(12,16))==='VP8X')return {type:'webp',width:1+b[24]+b[25]*256+b[26]*65536,height:1+b[27]+b[28]*256+b[29]*65536};
  return {type:'webp',width:null,height:null};
 }
 if(b.length>=4&&b[0]===255&&b[1]===216){
  for(let at=2;at+4<b.length;){
   if(b[at]!==255){at++;continue}
   let marker=b[at+1];if(marker===255){at++;continue}
   if(marker===0xd9||marker===0xda)break;
   if(marker===0x01||marker>=0xd0&&marker<=0xd7){at+=2;continue}
   const len=u16(b,at+2);if(len<2||at+len+2>b.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)){
    if(len>=7)return {type:'jpeg',width:u16(b,at+7),height:u16(b,at+5)};
   }
   at+=len+2;
  }
  return {type:'jpeg',width:null,height:null};
 }
 if(b.length>=16&&String.fromCharCode(...b.subarray(4,8))==='ftyp')return {type:'avif',width:null,height:null};
 return {type:null,width:null,height:null};
}
