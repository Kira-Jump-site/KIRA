from pathlib import Path
p=Path('/mnt/data/KIRA_v6_uncommitted/patches/apply-kira-v6.mjs')
s=p.read_text()
def rep(a,b):
 global s
 n=s.count(a)
 if n!=1:raise ValueError((n,a[:90]))
 s=s.replace(a,b)
rep('apply-kira-v5.mjs','apply-kira-v6.mjs') if 'apply-kira-v5.mjs' in s else None
# Append extra replacement anchors to source-adapters patch list, before closing marker
needle=" [\"const seen=new Set();works=works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id));\", \"const seen=new Set();works=works.filter(w=>!seen.has(w.source_post_id)&&seen.add(w.source_post_id)).map(w=>({...w,...normalizeWorkTags(w),source_discovery_mode:mode}));\"]"
assert needle in s
s=s.replace(needle, needle+''',
 ["import {normalizeWorkTags} from './tag-ontology-v5.mjs';", "import {normalizeWorkTags} from './tag-ontology-v5.mjs';\\nimport {extractBooruIdentity,extractNekosiaItems,extractBilibiliNode,extractEshuushuuDetail,zerochanParams} from './source-evidence-v6.mjs';"],
 ["const tagged={artist:artistTags,character:tagsOf(p.tag_string_character),copyright:tagsOf(p.tag_string_copyright),", "const tagged={artist:artistTags,character:tagsOf(p.tag_string_character),copyright:tagsOf(p.tag_string_copyright),"],
 ["original_source_url:p.source||null,", "original_source_url:p.source||null, ...extractBooruIdentity(p,source),"],
 ["const u=new URL('https://api.nekosia.cat/api/v1/images/'+category);", "const u=new URL('https://api.nekosia.cat/api/v1/images/'+category);"],
 ["const rows=Array.isArray(data.images)?data.images:data.image?[data]:data.id?[data]:[];", "const rows=extractNekosiaItems(data);"],
 ["const value=x.image||x;", "const value=x.image||x;"],
 ["x.metadata?.original?.width||value.original?.width||value.width,x.metadata?.original?.height||value.original?.height||value.height);", "x.width||1,x.height||1);"],
 ["return item('nekosia',id,{canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),rating:'safe',", "return item('nekosia',id,{canonical_url:'https://nekosia.cat/images/'+encodeURIComponent(id),rating:x.content_rating==='safe'?'safe':'unknown',"],
 ["original_source_url:x.source?.url||null,", "original_source_url:x.original_source_url||null,"],
 ["source_tag_groups:{general:tagsOf(x.tags),copyright:x.anime?.title?[x.anime.title]:[],character:x.anime?.character?[x.anime.character]:[]},", "source_tag_groups:x.source_tag_groups,"],
 ["author:x.attribution?.artist?.username||'',", "author:x.artist||'',"],
 ["title:x.anime?.character||x.anime?.title||x.title||'',tags:x.tags?.tags||x.tags||[],kind:'illustration'", "title:'',tags:x.tags||[],kind:'illustration'"],
 ["const index=new URL(mode==='popular'?'https://e-shuushuu.net/images/top':'https://e-shuushuu.net/');", "const index=new URL(mode==='popular'?'https://e-shuushuu.net/images/top':'https://e-shuushuu.net/');"],
 ["const rating=detail.match(/(?:rating:|\\\"rating\\\"\\s*:)(\\d+)/);", "const rating=detail.match(/(?:rating:|\\\"rating\\\"\\s*:)(\\d+)/);\\n     const evidence=extractEshuushuuDetail(detail);"],
 ["title:title?.[1]?.replace(/&amp;/g,'&')||'',rating:rating?.[1]==='0'?'safe':'unknown',", "title:evidence.title||'',uploader:evidence.uploader_name,score:evidence.source_score_raw,favorites:evidence.favorites_raw,\\n      rating:rating?.[1]==='0'?'safe':'unknown',"],
 ["async function getZerochan({page,tag,fetcher}){", "async function getZerochan({page,tag,fetcher,mode='new'}){"],
 ["const u=new URL(tag?'https://www.zerochan.net/'+encodeURIComponent(tag):'https://www.zerochan.net/');\\n  u.searchParams.set('p',String(page));u.searchParams.set('json','');", "const request=zerochanParams({page,mode,tag});\\n  const u=new URL(request.url);"],
 ["rating:'unknown',title:p.title||p.name||'',", "rating:'unknown',title:p.title||p.name||'',"],
 ["rating:'unknown',author:'',uploader:node.modules?.module_author?.name||'',uploader_id:uid,", "rating:'unknown',author:'',uploader:node.modules?.module_author?.name||'',uploader_id:uid,"],
 ["const w=item('bilibili_opus',opus,{canonical_url:'https://www.bilibili.com/opus/'+opus,", "const parsedNode=extractBilibiliNode(node);\\n    const w=item('bilibili_opus',opus,{canonical_url:'https://www.bilibili.com/opus/'+opus,"],
 ["author_id:'',author_role:'unknown',likes:node.modules?.module_stat?.like?.count??null,", "author_id:'',author_role:'unknown',likes:parsedNode.likes_raw,tags:parsedNode.tags,"],
 ["const works=item('bilibili_opus',id,{canonical_url:'https://www.bilibili.com/opus/'+id,", "const parsedNode=extractBilibiliNode(node);\\n  const works=item('bilibili_opus',id,{canonical_url:'https://www.bilibili.com/opus/'+id,"],
 ["author_role:'unknown',likes:node.modules?.module_stat?.like?.count??null,published_at:dateOf(node.modules?.module_author?.pub_ts),", "author_role:'unknown',likes:parsedNode.likes_raw,tags:parsedNode.tags,published_at:dateOf(node.modules?.module_author?.pub_ts),"]''')
