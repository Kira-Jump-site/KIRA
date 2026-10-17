import{cp,rm,mkdir}from'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const [a,b] of [['public','dist'],['edge-functions','dist/edge-functions'],['cloud-functions','dist/cloud-functions'],['lib','dist/lib']])await cp(a,b,{recursive:true});
await cp('package.json','dist/package.json');
await cp('edgeone.json','dist/edgeone.json');
console.log('KIRA EdgeOne static+functions ready in dist');
