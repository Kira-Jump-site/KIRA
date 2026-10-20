/** Apply only to a checked-out Kira-Jump-site/KIRA main ae1ec9d tree.
 * No git operations, no cloud operations, no writes until all patch anchors pass.
 */
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const dir=dirname(fileURLToPath(import.meta.url));
const root=resolve(process.argv[2]||'');
if(!process.argv[2]||root===dirname(root))throw Error('explicit project root required');
const EXPECTED_SOURCE_SHA={
 'lib/source-adapters.mjs':'d178987e7b6d43abbc475879b506af9231e25f58',
 'lib/source-policy.mjs':'9adefe66b93969f24e4d6b658a3dca1bc609c19d',
 'lib/metadata-schema.mjs':'4759981c5d33ca9935bf15cd976c5a48fd780f31',
 'lib/live-ingest.mjs':'a4f0e56353c2ac3e8f201b1d83707985106c6760',
 'lib/replenish.mjs':'376608c0965ffdaec2d0b712e0146518bf0c07c0',
 'lib/media-health.mjs':'7529a2e140fea3f1d29ea2bc7b532d19bdf19b45'
};
const staged=new Map();
const gitBlobSha=contents=>{const data=Buffer.from(contents,'utf8');return createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex');};
const patch=async(relative,replacements)=>{
 const file=join(root,relative);let content=await readFile(file,'utf8');
 const expected=EXPECTED_SOURCE_SHA[relative];if(!expected||gitBlobSha(content)!==expected)throw Error(relative+': source does not match verified KIRA main ae1ec9d; no files written');
 for(const [before,after] of replacements){const count=content.split(before).length-1;if(count!==1)throw Error(`${relative}: expected exactly one anchor, got ${count}: ${before.slice(0,85)}`);content=content.replace(before,after)}
 staged.set(file,content);
};
await patch('lib/source-adapters.mjs',[
 ["import {sourceQuery,sourceSchedule} from './source-policy.mjs';", "import {sourceQuery,sourceSchedule,sourceDiscoveryLane} from './source-policy.mjs';\nimport {normalizeWorkTags} from './tag-ontology-v5.mjs';"],
 [".filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,80);", ".map(x=>typeof x==='string'?x:(x&&typeof x==='object'?x.tag||x.name||x.tag_name||'':'')).filter(x=>typeof x==='string').map(x=>x.trim()).filter(Boolean).slice(0,80);"],
 ["author_role:values.author_role||'unknown',", "author_role:values.author_role||'unknown',source_artist_name:String(values.source_artist_name||values.author||'').slice(0,180),\n uploader_role:'source_uploader',original_source_url:values.original_source_url||null,source_tag_groups:values.source_tag_groups||{},display_title:String(values.display_title||'').slice(0,300),title_provenance:values.title_provenance||'upstream_explicit',"],
 ["tags:tagsOf(values.tags),raw_tags:tagsOf(values.tags),", "tags:tagsOf(values.tags),raw_tags:tagsOf(values.tags),tags_translated:tagsOf(values.tags_translated),"],
 ["likes_raw:optionalNumber(values.likes),views_raw:optionalNumber(values.views),images};", "likes_raw:optionalNumber(values.likes),views_raw:optionalNumber(values.views),images};"],
 ["const safe=ratingOf(p.rating);", "const safe=decodeBooruRating(p.rating,kind);"],
 ["const tags=tagsOf(p.tags||p.tag_string);", "const tags=tagsOf(p.tags||p.tag_string);\n   const artistTags=tagsOf(p.tag_string_artist);\n   const tagged={artist:artistTags,character:tagsOf(p.tag_string_character),copyright:tagsOf(p.tag_string_copyright),\n     general:tagsOf(p.tag_string_general),meta:tagsOf(p.tag_string_meta)};"],
 ["author:p.tag_string_artist||p.tag_string_artist_tags||'',uploader:p.uploader?.name||p.uploader_name||'',", "author:artistTags.join(', '),source_artist_name:artistTags.join(', '),uploader:p.uploader?.name||p.uploader_name||p.owner||'',"],
 ["uploader_id:p.uploader?.id||p.uploader_id||'',author_role:p.tag_string_artist?'tagged_artist':'unknown',title:p.title||'',tags,", "uploader_id:p.uploader?.id||p.uploader_id||p.creator_id||'',author_role:artistTags.length?'tagged_artist':'unknown',\n   title:p.title||'',tags,source_tag_groups:tagged,original_source_url:p.source||null,"],
 ["favorites:p.fav_count,kind:","favorites:p.fav_count,likes:p.up_score,kind:"],
 ["value.original?.width||value.width,value.original?.height||value.height);","x.metadata?.original?.width||value.original?.width||value.width,x.metadata?.original?.height||value.original?.height||value.height);"],
 ["author:x.attribution?.artist?.username||'',", "author:x.attribution?.artist?.username||'',original_source_url:x.source?.url||null,\n   source_tag_groups:{general:tagsOf(x.tags),copyright:x.anime?.title?[x.anime.title]:[],character:x.anime?.character?[x.anime.character]:[]},"],
 ["title:x.title||'',tags:x.tags?.tags||x.tags||[],kind:'illustration'", "title:x.anime?.character||x.anime?.title||x.title||'',tags:x.tags?.tags||x.tags||[],kind:'illustration'"],
 ["author:data.user?.name||'',author_id:data.user?.id||'',author_role:'pixiv_artist',tags:data.tags,", "author:data.user?.name||'',author_id:data.user?.id||'',author_role:'pixiv_artist',tags:data.tags,\n   source_tag_groups:{general:tagsOf(data.tags)},original_source_url:'https://www.pixiv.net/artworks/'+data.id,"],
 ["title,author:p.user?.nickname||'',author_id:post.uid||'',author_role:'post_creator',published_at:","title,author:'',uploader:p.user?.nickname||'',uploader_id:post.uid||'',author_id:'',author_role:'unknown',\n     source_tag_groups:{type:['cosplay'],general:topics.split(/[，, ]+/).filter(Boolean)},published_at:"],
 ["uploader:p.uploader?.username||'',uploader_id:p.uploader?.username||'',author_role:'unknown',", "uploader:p.uploader?.username||'',uploader_id:p.uploader?.username||'',author_role:'unknown',\n    original_source_url:p.source||null,"],
 ["return item('zerochan',p.id,{canonical_url:'https://www.zerochan.net/'+p.id,rating:'unknown'},img?[img]:[]);", "return item('zerochan',p.id,{canonical_url:'https://www.zerochan.net/'+p.id,rating:'unknown',title:p.title||p.name||'',\n    author:typeof p.artist==='string'?p.artist:'',uploader:typeof p.uploader==='string'?p.uploader:'',tags:tagsOf(p.tags||p.tag_string),\n    favorites:p.fav_count??p.favorites,source_tag_groups:{general:tagsOf(p.tags||p.tag_string)}},img?[img]:[]);"],
 ["rating:'unknown',author_id:uid,author_role:'feed_account',title:module.desc?.text||module.major?.opus?.summary?.text||''},images);", "rating:'unknown',author:'',uploader:node.modules?.module_author?.name||'',uploader_id:uid,\n     author_id:'',author_role:'unknown',likes:node.modules?.module_stat?.like?.count??null,\n     title:module.desc?.text||module.major?.opus?.summary?.text||''},images);"],
 ["author_id:node.modules?.module_author?.mid||'',author_role:'opus_poster',published_at:dateOf(node.modules?.module_author?.pub_ts),", "author_id:'',uploader:node.modules?.module_author?.name||'',uploader_id:node.modules?.module_author?.mid||'',\n   author_role:'unknown',likes:node.modules?.module_stat?.like?.count??null,published_at:dateOf(node.modules?.module_author?.pub_ts),"],
 ["async function getNekosia({page,tag,fetcher,mode='new'}){", "async function getNekosia({page,tag,fetcher,category='cute',mode='new'}){"],
 ["const u=new URL('https://api.nekosia.cat/api/v1/images/cute');", "const allowed=['cute','girl','vtuber','blue-archive','maid','catgirl'];\n  if(!allowed.includes(category))throw new SourceFailure('nekosia_unverified_category',422);\n  const u=new URL('https://api.nekosia.cat/api/v1/images/'+category);"],
 ["async function getMiyoushe({page,tag,cursor,fetcher}){", "async function getMiyoushe({page,tag,cursor,fetcher,keyword='cosplay'}){"],
 ["u.searchParams.set('keyword',tag||'cosplay');u.searchParams.set('size','20');", "u.searchParams.set('keyword',tag||keyword);u.searchParams.set('size','20');"],
 ["async function getBilibili({tag,fetcher}){", "async function getBilibili({tag,fetcher,authorSlot=0}){"],
 ["const uid=ids[(Math.max(1,Number(arguments[0]?.page||1))-1)%ids.length];", "const uid=ids[Math.abs(authorSlot)%ids.length];"],
 ["async function getEshuushuu({page,tag,fetcher}){", "async function getEshuushuu({page,tag,fetcher,mode='new'}){"],
 ["const index=new URL('https://e-shuushuu.net/');", "const index=new URL(mode==='popular'?'https://e-shuushuu.net/images/top':'https://e-shuushuu.net/images');"],
 ["const args={page,tag:translated.value,cursor,fetcher,source,mode};", "const lane=sourceDiscoveryLane(source,cycle);\n  const args={page,tag:translated.value,cursor,fetcher,source,mode,category:lane.category,keyword:lane.keyword,authorSlot:lane.authorSlot};"],
 ["export async function discoverSource(source,{page=1,tag='',cursor='',mode='new',fetcher=fetch}={}){", "export async function discoverSource(source,{page=1,tag='',cursor='',mode='new',cycle=0,fetcher=fetch}={}){"],
 ["const seen=new Set();works=works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id));", "const seen=new Set();works=works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id)).map(w=>({...w,...normalizeWorkTags(w),source_discovery_mode:mode}));"],
 ["import {normalizeWorkTags} from './tag-ontology-v5.mjs';", "import {normalizeWorkTags} from './tag-ontology-v5.mjs';\nimport {extractBooruIdentity,extractNekosiaItems,extractBilibiliNode,extractEshuushuuDetail,extractEshuushuuCards,zerochanParams,decodeBooruRating} from './source-evidence-v6.mjs';"],
 ["const tagged={artist:artistTags,character:tagsOf(p.tag_string_character),copyright:tagsOf(p.tag_string_copyright),", "const tagged={artist:artistTags,character:tagsOf(p.tag_string_character),copyright:tagsOf(p.tag_string_copyright),"],
 ["original_source_url:p.source||null,", "original_source_url:p.source||null, ...extractBooruIdentity(p,source),"],
 ["const u=new URL('https://api.nekosia.cat/api/v1/images/'+category);", "const u=new URL('https://api.nekosia.cat/api/v1/images/'+category);"],
 ["const rows=Array.isArray(data.images)?data.images:data.image?[data]:data.id?[data]:[];", "const rows=extractNekosiaItems(data);"],
 ["const value=x.image||x;", "const value=x;"],
 ["x.metadata?.original?.width||value.original?.width||value.width,x.metadata?.original?.height||value.original?.height||value.height);", "x.width||1,x.height||1);"],
 ["return item('nekosia',id,{canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),rating:'safe',", "return item('nekosia',id,{canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),rating:x.content_rating==='safe'?'safe':'unknown',"],
 ["original_source_url:x.source?.url||null,", "original_source_url:x.original_source_url||null,"],
 ["source_tag_groups:{general:tagsOf(x.tags),copyright:x.anime?.title?[x.anime.title]:[],character:x.anime?.character?[x.anime.character]:[]},", "source_tag_groups:x.source_tag_groups,"],
 ["author:x.attribution?.artist?.username||'',", "author:x.artist||'',"],
 ["title:x.anime?.character||x.anime?.title||x.title||'',tags:x.tags?.tags||x.tags||[],kind:'illustration'", "title:'',tags:x.tags||[],kind:'illustration'"],
 ["const index=new URL(mode==='popular'?'https://e-shuushuu.net/images/top':'https://e-shuushuu.net/images');", "const index=new URL(mode==='popular'?'https://e-shuushuu.net/images/top':'https://e-shuushuu.net/images');"],
 ["const matches=[...html.matchAll(/<a href=\"\/images\/(\\d+)\"[^>]*data-image-id=\"\\d+\"[^>]*><img src=\"(https:\\/\\/cdn\\.e-shuushuu\\.net\\/thumbs\\/[^\"]+)\"/g)].slice(0,12);", "const matches=extractEshuushuuCards(html,{limit:12});"],
 ["const rating=detail.match(/(?:rating:|\"rating\"\s*:)(\d+)/);", "const rating=detail.match(/(?:rating:|\"rating\"\s*:)(\d+)/);\n     const evidence=extractEshuushuuDetail(detail);"],
 ["title:title?.[1]?.replace(/&amp;/g,'&')||'',rating:rating?.[1]==='0'?'safe':'unknown',", "title:evidence.title||'',display_title:evidence.display_title,title_provenance:evidence.title_provenance,uploader:evidence.uploader_name,score:evidence.source_score_raw,favorites:evidence.favorites_raw,\n      rating:rating?.[1]==='0'?'safe':'unknown',"],
 ["async function getZerochan({page,tag,fetcher}){", "async function getZerochan({page,tag,fetcher,mode='new'}){"],
 ["const u=new URL(tag?'https://www.zerochan.net/'+encodeURIComponent(tag):'https://www.zerochan.net/');\n  u.searchParams.set('p',String(page));u.searchParams.set('json','');", "const request=zerochanParams({page,mode,tag});\n  const u=new URL(request.url);"],
 ["rating:'unknown',title:p.title||p.name||'',", "rating:'unknown',title:p.title||p.name||'',"],
 ["rating:'unknown',author:'',uploader:node.modules?.module_author?.name||'',uploader_id:uid,", "rating:'unknown',author:'',uploader:node.modules?.module_author?.name||'',uploader_id:uid,"],
 ["const w=item('bilibili_opus',opus,{canonical_url:'https://www.bilibili.com/opus/'+opus,", "const parsedNode=extractBilibiliNode(node);\n    const w=item('bilibili_opus',opus,{canonical_url:'https://www.bilibili.com/opus/'+opus,"],
 ["author_id:'',author_role:'unknown',likes:node.modules?.module_stat?.like?.count??null,", "author_id:'',author_role:'unknown',likes:parsedNode.likes_raw,tags:parsedNode.tags,"],
 ["const works=item('bilibili_opus',id,{canonical_url:'https://www.bilibili.com/opus/'+id,", "const parsedNode=extractBilibiliNode(node);\n  const works=item('bilibili_opus',id,{canonical_url:'https://www.bilibili.com/opus/'+id,"],
 ["author_role:'unknown',likes:node.modules?.module_stat?.like?.count??null,published_at:dateOf(node.modules?.module_author?.pub_ts),", "author_role:'unknown',likes:parsedNode.likes_raw,tags:parsedNode.tags,published_at:dateOf(node.modules?.module_author?.pub_ts),"]
]);
await patch('lib/source-policy.mjs',[
 ["zerochan:{mode:'latest',hot:null,hotAlternate:null,tag:'path_unverified',score:null,creator:'unknown'}", "zerochan:{mode:'popular-by-favorites',hot:'s=fav',hotAlternate:'s=fav&t=0',tag:'zerochan',score:'favorites',creator:'unknown'}"],
 ["'type:cosplay':{booru:'cosplay'", "'type:cosplay':{zerochan:'Cosplay',booru:'cosplay'"],
 ["'character:hatsune_miku':{booru:'hatsune_miku'", "'character:hatsune_miku':{zerochan:'Hatsune Miku',booru:'hatsune_miku'"],
 ["'ip:genshin_impact':{booru:'genshin_impact'", "'ip:genshin_impact':{zerochan:'Genshin Impact',booru:'genshin_impact'"],
 ["/**\n * Source-specific upstream discovery policy.", "import {canonicalTag} from './tag-ontology-v5.mjs';\n/**\n * Source-specific upstream discovery policy."],
 ["export const sourceProfiles=()", "export function sourceDiscoveryLane(source,cycle=0){\n const s=sourceSchedule(source,cycle);\n if(source==='nekosia')return {...s,category:['cute','girl','vtuber','blue-archive','maid','catgirl'][Math.abs(cycle)%6],selection:'curated-category'};\n if(source==='miyoushe_cos')return {...s,keyword:['cosplay','cos正片','coser','角色扮演','摄影正片'][Math.abs(cycle)%5],selection:'cosplay-search'};\n if(source==='bilibili_opus')return {...s,authorSlot:Math.abs(cycle)%3,selection:'known-author'};\n if(source==='e_shuushuu')return {...s,selection:'official-top-or-latest'};\n return {...s,selection:SOURCE_POLICIES[source].mode};\n}\nexport const sourceProfiles=()"],
 ["if(!a)return {value:'',supported:false,reason:'no_verified_source_tag_alias'};\n  candidate=a;", "if(!a){\n   const matched=canonicalTag(value);\n   const [axis,...pieces]=String(matched||'').split(':');\n   if(!['ip','character','appearance','clothing','pose','scene','theme','type'].includes(axis))return {value:'',supported:false,reason:'no_known_tag_translation'};\n   const slug=pieces.join(':');\n   // Only issue syntactically valid tags; upstream presence is still checked by the response.\n   candidate=policy.tag==='nekosia'?slug.replace(/_/g,'-'):['query','zerochan'].includes(policy.tag)?slug.replace(/_/g,' '):slug;\n  } else candidate=a;"],
]);
await patch('lib/media-health.mjs',[
 ["/**\n * Bounded sampling for an upstream source batch.", "import {sniffImage} from './media-dimensions-v6.mjs';\n/**\n * Bounded sampling for an upstream source batch."],
 ["headers:{Range:'bytes=0-127'}", "headers:{Range:'bytes=0-65535'}"],
 ["  if(!ok)return {ok:false,http_status:res.status,mime,error:'non_image_or_http_error'};", "  if(!ok&&![403,405,501].includes(res.status))return {ok:false,http_status:res.status,mime,error:'non_image_or_http_error'};"],
 ["  const chunk=await reader.read();await reader.cancel().catch(()=>{});\n  const bytes=chunk.value||new Uint8Array();", "  const chunks=[];let total=0;while(total<65536){const part=await reader.read();if(part.done)break;chunks.push(part.value);total+=part.value.length;if(total>=65536)break;}\n  await reader.cancel().catch(()=>{});\n  const bytes=new Uint8Array(Math.min(total,65536));let offset=0;for(const c of chunks){const take=Math.min(c.length,bytes.length-offset);bytes.set(c.subarray(0,take),offset);offset+=take;if(offset>=bytes.length)break;}"],
 ["  return {ok:signature,http_status:get.status,mime:gotMime,error:signature?null:'media_magic_mismatch'};", "  const detected=sniffImage(bytes);\n  return {ok:signature&&detected.type!==null,http_status:get.status,mime:gotMime,error:signature&&detected.type!==null?null:'media_magic_mismatch',detected_width:detected.width,detected_height:detected.height,detected_type:detected.type};"],
 ["source_post_id:x.source_post_id,image_index:x.image_index,kind:x.kind,ok:x.ok,", "source_post_id:x.source_post_id,image_index:x.image_index,kind:x.kind,ok:x.ok,detected_width:x.detected_width??null,detected_height:x.detected_height??null,"],
]);
await patch('lib/replenish.mjs',[
 ["import {SOURCE_CAPABILITIES} from './quality-ranking.mjs';", "import {SOURCE_POLICIES} from './source-policy.mjs';"],
 ["const profile=SOURCE_CAPABILITIES[source];", "const profile=SOURCE_POLICIES[source];"],
 ["result.source_capability={tag_query:profile.tag_query,popular_sort:profile.popular_sort};", "result.source_capability={tag_query:profile.tag,popular_sort:profile.hot,primary_strategy:profile.mode};"]
]);
await patch('lib/metadata-schema.mjs',[
 ["import {normalizeTags} from './tag-dictionary.mjs';", "import {normalizeWorkTags} from './tag-ontology-v5.mjs';"],
 ["const meta=normalizeTags(work.source,work.raw_tags||work.tags||[]);", "const meta=normalizeWorkTags(work);"],
 ["source_author_name:str(work.source_author_name??work.author,180),", "source_author_name:str(work.source_artist_name??work.source_author_name??work.author,180),\n uploader_name:str(work.uploader_name,180),uploader_id:str(work.uploader_id,180),\n original_source_url:str(work.original_source_url,2000)||null,"],
]);
await patch('lib/live-ingest.mjs',[
 ["import {isLegacyWork} from './legacy-ids.mjs';", "// Static pre-reset records may be re-imported as fresh EdgeOne v3 objects after review."],
 ["import {rankSourceCandidates} from './quality-ranking.mjs';", "import {evaluateSourcePool,sourceMetric,mediaGate,updatePopularityBaseline} from './source-popularity-v5.mjs';"],
 ["const candidates=rankSourceCandidates(parsed.works.map(w=>enrichWorkV3(w,{fetchedAt:now})),\n  {now,limit:24,desiredTags:tag?[tag]:[]});", "const baselineKey=ROOT+'quality/baselines/'+source+'.json';\n const baseline=await store.get(baselineKey,{type:'json',consistency:'strong'});\n const enriched=parsed.works.map(w=>enrichWorkV3(w,{fetchedAt:now}));\n const candidates=evaluateSourcePool(enriched,{maxItems:24,\n  referenceDistributions:baseline?.samples?.length?{[source]:baseline.samples}:undefined});"],
 ["  if(isLegacyWork(source,normalized.source_post_id)||Object.prototype.hasOwnProperty.call(base||{},normalized.source_post_id))continue;", "  // Fresh data may reuse an old D1/static ID; Blob immutable keys prevent duplicate writes."],
 [" const base=await store.get(ROOT+'lookup/'+source+'.json',{type:'json',consistency:'strong'});", " // Historical static lookup is intentionally not a blocklist after D1 reset."],
 ["mode:popular?policy.mode:'new',fetcher", "mode:popular?policy.mode:'new',cycle,fetcher"],
 ["  const key=keyOf(source,normalized.source_post_id);", "  const gate=mediaGate(normalized);\n  normalized.quality_gate=gate;\n  if(!gate.eligible)normalized.visibility='pending';\n  const key=keyOf(source,normalized.source_post_id);"],
 ["  const previous=await getLiveRecent(store,source);", "  const probedSize=new Map(media.details.filter(x=>x.kind==='preview'&&x.ok&&x.detected_width&&x.detected_height).map(x=>[x.source_post_id+':'+x.image_index,x]));\n  const previous=await getLiveRecent(store,source);"],
 ["  normalized.images=normalized.images.map(img=>({...img,", "  normalized.images=normalized.images.map(img=>({...img,\n    width:Number(img.width)>1?img.width:(probedSize.get(normalized.source_post_id+':'+img.image_index)?.detected_width||1),\n    height:Number(img.height)>1?img.height:(probedSize.get(normalized.source_post_id+':'+img.image_index)?.detected_height||1),\n    dimensions_provenance:Number(img.width)>1&&Number(img.height)>1?'upstream_original':'verified_preview_header',"],
 [" if(media.checked){\n  await store.setJSON(ROOT+'ingest/health/'+source+'.json',", " const samples=[...(Array.isArray(baseline?.samples)?baseline.samples:[]),...enriched.map(x=>sourceMetric(x).value).filter(x=>x!==null)].slice(-300);\n if(samples.length)await store.setJSON(baselineKey,{schema:1,source,updated_at:now,samples});\n if(media.checked){\n  await store.setJSON(ROOT+'ingest/health/'+source+'.json',"]
]);
// No source files are written until all anchors and six Git blob hashes have passed.
for(const filename of ['tag-ontology-v5.mjs','source-popularity-v5.mjs','source-evidence-v6.mjs','media-dimensions-v6.mjs'])await readFile(join(dir,'..','lib',filename));
for(const [file,source] of staged)await writeFile(file,source);
for(const filename of ['tag-ontology-v5.mjs','source-popularity-v5.mjs','source-evidence-v6.mjs','media-dimensions-v6.mjs'])await copyFile(join(dir,'..','lib',filename),join(root,'lib',filename));
console.log('Patched '+staged.size+' existing files and installed 4 modules. No GitHub/cloud operation.');