# Notes: keep direct booru and Nekosia anchors precise; source policy patch updates zerochan
needle=" [\"export const sourceProfiles=()\","
assert needle in s
s=s.replace(needle,''' ["zerochan:{mode:'latest',hot:null,hotAlternate:null,tag:'path_unverified',score:null,creator:'unknown'}", "zerochan:{mode:'popular-by-favorites',hot:'s=fav',hotAlternate:'s=fav&t=0',tag:'zerochan',score:'favorites',creator:'unknown'}"],
 ["e_shuushuu:{mode:'top',hot:'images/top',hotAlternate:null", "e_shuushuu:{mode:'top',hot:'images/top',hotAlternate:null"],
 ["if(!policy.tag||policy.tag==='path_unverified')", "if(!policy.tag||policy.tag==='path_unverified')"],
 ["const candidate=a;", "const candidate=a;"],
 ["export const sourceProfiles=()",''') if False else s
# Append separate policy patch before closing
marker=" [\"if(!a)return {value:'',supported:false,reason:'no_verified_source_tag_alias'};\\n  candidate=a;\","
# V5 uses exactly this line; don't conflict now, just inject before first policy anchor
n="await patch('lib/source-policy.mjs',[\n"
assert n in s
s=s.replace(n,n+''' ["zerochan:{mode:'latest',hot:null,hotAlternate:null,tag:'path_unverified',score:null,creator:'unknown'}", "zerochan:{mode:'popular-by-favorites',hot:'s=fav',hotAlternate:'s=fav&t=0',tag:'zerochan',score:'favorites',creator:'unknown'}"],
 ["'type:cosplay':{booru:'cosplay'", "'type:cosplay':{zerochan:'Cosplay',booru:'cosplay'"],
 ["'character:hatsune_miku':{booru:'hatsune_miku'", "'character:hatsune_miku':{zerochan:'Hatsune Miku',booru:'hatsune_miku'"],
 ["'ip:genshin_impact':{booru:'genshin_impact'", "'ip:genshin_impact':{zerochan:'Genshin Impact',booru:'genshin_impact'"],
''')
# Fix sourceQuery tag rewriting for Zerochan: ontology stable slug -> convert '_' to ' ' not anime native tag name guarantee but syntax valid
s=s.replace("policy.tag==='nekosia'?slug.replace(/_/g,'-'):policy.tag==='query'?slug.replace(/_/g,' '):slug", "policy.tag==='nekosia'?slug.replace(/_/g,'-'):['query','zerochan'].includes(policy.tag)?slug.replace(/_/g,' '):slug")
# add source kind event
s=s.replace("for(const filename of ['tag-ontology-v5.mjs','source-popularity-v5.mjs'])", "for(const filename of ['tag-ontology-v5.mjs','source-popularity-v5.mjs','source-evidence-v6.mjs'])")
s=s.replace("installed 2 modules", "installed 3 modules")
p.write_text(s)
print('Modified',len(s))
