export const TAG_DICTIONARY_VERSION='2026-10-18.1';
const entries=[
['type:cosplay','cosplay','Cosplay','コスプレ','角色扮演','coser','cosplay_photo','cosplay_photography','cos正片'],
['character:hatsune_miku','初音未来','Hatsune Miku','初音ミク','初音未來','hatsune_miku'],
['ip:genshin_impact','原神','Genshin Impact','genshin_impact'],
['ip:wuthering_waves','鸣潮','Wuthering Waves','鳴潮','wuthering_waves'],
['ip:honkai_star_rail','崩坏星穹铁道','Honkai Star Rail','崩壞星穹鐵道','honkai_star_rail'],
['appearance:blue_hair','蓝发','藍髮','青髪','blue_hair'],
['appearance:white_hair','白发','白髮','白髪','white_hair'],
['appearance:black_hair','黑发','黑髮','黒髪','black_hair'],
['medium:illustration','插画','插畫','イラスト','illustration'],
['medium:photo','摄影','攝影','写真','photography'],
['theme:anime','anime','动漫','動漫','アニメ'],
['composition:wallpaper','wallpaper','壁纸','壁紙']];
const clean=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/[\s-]+/g,'_');
export const TAG_DICTIONARY=Object.freeze(entries.map(([canonical_tag_id,...aliases])=>({canonical_tag_id,aliases})));
const lookup=new Map();
for(const {canonical_tag_id,aliases} of TAG_DICTIONARY)for(const a of [canonical_tag_id,...aliases]){
const k=clean(a);if(lookup.has(k)&&lookup.get(k)!==canonical_tag_id)throw Error('duplicate_tag_alias');lookup.set(k,canonical_tag_id)}
export const resolveTag=s=>lookup.get(clean(s))||null;
export function normalizeTags(source,raw=[],{manualOverrides={}}={}){
const raw_tags=[...new Set((Array.isArray(raw)?raw:typeof raw==='string'?raw.split(/[,\s]+/):[])
.filter(v=>typeof v==='string').map(x=>x.trim()).filter(Boolean))].slice(0,80);
const ids=new Set(),tokens=new Set(),tag_confidence={};
for(const tag of raw_tags){const k=clean(tag),id=manualOverrides[k]||lookup.get(k);if(!k)continue;
tokens.add(k);
if(id){ids.add(id);tokens.add(id);tag_confidence[id]={kind:manualOverrides[k]?'manual':'dictionary_exact',value:manualOverrides[k]?1:0.99,from:tag}}
else tokens.add(source+':'+k)}
return {raw_tags,normalized_tag_ids:[...ids],search_tokens:[...tokens].slice(0,180),tag_confidence,tag_dictionary_version:TAG_DICTIONARY_VERSION}}
export function matchesTags(work,desired=[]){const tags=new Set(work.normalized_tag_ids||[]),tokens=new Set(work.search_tokens||[]);return (Array.isArray(desired)?desired:[desired]).filter(Boolean).every(t=>{const id=resolveTag(t),k=clean(t);return id?tags.has(id):tokens.has(k)||tokens.has(work.source+':'+k)})}
export const reindexWorkTags=(work,options={})=>({...work,...normalizeTags(work.source,work.raw_tags||work.tags||[],options)});
