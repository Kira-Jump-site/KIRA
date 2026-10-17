import {getStore} from '@edgeone/pages-blob';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const projectId=process.env.KIRA_EDGEONE_PROJECT_ID||'makers-l0snbl3rzgnw';
const token=process.env.MAKERS_API_TOKEN;
if(!token){console.error('MAKERS_API_TOKEN must be securely set.');process.exit(2)}
const store=getStore({name:'kira-catalog-recovery-20261017',projectId,token,consistency:'strong'});
const items=[];
for(const dir of ['public/assets/catalog','public/assets/catalog-api'])for(const name of await readdir(dir)){
 if(!name.endsWith('.json'))continue;
 const rel=dir.replace(/^public\//,'')+'/'+name;
 items.push({rel,key:'catalog/v1/'+rel,body:await readFile(join(dir,name),'utf8')});
}
let next=0,passed=0,errors=[];
const worker=async()=>{while(next<items.length){const it=items[next++];try{
 await store.set(it.key,it.body);
 const got=await store.get(it.key,{type:'text',consistency:'strong'});
 const checksum=v=>createHash('sha256').update(v??'').digest('hex');
 if(checksum(it.body)!==checksum(got))throw Error('mismatched checksum');
 passed++;
}catch(e){errors.push({key:it.key,error:String(e)});console.error('FAILED',it.rel,String(e));}}};
await Promise.all(Array.from({length:3},()=>worker()));
console.log(JSON.stringify({projectId,namespace:'kira-catalog-recovery-20261017',verified:passed,total:items.length,errors},null,2));
if(errors.length)process.exitCode=1;
