/** Prepare the audited KIRA v10 source overlay at build/test time.
 * This is non-networked and idempotent within one checkout. Never writes Cloudflare or GitHub.
 */
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const source=resolve(root,'lib/live-ingest.mjs');
const overlay=resolve(root,'kira-overlay-v10/patches/apply-v10.mjs');
if(!existsSync(source)||!existsSync(overlay))throw Error('KIRA source or v10 overlay missing');
const src=readFileSync(source,'utf8');
const ready=src.includes("from './quality-admission-v10.mjs'")&&src.includes('qualityAdmission(')
 &&existsSync(resolve(root,'cloud-functions/api/catalog/admin/queue.js'))
 &&existsSync(resolve(root,'public/reports.html'));
if(ready){console.log('KIRA v10 audited overlay already prepared');process.exit(0)}
if(src.includes("from './quality-admission-v10.mjs'")||existsSync(resolve(root,'lib/quality-admission-v10.mjs')))
 throw Error('Partial KIRA v10 integration detected; inspect checkout before reapplying');
execFileSync(process.execPath,[overlay,root],{stdio:'inherit',cwd:root});
if(!existsSync(resolve(root,'lib/quality-admission-v10.mjs'))||!readFileSync(source,'utf8').includes('qualityAdmission('))
 throw Error('KIRA v10 integration verification failed');
console.log('KIRA v10 source integration prepared for test/build');
