/** KIRA v10 guarded offline integration. NEVER writes remote/git/EdgeOne. */
import {readFile,writeFile,copyFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const overlay=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw Error('usage: node patches/apply-v10.mjs /absolute/path/to/KIRA-main');
const root=resolve(process.argv[2]);
const initial=['lib/source-adapters.mjs','lib/source-policy.mjs','lib/metadata-schema.mjs',
 'lib/live-ingest.mjs','lib/replenish.mjs','lib/media-health.mjs','lib/blob-catalog.mjs',
 'lib/catalog.mjs','lib/live-read.mjs','lib/live-archive.mjs','lib/quality-ranking.mjs','lib/tag-dictionary.mjs',
 'cloud-functions/api/discover.js','cloud-functions/api/catalog/refresh.js','edge-functions/api/catalog/index.js',
 'edgeone.json','package.json','public/admin.html','cloud-functions/api/cron/replenish.js'];
const stagedPaths=new Set([...initial]);
const stage=await mkdtemp(join(tmpdir(),'kira-v10-verified-'));
const write=async(p,s)=>{const t=join(stage,p);await mkdir(dirname(t),{recursive:true});await writeFile(t,s)};
const exact=(s,old,updated,p)=>{const n=s.split(old).length-1;if(n!==1)throw Error(`${p}: anchor mismatch, got ${n}: ${old.slice(0,70)}`);return s.replace(old,updated)};
async function patch(p,fn){const content=await readFile(join(stage,p),'utf8');await write(p,fn(content));stagedPaths.add(p)}
try{
 for(const p of initial)await write(p,await readFile(join(root,p),'utf8'));
 // Includes strict ae1ec9d Git-blob SHA whitelist and v8 source verification.
 execFileSync(process.execPath,[join(overlay,'patches/apply-v9.mjs'),stage],{stdio:'inherit'});
 const copied=['lib/source-adapters.mjs','lib/source-policy.mjs','lib/metadata-schema.mjs','lib/live-ingest.mjs','lib/replenish.mjs','lib/media-health.mjs',
 'lib/tag-ontology-v5.mjs','lib/source-popularity-v5.mjs','lib/source-evidence-v6.mjs','lib/media-dimensions-v6.mjs',
 'lib/source-details-v7.mjs','lib/source-tag-registry-v8.mjs','lib/blob-catalog.mjs','lib/live-archive.mjs',
 'lib/quality-ranking.mjs','cloud-functions/api/discover.js','cloud-functions/api/catalog/refresh.js',
 'edge-functions/api/catalog/index.js','public/admin.html','lib/tag-knowledge-v9.mjs',
 'lib/moderation-v9.mjs','lib/review-state-v9.mjs','lib/admin-auth-v9.mjs','lib/tag-reindex-v9.mjs',
 'cloud-functions/api/catalog/admin/review.js','cloud-functions/api/catalog/admin/refill.js',
 'cloud-functions/api/catalog/admin/queue.js','cloud-functions/api/catalog/admin/bulk-review.js',
 'cloud-functions/api/catalog/admin/tags.js','cloud-functions/api/catalog/admin/reindex.js',
 'public/review.html','public/assets/review.js',
 'tests/tag-knowledge-v9.test.mjs','tests/moderation-v9.mock.test.mjs',
 'tests/review-integration-v9.test.mjs','tests/mock-unit/doubles.mjs','tests/mock-unit/moderation-under-test.mjs'];
 copied.forEach(p=>stagedPaths.add(p));
 await patch('lib/live-ingest.mjs',s=>{
  s=exact(s,"import {newlyDiscovered} from './review-state-v9.mjs';",
   "import {newlyDiscovered} from './review-state-v9.mjs';\nimport {preselectQualityPool,qualityAdmission} from './quality-admission-v10.mjs';",'ingest-import');
  s=exact(s,"const candidates=evaluateSourcePool(enriched,{maxItems:24,\n  referenceDistributions:baseline?.histograms||{}});",
   "const candidates=preselectQualityPool(evaluateSourcePool(enriched,{maxItems:64,\n  referenceDistributions:baseline?.histograms||{}}));",'ingest-preselect');
  s=exact(s,'maxWorks:24,maxImages:32','maxWorks:64,maxImages:160','ingest-media-batch');
  s=exact(s,"if(needsMediaCheck&&normalized.media_status!=='verified'){normalized.visibility='pending';}",
   "if(!needsMediaCheck||normalized.media_status!=='verified'){rejected++;continue;}",'ingest-no-media');
  s=exact(s,"const gate=mediaGate(normalized);\n  normalized.quality_gate=gate;\n  if(!gate.eligible)normalized.visibility='pending';",
   "const admission=qualityAdmission({...work,...normalized});\n  normalized.quality_admission=admission;\n  if(!admission.eligible){rejected++;continue;}",'ingest-quality-gate');
  return s;
 });
 // Live ingestion predates moderation. Never grandfather live v2 records as approved,
 // even if the original source adapter marked a safe item public before v9.
 await patch('lib/blob-catalog.mjs',s=>exact(s,
  'const merged=new Map(recent.map(w=>[w.source_post_id,w]));',
  'const merged=new Map(recent.filter(w=>Number(w.review_policy_version||0)>=1).map(w=>[w.source_post_id,w]));','legacy-live-privacy'));
 await patch('lib/blob-catalog.mjs',s=>exact(s,
  "export async function findWork(store,source,id){",
  "/** One revision-index read per moderation page instead of per card. */\nexport async function loadCatalogChangeHeads(store,source){\n if(!safeSource(source))throw Error('invalid_source');\n return changeHeads(store,source);\n}\nexport async function findWork(store,source,id){", 'review-queue-revision-snapshot'));
 await patch('lib/live-archive.mjs',s=>exact(s,
  'const isPublic=isApprovedPublic;',
  'const isPublic=w=>Number(w?.review_policy_version||0)>=1&&isApprovedPublic(w);','archive-live-privacy'));
 await patch('lib/replenish.mjs',s=>{
  s=exact(s,"import {SOURCE_POLICIES} from './source-policy.mjs';",
   "import {SOURCE_POLICIES} from './source-policy.mjs';\nimport {dailyQuota} from './quality-admission-v10.mjs';",'replenish-import');
  s=exact(s,"reason='daily',tag='',fetcher=fetch,maxPages=3,minAvailable=48,targetNew=60",
   "reason='daily',tag='',fetcher=fetch,maxPages=16,minAvailable=48,targetNew=120",'replenish-defaults');
  const a=s.indexOf('  const maxSourcePages='),b=s.indexOf('  const initial=',a);
  if(a<0||b<a)throw Error('replenish-page-boundary-unknown');
  s=s.slice(0,a)+`  const quota=dailyQuota(source);
  const cap=Math.max(1,Math.min(quota.max_pages,Math.trunc(maxPages)));
`+s.slice(b);
  s=exact(s,"if(result.details.slice(-2).length===2&&result.details.slice(-2).every(x=>x.added===0))break;",
   "if(!['nekosia','pixiv','pixiv_yuki','bilibili_opus'].includes(source)&&result.details.slice(-2).length===2&&result.details.slice(-2).every(x=>x.added===0))break;",'replenish-random');
  s=exact(s,'  result.ok=true;','  result.ok=true;\n  result.goal_pending=targetNew;result.quality_shortfall=Math.max(0,targetNew-result.pending);','replenish-quota-report');
  s=exact(s,'skipped:response.skipped||null','skipped:response.skipped||null,filtered:response.skipped_invalid||0','replenish-reject-report');
  return s;
 });
 await patch('cloud-functions/api/cron/replenish.js',s=>{
  s=exact(s,"import {REPLENISH_SOURCES,replenishSource} from '../../../lib/replenish.mjs';",
   "import {REPLENISH_SOURCES,replenishSource} from '../../../lib/replenish.mjs';\nimport {dailyQuota} from '../../../lib/quality-admission-v10.mjs';",'cron-import');
  s=exact(s,"{reason:'daily',maxPages:source==='e_shuushuu'?2:4,targetNew:80}",
   "{reason:'daily',maxPages:dailyQuota(source).max_pages,targetNew:dailyQuota(source).goal_pending}",'cron-daily');
  return s;
 });
 const sources=['lib/quality-admission-v10.mjs','lib/review-queue-v10.mjs','lib/review-batch-v10.mjs','lib/report-moderation-v10.mjs',
  'cloud-functions/api/catalog/admin/refill.js','cloud-functions/api/catalog/admin/queue.js','cloud-functions/api/catalog/admin/bulk-review.js','cloud-functions/api/catalog/admin/reports.js',
  'edge-functions/api/catalog/report-anonymous.js','public/review.html','public/assets/review.js','public/reports.html','public/assets/reports.js',
  'lib/moderation-v9.mjs','cloud-functions/api/catalog/admin/review.js',
  'tests/quality-admission-v10.test.mjs','tests/review-batch-v10.test.mjs','tests/queue-reports-v10.test.mjs',
  'tests/quality-review-v10.test.mjs','tests/mock-unit/review-store-doubles.mjs',
  'tests/mock-unit/review-queue-under-test.mjs','tests/mock-unit/report-moderation-under-test.mjs',
  'tests/mock-unit/moderation-under-test-v10.mjs'];
 for(const p of sources){await write(p,await readFile(join(overlay,p),'utf8'));stagedPaths.add(p)}
 // Verify all JS syntax BEFORE modifying the target working copy.
 for(const p of stagedPaths){if(/\.m?js$/.test(p))execFileSync(process.execPath,['--check',join(stage,p)],{stdio:'inherit'})}
 // Do not overwrite unrelated files; only v8-v10 changed sources are copied.
 stagedPaths.delete('package.json');stagedPaths.delete('edgeone.json');
 stagedPaths.delete('lib/catalog.mjs');stagedPaths.delete('lib/live-read.mjs');stagedPaths.delete('lib/tag-dictionary.mjs');
 for(const p of stagedPaths){const target=join(root,p);await mkdir(dirname(target),{recursive:true});await copyFile(join(stage,p),target)}
 console.log(`Applied ${stagedPaths.size} verified v8→v9→v10 files. NO commit, NO deploy.`);
}finally{await rm(stage,{recursive:true,force:true})}
