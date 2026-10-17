import{cp,rm,mkdir}from'node:fs/promises';
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});
for(const [a,b] of [['public','dist'],['edge-functions','dist/edge-functions'],['lib','dist/lib']])await cp(a,b,{recursive:true});
console.log('KIRA EdgeOne static+functions ready in dist');
