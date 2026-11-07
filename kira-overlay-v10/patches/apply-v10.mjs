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
   "if(result.details.slice(-2).length===2&&result.details.slice(-2).every(x=>x.candidates===0))break;",'replenish-random');
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
 await patch('lib/source-adapters.mjs',s=>exact(s,
  "const image=oneImage(value.compressed?.url||value.original?.url,value.original?.url||value.compressed?.url,\n   x.width||1,x.height||1);",
  "const image=oneImage(x.thumbnail,x.preview,x.width||1,x.height||1);", 'nekosia-normalized-image-fields'));
 await patch('lib/replenish.mjs',s=>exact(s,
  "  for(let n=0;n<cap;n++){",
  "  const budgetStart=Date.now();\n  for(let n=0;n<cap;n++){\n   if(Date.now()-budgetStart>90000){result.errors.push('runtime_budget_exhausted');break;}", 'replenish-time-budget'));

 // PRE-PROBE existing work dedup and media checks in complete gallery units.
 await patch('lib/live-ingest.mjs',s=>{
  s=exact(s,"import {preselectQualityPool,qualityAdmission} from './quality-admission-v10.mjs';",
   "import {preselectQualityPool,qualityAdmission} from './quality-admission-v10.mjs';\nimport {isLegacyWork} from './legacy-ids.mjs';\nimport {planWholeWorkMedia} from './media-batch-planner-v15.mjs';",'whole-gallery-plan-import');
  s=exact(s," const previous=await getLiveRecent(store,source);\n // Historical static lookup",
   " // Historical static lookup",'move-dedup-early');
  s=exact(s," const enriched=parsed.works.map(w=>enrichWorkV3(w,{fetchedAt:now}));",
   " const previous=await getLiveRecent(store,source);\n const indexedIds=new Set(previous.map(w=>w.source_post_id));\n const enriched=parsed.works.map(w=>enrichWorkV3(w,{fetchedAt:now}));",'dedup-read-early');
  s=exact(s," const candidates=preselectQualityPool(evaluateSourcePool(enriched,{maxItems:64,\n  referenceDistributions:baseline?.histograms||{}}));",
   " const preselected=preselectQualityPool(evaluateSourcePool(enriched,{maxItems:64,\n  referenceDistributions:baseline?.histograms||{}}));\n const candidates=preselected.filter(w=>!indexedIds.has(w.source_post_id)&&!isLegacyWork(source,w.source_post_id));\n const skippedExisting=preselected.length-candidates.length;\n const mediaPlan=planWholeWorkMedia(candidates,{maxWorks:64,maxImages:160});",'planned-probes-only-for-fresh-works');
  s=exact(s,"await sampleWorkMedia(candidates,{fetcher:mediaFetcher||fetch,maxWorks:64,maxImages:160})",
   "await sampleWorkMedia(mediaPlan.selected,{fetcher:mediaFetcher||fetch,maxWorks:64,maxImages:160})",'plan-full-gallery-probes');
  s=exact(s," for(const work of candidates){\n  let normalized;",
   " for(const work of candidates){\n  if(mediaPlan.deferredIds.has(work.source_post_id)||mediaPlan.invalidIds.has(work.source_post_id))continue;\n  let normalized;",'defer-whole-galleries');
  s=exact(s,"media_checked:media.checked,media_passed:media.passed,media_failed:media.failed,unhealthy_ids:",
   "media_checked:media.checked,media_passed:media.passed,media_failed:media.failed,skipped_existing:skippedExisting,media_budget_deferred:mediaPlan.deferredIds.size,media_invalid_gallery:mediaPlan.invalidIds.size,unhealthy_ids:",'distinct-probe-budget-reasons');
  return s;
 });
 // Shared thumb/preview URLs need one real probe, but separate roles are recorded.
 await patch('lib/media-health.mjs',s=>{
  s=exact(s," const result=new Array(checks.length);let next=0;",
   " const result=new Array(checks.length);let next=0;\n const cache=new Map();\n const checked=(source,url)=>{const k=source+'|'+url;let r=cache.get(k);if(!r){r=probeMedia(source,url,{fetcher});cache.set(k,r)}return r};",'deduplicate-identical-media-probes');
  s=exact(s,"result[i]={...await probeMedia(source,url,{fetcher}),kind,source_post_id,image_index};",
   "result[i]={...await checked(source,url),kind,source_post_id,image_index};",'probe-use-cache');
  return s;
 });
 await patch('lib/replenish.mjs',s=>exact(s,
   'skipped:response.skipped||null,filtered:response.skipped_invalid||0',
   'skipped:response.skipped||null,filtered:response.skipped_invalid||0,skipped_existing:response.skipped_existing||0,media_budget_deferred:response.media_budget_deferred||0', 'differentiate-media-deferrals'));
 const sources=['lib/media-batch-planner-v15.mjs','lib/quality-admission-v10.mjs','lib/review-queue-v10.mjs','lib/review-batch-v10.mjs','lib/report-moderation-v10.mjs',
  'cloud-functions/api/catalog/admin/refill.js','cloud-functions/api/catalog/admin/queue.js','cloud-functions/api/catalog/admin/bulk-review.js','cloud-functions/api/catalog/admin/reports.js',
  'edge-functions/api/catalog/report-anonymous.js','public/review.html','public/assets/review.js','public/reports.html','public/assets/reports.js',
  'lib/moderation-v9.mjs','cloud-functions/api/catalog/admin/review.js',
  'tests/quality-admission-v10.test.mjs','tests/review-batch-v10.test.mjs','tests/queue-reports-v10.test.mjs',
  'tests/quality-review-v10.test.mjs','tests/mock-unit/review-store-doubles.mjs',
  'tests/mock-unit/review-queue-under-test.mjs','tests/mock-unit/report-moderation-under-test.mjs',
  'tests/mock-unit/moderation-under-test-v10.mjs'];
 for(const p of sources){await write(p,await readFile(join(overlay,p),'utf8'));stagedPaths.add(p)}
 await patch('lib/quality-admission-v10.mjs',s=>exact(s,
  "return {goal_pending:120,max_pages:smallFeed?20:16,max_items_per_fetch:64,source};",
  "return {goal_pending:120,max_pages:['pixiv','pixiv_yuki'].includes(source)?36:smallFeed?20:16,max_items_per_fetch:64,source};",'pixiv-daily-budget'));
 await patch('lib/review-queue-v10.mjs',s=>exact(s,
  "if(current.quality_admission?.eligible!==true)return null;",
  "if(current.quality_admission?.eligible!==true||current.media_status!=='verified'||!Array.isArray(current.images)||!current.images.length||current.images.some(img=>img.media_status!=='verified'))return null;",'verified-media-review-queue'));

 // v16: arrow returned [id, thumb]; the adapter indexed [_, id, thumb] and built
 // detail URLs from the thumbnail URL, so every real E-Shuushuu detail failed.
 await patch('lib/source-adapters.mjs',s=>{
  s=exact(s,"const detail=await response('https://e-shuushuu.net/images/'+m[1],fetcher,'text/html');",
   "const detail=await response('https://e-shuushuu.net/images/'+m[0],fetcher,'text/html');",'v16-eshuushuu-detail-id');
  s=exact(s,"const img=oneImage(m[2],fullsize?.[1]||full?.[1],Number(size?.[1])||1,Number(size?.[2])||1);",
   "const img=oneImage(m[1],fullsize?.[1]||full?.[1],Number(size?.[1])||1,Number(size?.[2])||1);",'v16-eshuushuu-thumb');
  s=exact(s,"const w=item('e_shuushuu',m[1],{canonical_url:'https://e-shuushuu.net/images/'+m[1],",
   "const w=item('e_shuushuu',m[0],{canonical_url:'https://e-shuushuu.net/images/'+m[0],",'v16-eshuushuu-work-id');
  s=exact(s,"   .map((x,i)=>oneImage(typeof x==='string'?x:x.url||x.small||x.cover,\n    typeof x==='string'?x:x.url||x.original||x.cover,0,0,i)).filter(Boolean);",
   "   .map((x,i)=>oneImage(typeof x==='string'?x:x.url||x.small||x.cover,\n    typeof x==='string'?x:x.url||x.original||x.cover,\n    typeof x==='string'?0:x.width,typeof x==='string'?0:x.height,i)).filter(Boolean);",'v16-miyoushe-dimensions');
  return s;
 });
 await patch('lib/replenish.mjs',s=>{
  s=exact(s,"reason='daily',tag='',fetcher=fetch,maxPages=16,minAvailable=48,targetNew=120",
   "reason='daily',tag='',fetcher=fetch,mediaFetcher=null,maxPages=16,minAvailable=48,targetNew=120",'v16-replenish-media-fetcher');
  s=exact(s,"{page:1,tag,ignoreCooldown:true,fetcher}","{page:1,tag,ignoreCooldown:true,fetcher,mediaFetcher}",'v16-replenish-forward-media');
  return s;
 });
 // Switching the source dropdown must actually load it; otherwise the page looks dead.
 await patch('public/assets/review.js',s=>exact(s,"$('source').onchange=()=>{state.cursors=[''];state.page=0;state.nextCursor=null;state.items=[];state.selected.clear();render();void sourceDiagnostics()};",
  "let activeSource=$('source').value;\n$('source').onchange=()=>{const next=$('source').value;if(state.dirty&&!confirm('本页存在尚未提交的选择，切换图源会丢弃，继续？')){$('source').value=activeSource;return}\n activeSource=next;state.cursors=[''];state.page=0;state.nextCursor=null;state.items=[];state.selected.clear();state.dirty=false;render();void sourceDiagnostics();void load(0)};",'v16-source-change-autoload'));
 // v16: opus detail returns -352 without WBI signing and buvid cookies.
 await write('lib/wbi-sign-v16.mjs',await readFile(join(overlay,'lib/wbi-sign-v16.mjs'),'utf8'));
 stagedPaths.add('lib/wbi-sign-v16.mjs');
 await patch('lib/source-adapters.mjs',s=>{
  s=exact(s,"import {parseWallhavenDetail,parseZerochanDetail,parseEshuushuuTags,parseEshuushuuTagGroups} from './source-details-v7.mjs';",
   "import {parseWallhavenDetail,parseZerochanDetail,parseEshuushuuTags,parseEshuushuuTagGroups} from './source-details-v7.mjs';\nimport {signWbi,parseWbiKeys} from './wbi-sign-v16.mjs';",'v16-wbi-import');
  s=exact(s,"async function getBilibili({tag,fetcher,authorSlot=0}){",
   "const BILI_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';\nlet bilibiliSessionCache=null;\nasync function bilibiliJson(fetcher,url,cookie=''){\n let r;\n try{r=await fetcher(url,{signal:AbortSignal.timeout(TIMEOUT_MS),headers:{Accept:'application/json','User-Agent':BILI_UA,Referer:'https://www.bilibili.com/',...(cookie?{Cookie:cookie}:{})}})}\n catch(e){throw new SourceFailure(e?.name==='TimeoutError'?'upstream_timeout':'upstream_connection_failed',503)}\n if(!r.ok)throw new SourceFailure('upstream_http_'+r.status,r.status===429?429:502);\n const text=await r.text();\n if(text.length>2500000)throw new SourceFailure('upstream_response_too_large');\n try{return JSON.parse(text)}catch{throw new SourceFailure('upstream_invalid_json')}\n}\nasync function bilibiliAuth(fetcher){\n const now=Date.now();\n if(bilibiliSessionCache&&now-bilibiliSessionCache.at<55*60*1000&&bilibiliSessionCache.keys)return bilibiliSessionCache;\n let cookie='';\n try{const d=await bilibiliJson(fetcher,'https://api.bilibili.com/x/frontend/finger/spi');if(d?.code===0&&d.data?.b_3)cookie='buvid3='+d.data.b_3+'; buvid4='+(d.data.b_4||'')}catch{}\n let keys=null;\n try{keys=parseWbiKeys(await bilibiliJson(fetcher,'https://api.bilibili.com/x/web-interface/nav',cookie))}catch{}\n bilibiliSessionCache={cookie,keys,at:now};\n return bilibiliSessionCache;\n}\nasync function getBilibili({tag,fetcher,authorSlot=0}){",'v16-bilibili-auth');
  s=exact(s," const ids=['2433445','2051740842','284805222'];",
   " const ids=['2433445','2051740842','284805222'];\n const auth=await bilibiliAuth(fetcher);",'v16-bilibili-session');
  s=exact(s,"  const feed=await response(u,fetcher);",
   "  const feed=await bilibiliJson(fetcher,u.toString(),auth.cookie);",'v16-bilibili-feed');
  s=exact(s,"   const u=new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/detail');u.searchParams.set('id',opus);\n   const data=await response(u,fetcher);",
   "   const query=auth.keys?signWbi({id:opus},auth.keys).query:'id='+encodeURIComponent(opus);\n   const data=await bilibiliJson(fetcher,'https://api.bilibili.com/x/polymer/web-dynamic/v1/detail?'+query,auth.cookie);",'v16-bilibili-detail');
  return s;
 });
 // Pixiv's recommendation feed returns one work per call; 12 calls gave 12 unique.
 await patch('lib/source-adapters.mjs',s=>exact(s,"Array.from({length:4},()=>response(u,fetcher))",
  "Array.from({length:12},()=>response(u,fetcher))",'v16-pixiv-attempts'));
 // v16: a cohort whose observed values are all equal (e.g. every fresh post has
 // score 0) has no ranking signal; do not silently rank it at the 50th percentile.
 await patch('lib/source-popularity-v5.mjs',s=>{
  s=exact(s,"   const enough=w._metric.observed&&samples.length>=minReference;\n   const pct=enough?q([...samples].sort(order),w._metric.value):null;",
   "   const degenerate=samples.length>=2&&samples.every(v=>v===samples[0]);\n   const enough=w._metric.observed&&samples.length>=minReference&&!degenerate;\n   const pct=enough?q([...samples].sort(order),w._metric.value):null;",'v16-degenerate-cohort');
  s=exact(s,"popularity_status:!w._metric.observed?'unrated':enough?'ranked':'insufficient_reference',",
   "popularity_status:!w._metric.observed?'unrated':degenerate?'cohort_unrankable':enough?'ranked':'insufficient_reference',",'v16-degenerate-status');
  return s;
 });
 await patch('lib/quality-admission-v10.mjs',s=>{
  s=exact(s," const smallSample=rated.filter(w=>w.popularity_status==='insufficient_reference');",
   " const unrankable=rated.filter(w=>w.popularity_status==='cohort_unrankable');\n const smallSample=rated.filter(w=>w.popularity_status==='insufficient_reference');",'v16-unrankable-preselect');
  s=exact(s,"return [...limited,...weak].slice(0,Math.max(0,Math.min(64,max)));",
   "return [...limited,...unrankable,...weak].slice(0,Math.max(0,Math.min(64,max)));",'v16-unrankable-pool');
  s=exact(s," if(work.popularity_status==='insufficient_reference'){",
   " if(work.popularity_status==='cohort_unrankable'){\n  if(work.observed_popularity_value===null||work.observed_popularity_value===undefined)\n   return {eligible:false,stage:'ranking',reason:'missing_observed_signal',version:ADMISSION_VERSION};\n  return {eligible:true,stage:'complete',rule:'no_ranking_signal_verified_media_requires_admin_judgement',version:ADMISSION_VERSION};\n }\n if(work.popularity_status==='insufficient_reference'){",'v16-unrankable-admission');
  return s;
 });
 // v16: one bounded retry on a media timeout; 403/HTML failures are not retried.
 await patch('lib/media-health.mjs',s=>{
  s=exact(s,"export async function probeMedia(source,url,{fetcher=fetch,timeoutMs=4500,verifyBytes=fetcher===fetch}={}){",
   "async function probeMediaAttempt(source,url,{fetcher=fetch,timeoutMs=4500,verifyBytes=fetcher===fetch}={}){",'v16-media-attempt');
  s=exact(s,"export async function sampleWorkMedia(works,",
   "export async function probeMedia(source,url,opts={}){\n const first=await probeMediaAttempt(source,url,opts);\n if(first.ok||first.error!=='media_timeout')return first;\n return probeMediaAttempt(source,url,{...opts,timeoutMs:Math.round((opts.timeoutMs||4500)*1.8)});\n}\nexport async function sampleWorkMedia(works,",'v16-media-retry');
  return s;
 });
 // v16: rank a batch within itself when it is large enough. A popular-lane
 // baseline must not bury every fresh/lower-score page below the 70th percentile.
 await patch('lib/source-popularity-v5.mjs',s=>exact(s,
  "   const samples=historyOk.length>=minReference?historyOk:[...historyOk,...current];",
  "   const samples=current.length>=minReference?current:[...historyOk,...current];",'v16-lane-relative'));
 // A source change during the initial load used to be dropped by the busy guard.
 await patch('public/assets/review.js',s=>exact(s,
  "let activeSource=$('source').value;\n$('source').onchange=()=>{const next=$('source').value;if(state.dirty&&!confirm('本页存在尚未提交的选择，切换图源会丢弃，继续？')){$('source').value=activeSource;return}\n activeSource=next;state.cursors=[''];state.page=0;state.nextCursor=null;state.items=[];state.selected.clear();state.dirty=false;render();void sourceDiagnostics();void load(0)};",
  "let activeSource=$('source').value,sourceGen=0;\n$('source').onchange=()=>{const next=$('source').value;if(state.dirty&&!confirm('本页存在尚未提交的选择，切换图源会丢弃，继续？')){$('source').value=activeSource;return}\n activeSource=next;const gen=++sourceGen;state.cursors=[''];state.page=0;state.nextCursor=null;state.items=[];state.selected.clear();state.dirty=false;render();void sourceDiagnostics();const start=()=>{if(gen!==sourceGen)return;if(state.busy){setTimeout(start,120);return}void load(0)};start()};",'v16-source-change-race'));
 // Cosbooru rejects no-referrer image requests; the main app already special-cases it.
 await patch('public/assets/review.js',s=>{
  s=exact(s,"function safeURL(str){try{const u=new URL(str);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}",
   "function safeURL(str){try{const u=new URL(str);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}\nconst refPolicy=url=>{try{return new URL(url).hostname==='cos.booru.nl'?'strict-origin-when-cross-origin':'no-referrer'}catch{return 'no-referrer'}};",'v16-review-refpolicy');
  s=exact(s,"img.referrerPolicy='no-referrer'","img.referrerPolicy=refPolicy(thumb)",'v16-review-thumb-ref');
  return s;
 });
 await patch('public/assets/reports.js',s=>{
  s=exact(s,"function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}",
   "function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}\nconst refPolicy=url=>{try{return new URL(url).hostname==='cos.booru.nl'?'strict-origin-when-cross-origin':'no-referrer'}catch{return 'no-referrer'}};",'v16-reports-refpolicy');
  s=exact(s,"i.referrerPolicy='no-referrer'","i.referrerPolicy=refPolicy(src)",'v16-reports-thumb-ref');
  return s;
 });
 // v16: e-shuushuu "rating" is a 0-10 quality score with num_ratings, not a
 // safety class. Never label an unrated image safe.
 await patch('lib/source-adapters.mjs',s=>exact(s,
  "      rating:rating?.[1]==='0'?'safe':'unknown',",
  "      // e-shuushuu exposes no per-image safety field; rating is a 0-10 quality score.\n      rating:'unknown',",'v16-eshuushuu-rating-unknown'));
 // Verify all JS syntax BEFORE modifying the target working copy.
 for(const p of stagedPaths){if(/\.m?js$/.test(p))execFileSync(process.execPath,['--check',join(stage,p)],{stdio:'inherit'})}
 // Do not overwrite unrelated files; only v8-v10 changed sources are copied.
 stagedPaths.delete('package.json');stagedPaths.delete('edgeone.json');
 stagedPaths.delete('lib/catalog.mjs');stagedPaths.delete('lib/live-read.mjs');stagedPaths.delete('lib/tag-dictionary.mjs');
 for(const p of stagedPaths){const target=join(root,p);await mkdir(dirname(target),{recursive:true});await copyFile(join(stage,p),target)}
 console.log(`Applied ${stagedPaths.size} verified v8→v9→v10 files. NO commit, NO deploy.`);
}finally{await rm(stage,{recursive:true,force:true})}
