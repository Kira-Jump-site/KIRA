/**
 * Atomic-ish local preparation (not a Git commit, not a deployment).
 * Copies selected verified ae1ec9d source files into a temporary staging tree,
 * applies the preserved v8 overlay and the v9 moderation integration, then
 * ONLY writes to the chosen local repository after every anchor succeeds.
 */
import {readFile,writeFile,copyFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const here=dirname(fileURLToPath(import.meta.url));
const overlay=resolve(here,'..');
if(!process.argv[2])throw Error('required: node patches/apply-v9.mjs /absolute/path/to/KIRA');
const root=resolve(process.argv[2]);
const startFiles=[
 'lib/source-adapters.mjs','lib/source-policy.mjs','lib/metadata-schema.mjs',
 'lib/live-ingest.mjs','lib/replenish.mjs','lib/media-health.mjs',
 'lib/blob-catalog.mjs','lib/catalog.mjs','lib/live-read.mjs',
 'lib/live-archive.mjs','lib/quality-ranking.mjs','lib/tag-dictionary.mjs',
 'cloud-functions/api/discover.js','cloud-functions/api/catalog/refresh.js',
 'edge-functions/api/catalog/index.js','edgeone.json','package.json','public/admin.html'
];
const expected={
 'lib/source-adapters.mjs':'d178987e7b6d43abbc475879b506af9231e25f58',
 'lib/source-policy.mjs':'9adefe66b93969f24e4d6b658a3dca1bc609c19d',
 'lib/metadata-schema.mjs':'4759981c5d33ca9935bf15cd976c5a48fd780f31',
 'lib/live-ingest.mjs':'a4f0e56353c2ac3e8f201b1d83707985106c6760',
 'lib/replenish.mjs':'376608c0965ffdaec2d0b712e0146518bf0c07c0',
 'lib/media-health.mjs':'7529a2e140fea3f1d29ea2bc7b532d19bdf19b45'
};
const sha=s=>{const data=Buffer.from(s,'utf8');return createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')};
const stage=await mkdtemp(join(tmpdir(),'kira-reviewed-v9-'));
const write=async(p,text)=>{const dest=join(stage,p);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,text)};
function replaceOnce(s,a,b,file){const n=s.split(a).length-1;if(n!==1)throw Error(`${file}: expected anchor once, got ${n}: ${a.slice(0,96)}`);return s.replace(a,b)}
const modify=async(p,fn)=>{let value=await readFile(join(stage,p),'utf8');value=fn(value);await write(p,value)};
const written=new Set();
try{
 for(const p of startFiles){const value=await readFile(join(root,p),'utf8');if(expected[p]&&sha(value)!==expected[p])throw Error(`${p}: source changed from verified ae1ec9d; abort. SHA ${sha(value)} != ${expected[p]}`);await write(p,value)}
 // The uncommitted v8 patch itself also SHA-checks ALL six source files before changing any.
 execFileSync(process.execPath,[join(overlay,'base-v8/patches/apply-kira-v8.mjs'),stage],{stdio:'inherit'});
 for(const p of ['lib/source-adapters.mjs','lib/source-policy.mjs','lib/metadata-schema.mjs','lib/live-ingest.mjs','lib/replenish.mjs','lib/media-health.mjs'])written.add(p);
 for(const p of ['tag-ontology-v5.mjs','source-popularity-v5.mjs','source-evidence-v6.mjs','media-dimensions-v6.mjs','source-details-v7.mjs','source-tag-registry-v8.mjs'])written.add('lib/'+p);
 await modify('lib/live-ingest.mjs',s=>{
   s=replaceOnce(s,"import {normalizeWork} from './blob-catalog.mjs';","import {normalizeWork} from './blob-catalog.mjs';\nimport {loadActiveKnowledge,resolveWorkKnowledge,sourceQueryForTag} from './tag-knowledge-v9.mjs';\nimport {newlyDiscovered} from './review-state-v9.mjs';",'live-ingest import');
   s=replaceOnce(s,' const parsed=preparsed||await discoverSource(source,{',` const knowledge=await loadActiveKnowledge(store);
 const sourceTag=tag.includes(':')?(sourceQueryForTag(knowledge,source,tag).source_tag||tag):tag;
 const parsed=preparsed||await discoverSource(source,{`,'live-knowledge-before-discovery');
   s=replaceOnce(s,'tag,cursor:sourceCursor,mode:popular?policy.mode:', 'tag:sourceTag,cursor:sourceCursor,mode:popular?policy.mode:', 'live-source-dictionary-query');
   s=replaceOnce(s,'  try{normalized=normalizeWork(work)}catch{rejected++;continue}',"   try{normalized=normalizeWork(work);normalized=newlyDiscovered({...normalized,...resolveWorkKnowledge(normalized,knowledge)});}catch{rejected++;continue}",'live-ingest policy');
   s=replaceOnce(s,"if(needsMediaCheck&&normalized.media_status!=='verified'){rejected++;continue;}","if(needsMediaCheck&&normalized.media_status!=='verified'){normalized.visibility='pending';}",'retain failed-media candidates pending');
   s=replaceOnce(s,"const key=keyOf(source,normalized.source_post_id);","if(source==='pixiv'||source==='pixiv_yuki'){\n   const sibling=source==='pixiv'?'pixiv_yuki':'pixiv';\n   if(await getLiveItem(store,sibling,normalized.source_post_id))continue;\n  }\n  const key=keyOf(source,normalized.source_post_id);",'pixiv_shared_origin_dedup');
   // Blob does NOT document onlyIfNew/CAS; avoid overwriting an existing reviewed item.
   const blockStart=s.indexOf('  let stored=normalized;');
   const blockEnd=s.indexOf('  // Idempotent index repair:',blockStart);
   if(blockStart<0||blockEnd<=blockStart)throw Error('live-item-write-boundary-not-found');
   s=s.slice(0,blockStart)+`   let stored=normalized;
   const already=await store.get(key,{type:'json',consistency:'strong'});
   if(already?.work){stored=already.work;reused++;}
   else{
    await store.setJSON(key,entity);
    const check=await store.get(key,{type:'json',consistency:'strong'});
    if(check?.work?.source_post_id!==normalized.source_post_id)throw Error('live_item_readback_failed');
    inserted++;
   }
`+s.slice(blockEnd);
   // Best-effort source cooldown; there is NO claim this is an atomic distributed mutex.
   const leaseStart=s.indexOf(' if(!ignoreCooldown){');
   const leaseEnd=s.indexOf(' // For ordinary visitor refreshes,',leaseStart);
   if(leaseStart<0||leaseEnd<=leaseStart)throw Error('live-lease-boundary-not-found');
   s=s.slice(0,leaseStart)+` if(!ignoreCooldown){
  const lease=await store.get(leaseKey,{type:'json',consistency:'strong'});
  if(lease)return {ok:true,source,new_posts:0,skipped:'cooldown',retry_after_seconds:300-Math.floor((now%300000)/1000)};
  await store.setJSON(leaseKey,{source,bucket,started_at:now});
 }
`+s.slice(leaseEnd);
   return s;
 });written.add('lib/live-ingest.mjs');
 await modify('lib/replenish.mjs',s=>{
  const start=s.indexOf(' try{\n  await store.setJSON(lease,');
  const end=s.indexOf(' const result={schema:2',start);
  if(start<0||end<=start)throw Error('replenish-lease-boundary-not-found');
  s=s.slice(0,start)+` const existingLease=await store.get(lease,{type:'json',consistency:'strong'});
 if(existingLease)return {ok:true,source,reason,skipped:'cooldown',retry_after_seconds:Math.ceil((PERIOD_MS-now%PERIOD_MS)/1000)};
 await store.setJSON(lease,{schema:1,source,slot,reason,created_at:now});
`+s.slice(end);
  // Optional admin-selected source-native or approved standard tag.
  s=replaceOnce(s,"reason='daily',fetcher=fetch,maxPages=3,minAvailable=48,targetNew=60","reason='daily',tag='',fetcher=fetch,maxPages=3,minAvailable=48,targetNew=60",'replenish-tag-option');
  s=replaceOnce(s,"{page:1,ignoreCooldown:true,fetcher}","{page:1,tag,ignoreCooldown:true,fetcher}",'replenish-tag-forward');
  return s;
 });written.add('lib/replenish.mjs');
 await modify('lib/metadata-schema.mjs',s=>replaceOnce(s,'const meta=normalizeWorkTags(work);',
  `const meta=work.tag_dictionary_version&&Array.isArray(work.normalized_tag_ids)?{
   raw_tags:work.raw_tags||[], normalized_tag_ids:[...new Set([...(work.normalized_tag_ids||[]),...(work.admin_confirmed_tag_ids||[])])],
   normalized_tags:work.normalized_tags||[], search_tokens:work.search_tokens||[],
   tag_dictionary_version:work.tag_dictionary_version,
   source_tag_facts:work.source_tag_facts||[],unresolved_tag_facts:work.unresolved_tag_facts||[],
   confirmed_tag_relations:work.confirmed_tag_relations||[],tag_mapping_status:work.tag_mapping_status||'partial'
  }:normalizeWorkTags(work);`,'metadata-v9'));written.add('lib/metadata-schema.mjs');
 await modify('lib/blob-catalog.mjs',s=>{
   s=replaceOnce(s,"import {enrichWorkV3} from './metadata-schema.mjs';","import {enrichWorkV3} from './metadata-schema.mjs';\nimport {isApprovedPublic} from './review-state-v9.mjs';",'blob-import');
   s=replaceOnce(s,"const isPublic = w => w && w.visibility==='public' && ['safe','general'].includes(w.rating);","const isPublic = isApprovedPublic;",'blob-public');
   s=replaceOnce(s,"  if(work.visibility==='public'&&!['safe','general'].includes(work.rating))throw Error('rating_review_required');", "  if(work.visibility==='public'&&!['safe','general'].includes(work.rating))throw Error('rating_review_required');\n  if(work.visibility==='public'&&Number(work.review_policy_version||0)>=1&&!isApprovedPublic(work))throw Error('admin_review_required');",'blob-restore');
   s=replaceOnce(s,"await store.setJSON(key,event,{onlyIfNew:true});","await store.setJSON(key,event);",'event-unique-key');
   return s;
 });written.add('lib/blob-catalog.mjs');
 await modify('lib/live-archive.mjs',s=>{
   s=replaceOnce(s,"import {getCatalogOverlay} from './blob-catalog.mjs';","import {getCatalogOverlay} from './blob-catalog.mjs';\nimport {isApprovedPublic} from './review-state-v9.mjs';",'archive-import');
   s=replaceOnce(s,"const isPublic=w=>w?.visibility==='public'&&['safe','general'].includes(w.rating);","const isPublic=isApprovedPublic;",'archive-status');return s;
 });written.add('lib/live-archive.mjs');
 await modify('edge-functions/api/catalog/index.js',s=>{
  s=replaceOnce(s,"import {queryBlobCatalog,getCatalogOverlay} from '../../../lib/blob-catalog.mjs';", "import {queryBlobCatalog,getCatalogOverlay} from '../../../lib/blob-catalog.mjs';\nimport {isApprovedPublic} from '../../../lib/review-state-v9.mjs';",'catalog-import');
  s=replaceOnce(s,"if(w.visibility==='public'&&['safe','general'].includes(w.rating))byId.set(id,w);",'if(isApprovedPublic(w))byId.set(id,w);','catalog-overlay');return s;
 });written.add('edge-functions/api/catalog/index.js');
 await modify('lib/quality-ranking.mjs',s=>{
   s=replaceOnce(s,"const weights={pixels:.35,popularity:.30,relevance:.20,availability:.10,freshness:.05};","const weights={pixels:.05,popularity:.70,relevance:.20,availability:0,freshness:.05};",'quality-weights');
   s=replaceOnce(s,"quality_score:coverage?Math.round(10000*valid.reduce((s,k)=>s+weights[k]*dim[k],0)/coverage)/100:null,","quality_score:dim.popularity===null?null:coverage?Math.round(10000*valid.reduce((s,k)=>s+weights[k]*dim[k],0)/coverage)/100:null,",'quality-score');
   return s;
 });written.add('lib/quality-ranking.mjs');
 // Live discovery no longer returns any unapproved upstream response, even on Blob failure.
 await write('cloud-functions/api/discover.js',`import {json,SOURCES} from '../../lib/catalog.mjs';
import {getStore} from '@edgeone/pages-blob';
import {getCatalogOverlay} from '../../lib/blob-catalog.mjs';
import {flattenForReader} from '../../lib/source-adapters.mjs';
import {isApprovedPublic} from '../../lib/review-state-v9.mjs';
import {loadActiveKnowledge,resolveWorkKnowledge} from '../../lib/tag-knowledge-v9.mjs';
export async function onRequest({request}){
 if(request.method!=='GET')return json({ok:false,error:'method_not_allowed'},405);
 const u=new URL(request.url),source=u.searchParams.get('source')||'',page=Number(u.searchParams.get('page')||1),tag=u.searchParams.get('tag')||'';
 if(!SOURCES.has(source)||!Number.isSafeInteger(page)||page<1||page>50||tag.length>160)return json({ok:false,error:'invalid_request'},400);
 try{
  const store=getStore({name:'kira-catalog-recovery-20261017',consistency:'strong'});
  const overlay=await getCatalogOverlay(store,source),knowledge=await loadActiveKnowledge(store);
  const desired=tag?resolveWorkKnowledge({source,raw_tags:[tag]},knowledge).normalized_tag_ids:[];
  const found=[...overlay.values()].filter(isApprovedPublic).filter(w=>!tag||desired.some(id=>(w.normalized_tag_ids||[]).includes(id))||(w.raw_tags||[]).some(x=>String(x).toLowerCase()===tag.toLowerCase()));
  found.sort((a,b)=>(b.indexed_at||0)-(a.indexed_at||0));
  const slice=found.slice((page-1)*30,page*30),works=flattenForReader(slice);
  return json({ok:true,source,page,works,posts:works,items:works,page_mode:'number',next_cursor:null,backend:'approved-blob-only',upstream_works:0});
 }catch(e){console.error('kira_public_discover_read_failed',e?.name||'UNKNOWN');return json({ok:false,error:'catalog_unavailable'},503)}
}
`);written.add('cloud-functions/api/discover.js');
 await write('cloud-functions/api/catalog/refresh.js',`import {json} from '../../../lib/catalog.mjs';
// Anonymous visitors may read approved inventory; they cannot invoke paid upstream or Blob writes.
// Daily EdgeOne schedules and authenticated /api/catalog/admin/refill own replenishment.
export async function onRequest({request}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 return json({ok:true,source:'server_managed',scheduled:false,reason:'automatic_daily_or_admin_refill'},202);
}
`);written.add('cloud-functions/api/catalog/refresh.js');
 // Keep the existing admin reports interface; add a dedicated reviewed-works page.
 await modify('public/admin.html',s=>replaceOnce(s,'← 返回画廊</a>','← 返回画廊</a><a href="/review.html" style="color:#8cc6ff">审核新采集作品 →</a>','admin-link'));written.add('public/admin.html');
 const parts=['lib/tag-knowledge-v9.mjs','lib/moderation-v9.mjs','lib/review-state-v9.mjs','lib/admin-auth-v9.mjs','lib/tag-reindex-v9.mjs','public/review.html','public/assets/review.js',
  'cloud-functions/api/catalog/admin/queue.js','cloud-functions/api/catalog/admin/review.js','cloud-functions/api/catalog/admin/refill.js','cloud-functions/api/catalog/admin/tags.js','cloud-functions/api/catalog/admin/bulk-review.js','cloud-functions/api/catalog/admin/reindex.js',
  'tests/tag-knowledge-v9.test.mjs','tests/moderation-v9.mock.test.mjs','tests/review-integration-v9.test.mjs',
  'tests/mock-unit/doubles.mjs','tests/mock-unit/moderation-under-test.mjs'];
 for(const p of parts){await write(p,await readFile(join(overlay,p),'utf8'));written.add(p)}
 // Safe to copy now; validate all edit anchors before any local project mutation.
 for(const p of written){const target=join(root,p);await mkdir(dirname(target),{recursive:true});await copyFile(join(stage,p),target)}
 console.log('Applied KIRA v8+v9 overlay to local worktree:',written.size,'source files. No GitHub write or deployment.');
}finally{await rm(stage,{recursive:true,force:true})}
