/** Read-only REAL network smoke test. Never touches EdgeOne Blob or D1. */
import {writeFile} from 'node:fs/promises';
import {discoverSource} from '../lib/source-adapters.mjs';
import {sampleWorkMedia} from '../lib/media-health.mjs';
import {SOURCE_POLICIES} from '../lib/source-policy.mjs';
const report={date:new Date().toISOString(),kind:'actual-upstream-http-and-media-readonly',sources:{}};
const SOURCE_LIST=Object.keys(SOURCE_POLICIES);
const maxWorks=3;
for(const source of SOURCE_LIST){
 const modes=SOURCE_POLICIES[source].hot?['new','popular']:['new'];
 const result={attempted:modes.length,upstream_success:0,counts:[],media:[],errors:[],examples:[]};
 for(const mode of modes){
  try{
   const resultSet=await discoverSource(source,{mode,page:1,fetcher:fetch});
   result.upstream_success++;
   result.counts.push({mode,works:resultSet.works.length,next_cursor:resultSet.next_cursor||null});
   const works=resultSet.works.slice(0,maxWorks);
   const media=await sampleWorkMedia(works,{fetcher:fetch,maxWorks,maxImages:6});
   result.media.push({mode,checked:media.checked,passed:media.passed,failed:media.failed,errors:media.details.filter(d=>!d.ok).map(d=>d.error)});
   result.examples.push(...works.map(w=>({id:w.source_post_id,title:w.title||null,author:w.source_artist_name||w.author||null,
     uploader:w.uploader_name||null,raw_tag_count:w.raw_tags?.length||0,source_score_raw:w.source_score_raw??null,
     favorites_raw:w.favorites_raw??null,likes_raw:w.likes_raw??null,image_count:w.images?.length||0})));
  }catch(err){result.errors.push({mode,message:String(err?.message||err).slice(0,240)});}
  await new Promise(resolve=>setTimeout(resolve,900));
 }
 report.sources[source]=result;
 process.stdout.write(source+': '+result.upstream_success+'/'+result.attempted+' query lanes, '+result.media.reduce((n,m)=>n+m.passed,0)+' verified media responses\n');
}
report.successful_sources=Object.entries(report.sources).filter(([,x])=>x.upstream_success>0).length;
const output=process.argv[2]||'kira-live-probe-results.json';
await writeFile(output,JSON.stringify(report,null,2));
console.log('Wrote '+output+'. No datastore mutations performed.');
if(report.successful_sources!==12)process.exitCode=1;
