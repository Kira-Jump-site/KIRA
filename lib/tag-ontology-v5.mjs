/** KIRA work-wide typed ontology; no machine-translated or guessed aliases.
 * Every source tag is retained, including every unknown tag.
 */
export const TAG_MODEL_VERSION='2026-10-18.7';
const DEFINITIONS=[
 ['type:cosplay','cosplay','コスプレ','角色扮演','cos正片','coser','cosplay_photo'],
 ['type:illustration','illustration','イラスト','插画','插畫','同人插画','绘画'],
 ['type:photography','photography','photo','写真','摄影','攝影'],
 ['ip:genshin_impact','genshin_impact','genshin-impact','Genshin Impact','原神','原神_(genshin_impact)'],
 ['ip:wuthering_waves','wuthering_waves','wuthering-waves','Wuthering Waves','鸣潮','鳴潮'],
 ['ip:honkai_star_rail','honkai_star_rail','honkai-star-rail','崩坏星穹铁道','崩壞星穹鐵道','崩鉄'],
 ['ip:blue_archive','blue_archive','blue-archive','ブルーアーカイブ','碧蓝档案','蔚藍檔案'],
 ['ip:azur_lane','azur_lane','azur-lane','アズールレーン','碧蓝航线','碧藍航線'],
 ['ip:vocaloid','vocaloid','VOCALOID','ボーカロイド','术力口'],
 ['ip:touhou_project','touhou','touhou_project','東方Project','东方project','東方プロジェクト'],
 ['ip:hololive','hololive','ホロライブ','holo live'],
 ['ip:arknights','arknights','明日方舟','アークナイツ'],
 ['ip:nikke','nikke','勝利の女神NIKKE','胜利女神nikke'],
 ['character:hatsune_miku','hatsune_miku','hatsune-miku','初音ミク','初音未来','初音未來'],
 ['character:furina','furina','芙宁娜','芙寧娜','フリーナ'],
 ['character:hu_tao','hu_tao','hu-tao','胡桃','フータオ'],
 ['character:keqing','keqing','刻晴','コクセイ'],
 ['character:nahida','nahida','纳西妲','納西妲','ナヒーダ'],
 ['character:raiden_shogun','raiden_shogun','raiden-shogun','雷电将军','雷電将軍','雷電将軍_(原神)'],
 ['character:kamisato_ayaka','kamisato_ayaka','神里绫华','神里綾華','神里綾華_(原神)'],
 ['character:reimu_hakurei','reimu_hakurei','reimu-hakurei','博麗霊夢','博丽灵梦'],
 ['character:marisa_kirisame','marisa_kirisame','霧雨魔理沙','雾雨魔理沙'],
 ['appearance:blue_hair','blue_hair','blue-hair','蓝发','藍髮','青髪'],
 ['appearance:white_hair','white_hair','white-hair','白发','白髮','白髪'],
 ['appearance:black_hair','black_hair','black-hair','黑发','黑髮','黒髪'],
 ['appearance:pink_hair','pink_hair','pink-hair','粉发','粉髮','ピンク髪'],
 ['appearance:silver_hair','silver_hair','silver-hair','银发','銀髮','銀髪'],
 ['appearance:long_hair','long_hair','long-hair','长发','長髮','ロングヘア'],
 ['appearance:twintails','twintails','双马尾','雙馬尾','ツインテール'],
 ['appearance:blue_eyes','blue_eyes','blue-eyes','蓝眼','藍眼','青い目'],
 ['appearance:red_eyes','red_eyes','red-eyes','红瞳','紅瞳','赤い目'],
 ['clothing:maid','maid','maid_uniform','maid-uniform','女仆装','女僕裝','メイド服'],
 ['clothing:school_uniform','school_uniform','school-uniform','校服','制服','学校制服'],
 ['clothing:kimono','kimono','和服','着物'],
 ['clothing:dress','dress','连衣裙','連衣裙','ドレス'],
 ['clothing:swimsuit','swimsuit','swimwear','泳装','泳裝','水着'],
 ['pose:sitting','sitting','坐姿','座る'],
 ['pose:standing','standing','站姿','立ち'],
 ['pose:looking_at_viewer','looking_at_viewer','looking-at-viewer','看向镜头','カメラ目線'],
 ['pose:peace_sign','peace_sign','peace-sign','剪刀手','ピースサイン'],
 ['scene:night','night','夜景','夜','夜間'],
 ['scene:sunset','sunset','日落','夕日','黄昏'],
 ['scene:flower_field','flower_field','flower-field','花海','お花畑'],
 ['scene:rain','rain','下雨','雨','雨天'],
 ['scene:beach','beach','海滩','海灘','ビーチ'],
 ['theme:anime','anime','アニメ','动漫','動漫'],
 ['theme:wallpaper','wallpaper','壁纸','壁紙'],
 ['theme:vtuber','vtuber','虚拟主播','虛擬主播','バーチャルYouTuber']
];
const clean=v=>String(v??'').normalize('NFKC').trim().toLowerCase().replace(/[\s-]+/g,'_');
const valid=v=>/^[\p{L}\p{N}_:.()]{1,120}$/u.test(v);
const aliases=new Map();
for(const [id,...names] of DEFINITIONS){for(const name of [id,...names]){
 const k=clean(name);const old=aliases.get(k);if(old&&old!==id)throw Error('ambiguous_alias:'+name);
 aliases.set(k,id);
}}
export const TAG_ALIASES=Object.freeze(DEFINITIONS.map(([id,...names])=>({id,aliases:names})));
export function canonicalTag(v,axis='unclassified'){
 const k=clean(v);if(!k||!valid(k))return null;
 const known=aliases.get(k);if(known)return known;
 const kind=({'copyright':'ip','series':'ip','ip':'ip','character':'character','artist':'artist','general':'general','meta':'meta','clothing':'clothing','appearance':'appearance','scene':'scene','pose':'pose','type':'type'})[axis]||'unclassified';
 return kind+':'+k;
}
const TEXT=x=>typeof x==='string'?x:typeof x==='object'&&x?(x.tag||x.name||x.tag_name||x.tagName||''):'';
function strings(v){if(Array.isArray(v))return v.flatMap(x=>{const t=TEXT(x);return typeof t==='string'?[t]:[]});
 if(typeof v==='string')return v.split(/[\s,，]+/);return []}
function associatedTagStrings(tags){
 // Pixiv explicitly supplies translated_name paired with name. This is evidence,
 // unlike a machine-inferred synonym. We retain the relationship per work.
 return Array.isArray(tags)?tags.flatMap(t=>t&&typeof t==='object'&&typeof t.name==='string'&&typeof t.translated_name==='string'&&t.translated_name.trim()?[[t.name.trim(),t.translated_name.trim()]]:[]):[];
}
function makeBuckets(work){
 const o=work.source_tag_groups||{};
 const out=[];
 for(const [axis,arr] of Object.entries(o))for(const raw of strings(arr))out.push({axis,raw});
 for(const val of strings(work.raw_tags||work.tags))out.push({axis:'unclassified',raw:val});
 for(const val of strings(work.tags_translated))out.push({axis:'unclassified',raw:val});
 for(const [original,translated] of associatedTagStrings(work.source_tags_structured||work.tags)){
  out.push({axis:'unclassified',raw:original});out.push({axis:'unclassified',raw:translated});
 }
 return out;
}
export function normalizeWorkTags(work,{manualAliasMap={}}={}){
 const pool=makeBuckets(work),items=new Map(),raw=new Set(),search=new Set();
 const override=new Map(Object.entries(manualAliasMap).map(([k,v])=>[clean(k),v]));
 const paired=new Map();
 for(const [original,translated] of associatedTagStrings(work.source_tags_structured||work.tags)){
  const a=clean(original),b=clean(translated);
  if(!valid(a)||!valid(b))continue;
  const id=aliases.get(a)||aliases.get(b)||'source:'+clean(work.source)+':'+a;
  if(paired.has(a)&&paired.get(a)!==id||paired.has(b)&&paired.get(b)!==id)continue;
  paired.set(a,id);paired.set(b,id);
 }
 for(const entry of pool){const label=TEXT(entry.raw).trim(),key=clean(label);if(!key||!valid(key))continue;
  raw.add(label);
  const knownId=aliases.get(key);
  let id=override.get(key)||knownId||paired.get(key)||canonicalTag(label,entry.axis);
  // Identical spelling from different sites is not enough proof of semantic identity.
  // Only curated aliases or an authoritative typed namespace may join globally.
  if(!knownId&&!paired.has(key)&&!override.has(key)&&entry.axis==='unclassified')id='source:'+clean(work.source)+':'+key;
  if(!knownId&&!paired.has(key)&&!override.has(key)&&entry.axis==='general')id='source:'+clean(work.source)+':general:'+key;
  if(!id)continue;
  if(!items.has(id))items.set(id,{id,axis:id.split(':')[0],raw_tags:[],evidence:override.has(key)?'manual':aliases.has(key)?'known_alias':'source_native',source:work.source});
  const record=items.get(id);if(!record.raw_tags.includes(label))record.raw_tags.push(label);
  search.add(key);search.add(id);
 }
 // Plain source tags are never globally mapped to artist names unless the source says they are artist tags.
 // A Pixiv name / translated_name pair is linked via explicit upstream evidence;
 // it can be searched in either language without claiming unreviewed global ontology.
 const sourceTranslations=[];
 for(const [original,translated] of associatedTagStrings(work.source_tags_structured||work.tags)){
  const a=clean(original),b=clean(translated);if(!valid(a)||!valid(b))continue;
  const same=aliases.get(a)||aliases.get(b);
  const id=same||'source:'+clean(work.source)+':'+a;
  items.set(id,items.get(id)||{id,axis:id.split(':')[0],raw_tags:[original,translated],evidence:same?'known_alias':'upstream_explicit_translation',source:work.source});
  sourceTranslations.push({original,translated,id,evidence:'pixiv_source_pair'});
  search.add(a);search.add(b);search.add(id);
 }
 return {raw_tags:[...raw],normalized_tag_ids:[...items.keys()],normalized_tags:[...items.values()],source_translations:sourceTranslations,search_tokens:[...search],tag_dictionary_version:TAG_MODEL_VERSION};
}
export function sourceTagged(work,desired){const normal=work.normalized_tag_ids?work:normalizeWorkTags(work);const ids=new Set(normal.normalized_tag_ids||[]);const tokens=new Set(normal.search_tokens||[]);
 return (Array.isArray(desired)?desired:[desired]).filter(Boolean).every(t=>{const v=canonicalTag(t);return ids.has(String(t))||(v&&ids.has(v))||tokens.has(clean(t))});}
