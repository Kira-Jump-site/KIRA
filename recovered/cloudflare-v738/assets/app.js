'use strict';
/* KIRA! JUMP V7.29 — retryable discovery pages, real community cursors and content identity. */
const $=id=>document.getElementById(id);
// Status belongs outside the image viewport; the image canvas stays uncluttered.
const kiraDetails=document.querySelector('.reader-details');
if(kiraDetails)kiraDetails.prepend($('mediaLoad'),$('mediaFail'),$('originalAlert'));
const EDGEONE_PRIMARY=location.hostname==='kira.casto.top'||location.hostname.endsWith('.edgeone.dev')||location.hostname.endsWith('.pages.dnsoe5.com');
const EDGE_ROUTE_KEY='kira.edge.route.v1';
let EDGE_ROUTE=EDGEONE_PRIMARY?'mainland':'global';
try{
 const cached=JSON.parse(sessionStorage.getItem(EDGE_ROUTE_KEY)||'null');
 if(cached&&['mainland','global'].includes(cached.route)&&Date.now()-Number(cached.at)<21600000)EDGE_ROUTE=cached.route;
}catch{}
const isMainlandRoute=()=>EDGEONE_PRIMARY&&EDGE_ROUTE==='mainland';
function updateRegionalUi(){
 const channelHome=document.querySelector('#sourceFilters [data-source="all"]');
 if(channelHome)channelHome.textContent=isMainlandRoute()?'✦ 国内线路优先推荐':'✦ 全球线路优先推荐';
}
function warmRegionalMediaOrigins(){
 const origins=isMainlandRoute()
  ? ['https://upload-bbs.miyoushe.com','https://i0.hdslb.com','https://i1.hdslb.com','https://i2.hdslb.com']
  : ['https://i.pixiv.re','https://cos.booru.nl','https://cdn.nekosia.cat','https://cdn.e-shuushuu.net'];
 for(const href of origins){
  if(document.head.querySelector('link[data-kira-origin="'+href+'"]'))continue;
  const dns=document.createElement('link');dns.rel='dns-prefetch';dns.href=href;dns.dataset.kiraOrigin=href;document.head.appendChild(dns);
  const pre=document.createElement('link');pre.rel='preconnect';pre.href=href;pre.crossOrigin='anonymous';pre.dataset.kiraOrigin=href;document.head.appendChild(pre);
 }
}
updateRegionalUi();warmRegionalMediaOrigins();
const edgeRegionReady=(async()=>{
 if(!EDGEONE_PRIMARY)return EDGE_ROUTE;
 try{
  const r=await fetch('/api/region',{cache:'no-store',signal:AbortSignal.timeout(1800)});
  const data=await r.json();
  if(r.ok&&data?.ok&&['mainland','global'].includes(data.route)){
   const changed=EDGE_ROUTE!==data.route;EDGE_ROUTE=data.route;
   sessionStorage.setItem(EDGE_ROUTE_KEY,JSON.stringify({route:EDGE_ROUTE,at:Date.now()}));
   if(changed){updateRegionalUi();warmRegionalMediaOrigins()}
  }
 }catch{}
 return EDGE_ROUTE;
})();
const ico=name=>`<svg aria-hidden="true"><use href="#ico-${name}"></use></svg>`;

/* KIRA! JUMP V6 — real Pixiv metadata snapshot; artwork remains owned by creators. */
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imageReferrerPolicy=url=>{try{return new URL(url).hostname==='cos.booru.nl'?'strict-origin-when-cross-origin':'no-referrer'}catch{return 'no-referrer'}};
const allowedImage=u=>{try{const v=new URL(u);return v.protocol==='https:'&&['i.pixiv.re','i.pixiv.nl','i.pixiv.cat','i.pximg.net','i-cf.pximg.net','i.pixiv.moe','cdn.donmai.us','konachan.net','konachan.com','safebooru.org','upload-bbs.miyoushe.com','th.wallhaven.cc','cdn.nekosia.cat','yande.re','files.yande.re','assets.yande.re','cos.booru.nl','cdn.e-shuushuu.net','i0.hdslb.com','i1.hdslb.com','i2.hdslb.com','static.zerochan.net','s1.zerochan.net','s2.zerochan.net','s3.zerochan.net'].includes(v.hostname)?v.href:null}catch{return null}};
/* These are ONLY explicit-user-request original CDN images. Never include them
 * in thumb/sample preloads, decoded warmImages or SW CacheStorage. */
function validatedOriginal(raw,source){
 try{
  if(typeof raw!=='string'||raw.length>2200)return null;
  const u=new URL(raw);
  if(u.protocol!=='https:'||u.username||u.password)return null;
  const path=u.pathname.toLowerCase();
  const image=/\.(?:jpg|jpeg|png|webp|avif)$/i.test(path)||/\.(?:jpg|jpeg|png|webp)(?:@\d+w_\d+h_\d+e_\d+c\.webp)$/i.test(path);
  if(!image)return null;
  if(source==='bilibili_opus')return ['i0.hdslb.com','i1.hdslb.com','i2.hdslb.com'].includes(u.hostname)&&/^\/bfs\/new_dyn\//.test(path)?u.href:null;
  if(source==='safedonmai')return u.hostname==='cdn.donmai.us'&&/^\/(?:original|data|sample)\//.test(path)?u.href:null;
  if(source==='pixiv_yuki')return ['i.pixiv.re','i.pixiv.cat','i.pixiv.nl','i.pximg.net','i-cf.pximg.net'].includes(u.hostname)?u.href:null;
  if(source==='e_shuushuu')return u.hostname==='cdn.e-shuushuu.net'&&/^\/(?:images|image)\//.test(path)?u.href:null;
  if(source==='cosbooru')return u.hostname==='cos.booru.nl'&&/\.(?:jpe?g|png|webp|avif)(?:$|\?)/i.test(u.href)&&!/^\/(?:posts|wiki_pages|users|login)(?:\/|$)/.test(path)?u.href:null;
  if(source==='zerochan')return ['static.zerochan.net','s1.zerochan.net','s2.zerochan.net','s3.zerochan.net'].includes(u.hostname)?u.href:null;
  if(source==='konachan')return ['konachan.net','konachan.com'].includes(u.hostname)&&
    /^\/(?:image|data|jpeg|images)\//.test(path)?u.href:null;
  if(source==='safebooru')return u.hostname==='safebooru.org'&&path.startsWith('/images/')?u.href:null;
  if(source==='wallhaven')return u.hostname==='w.wallhaven.cc'&&
    /^\/full\/[a-z0-9]{2}\/wallhaven-[a-z0-9]{5,7}\.(?:jpg|png)$/.test(path)?u.href:null;
  if(source==='nekosia')return u.hostname==='cdn.nekosia.cat'&&
    /^\/images\/[a-z-]+\/[a-f0-9]{24}\.(?:png|jpe?g|webp)$/.test(path)?u.href:null;
  if(source==='miyoushe_art'||source==='miyoushe_cos')
   return u.hostname==='upload-bbs.miyoushe.com'&&!u.searchParams.has('x-oss-process')?u.href:null;
  return null; // Pixiv metadata snapshot cannot prove original file extension/URL.
 }catch{return null}
}
const SOURCE_TAGS={miku:'初音未来',genshin:'原神',girl:'少女',discover:'Pixiv',original:'原创',touhou:'东方Project',bluearchive:'蔚蓝档案',arknights:'明日方舟',fantasy:'幻想',landscape:'风景',safebooru:'Safebooru',miyoushe_art:'米游社插画',miyoushe_cos:'米游社 COS',wallhaven:'Wallhaven 动漫壁纸',nekosia:'Nekosia 创作图集',pixiv_yuki:'Pixiv 画师补充',cosbooru:'Cosbooru COS',e_shuushuu:'E-Shuushuu 插画',safedonmai:'Safebooru · Danbooru 全年龄',zerochan:'Zerochan'};
const DENY_TAG=/^(?:loli|shota|underage|child|children|未成年|幼女|萝莉|正太)$/i;
const normalizeTag=t=>String(t||'').replace(/_/g,' ').trim().toLowerCase().replace(/\s+/g,' ');
const NOISE_TAG=/^(?:1girl|1boy|2girls|solo|multiple girls|long hair|short hair|smile|looking at viewer|blush|breasts|large breasts|dress|white background|simple background|official art|illustration|original|original character|girl|girls|anime|pixiv|absurdres|highres|rating safe|rating general|artist name|copyright|image|solo focus|colored eyes|(?:black|blue|red|green|aqua|pink|purple|brown|white|blonde|silver|grey|gray) (?:hair|eyes)|(?:short|long|medium) (?:hair|sleeves)|(?:black|white|pink|blue|red) (?:dress|shirt|skirt|pantyhose|thighhighs)|hair ornament|hair ribbon|sitting|standing|from side|full body|upper body|school uniform|swimsuit|bikini|cleavage|solo focus)$/i;
const meaningfulTags=w=>[...new Set((w.tags||[]).map(normalizeTag))].filter(t=>t.length>=3&&!NOISE_TAG.test(t)&&!COMMON_TAG.test(t)&&!DENY_TAG.test(t));
const verifiedSourceLink=u=>{try{const x=new URL(u);return x.protocol==='https:'&&['pixiv.net','www.pixiv.net','x.com','twitter.com','artstation.com','www.artstation.com','deviantart.com','www.deviantart.com','www.miyoushe.com','www.bilibili.com','m.bilibili.com','bilibili.com','t.bilibili.com'].includes(x.hostname)?x.href:null}catch{return null}};
const COMMON_TAG=/^(?:女の子|女孩子|girl|girls|オリジナル|原创|original|イラスト|illustration|pixiv|r[\s_-]*18(?:g)?)$/i;
function facet(w,tagSet){
  const has=re=>w.some(x=>re.test(x));
  const character=w.find(t=>/^(初音ミク|初音未来|Hatsune Miku|Miku Hatsune|刻晴|Keqing|甘雨|Ganyu|雷電将軍|Raiden Shogun|胡桃|Hu Tao|フリーナ|Furina|芙宁娜|ディシア|迪希雅|八重神子|Yae Miko|宵宮|旅行者|钟离|eula lawrence|eula|kamisato ayaka|nilou|nahida|noelle|amaya ako|ako amau)$/i.test(t))||
    (has(/初音|hatsune.miku/i)||tagSet.has('miku')?'初音未来':'角色未标注');
  const mood=has(/夜|night|夜景/i)?'夜景':has(/夏|水着|海|summer/i)?'夏日':has(/空|風景|景色|sky|landscape/i)?'风景':has(/魔法|ファンタジー|fantasy|魔女/i)?'幻想':has(/サイバー|cyber|近未来/i)?'赛博':has(/花|桜|樱|春/i)?'花季':'插画';
  const color=has(/青|蓝|蒼|蓝色|blue|cyan/i)?'蓝':has(/紫|violet|purple/i)?'紫':has(/桜|樱|粉|pink/i)?'粉':has(/赤|紅|红|red/i)?'红':has(/黄|金|gold|sun/i)?'金':has(/白|white|銀|银/i)?'白':has(/黒|黑|black/i)?'黑':'未分类';
  const kind=has(/オリジナル|原创|original/i)?'原创':'同人';
  return {character,mood,color,kind};
}
/* Named IPs only: derived from explicit source tags, not inferred from image pixels. */
const SERIES_INDEX=[
 ['genshin','原神',/^(?:原神|Genshin|Genshin Impact)$/i],
 ['vocaloid','VOCALOID',/^(?:VOCALOID|初音ミク|初音未来|Hatsune Miku|鏡音リン|鏡音レン|巡音ルカ|ボーカロイド)$/i],
 ['blue-archive','蔚蓝档案',/^(?:ブルーアーカイブ|Blue Archive|蔚蓝档案|碧蓝档案)$/i],
 ['arknights','明日方舟',/^(?:アークナイツ|Arknights|明日方舟)$/i],
 ['touhou','东方Project',/^(?:東方Project|東方|东方Project|Touhou Project)$/i],
 ['fate','Fate',/^(?:Fate\/Grand Order|FGO|Fate\/stay night)$/i]
];
function findSeries(tags){
 const matched=SERIES_INDEX.find(([, ,test])=>tags.some(t=>test.test(t.trim())||test.test(t.replace(/_/g,' ').trim())));
 return matched?{key:matched[0],label:matched[1]}:null;
}
function kiraStablePostNumber(raw){
 let h=2166136261;
 for(const c of String(raw)){h=Math.imul(h^c.charCodeAt(0),16777619)>>>0}
 return 1+(h%100000000);
}
function normalizeSnapshot(snapshot){
  if(!snapshot?.channels||typeof snapshot.channels!=='object')return [];
  const records=new Map();
  const order=[...new Set(['discover','miku','genshin','girl',...Object.keys(snapshot.channels)])];
  for(const group of order)for(const a of (Array.isArray(snapshot.channels[group])?snapshot.channels[group]:[])){
    const biliOpus=group==='bilibili_opus'||a?.source==='bilibili_opus';
    const biliCreator=group==='bilibili_creator'||a?.source==='bilibili_creator';
    const booru=group==='danbooru'||a?.source==='danbooru';
    const konachan=group==='konachan'||a?.source==='konachan';
    const yande=group==='yande'||a?.source==='yande';
    const safebooru=group==='safebooru'||a?.source==='safebooru';
    const safeDonmai=group==='safedonmai'||a?.source==='safedonmai';
    const zerochan=group==='zerochan'||a?.source==='zerochan';
    const wallhaven=group==='wallhaven'||a?.source==='wallhaven';
    const nekosia=group==='nekosia'||a?.source==='nekosia';
    const miyousheArt=group==='miyoushe_art'||a?.source==='miyoushe_art';
    const miyousheCos=group==='miyoushe_cos'||a?.source==='miyoushe_cos';
    const cosbooru=group==='cosbooru'||a?.source==='cosbooru';
    const pixivYuki=group==='pixiv_yuki'||a?.source==='pixiv_yuki';
    const eshu=group==='e_shuushuu'||a?.source==='e_shuushuu';
    const miyoushe=miyousheArt||miyousheCos;
    if(!a||miyousheArt||!Number.isSafeInteger(a.pid)||!Array.isArray(a.tags))continue;
    const tags=a.tags.filter(t=>typeof t==='string').map(t=>t.replace(/_/g,' ').slice(0,72));
    if(tags.some(t=>DENY_TAG.test(t)))continue;
    const card=allowedImage(a.thumbnail_url);
    // Existing D1 records may still hold the invalid API sample path.
    // Normalize before thumbnail/HD scheduling so broken requests never enter
    // the warmup queue. This changes no original/source URLs.
    const preview=cosbooru?(allowedImage(a.preview_url)||card):allowedImage(a.preview_url);
    if(!card||!preview)continue;
    const id=biliCreator?960000000000000+a.pid:biliOpus?970000000000000+a.pid*32+Number(a.page||0):zerochan?950000000000000+a.pid:safeDonmai?610000000000000+a.pid:booru?600000000000000+a.pid:konachan?700000000000000+a.pid:yande?800000000000000+a.pid:safebooru?900000000000000+a.pid:wallhaven?920000000000000+a.pid:eshu?930000000000000+a.pid:cosbooru?940000000000000+a.pid:nekosia?400000000000000+a.pid:miyoushe?(miyousheCos?510000000000000:500000000000000)+a.pid*16+Number(a.page||0):a.pid*1000+Number(a.page||0);
    if(!Number.isSafeInteger(id)||id<=0)continue;
    if(records.has(id)){records.get(id)._groups.add(group);continue;}
    const tagSet=new Set([group]),facets=facet(tags,tagSet),series=findSeries(tags);
    const source=biliCreator?'bilibili_creator':biliOpus?'bilibili_opus':eshu?'e_shuushuu':cosbooru?'cosbooru':pixivYuki?'pixiv_yuki':zerochan?'zerochan':safeDonmai?'safedonmai':booru?'danbooru':konachan?'konachan':yande?'yande':safebooru?'safebooru':wallhaven?'wallhaven':nekosia?'nekosia':miyousheCos?'miyoushe_cos':miyousheArt?'miyoushe_art':'pixiv';
    const originArtist=String(a.author||'').trim();
    const artistVerified=Boolean(originArtist&&a.artist_verified!==false&&!/^(?:未知|作者未|来源站点未|画师以来源页为准|unknown)/i.test(originArtist));
    const artist=originArtist||'作者未标注（查看来源页）';
    const artistCredit=artistVerified?'source-metadata':originArtist?'source-attributed-unverified':'missing';
    const originLink=verifiedSourceLink(a.source_url||'');
    const workTitle=String(a.title||'').trim().slice(0,140);
    const genericTitle=/^(?:(?:插画|KONACHAN|Konachan|Safebooru|Yande.re)\s*[·-]\s*)?(?:Konachan\s*)?#\d+$/i.test(workTitle)||!workTitle;
    const trustedSubject=facets.character!=='角色未标注'?facets.character:null;
    const identifiedTitle=[series?.label,trustedSubject].filter(Boolean).join(' · ');
    const title=genericTitle?(identifiedTitle?'标签：'+identifiedTitle+' · '+source+' #'+a.pid:'标题未收录 · '+source+' #'+a.pid):workTitle;
    records.set(id,{
      id,sourcePostId:String(a.source_post_id||a.pid),imageIndex:Number(a.page||0),contentKey:/^[a-f0-9]{32}$/i.test(String(a.md5||''))?'md5:'+a.md5.toLowerCase():null,pid:a.pid,title,titleOriginal:genericTitle?null:workTitle,titleIsPlaceholder:genericTitle,artist,artistVerified,artistCredit,originLink,uploader:String(a.uploader||'').slice(0,85),
      uploadDate:a.created_at||null,providerScore:Number(a.score)||0,providerFavorites:Number(a.fav_count)||0,
      imageWidth:Number(a.width)>0?Number(a.width):null,imageHeight:Number(a.height)>0?Number(a.height):null,
      tags,facets,character:facets.character,mood:facets.mood,color:/^(蓝|紫|粉|红|金|绿|黑|白|灰|暖)$/.test(a.dominant_tone||'')?a.dominant_tone:facets.color,
      dominantHex:/^#[a-fA-F0-9]{6}$/.test(a.dominant_hex||'')?a.dominant_hex:null,
       seriesKey:series?.key||null,seriesLabel:series?.label||null,
      artistKey:artistVerified?(Number.isSafeInteger(a.uid)&&a.uid>0?'pixiv:'+a.uid:'artist:'+normalizeTag(artist)):source+':unattributed:'+a.pid,
      kinds:[miyousheCos||cosbooru?'Cosplay':facets.kind],likes:null,series:0,ratio:Math.max(.62,Math.min(2.35,Number(a.height)/Math.max(1,Number(a.width))||1.3)),
      source,sourceName:biliCreator?'B站 · 画师公开图文':biliOpus?'B站 · 公开图文':eshu?'E-Shuushuu · 插画':cosbooru?'Cosbooru · COS':pixivYuki?'Pixiv · 补充索引':zerochan?'Zerochan':safeDonmai?'Safebooru · Danbooru 全年龄':booru?'Danbooru':konachan?'Konachan':yande?'Yande.re':safebooru?'Safebooru':wallhaven?'Wallhaven 动漫':nekosia?'Nekosia · 原创插画':miyousheCos?'米游社 · COS':miyousheArt?'米游社 · 同人插画':'Pixiv',
      desc:eshu?'E-Shuushuu 公开插画库：站点详情中的作者署名、作品标签和原始来源线索。署名尚未独立验证，版权归作者；本站仅浏览源站缩略与 large 预览，不加载原图。国内速度未验证，需主动进入海外实验源。':cosbooru?'Cosbooru 的公开 Cosplay 作品，可能包含成人分级内容。标签作者不代表已验证的摄影师或 Coser，原始发布链接请在源站核实；站点有 18 岁访问要求，需用户主动选择。本网站不托管图片。':pixivYuki?'Pixiv Yuki 的公开作品索引，作品仍属于 Pixiv 内容池。画师、标题和标签来自索引；图片通过浏览器直连公开 CDN，源站授权尚需核实。':nekosia?'来自 Nekosia 公开安全评级动漫图集；署名与作者作品来源由 API 提供。浏览器直接加载压缩图片，原尺寸仅在用户点击后请求。作品版权归原作者，作者授权仍需个别核实。':wallhaven?'Wallhaven 的公开 SFW 动漫壁纸元数据；Wallhaven 上传者不一定是原画师。只使用壁纸站官方缩略与中等预览，原始大图需前往来源页面。作品授权未逐张审核，仅限主动选择的实验频道浏览。':miyoushe?'米游社公开社区的用户投稿，发帖用户不一定是画师或摄影师。尚未完成原作者授权和逐张内容审核，仅供主动选择的实验频道浏览。图片由浏览器直接从米游社官方 CDN 加载缩略和预览。':'来自 '+(booru?'Danbooru':konachan?'Konachan':yande?'Yande.re':safebooru?'Safebooru':'Pixiv')+' 的作品索引。'+(originLink?'已找到来源发布线索，可到来源核对作者与作品。':'该图源未提供可核实的原始发布地址。')+' 图片不由 KIRA 托管，版权归原作者。',
      card,preview,originalDirect:validatedOriginal(a.original_url||a.file_url||a.originalUrl||a.full_url,source),pixivUrl:biliOpus?'https://www.bilibili.com/opus/'+String(a.source_post_id||a.pid):eshu?'https://e-shuushuu.net/images/'+a.pid:cosbooru?'https://cos.booru.nl/posts/'+a.pid:pixivYuki?'https://www.pixiv.net/artworks/'+a.pid:booru?'https://danbooru.donmai.us/posts/'+a.pid:konachan?'https://konachan.net/post/show/'+a.pid:yande?'https://yande.re/post/show/'+a.pid:safebooru?'https://safebooru.org/index.php?page=post&s=view&id='+a.pid:wallhaven?/^https:\/\/wallhaven\.cc\/w\/[a-z0-9]{5,7}$/.test(a.pixiv_url||'')?a.pixiv_url:'https://wallhaven.cc/':nekosia?verifiedSourceLink(a.pixiv_url)||'https://nekosia.cat/':miyoushe?verifiedSourceLink(a.pixiv_url)||'https://www.miyoushe.com/':'https://www.pixiv.net/artworks/'+a.pid,
      artistUrl:nekosia?verifiedSourceLink(a.author_profile):source==='pixiv'&&Number.isSafeInteger(a.uid)&&a.uid>0?'https://www.pixiv.net/users/'+a.uid:null,
      _groups:tagSet
    });
  }
  for(const w of records.values()){
    w.kind=['miyoushe_cos','cosbooru'].includes(w.source)?'Cosplay':w.facets.kind;
    w.tags=[...new Set([...w.tags, ...[...w._groups].map(x=>SOURCE_TAGS[x]||'Pixiv')])];
    delete w._groups;
  }
  return [...records.values()];
}
let WORKS=[];
let pixivSnapshotDate=null;
const userSyncBridge=import('/assets/user-sync.js').catch(()=>null);
const userAuthBridge=import('/assets/user-auth.js').catch(()=>null);
let accountAuthenticated=false,userSnapshotLoaded=false,accountUserId='';
const syncedFavoriteKeys=new Set();
const favoriteSyncKey=w=>w&&w.source&&w.sourcePostId!=null
 ? String(w.source)+':'+String(w.sourcePostId)+':'+String(Number.isSafeInteger(w.imageIndex)?w.imageIndex:0):'';
window.addEventListener('online',()=>void userSyncBridge.then(m=>m?.flushUserSync()));
setTimeout(()=>void userSyncBridge.then(m=>m?.flushUserSync()),3500);
function storedLikes(){try{const a=JSON.parse(localStorage.getItem('kira.likes.v2')||'[]');return Array.isArray(a)?a.filter(Number.isSafeInteger):[]}catch{return []}}
function storedFollows(){try{const a=JSON.parse(localStorage.getItem('kira.follows.v2')||'[]');return Array.isArray(a)?a.filter(x=>typeof x==='string'):[]}catch{return []}}

const SOURCE_PREF_KEY='kira.selected.source.v1';
const storedSource=(()=>{try{const v=localStorage.getItem(SOURCE_PREF_KEY)||'all';return /^(all|everything|[a-z_]{3,32})$/.test(v)&&v!=='cos_section'?v:'all'}catch{return 'all'}})();
const saveCurrentSource=()=>{try{localStorage.setItem(SOURCE_PREF_KEY,state.sourceFilter)}catch{}};
const SHOW_VIEWED_KEY='kira.feed.show-viewed.v1';
const storedShowViewed=(()=>{try{return localStorage.getItem(SHOW_VIEWED_KEY)==='true'}catch{return false}})();
const state={showViewed:storedShowViewed,sourceFilter:storedSource,renderedCount:0,refreshNonce:0,main:'推荐',route:'all',filter:'全部',search:'',shown:[],focus:null,anchor:null,relatedPath:'character',zoom:1,panX:0,panY:0,original:false,liked:new Set(storedLikes()),followed:new Set(storedFollows()),lastCard:null,moving:false};
const byId=id=>WORKS.find(w=>w.id===Number(id));
function applyUserSnapshot(snapshot){
 if(!snapshot?.ok)return;
 syncedFavoriteKeys.clear();
 for(const item of Array.isArray(snapshot.favorites)?snapshot.favorites:[]){
  const source=String(item?.source||''),post=String(item?.source_post_id||''),image=Number(item?.image_index||0);
  if(source&&post&&Number.isSafeInteger(image))syncedFavoriteKeys.add(source+':'+post+':'+image);
 }
 userSnapshotLoaded=true;
 for(const w of WORKS){
  const key=favoriteSyncKey(w);if(!key)continue;
  if(syncedFavoriteKeys.has(key))state.liked.add(w.id);else state.liked.delete(w.id);
 }
 const follows=new Set((Array.isArray(snapshot.follows)?snapshot.follows:[]).map(x=>String(x?.artist_key||'')).filter(Boolean));
 state.followed=follows;
 try{
  localStorage.setItem('kira.likes.v2',JSON.stringify([...state.liked]));
  localStorage.setItem('kira.follows.v2',JSON.stringify([...state.followed]));
 }catch{}
 if(state.focus)fillReader();
 if(['收藏','关注'].includes(state.main))draw();
}
function updateAccountUi(detail={}){
 const authed=detail?.authenticated===true;
 accountAuthenticated=authed;accountUserId=authed?String(detail?.user?.id||''):'';
 const button=$('accountButton'),status=$('accountStatus'),signin=$('accountSignIn'),signup=$('accountSignUp'),signout=$('accountSignOut'),sync=$('accountSync');
 button?.classList.toggle('synced',authed);
 if(button)button.textContent=authed?'✓':'K';
 if(status)status.textContent=authed
  ? '已登录 '+String(detail?.user?.email||'')+' · 收藏与关注会在设备间同步'
  : '本机收藏即时可用。登录后会在设备间同步收藏与关注。';
 if(signin)signin.hidden=authed;if(signup)signup.hidden=authed;if(signout)signout.hidden=!authed;if(sync)sync.hidden=!authed;
 if(authed){
  void (async()=>{
   const sync=await userSyncBridge;if(!sync)return;
   const bootstrapKey='kira.sync.bootstrap.'+accountUserId;
   let bootstrapped=false;try{bootstrapped=localStorage.getItem(bootstrapKey)==='1'}catch{}
   if(!bootstrapped){
    for(const w of WORKS)if(state.liked.has(w.id))sync.recordFavoriteMutation(w,true);
    for(const key of state.followed)sync.recordFollowMutation(key,true);
   }
   const pushed=await sync.flushUserSync();
   if(pushed?.ok&&!bootstrapped)try{localStorage.setItem(bootstrapKey,'1')}catch{}
   if(pushed?.ok){
    const auth=await userAuthBridge;
    await auth?.pullAccountSnapshot();
   }
  })();
 }
}
function applyUserDelta(event){
 const kind=String(event?.kind||''),payload=event?.payload||{};
 if(kind.startsWith('favorite.')){
  const key=String(payload.source||'')+':'+String(payload.source_post_id||'')+':'+String(Number(payload.image_index||0));
  if(kind==='favorite.add')syncedFavoriteKeys.add(key);else syncedFavoriteKeys.delete(key);
  for(const w of WORKS){if(favoriteSyncKey(w)===key){if(kind==='favorite.add')state.liked.add(w.id);else state.liked.delete(w.id)}}
 }else if(kind.startsWith('follow.')){
  const key=String(payload.artist_key||'');if(key){if(kind==='follow.add')state.followed.add(key);else state.followed.delete(key)}
 }
}
window.addEventListener('kira:user-snapshot',e=>applyUserSnapshot(e.detail));
window.addEventListener('kira:user-delta',e=>{
 for(const event of e.detail?.events||[])applyUserDelta(event);
 try{localStorage.setItem('kira.likes.v2',JSON.stringify([...state.liked]));localStorage.setItem('kira.follows.v2',JSON.stringify([...state.followed]))}catch{}
 if(state.focus)fillReader();if(['收藏','关注'].includes(state.main))draw();
});
window.addEventListener('kira:user-status',e=>updateAccountUi(e.detail));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&accountAuthenticated)void userAuthBridge.then(m=>m?.pullAccountDelta())});

function updateViewedToggle(){const b=$('floatViewed');if(!b)return;b.setAttribute('aria-pressed',String(state.showViewed));b.setAttribute('aria-label',state.showViewed?'已允许显示浏览过的作品，点击隐藏':'已隐藏浏览过的作品，点击显示');b.title=state.showViewed?'当前显示已浏览图片 · 点击隐藏':'当前不显示已浏览图片 · 点击显示';b.textContent=state.showViewed?'◉':'◌';b.classList.toggle('active',state.showViewed)}
$('floatViewed')?.addEventListener('click',()=>{state.showViewed=!state.showViewed;try{localStorage.setItem(SHOW_VIEWED_KEY,String(state.showViewed))}catch{}updateViewedToggle();state.refreshNonce++;draw()});
updateViewedToggle();
$('floatHome')?.addEventListener('click',()=>{if(state.focus)closeReader();refreshOnlyIds=null;state.sourceFilter='all';saveCurrentSource();state.main='推荐';state.route='all';state.filter='全部';state.search='';$('search').value='';draw();window.scrollTo({top:0,behavior:'smooth'})});
$('floatRefresh')?.addEventListener('click',()=>{saveCurrentSource();location.reload()});

const discoverySeed=Math.floor(Math.random()*2147483647);
const randomizedArtworkRanks=new Map();
function fullRandomOrder(list){
 // One unpredictable rank per work this page visit. New D1 pages never inherit
 // upstream ID/index ordering, and successive draws do not reshuffle the viewport.
 const rank=w=>{if(!randomizedArtworkRanks.has(w.id))randomizedArtworkRanks.set(w.id,crypto.getRandomValues(new Uint32Array(1))[0]);return randomizedArtworkRanks.get(w.id)};
 return list.slice().sort((a,b)=>rank(a)-rank(b)||a.id-b.id);
}
const viewHistory=(()=>{try{const a=JSON.parse(localStorage.getItem('kira.viewed.v1')||'[]');return Array.isArray(a)?a.filter(Number.isSafeInteger).slice(-6000):[]}catch{return []}})();
function markViewed(id){const i=viewHistory.indexOf(id);if(i>=0)viewHistory.splice(i,1);viewHistory.push(id);if(viewHistory.length>6000)viewHistory.shift();try{localStorage.setItem('kira.viewed.v1',JSON.stringify(viewHistory))}catch{}}
function mixKey(id,seed){let x=(id^Math.imul(seed||1,2654435761))>>>0;x^=x>>>16;x=Math.imul(x,2246822519)>>>0;return (x^(x>>>13))>>>0}
// Real discovery results are kept separate from the bundled legacy fallback.
// Static fixtures must never silently masquerade as newly fetched artwork.
const liveHotIds=new Set();
const liveFeedIds=new Set();
// Server-prepared D1 works are separate from this visit's live upstream discoveries.
const preparedFeedIds=new Set();
let allowSnapshotFallback=false,refreshOnlyIds=null,refreshInProgress=false;
const FEED_EXPOSURE_KEY='kira.feed.exposed.v1';
const exposedHistory=(()=>{
 try{const x=JSON.parse(localStorage.getItem(FEED_EXPOSURE_KEY)||'[]');
  return Array.isArray(x)?x.filter(Number.isSafeInteger).slice(-3000):[]}
 catch{return []}
})();
const exposedHistorySet=new Set(exposedHistory);
const exposedContent=(()=>{try{const x=JSON.parse(localStorage.getItem('kira.content.exposed.v1')||'[]');return Array.isArray(x)?x.filter(v=>/^md5:[a-f0-9]{32}$/.test(v)).slice(-6000):[]}catch{return []}})();
const exposedContentSet=new Set(exposedContent);
function contentWasExposed(work){return Boolean(work.contentKey&&exposedContentSet.has(work.contentKey))}
function uniqueContent(works){const seen=new Set();return works.filter(w=>{const key=w.contentKey||w.id;if(seen.has(key))return false;seen.add(key);return true})}
function rememberPresented(works){
 let changed=false;
 for(const w of works){
  if(w?.contentKey&&!exposedContentSet.has(w.contentKey)){exposedContent.push(w.contentKey);exposedContentSet.add(w.contentKey);changed=true}
  if(!Number.isSafeInteger(w?.id)||exposedHistorySet.has(w.id))continue;
  exposedHistory.push(w.id);exposedHistorySet.add(w.id);changed=true;
 }
 while(exposedHistory.length>3000)exposedHistorySet.delete(exposedHistory.shift());
 while(exposedContent.length>6000)exposedContentSet.delete(exposedContent.shift());
 if(changed)try{localStorage.setItem(FEED_EXPOSURE_KEY,JSON.stringify(exposedHistory));localStorage.setItem('kira.content.exposed.v1',JSON.stringify(exposedContent))}catch{}
}
/* Explicit, inspectable recommendation signals — no fake popularity or image-AI claims.
 * Favorite and followed work matter most, recent views are weak signals.
 * Resolution is original metadata, not a promise of preview display resolution.
 */
function userTaste(){
 const weights=new Map();
 const add=(key,weight)=>{if(key)weights.set(key,(weights.get(key)||0)+weight)};
 const recent=[...new Set(viewHistory.slice(-45).reverse())].map(byId).filter(Boolean);
 const liked=WORKS.filter(w=>state.liked.has(w.id));
 const visits=[...recent.slice(0,20).map((w,i)=>[w,Math.max(.25,1.5-i*.055)]),...liked.map(w=>[w,7])];
 for(const [w,weight] of visits){
  if(w.seriesKey)add('series:'+w.seriesKey,weight*2.4);
  if(w.artistVerified)add('artist:'+w.artistKey,weight*2.7);
  if(w.character!=='原创角色'&&w.character!=='角色未标注')add('character:'+normalizeTag(w.character),weight*1.2);
  meaningfulTags(w).slice(0,16).forEach(t=>add('tag:'+t,weight*.6));
 }
 for(const k of state.followed)add('artist:'+k,19);
 return weights;
}
/* Relevance policy: favor identifiable JP/CN anime/game works and original
 * illustration or character cosplay. Do not infer a person's ethnicity or
 * nationality from their face; use only explicit source and work tags.
 * A user-selected source/search still permits exploring other aesthetics.
 */
const ANIME_CULTURE_TAGS=/^(?:anime|manga|anime art|illustration|anime illustration|pixiv|vocaloid|hatsune miku|touhou|genshin impact|honkai star rail|honkai impact 3rd|zenless zone zero|blue archive|arknights|azur lane|fate grand order|fate stay night|project sekai|wuthering waves|punishing gray raven|nikke|reverse 1999|girls frontline|kantai collection|love live|hololive|nijisanji|bang dream|uma musume|princess connect|original character|同人|二次元|原神|崩坏|星穹铁道|绝区零|鸣潮|明日方舟|蔚蓝档案|碧蓝航线|初音未来|东方project|崩坏三|绘画|插画|同人作品)$/i;
const IRRELEVANT_CONTENT_TAGS=/^(?:meme|reaction image|screenshot|screen capture|text only|text focus|comic strip|comic|4k wallpaper pack|collage|advertisement|advertising|product photo|stock photo|logo|watermark only|western cartoon|american comic|marvel comics|dc comics|disney|pixar|realistic western fantasy|political poster|新闻|广告|表情包|截图|梗图|壁纸合集|商品图|营销|搬运合集)$/i;
function editorialRelevance(w){
 const tags=(w.tags||[]).map(normalizeTag);
 if(tags.some(t=>IRRELEVANT_CONTENT_TAGS.test(t)))return -300;
 let score=0;
 if(w.seriesKey)score+=95;
 if(tags.some(t=>ANIME_CULTURE_TAGS.test(t)))score+=48;
 if(w.source==='miyoushe_cos')score+=62;
 if(w.kind==='COS'||w.kind==='Cosplay'||tags.some(t=>/^(?:cosplay|coser|角色扮演|cosplay photography)$/.test(t)))score+=28;
 if(w.artistVerified)score+=12;
 if(w.originLink)score+=10;
 if(w.imageWidth>=1200&&w.imageHeight>=900)score+=10;
 return score;
}
function contentEligible(w){
 if(editorialRelevance(w)<0)return false;
 if(!w.card||!w.preview)return false;
 const width=w.imageWidth||0,height=w.imageHeight||0;
 if(width&&height&&width*height<360000)return false;
 return true;
}
function qualitySignal(w){
 const width=w.imageWidth||0,height=w.imageHeight||0,px=width*height;
 const dimensions=px>=8000000?44:px>=3500000?37:px>=1800000?30:px>=1000000?20:px>=600000?7:-25;
 const shape=width&&height?Math.max(width,height)/Math.min(width,height):5;
 const provider=Math.min(25,Math.log1p(Math.max(0,w.providerScore||0))*7);
 const evidence=(w.artistVerified?8:0)+(w.originLink?7:0)+(w.seriesKey?7:0);
 const tags=Math.min(13,meaningfulTags(w).length*.7);
 return dimensions+provider+evidence+tags-(shape>3?20:0);
}
function interestSignal(w,taste){
 let score=0;
 if(w.seriesKey)score+=Math.min(100,(taste.get('series:'+w.seriesKey)||0)*5);
 if(w.artistVerified)score+=Math.min(145,(taste.get('artist:'+w.artistKey)||0)*4);
 if(w.character!=='原创角色'&&w.character!=='角色未标注')score+=Math.min(80,(taste.get('character:'+normalizeTag(w.character))||0)*5);
 const tags=meaningfulTags(w).map(t=>taste.get('tag:'+t)||0).sort((a,b)=>b-a);
 score+=Math.min(125,tags.slice(0,5).reduce((a,b)=>a+b*4,0));
 return score;
}
function recommendedOrder(list,mode,seed){
 if(list.length<=1)return list;
 const taste=userTaste(),seen=new Set([...viewHistory,...exposedHistorySet,...list.filter(contentWasExposed).map(w=>w.id)]);
 const scored=list.map(w=>({w,score:qualitySignal(w)*(mode==='精选'?2.2:1)+
   editorialRelevance(w)*(mode==='精选'?1.1:1.4)+
   (mode==='精选'?0:interestSignal(w,taste)*1.35)+
   (seen.has(w.id)?(mode==='精选'?-6:-100):26)+
   (liveHotIds.has(w.id)?12:0)+
   (mixKey(w.id,seed)%2000)/500}));
 // Strict unseen-first partition: a static high-score card cannot crowd out
 // works already shown on a previous visit or refresh.
 scored.sort((a,b)=>Number(seen.has(a.w.id))-Number(seen.has(b.w.id))||b.score-a.score||a.w.id-b.w.id);
 // Break up repetitive artists/characters/series in the visible first-screen feed.
 // The diversity pass must only consider unseen cards until those are exhausted.
 const unseenCount=scored.filter(x=>!seen.has(x.w.id)).length;
 const head=scored.slice(0,Math.min(128,unseenCount||scored.length)),rest=scored.slice(head.length);
 const countArtists=new Map(),countSeries=new Map(),countCharacters=new Map(),countProviders=new Map(),out=[];
 while(head.length){
  let bestIndex=0,best=-Infinity;
  for(let i=0;i<head.length;i++){
   const x=head[i],w=x.w;
   const p=(w.artistVerified?(countArtists.get(w.artistKey)||0)*42:0)+
    (w.seriesKey?(countSeries.get(w.seriesKey)||0)*11:0)+
    (w.character!=='原创角色'&&w.character!=='角色未标注'?(countCharacters.get(w.character)||0)*9:0)+
    (countProviders.get(w.source)||0)*7+
    (out.slice(-2).filter(a=>a.source===w.source).length*13);
   const adjusted=x.score-p;
   if(adjusted>best){best=adjusted;bestIndex=i}
  }
  const w=head.splice(bestIndex,1)[0].w;out.push(w);
  countProviders.set(w.source,(countProviders.get(w.source)||0)+1);
  if(w.artistVerified)countArtists.set(w.artistKey,(countArtists.get(w.artistKey)||0)+1);
  if(w.seriesKey)countSeries.set(w.seriesKey,(countSeries.get(w.seriesKey)||0)+1);
  if(w.character!=='原创角色'&&w.character!=='角色未标注')countCharacters.set(w.character,(countCharacters.get(w.character)||0)+1);
 }
 return out.concat(rest.map(x=>x.w));
}
/* A source must actually appear among the first cards, not only somewhere in
 * the indexed feed. In normal recommendation, blend distinct qualified pools
 * every third card, preserving each provider's quality-ranked order.
 * Dedicated search, source filters and relation views do not use this.
 */
function blendProviderFirstScreen(sorted){
 if(sorted.length<8)return sorted;
 const pools=new Map();
 sorted.forEach(w=>{if(!pools.has(w.source))pools.set(w.source,[]);pools.get(w.source).push(w)});
 const eligible=[...pools.keys()].filter(x=>pools.get(x).length>=5);
 if(eligible.length<2)return sorted;
 const lead=sorted[0].source;
 const alternatives=eligible.filter(x=>x!==lead);
 let cursor=0;const out=[],used=new Set();
 const limit=Math.min(32,sorted.length);
 for(let i=0;i<limit;i++){
  let choice=null;
  if((i+1)%3===0&&alternatives.length){
   // Give the least represented alternate the next visible slot.
   const order=alternatives.slice().sort((a,b)=>
    out.filter(x=>x.source===a).length-out.filter(x=>x.source===b).length);
   for(let n=0;n<order.length;n++){
    choice=pools.get(order[(cursor+n)%order.length]).find(w=>!used.has(w.id));
    if(choice){cursor=(cursor+n+1)%order.length;break}
   }
  }
  if(!choice)choice=sorted.find(w=>!used.has(w.id));
  if(!choice)break;
  used.add(choice.id);out.push(choice);
 }
 return out.concat(sorted.filter(w=>!used.has(w.id)));
}
function recommendationReason(w){
 if(state.followed.has(w.artistKey)&&w.artistVerified)return '已关注的画师';
 const liked=WORKS.filter(a=>state.liked.has(a.id));
 if(w.seriesKey&&liked.some(a=>a.seriesKey===w.seriesKey))return '关联收藏 · '+(w.seriesLabel||w.seriesKey);
 if(w.artistVerified&&liked.some(a=>a.artistKey===w.artistKey))return '收藏画师的其他作品';
 const favoriteTags=new Set(liked.flatMap(meaningfulTags));
 const common=meaningfulTags(w).find(t=>favoriteTags.has(t));
 if(common)return '与收藏同标签 · '+common;
 if(qualitySignal(w)>=55)return '高分辨率作品 · '+Math.round((w.imageWidth||0)/100)/10+'K 宽';
 return w.seriesLabel?'系列 · '+w.seriesLabel:'站外公开作品索引';
}

const prefersReduced=window.matchMedia('(prefers-reduced-motion: reduce)');
const count=n=>typeof n==='number'?(n>=10000?(n/10000).toFixed(1)+'万':String(n)):'PIXIV';
let toastTimer;
function toast(msg){const node=$('toast');node.textContent=msg;node.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('show'),2200)}

function shared(a,b){const tags=new Set(meaningfulTags(a));return meaningfulTags(b).reduce((n,t)=>n+(tags.has(t)?1:0),0)}
function baseList(){
  let list=WORKS.slice();
  const liveChannel=['all','everything',...ALL_LIVE_PROVIDERS].includes(state.sourceFilter);
  if(liveChannel&&['推荐','换一批','精选'].includes(state.main)){
   // Fall back to the archived catalog only when every live source is unavailable.
   if(liveFeedIds.size||preparedFeedIds.size||!allowSnapshotFallback)
    list=list.filter(w=>liveFeedIds.has(w.id)||preparedFeedIds.has(w.id));
   if(state.main==='换一批'&&refreshOnlyIds)list=list.filter(w=>refreshOnlyIds.has(w.id));
   // Never fill the main screen with old cards when real unseen works exist.

  }
  // Explicit filters can inspect the full archive; the default discovery feed
  // must not surface known memes, unrelated comics or low-resolution records.
  if(state.sourceFilter==='all'&&['推荐','换一批','精选'].includes(state.main)&&!state.search)
   list=list.filter(contentEligible);
  // Multi-source homepage: use providers whose external previews have been
  // decoded in real Chromium, not a secret Konachan-only filter.
  // Slow Pixiv mirrors and user-submitted COS stay behind explicit filters.
  if(state.sourceFilter==='all'&&['推荐','换一批','精选'].includes(state.main))
   list=list.filter(w=>currentHomeFeedSources().has(w.source));
  const seed=byId(state.anchor)||WORKS[0];
  if(state.route!=='all'&&seed){
    list=list.filter(w=>w.id!==seed.id&&relationScore(seed,w,state.route)>0)
      .sort((a,b)=>relationScore(seed,b,state.route)-relationScore(seed,a,state.route));
  }


  if(!state.showViewed&&state.route==='all'&&['推荐','换一批','精选'].includes(state.main)){
   list=list.filter(w=>!exposedHistorySet.has(w.id)&&!viewHistory.includes(w.id)&&!contentWasExposed(w));
  }
  if(state.main==='关注')list=list.filter(w=>state.followed.has(w.artistKey));
  if(state.main==='收藏')list=list.filter(w=>state.liked.has(w.id));
  if(state.sourceFilter!=='all'&&state.sourceFilter!=='everything')list=list.filter(w=>w.source===state.sourceFilter);
  if(state.filter!=='全部')list=list.filter(w=>w.kind===state.filter||w.tags.includes(state.filter)||w.mood===state.filter);
  const q=state.search.trim().toLowerCase();
  if(q)list=list.filter(w=>remoteSearchIds?.has(w.id)||[w.title,w.artist,w.character,w.mood,w.color,...w.tags].join(' ').toLowerCase().includes(q));
  if(state.route==='all'&&['推荐','换一批','精选'].includes(state.main)){
   list=fullRandomOrder(list);
  }
  return ['all','everything'].includes(state.sourceFilter)?uniqueContent(list):list;
}


function card(w,i){
  return '<article class="art-card" style="--delay:'+Math.min(i,14)*26+'ms"><div class="art-cover-shell">'+
    '<button class="art-cover" data-view="'+w.id+'" aria-label="查看作品：'+esc(w.title)+'" style="--ratio:'+w.ratio+'">'+
    '<img src="'+esc(w.card)+'" data-card-art="'+w.id+'" referrerpolicy="'+imageReferrerPolicy(w.card)+'" alt="'+esc(w.title)+'" loading="'+(i<(w.source?.startsWith('miyoushe_')?2:(innerWidth>=1100?8:4))?'eager':'lazy')+'" decoding="async" fetchpriority="'+(i<(w.source?.startsWith('miyoushe_')?2:(innerWidth>=1100?8:4))?'high':'low')+'">'+
    '</button>'+
    '</div>'+
    '<div class="art-copy"><div class="art-title-row"><div class="art-name" title="'+esc(w.title)+'">'+esc(w.title)+'</div>'+
    '<span class="art-preview-state" role="status" aria-label="高清预览加载中" title="高清预览加载中"><span class="art-loading-ring" aria-hidden="true"></span><span class="art-ready-mark" aria-hidden="true">✓</span></span>'+
    '<button class="art-report" type="button" data-report="'+esc(w.source)+'" data-report-id="'+esc(w.sourcePostId||String(w.pid))+'" title="举报作品" aria-label="举报作品">⚑</button></div>'+
    '<div class="art-meta"><span class="mini-face" style="background:'+colorFor(w)+'">'+esc(w.artist.slice(0,1))+'</span>'+
    '<span class="art-author">'+esc(w.artist)+'</span></div>'+
    '<div class="art-reason">✧ '+esc(recommendationReason(w))+'</div>'+ 
    '<div class="art-tags"><span># '+esc(w.character)+'</span><span># '+esc(w.mood)+'</span></div></div></article>';
}

function colorFor(w){if(w.dominantHex)return w.dominantHex;return {蓝:'#6a91e9',紫:'#9876e9',粉:'#f879aa',金:'#e0a45f',红:'#eb7782',白:'#a9abd5',暖:'#d5a468'}[w.color]||'#7368b8'}

/* All indexed artwork remains in WORKS; only mount cards near the viewport. */
const FEED_BATCH=innerWidth>=1100?32:innerWidth<=650?18:26;
const FEED_PREFETCH_PX=innerWidth>=1100?4200:innerWidth<=650?1400:2600;
const FEED_NETWORK_COOLDOWN_MS=innerWidth>=1100?900:innerWidth<=650?2200:1400;
const FEED_RESERVE_TARGET=innerWidth>=1100?72:innerWidth<=650?30:48;
let pendingLive=false;
const activeLiveProviders=new Set();
let feedObserver=null;
let viewedObserver=null;
let lastAutoFetch=0;
const markVisibleOnce=new Set();
let nearPreviewObserver=null;
const previewTiming={lastOpenedMs:null,nearInstant:0,cold:0};
function hasDecodedPreview(w){return !!w?.preview&&decodedImageUrls.has(w.preview)&&warmImages.has(w.preview)}
function refreshReadyBadges(){
 const controls=$('artWall')?.querySelectorAll('.art-cover[data-view]')||[];
 for(const b of controls){
  const w=byId(b.dataset.view),ready=hasDecodedPreview(w);
  b.dataset.hdReady=ready?'true':'false';
  const indicator=b.closest('.art-card')?.querySelector('.art-preview-state');
  if(indicator){
   const failed=failedPreviewUrls.has(w?.preview),notAvailable=w?.source==='wallhaven';
   indicator.dataset.state=notAvailable||failed?'unavailable':ready?'ready':'loading';
   const label=notAvailable?'预览仅来源页提供':failed?'高清预览暂不可用':ready?'高清预览已缓存':'高清预览加载中';
   indicator.setAttribute('aria-label',label);
   indicator.title=label;
  }
 }
}
function observeApproachingArt(){
 if(!('IntersectionObserver' in window))return;
 if(!nearPreviewObserver){nearPreviewObserver=new IntersectionObserver(entries=>{
   for(const entry of entries){if(!entry.isIntersecting||state.focus||!preloadingAllowed())continue;
    const work=byId(entry.target.dataset.view);if(work)scheduleViewportPreviews();
   }
  },{rootMargin:(innerWidth>=1100?'1000px':'420px')+' 0px',threshold:0});}
 $('artWall').querySelectorAll('.art-cover[data-view]').forEach(c=>nearPreviewObserver.observe(c));
}

function trackVisibleCards(){
 if(!('IntersectionObserver' in window))return;
 if(!viewedObserver){viewedObserver=new IntersectionObserver(entries=>{
  for(const entry of entries){
   if(!entry.isIntersecting||entry.intersectionRatio<.55)continue;
   const id=Number(entry.target.dataset.view);
   if(!Number.isSafeInteger(id)||markVisibleOnce.has(id))continue;
   const node=entry.target;
   // If a thumbnail needs >650ms, do not permanently lose its seen/preload callback.
   const record=()=>{
    if(!node.isConnected||markVisibleOnce.has(id))return;
    const box=node.getBoundingClientRect(),im=node.querySelector('img');
    if(box.bottom<=0||box.top>=innerHeight||!im?.naturalWidth)return;
    markVisibleOnce.add(id);viewedObserver.unobserve(node);markViewed(id);
    if(!state.focus)scheduleViewportPreviews();
   };
   if(node.querySelector('img')?.naturalWidth)record();
   else node.querySelector('img')?.addEventListener('load',record,{once:true});
  }
 },{threshold:.55});}
 $('artWall').querySelectorAll('.art-cover[data-view]').forEach(x=>viewedObserver.observe(x));
}
function appendFeedBatch(){
 const list=state.shown,start=state.renderedCount||0;
 const batch=state.sourceFilter.startsWith('miyoushe_')?12:FEED_BATCH;
 const end=Math.min(list.length,start+batch);
 if(start>=end){$('feedMore').hidden=!['推荐','精选','换一批'].includes(state.main);return}
 const cols=[...$('artWall').querySelectorAll('.art-col')],heights=cols.map(col=>Number(col.dataset.h)||0),chunks=cols.map(()=>[]);
 if(!cols.length)return;
 list.slice(start,end).forEach((w,i)=>{const n=heights.indexOf(Math.min(...heights));chunks[n].push(card(w,start+i));heights[n]+=w.ratio+.32});
 cols.forEach((col,i)=>{col.insertAdjacentHTML('beforeend',chunks[i].join(''));col.dataset.h=String(heights[i])});
 state.renderedCount=end;$('feedMore').hidden=false;
 rememberPresented(list.slice(start,Math.min(end,start+batch)));
 trackVisibleCards();observeApproachingArt();refreshReadyBadges();
 if(previewMode!=='off')scheduleViewportPreviews();
 scheduleFeedReserveWarmup(160);
 // The sentinel is a spinner and intersection target, not a manual 'external source' button.
}
$('artWall').addEventListener('pointerover',e=>{
 const b=e.target.closest('.art-cover[data-view]');if(!b||state.focus)return;
 const w=byId(b.dataset.view);if(w)queuePreview(w,100);
},{passive:true});
$('artWall').addEventListener('focusin',e=>{
 const b=e.target.closest('.art-cover[data-view]');if(b&&!state.focus){const w=byId(b.dataset.view);if(w&&isArtworkOnScreen(b))queuePreview(w,160)}
});
$('artWall').addEventListener('touchstart',e=>{
 const b=e.target.closest('.art-cover[data-view]');if(b&&!state.focus){const w=byId(b.dataset.view);if(w&&isArtworkOnScreen(b))queuePreview(w,160)}
},{passive:true});
$('artWall').addEventListener('error',e=>{
 const img=e.target.closest('img[data-card-art]');if(!img)return;
 const w=byId(img.dataset.cardArt);if(!w)return;
 const step=img.dataset.fallback||'primary';
 // First retry the original thumbnail with the alternate Referer policy.
 // A successfully opened URL must not be replaced by a guessed CDN variant.
 if(step==='primary'&&w.source==='cosbooru'){
  img.dataset.fallback='cos-referrer';
  img.referrerPolicy=img.referrerPolicy==='no-referrer'?'strict-origin-when-cross-origin':'no-referrer';
  img.removeAttribute('src');img.src=w.card;return;
 }
 // Cosbooru serves separate 180px and sample derivatives. Try the public
 // sample if the thumbnail fails; never silently download an original file.
 if(step==='cos-referrer'&&w.source==='cosbooru'&&w.preview&&w.preview!==w.card&&allowedImage(w.preview)){
  img.dataset.fallback='cos-sample';img.src=w.preview;return;
 }
 // Final attempt: tightly validated preview derivative, never the original image.
 if((step==='cos-sample'||(step==='cos-referrer'&&w.preview===w.card))&&w.source==='cosbooru'){
  try{const u=new URL(w.preview||w.card);
   if(u.hostname==='cos.booru.nl'&&/^\/data\/(?:180x180|360x360|720x720|sample)\//.test(u.pathname)){
    const rescue=cosbooruRescueUrl(u.href);if(rescue){img.dataset.fallback='cos-rescue';img.src=rescue;return;}
   }
  }catch{}
 }
 if(step==='primary'&&w.source==='safebooru'){
  try{const u=new URL(w.card);if(u.hostname==='safebooru.org'&&u.pathname.endsWith('.png')){
   u.pathname=u.pathname.replace(/\.png$/i,'.jpg');img.dataset.fallback='jpeg';img.src=u.href;return;
  }}catch{}
 }
 // Public Miyoushe CDN sometimes stalls at 550px; try smaller metadata-only
 // thumbnail variants. Do not fall back to original-sized image bytes.
 if((step==='primary'||step==='miyo-small')&&w.source?.startsWith('miyoushe_')){
  try{
   const u=new URL(w.card);
   if(u.protocol==='https:'&&u.hostname==='upload-bbs.miyoushe.com'&&
      u.searchParams.get('x-oss-process')==='image/resize,w_550'){
    u.searchParams.set('x-oss-process',step==='primary'?'image/resize,w_360':'image/resize,w_240');
    img.dataset.fallback=step==='primary'?'miyo-small':'miyo-tiny';
    img.src=u.href;return;
   }
  }catch{}
 }
 if(step==='primary'&&w.source==='pixiv'){img.dataset.fallback='mirror';img.src=mirrorUrl(w.card,1)||w.preview;return}
 if(step==='mirror'){img.dataset.fallback='preview';img.src=w.preview;return}
 if(step==='preview'&&w.source==='pixiv'){img.dataset.fallback='preview-mirror';img.src=mirrorUrl(w.preview,1)||w.preview;return}
 img.style.opacity='.12';img.alt='外部图片源暂时失效';
 img.closest('.art-cover')?.classList.add('art-cover-failed');
 if(w.source==='cosbooru'){
  const container=img.closest('.art-cover-shell');
  if(container&&!container.querySelector('.cos-source-fallback')&&/^https:\/\/cos\.booru\.nl\/posts\/\d+$/.test(w.pixivUrl||'')){
   const link=document.createElement('a');
   link.className='cos-source-fallback';link.href=w.pixivUrl;
   link.target='_blank';link.rel='noopener noreferrer';
   link.textContent='图片直连失败 · 到 Cosbooru 查看 ↗';
   container.append(link);
  }
 }
},true);
let prefetchFeedIdentity='';
function draw(){
  const identity=[state.main,state.sourceFilter,state.route,state.filter,state.search].join('|');
  if(prefetchFeedIdentity!==identity){
   prefetchFeedIdentity=identity;
   if(!state.focus)preemptBackgroundExcept(null);
  }
  const list=baseList();state.shown=list;
  $('feedCount').textContent='· '+list.length+' 张作品'+(state.main==='换一批'?' · 新获取的作品':'');
  const likedCount=state.liked.size,followedCount=state.followed.size;
  $('feedReason').textContent=state.route!=='all'?'当前关联：'+({character:'角色与非通用标签',series:'同作品系列',artist:'已确认的同画师',color:'同色标签／真实色值',mood:'相同氛围标签'}[state.route]||'作品标签'):
   state.main==='精选'?'精选依据：分辨率、图源评分、出处完整度与多样性；不是虚构热度':
   '推荐依据：'+(likedCount||followedCount?(accountAuthenticated?'账号 ':'本机 ')+likedCount+' 项收藏、'+followedCount+' 位关注画师':'作品系列、清晰度与有效标签')+' · 收藏状态只用于你的推荐；如已收藏，下一批会按系列向图源发送单个兴趣标签';
  const seed=byId(state.anchor)||WORKS[0];
  const names={all:'全部发现',character:'角色同频',color:'色彩共振',mood:'氛围感应'};
  $('feedTitle').textContent=state.main==='推荐'?(state.route==='all'?(state.sourceFilter==='safebooru'?'Safebooru · 动漫美少女发现':state.sourceFilter==='bilibili_opus'?'B站图文 · 数据库作品':state.sourceFilter==='miyoushe_cos'?'米游社 · Cosplay 摄影（实验）':state.sourceFilter==='wallhaven'?'Wallhaven · SFW 动漫壁纸（实验）':state.sourceFilter==='everything'?'全部图源 · 实时发现':state.sourceFilter==='pixiv_yuki'?'Pixiv · 补充发现（实验）':'多源精选 · Konachan / Safebooru'):names[state.route]+' · '+(seed?state.route==='character'?seed.character:state.route==='color'?seed.color:seed.mood:'')) :state.main==='精选'?'从标签中发现':state.main==='换一批'?'新发现 · 实时作品':state.main==='关注'?'已关注的画师':state.main==='收藏'?'我收藏的作品':'多图源插画发现';
  const columns=window.innerWidth<=650?2:window.innerWidth<=850?3:4;
  state.renderedCount=0;
  viewedObserver?.disconnect();
  $('artWall').innerHTML=list.length?Array.from({length:columns},()=>'<div class="art-col" data-h="0"></div>').join('')
   :'<div class="empty-feed"><strong>'+(!WORKS.length?'正在连接作品流…':'这里还没有对应作品 ✳')+'</strong>'+(state.main==='收藏'?'在作品详情点击收藏，就会保存到这里。':'试试其他标签、图源或继续发现。')+'</div>';
  appendFeedBatch();
  document.querySelectorAll('[data-route]').forEach(b=>b.classList.toggle('on',b.dataset.route===state.route));
  document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('on',b.dataset.filter===state.filter));
  document.querySelectorAll('[data-source]').forEach(b=>b.classList.toggle('on',b.dataset.source===state.sourceFilter));
  $('sourceDanbooru').hidden=!WORKS.some(w=>w.source==='danbooru');
  $('sourceKonachan').hidden=false;
  $('sourceSafebooru').hidden=false;
  $('sourceMiyousheCos').hidden=false;
  $('sourceWallhaven').hidden=false;
  $('sourceYande').hidden=!WORKS.some(w=>w.source==='yande');
  document.querySelectorAll('[data-main]').forEach(b=>b.classList.toggle('active',b.dataset.main===state.main));
  $('upload').classList.toggle('active',state.main==='收藏');
  document.querySelectorAll('[data-mobile]').forEach(b=>b.classList.toggle('on',b.dataset.mobile===(state.main==='精选'?'rank':state.main==='关注'?'follow':state.main==='收藏'?'upload':'home')));
  renderRanks();
  if(!feedObserver&&'IntersectionObserver' in window){feedObserver=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)&&!state.focus)void loadNextGalleryBatch();
  },{rootMargin:FEED_PREFETCH_PX+'px 0px',threshold:0});feedObserver.observe($('feedMore'));}
}
function renderRanks(){
  const rankItems=state.shown;
  $('miniRank').innerHTML=rankItems.slice(0,4).map((w,i)=>'<button class="rank-item" data-rank="'+w.id+'"><span class="rank-no '+(i<3?'top':'')+'">'+(i+1)+'</span><img src="'+esc(w.card)+'" referrerpolicy="no-referrer" loading="lazy" alt=""><span><strong>'+esc(w.title)+'</strong><small>↗ '+esc(w.artist)+'</small></span></button>').join('')||'<p class="reader-related-count">该分区目前暂无可靠作品</p>';
}

function setRoute(route){state.route=route;state.main='推荐';state.filter='全部';state.search='';$('search').value='';draw();toast({all:'重新连接全部频道 ✦',character:'角色同频频道已连接 ⚡',color:'色彩共振频道已连接 ✦',mood:'氛围感应频道已连接 ✧'}[route]||'频道已切换')}
function setMain(main){
 if(main==='换一批'){refreshFeed();return}
 refreshOnlyIds=null;
 state.main=main;state.route='all';state.filter='全部';state.search='';$('search').value='';
 if(main==='收藏'||main==='关注')state.sourceFilter='all';
 draw();window.scrollTo({top:0,behavior:'smooth'});
 if(main==='换一批')loadLiveArtwork({force:true});
}
function pickNew(){
 const channelWorks=state.shown;
 const available=channelWorks.filter(w=>w.id!==state.focus?.id);
 const unseen=available.filter(w=>!viewHistory.includes(w.id));
 if(!unseen.length){toast('已浏览当前作品，正在向外部图源发现新作品');loadLiveArtwork({force:true});return}
 const chosen=unseen[Math.floor(Math.random()*unseen.length)];
 openReader(chosen.id,null);
 if(unseen.length<20)loadLiveArtwork({force:true});
}
function motionClone(fromEl,toEl,reverse=false){if(prefersReduced.matches||!fromEl||!toEl)return;const a=fromEl.getBoundingClientRect();const b=toEl.getBoundingClientRect();if(!a.width||!a.height||!b.width||!b.height)return;const clone=document.createElement('img');clone.src=fromEl.currentSrc||fromEl.src;clone.alt='';clone.style.cssText='position:fixed;z-index:125;object-fit:cover;pointer-events:none;box-shadow:0 25px 70px #08061770;will-change:top,left,width,height,border-radius;';document.body.append(clone);const first=reverse?b:a,last=reverse?a:b;const style=(r,rad)=>({top:r.top+'px',left:r.left+'px',width:r.width+'px',height:r.height+'px',borderRadius:rad});const anim=clone.animate([style(first,'12px'),style(last,'5px')],{duration:380,easing:'cubic-bezier(.2,.76,.17,1)',fill:'both'});anim.finished.catch(()=>{}).finally(()=>clone.remove())}

/* V7 image loading coordinator. An old async response must never overwrite a newer work. */
let mediaSequence=0;
let originalController=null;
let originalOpenCount=0;

let mediaPreloadSequence=0;
let foregroundController=null,foregroundSourceUrl=null;
const warmImages=new Map();
const decodedImageUrls=new Set();
// External HD failures are remembered only within this browser session, never uploaded.
const failedPreviewUrls=new Set();
const failedPreviewAt=new Map();
const HD_RETRY_COOLDOWN_MS=120000;
const failedBackgroundPreviewAt=new Map();
const previewRetryAllowed=url=>!failedPreviewUrls.has(url)||Date.now()-(failedPreviewAt.get(url)||0)>=HD_RETRY_COOLDOWN_MS;
/* Preview prefetch is visitor-browser only, never Worker or ImgBed image-byte traffic.
 * The Service Worker caches completed HTTPS preview responses; this pool reuses
 * decoded Image instances for immediate reader navigation in the same session.
 */
const CACHE_PREF_KEY='kira.previews.mode.v2';
const VALID_PRELOAD=new Set(['off','near','more','page']);
let previewMode=(()=>{
 try{
  const saved=localStorage.getItem(CACHE_PREF_KEY),previous=localStorage.getItem('kira.previews.mode.v1');
  if(VALID_PRELOAD.has(saved))return saved;
  return previous==='off'?'off':'page'; // upgrade old ineffective default to a visible-screen warmup
 }catch{return 'page'}
})();
const previewQueue=[],previewQueued=new Set();
const backgroundControllers=new Map();
const inFlightImages=new Map();
let foregroundPreviewLoads=0;
let previewActive=0,previewCounter=0,previewFailed=0,previewReused=0,previewSwHits=0;
let lastViewportPrefetch=0,previewCacheReady=false,preloadWorkerWaitUntil=Date.now()+2000;
let viewportPreviewTimer=null;
const visiblePreviewUrls=new Set();
function isArtworkOnScreen(node,margin=150){const r=node?.getBoundingClientRect();return !!r&&r.bottom>=-margin&&r.top<=innerHeight+margin}
function prioritizeVisiblePreviews(){
 if(state.focus||!preloadingAllowed())return;
 const visible=[],nearby=[],warmMargin=innerWidth>=1100?1000:innerWidth<=650?280:600;
 for(const node of $('artWall').querySelectorAll('.art-cover[data-view]')){
  const work=byId(node.dataset.view),thumbnail=node.querySelector('img');
  if(!work?.preview||!thumbnail?.naturalWidth)continue; // thumbnails always win bandwidth
  if(isArtworkOnScreen(node,110))visible.push(work);
  else if(isArtworkOnScreen(node,warmMargin))nearby.push(work);
 }
 const visibleMax=innerWidth<=650?5:8,nearMax=innerWidth<=650?2:innerWidth>=1100?8:4;
 const eligible=[...visible.slice(0,visibleMax),...nearby.slice(0,nearMax)];
 visiblePreviewUrls.clear();eligible.forEach(w=>visiblePreviewUrls.add(w.preview));
 // Keep only the current and next-screen warm set. Fast desktop scrolling no
 // longer aborts the very previews that the approaching-card observer queued.
 for(let i=previewQueue.length-1;i>=0;i--){if(!visiblePreviewUrls.has(previewQueue[i].url)){previewQueued.delete(previewQueue[i].url);previewQueue.splice(i,1)}}
 for(const [url,controller] of backgroundControllers){if(!visiblePreviewUrls.has(url)){controller.abort();backgroundControllers.delete(url)}}
 visible.slice(0,visibleMax).forEach((w,i)=>queuePreview(w,150-i));
 nearby.slice(0,nearMax).forEach((w,i)=>queuePreview(w,75-i));
 pumpPreviewQueue();updateCacheStatus();
}
function scheduleViewportPreviews(){if(viewportPreviewTimer)clearTimeout(viewportPreviewTimer);viewportPreviewTimer=setTimeout(()=>{viewportPreviewTimer=null;prioritizeVisiblePreviews()},95)}
window.addEventListener('scroll',scheduleViewportPreviews,{passive:true});
window.addEventListener('resize',scheduleViewportPreviews,{passive:true});
const networkInfo=()=>navigator.connection||navigator.mozConnection||navigator.webkitConnection;
const isConstrained=()=>{const c=networkInfo();return c?.saveData||['slow-2g','2g'].includes(c?.effectiveType)};
function preloadingAllowed(){
 return previewMode!=='off'&&document.visibilityState!=='hidden'&&!isConstrained();
}
function prefetchConcurrency(){
 const c=networkInfo(),mobile=innerWidth<=650,lowMemory=Number(navigator.deviceMemory)||4;
 return c?.effectiveType==='3g'||lowMemory<=2?1:mobile?1:innerWidth>=1100?3:2;
}
function previewBatchSize(){
 if(previewMode==='off')return 0;
 const mobile=innerWidth<=650,lowMemory=(Number(navigator.deviceMemory)||4)<=2;
 if(previewMode==='near')return mobile?2:4;
 if(previewMode==='more')return mobile?4:6;
 return lowMemory?2:mobile?3:5; // Prefer only the currently visible artwork.
}
function updateCacheStatus(msg=''){
 const status=msg||(previewMode==='off'?'已关闭本机高清预载':
   isConstrained()?'省流量/低速模式：已暂停预载':
   '本机预览已就绪 '+previewCounter+' 张 · 内存复用 '+previewReused+' 次 · 磁盘命中 '+previewSwHits+' 次'+
   (previewFailed?' · 失败 '+previewFailed:'')+
   (previewActive||previewQueue.length?' · 进行中 '+(previewActive+previewQueue.length):''));
 if($('cacheStatus'))$('cacheStatus').textContent=status;
 const progress=$('preloadProgress');
 if(progress)progress.textContent='高清预览缓存 · '+(previewMode==='page'?'当前屏优先':previewMode==='more'?'邻近多张':previewMode==='near'?'前后各 1 张':'关闭')+
  ' · '+previewCounter+' 张完成 · 磁盘命中 '+previewSwHits+' 次'+(previewActive||previewQueue.length?' · '+(previewActive+previewQueue.length)+' 张准备中':'')+
  (previewFailed?' · '+previewFailed+' 张失败':'')+
  ' · 仅保存在你的浏览器，不占本站图床';
 const button=$('preloadPage');
 if(button)button.disabled=previewMode==='off'||isConstrained();
}
function queuePreview(w,priority=0){
 if(!w?.preview||!preloadingAllowed())return false;
 // Public Miyoushe photo CDN has slower overseas behavior under a burst of
 // 550px cards plus 1000px previews. Warm only explicit reader-neighbors
 // or user-requested previews; don't compete with first-paint thumbnails.
 if(w.source?.startsWith('miyoushe_')&&priority<70&&!state.sourceFilter.startsWith('miyoushe_'))return false;
 // Wallhaven `thumbs.original` decoded at only 300px in 6/6 browser samples.
 // Never count this experimental wallpaper index as an HD preload.
 if(w.source==='wallhaven')return false;
 const url=w.preview;
 if(!previewRetryAllowed(url)||Date.now()-(failedBackgroundPreviewAt.get(url)||0)<HD_RETRY_COOLDOWN_MS)return false;
 if(previewQueued.has(url)){
  const at=previewQueue.findIndex(t=>t.url===url);
  if(at>=0&&priority>previewQueue[at].priority){const [task]=previewQueue.splice(at,1);task.priority=priority;previewQueue.unshift(task)}
  return false;
 }
 if(warmImages.has(url))return false;
 if(!allowedImage(url))return false;
 if(previewQueue.length>=(innerWidth>=1100?32:18)){
  // Drop oldest background task, never leave stale URLs in the duplicate-filter Set.
  const dropped=previewQueue.pop();
  if(dropped)previewQueued.delete(dropped.url);
 }
 const task={url,priority,at:Date.now()};
 if(priority>=80)previewQueue.unshift(task);else if(priority>=60){
  const firstLower=previewQueue.findIndex(t=>t.priority<priority);
  if(firstLower<0)previewQueue.push(task);else previewQueue.splice(firstLower,0,task);
 }else previewQueue.push(task);
 previewQueued.add(url);
 pumpPreviewQueue();
 return true;
}
function pumpPreviewQueue(){
 if(!preloadingAllowed()||foregroundPreviewLoads>0)return;
 // Register worker immediately, then give it a chance to claim this page before
 // downloading the initial screen's previews. Never wait indefinitely if blocked.
 if(!previewCacheReady&&Date.now()<preloadWorkerWaitUntil)return;
 while(previewActive<prefetchConcurrency()&&previewQueue.length){
  const task=previewQueue.shift();
  previewQueued.delete(task.url);
  if(!state.focus&&!visiblePreviewUrls.has(task.url)&&task.priority<160)continue;
  if(warmImages.has(task.url))continue;
  previewActive++;
  const controller=new AbortController();
  backgroundControllers.set(task.url,controller);
  pictureRequest(task.url,12500,false,'low',controller.signal).then(()=>{
   failedBackgroundPreviewAt.delete(task.url);
   previewCounter++;refreshReadyBadges();
  }).catch(e=>{if(e.message!=='preempted'&&e.name!=='AbortError'&&!controller.signal.aborted){
   previewFailed++;failedBackgroundPreviewAt.set(task.url,Date.now());
   if(failedBackgroundPreviewAt.size>700)failedBackgroundPreviewAt.delete(failedBackgroundPreviewAt.keys().next().value);
  }}).finally(()=>{
   if(backgroundControllers.get(task.url)===controller)backgroundControllers.delete(task.url);
   previewActive--;updateCacheStatus();pumpPreviewQueue();
  });
 }
 updateCacheStatus();
}
function scheduleAdjacentPreviews(index,list,fromFeed=false){
 if(!preloadingAllowed()||!Array.isArray(list)||!list.length||index<0)return;
 if(fromFeed&&Date.now()-lastViewportPrefetch<550)return;
 if(fromFeed)lastViewportPrefetch=Date.now();
 const limit=previewMode==='page'?2:previewMode==='more'?2:1;
 const indexes=[index];
 for(let i=1;i<=limit;i++){indexes.push(index+i,index-i)}
 for(const i of indexes){if(i>=0&&i<list.length)queuePreview(list[i],fromFeed?55:110)}
 updateCacheStatus();
}
/* Select a mixed-source warmup by a PER-PROVIDER budget.
 * Previous logic truncated the entire homepage to three HD previews as soon as
 * just one slower Miyoushe item appeared in the first twelve cards. This was
 * the root cause of the "no apparent preloading" experience in a mixed feed.
 */
function selectPreviewCandidates(list,start,end,manual=false){
 if(!Array.isArray(list)||end<=start)return [];
 const explicitSlow=state.sourceFilter.startsWith('miyoushe_');
 const limit=Math.min(manual?24:previewBatchSize(),end-start);
 const slowCap=explicitSlow?(manual?8:4):(manual?3:1);
 const out=[];let slow=0;
 for(let i=start;i<end&&out.length<limit;i++){
  const w=list[i];
  if(!w?.preview||!allowedImage(w.preview)||!previewRetryAllowed(w.preview)||w.source==='wallhaven')continue; // 300px Wallhaven index is not HD
  if(w.source?.startsWith('miyoushe_')&&++slow>slowCap)continue;
  out.push(w);
 }
 return out;
}
function preloadCurrentFeed(start=0,manual=false){
 if(!preloadingAllowed()||state.focus)return 0;
 if(!manual){scheduleViewportPreviews();return 0;}
 const list=state.shown,end=Math.min(list.length,state.renderedCount||list.length);
 if(!end)return 0;
 const candidates=selectPreviewCandidates(list,start,end,manual);
 let added=0;
 for(const w of candidates)if(queuePreview(w,manual?80:25))added++;
 updateCacheStatus();
 return added;
}
function clearPendingPrefetch(){
 previewQueue.length=0;previewQueued.clear();updateCacheStatus();
}
function preemptBackgroundExcept(activeUrl){
 // An in-flight background <img> is a real network transfer. Cancel stale ones
 // BEFORE foreground starts, otherwise the preloader competes with the reader.
 for(const [url,controller] of backgroundControllers){
  if(url===activeUrl)continue; // reuse already-warming current preview
  warmImages.delete(url);decodedImageUrls.delete(url);controller.abort();
 }
 clearPendingPrefetch();
}
if($('preloadMode')){
 $('preloadMode').value=previewMode;
 $('preloadMode').addEventListener('change',e=>{
  previewMode=VALID_PRELOAD.has(e.target.value)?e.target.value:'page';
  try{localStorage.setItem(CACHE_PREF_KEY,previewMode)}catch{}
  if(previewMode==='off')clearPendingPrefetch();
  else if(state.focus)prefetchNeighbors(state.focus);
  else scheduleViewportPreviews();
  updateCacheStatus();
 });
}
if($('preloadPage'))$('preloadPage').addEventListener('click',()=>{
 const n=preloadCurrentFeed(0,true);
 toast(n?'已开始在你的浏览器预载 '+n+' 张高清预览':'这些作品可能已缓存；滚动可加载更多');
});
if('serviceWorker' in navigator&&location.protocol==='https:'){
 navigator.serviceWorker.addEventListener('message',event=>{
  if(event.data?.type==='KIRA_PREVIEW_CACHE_HIT'){previewSwHits++;updateCacheStatus()}
  if(event.data?.type==='KIRA_CACHE_CLEARED'){previewCounter=0;previewSwHits=0;updateCacheStatus()}
 });
 // Do not wait for window.load: third-party thumbnails may keep load pending.
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  previewCacheReady=!!navigator.serviceWorker.controller;
  pumpPreviewQueue();
 });
 navigator.serviceWorker.register('/sw.js',{scope:'/'}).then(()=>{
  previewCacheReady=!!navigator.serviceWorker.controller;
  pumpPreviewQueue();
 }).catch(()=>{previewCacheReady=true;pumpPreviewQueue()});
}else previewCacheReady=true;
setTimeout(()=>{previewCacheReady=true;pumpPreviewQueue()},2100);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)pumpPreviewQueue()});
updateCacheStatus();
function markMedia(kind,message='',detail=''){
 const load=$('mediaLoad'),fail=$('mediaFail');
 const icon=$('readerPreviewState');if(icon){icon.dataset.state=kind==='loading'?'loading':kind==='failed'?'failed':'ready';icon.setAttribute('aria-label',kind==='loading'?'正在加载预览':kind==='failed'?'预览加载失败':'高清预览已准备好')}
 load.hidden=true;fail.hidden=true;
 if(kind==='loading'){$('mediaLoadTitle').textContent=message||'正在载入作品…';$('mediaLoadSub').textContent=detail||'已经保留图片浏览状态'}
 if(kind==='failed'){$('mediaLoadTitle').textContent='加载失败';}
}

/* Community image proxy failover: same Pixiv path, only change verified mirror host. */
const MIRRORS=['i.pixiv.re','i.pixiv.nl','i.pixiv.cat'];
function mirrorUrl(input,index=1){
 try{
  const u=new URL(input);
  if(u.protocol!=='https:'||!MIRRORS.includes(u.hostname))return null;
  u.hostname=MIRRORS[index]||MIRRORS[0];return u.toString();
 }catch{return null}
}
/* Hedged request: a slow Pixiv mirror must not block fast candidates.
   Browser fetches external image bytes directly, only while visible in the reader. */
/* Konachan .net/.com serve the same work URLs; one hostname fallback only. */
function konachanPreviewMirror(input) {
 try {
  const u=new URL(input);
  if(u.protocol!=='https:'||!['konachan.net','konachan.com'].includes(u.hostname))return null;
  u.hostname=u.hostname==='konachan.net'?'konachan.com':'konachan.net';
  return u.href;
 }catch{return null}
}
// Only official thumbnail/sample derivative paths qualify for rescue; never originals.
function cosbooruRescueUrl(url){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:'||u.hostname!=='cos.booru.nl'||u.search)return null;
  if(!/^\/data\/(?:180x180|360x360|720x720|sample)\/[a-f0-9]{2}\/[a-f0-9]{2}\/(?:sample-)?[a-f0-9]{32}\.(?:jpe?g|png|webp|avif)$/i.test(u.pathname))return null;
  return '/api/cosbooru-preview?path='+encodeURIComponent(u.pathname);
 }catch{return null}
}
function miyoushePreviewVariant(url,width=850){
 try{const u=new URL(url);if(u.hostname!=='upload-bbs.miyoushe.com'||u.protocol!=='https:')return null;
  if(u.searchParams.get('x-oss-process')!=='image/resize,w_1000')return null;
  u.searchParams.set('x-oss-process','image/resize,w_'+width);
  return u.toString();
 }catch{return null}
}
async function imageWithFailover(url,timeout=4200,refresh=false,signal=null){
 if(signal?.aborted)throw new Error('preempted');
 const miyoFallback=miyoushePreviewVariant(url,850);
 const cosFallback=cosbooruRescueUrl(url);
 const options=[url,konachanPreviewMirror(url),mirrorUrl(url,1),mirrorUrl(url,2),miyoFallback,cosFallback].filter((v,i,a)=>v&&a.indexOf(v)===i);
 if(!refresh&&warmImages.has(url)){
  try{return await pictureRequest(url,timeout,false,'high',signal)}
  catch(e){if(signal?.aborted)throw new Error('preempted');warmImages.delete(url);decodedImageUrls.delete(url)}
 }
 if(options.length===1)return pictureRequest(options[0],timeout,refresh,'high',signal);
 // Hedge only while still unresolved. Old implementation started ALL mirrors
 // even after cache hit or fast first response, wasting visitor bandwidth.
 return new Promise((resolve,reject)=>{
  let settled=false,failed=0;
  const timers=[];
  // Stop the losing CDN loads immediately after an image decodes.
  const attempts=new AbortController();
  const abort=()=>{if(settled)return;settled=true;timers.forEach(clearTimeout);attempts.abort();reject(new Error('preempted'))};
  signal?.addEventListener('abort',abort,{once:true});
  const done=(value,error)=>{
   if(settled)return;
   if(!error){settled=true;timers.forEach(clearTimeout);signal?.removeEventListener('abort',abort);attempts.abort();
    if(!refresh&&value.url!==url){
     warmImages.set(url,Promise.resolve(value));decodedImageUrls.add(url);refreshReadyBadges();
    }
    resolve(value);return}
   if(++failed===options.length){settled=true;signal?.removeEventListener('abort',abort);reject(error)}
  };
  options.forEach((candidate,i)=>{
   timers.push(setTimeout(()=>{
    if(settled||signal?.aborted)return;
    pictureRequest(candidate,i?Math.max(2200,timeout-400):timeout,refresh&&i===0,'high',attempts.signal)
     .then(value=>done(value,null),error=>done(null,error));
   },miyoFallback?i*1600:i*650));
  });
 });
}

function invalidateCachedPreview(url){
 try{if(url&&navigator.serviceWorker?.controller)
  navigator.serviceWorker.controller.postMessage({type:'KIRA_INVALIDATE_PREVIEW_URL',url});
 }catch{}
}
function pictureRequest(url,timeout=8500,refresh=false,priority='auto',signal=null){
 if(!url)return Promise.reject(new Error('invalid_source'));
 if(!refresh&&warmImages.has(url)){
  const loading=inFlightImages.get(url);
  // Do not reuse an in-flight image promise owned by a cancelled reader.
  if(loading?.kiraSignal?.aborted||(loading&&signal&&loading.kiraSignal&&loading.kiraSignal!==signal)){
   // Do not share an abort-owned pending image with a different reader.
   warmImages.delete(url);decodedImageUrls.delete(url)
  }
  else{
   if(priority==='high'&&loading)loading.fetchPriority='high';
   const existing=warmImages.get(url);warmImages.delete(url);warmImages.set(url,existing);previewReused++;updateCacheStatus();return existing;
  }
 }
 const p=new Promise((resolve,reject)=>{
  const img=new Image();img.referrerPolicy=imageReferrerPolicy(url);img.decoding='async';img.fetchPriority=priority;img.kiraSignal=signal;
  if(!refresh)inFlightImages.set(url,img);
  let done=false;const onAbort=()=>finish('preempted');
  const finish=(error)=>{
   if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;
   signal?.removeEventListener('abort',onAbort);
   if(inFlightImages.get(url)===img)inFlightImages.delete(url);
   if(error){if(error!=='preempted')invalidateCachedPreview(url);
    try{img.src=''}catch{}reject(new Error(error))}else{if(!refresh)decodedImageUrls.add(url);resolve({url:img.currentSrc||img.src,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,img})}
  };
  img.onload=()=>{
   if(!(img.naturalWidth>0&&img.naturalHeight>0)){finish('empty_image');return}
   if(typeof img.decode==='function')img.decode().then(()=>finish(null),()=>finish('image_decode_failed'));
   else finish(null);
  };
  // Some booru CDNs require an origin Referer; others reject hotlink Referers.
  // Retry the SAME authenticated public derivative with the opposite browser
  // referrer policy once, without guessing CDN paths or downloading originals.
  let switchedReferrer=false;
  img.onerror=()=>{
   if(!switchedReferrer&&new URL(url,location.href).hostname==='cos.booru.nl'&&!signal?.aborted){
    switchedReferrer=true;
    img.referrerPolicy=img.referrerPolicy==='no-referrer'?'strict-origin-when-cross-origin':'no-referrer';
    img.removeAttribute('src');img.src=url;return;
   }
   finish('image_failed');
  };
  const timer=setTimeout(()=>finish('image_timeout'),timeout);
  if(signal?.aborted){finish('preempted');return}
  signal?.addEventListener('abort',onAbort,{once:true});
  // Preserve exact signed CDN query parameters, especially Miyoushe's x-oss-process.
   // A forced retry bypasses the in-memory pool; do not invent cache-busting query keys.
   img.src=url;
 });
 if(!refresh){
  warmImages.set(url,p);
  p.catch(()=>{if(warmImages.get(url)===p){warmImages.delete(url);decodedImageUrls.delete(url)}});
  // Decoded images have significant memory cost. Keep the pool bounded.
  const max=(innerWidth<=650?12:24);
  while(warmImages.size>max){const oldest=warmImages.keys().next().value;warmImages.delete(oldest);decodedImageUrls.delete(oldest)}
  refreshReadyBadges();
 }
 return p;
}
function fitMedia(nw,nh){
 const stage=$('readerStage'),image=$('viewerImage');
 if(!nw||!nh||!stage.clientWidth||!stage.clientHeight)return;
 // Use more of the actual viewport; no bottom toolbar reserves extra space.
 const mobile=innerWidth<=650,marginX=mobile?8:42,marginY=mobile?10:64;
 const stageW=Math.max(80,stage.clientWidth-marginX),stageH=Math.max(90,stage.clientHeight-marginY);
 const ratio=Math.min(stageW/nw,stageH/nh);
 const width=Math.max(1,Math.floor(nw*ratio)),height=Math.max(1,Math.floor(nh*ratio));
 image.style.width=width+'px';image.style.height=height+'px';
 image.dataset.baseWidth=String(width);image.dataset.baseHeight=String(height);
}

function setVisibleImage(candidate,work=null,quality='full'){
 // Transfer an already-decoded external image: avoid a second CDN hotlink request.
 const previous=$('viewerImage');
 const reusable=!!(candidate?.img&&candidate.img.naturalWidth>0&&candidate.img.naturalHeight>0);
 const image=reusable?candidate.img:previous;
 if(image!==previous){
  image.id='viewerImage';image.className=previous.className;image.alt=previous.alt;
  image.style.cssText=previous.style.cssText;previous.replaceWith(image);
 }
 image.referrerPolicy=imageReferrerPolicy(candidate.url);
 image.fetchPriority='high';
 if(!reusable&&image.src!==candidate.url)image.src=candidate.url;
 // Fixed intrinsic artwork frame prevents cropping/layout jumps on progressive upgrades.
 const nw=work?.imageWidth||candidate.naturalWidth,nh=work?.imageHeight||candidate.naturalHeight;
 image.dataset.naturalWidth=String(nw);
 image.dataset.naturalHeight=String(nh);
 fitMedia(nw,nh);
 image.classList.toggle('low-quality',quality==='thumb');
 image.classList.add('loaded');
 image.style.opacity='';
 image.onerror=()=>{invalidateCachedPreview(image.src);if(state.focus){image.classList.remove('loaded');markMedia('failed');}};
}

async function loadWorkPreview(w,{force=false,source=null}={}){
 // Cancel all prior image download attempts, including delayed Pixiv mirror
 // hedges: rapid arrow/swipe navigation must not keep old previews downloading.
 if(foregroundController){
  for(const old of [foregroundSourceUrl,mirrorUrl(foregroundSourceUrl,1),mirrorUrl(foregroundSourceUrl,2)]){
   if(old&&!decodedImageUrls.has(old))warmImages.delete(old);
  }
  foregroundController.abort();
 }
 const controller=new AbortController();
 foregroundController=controller;foregroundSourceUrl=w.preview;
 const seq=++mediaSequence;
 const readerStart=performance.now(),wasDecodedAtOpen=hasDecodedPreview(w);
 const stage=$('readerStage'),image=$('viewerImage');
 stage.classList.remove('original-fetch','preview-upgrade');
 image.classList.remove('loaded');image.style.opacity='';
 markMedia('loading',force?'重新加载图片…':'正在载入 '+w.title,'先显示轻量缩略图，再升级高清预览');
 let thumb=null,full=null;
 let revealed=false;
 const stillCurrent=()=>seq===mediaSequence&&state.focus?.id===w.id;
 function reveal(candidate,quality){
  if(!stillCurrent())return;
  if(quality==='thumb'&&full)return;
  if(quality==='full'){
   full=candidate;const ms=Math.round(performance.now()-readerStart);
   previewTiming.lastOpenedMs=ms;
   if(wasDecodedAtOpen)previewTiming.nearInstant++;else previewTiming.cold++;
   const status=$('cacheStatus');if(status)status.textContent=(wasDecodedAtOpen?'✓ 命中已预载高清':'新高清预览')+' · '+ms+'ms · '+candidate.naturalWidth+'×'+candidate.naturalHeight;
  }else thumb=candidate;
  setVisibleImage(candidate,w,quality);revealed=true;state.original=false;
  const sizeFact=$('previewFact');
  if(sizeFact)sizeFact.textContent=(quality==='full'?'当前预览':'仅缩略图')+'：'+candidate.naturalWidth+' × '+candidate.naturalHeight+' 像素'+(w.source==='wallhaven'?' · Wallhaven 当前仅提供 300px 索引预览，高清在原站查看':quality==='full'&&candidate.naturalWidth<1000?' · 源站仅提供此预览尺寸':'');
  $('btnOriginal').disabled=false;$('btnOriginal').classList.remove('on');
  $('btnOriginal').textContent='↗ '+w.sourceName+' 来源';
  if(quality==='thumb'){
   stage.classList.add('preview-upgrade');
   markMedia('loading','已显示缩略图，高清加载中…','');
  }else{
   stage.classList.remove('preview-upgrade');markMedia('idle');
   applyZoom(false);refreshReadyBadges();
   prefetchNeighbors(w);
  }
  if(quality==='thumb'&&source&&!prefersReduced.matches){
   const card=source.querySelector('img');
   if(card?.complete&&card.naturalWidth)requestAnimationFrame(()=>motionClone(card,image));
  }else if(!prefersReduced.matches){
   image.animate([{opacity:.5},{opacity:1}],{duration:190,easing:'ease-out'});
  }
 }
 ++foregroundPreviewLoads;
 // When HD is already in memory/disk queue, do not launch an unnecessary
 // separate thumbnail download that competes with the foreground preview.
 const alreadyWarm=!force&&decodedImageUrls.has(w.preview);
 const thumbJob=alreadyWarm?Promise.resolve():imageWithFailover(w.card,3800,false,controller.signal).then(c=>reveal(c,'thumb')).catch(()=>{});
 if(force){failedPreviewUrls.delete(w.preview);failedPreviewAt.delete(w.preview)}
 const fullJob=!force&&!previewRetryAllowed(w.preview)?Promise.resolve():
  imageWithFailover(w.preview,isMainlandRoute()?11000:(w.source==='pixiv'?6200:9500),force,controller.signal)
   .then(c=>{failedPreviewUrls.delete(w.preview);failedPreviewAt.delete(w.preview);reveal(c,'full')})
   .catch(e=>{if(e.message!=='preempted'){
    failedPreviewUrls.add(w.preview);failedPreviewAt.set(w.preview,Date.now());warmImages.delete(w.preview);invalidateCachedPreview(w.preview);refreshReadyBadges();
    console.warn('KIRA preview unavailable',e.message);
   }});
 try{await Promise.all([thumbJob,fullJob])}
 finally{
  foregroundPreviewLoads=Math.max(0,foregroundPreviewLoads-1);
  if(foregroundController===controller){foregroundController=null;foregroundSourceUrl=null}
  pumpPreviewQueue();
 }
 if(!stillCurrent())return;
 if(!revealed){
  image.removeAttribute('src');image.classList.remove('loaded');
  stage.classList.remove('preview-upgrade');markMedia('failed');
 }else if(!full){
  stage.classList.remove('preview-upgrade');markMedia('idle');
  alertOriginal('高清暂不可用，当前为缩略预览；可重试或点击「来源」查看原站');
 }
}

function prefetchPreview(w){if(w?.preview)queuePreview(w)}
function prefetchNeighbors(w){
 ++mediaPreloadSequence;
 const arr=state.shown;
 const i=arr.findIndex(x=>x.id===w.id);
 if(i<0)return;
 clearPendingPrefetch();
 scheduleAdjacentPreviews(i,arr);
}
function openReader(id,source){
 const w=byId(id);if(!w)return;
 if(originalController){originalController.abort();originalController=null;}
 const wasOpen=$('reader').classList.contains('open');
 const sourceImg=source?.querySelector('img')||null;
 state.anchor=w.id;
 markViewed(w.id);
 if(!wasOpen)state.lastCard=source||null;
 state.focus=w;state.original=false;state.relatedPath=w.seriesKey?'series':'character';preemptBackgroundExcept(w.preview);
 // First open creates a navigable history entry; changing works reuses the reader entry.
 try{
  if(location.hash!=='#art-'+w.id){
   if(wasOpen)history.replaceState(history.state,'','#art-'+w.id);
   else history.pushState({...((history.state&&typeof history.state==='object')?history.state:{}),kiraArtwork:true},'','#art-'+w.id);
  }
 }catch{}
 $('reader').classList.add('open');$('reader').setAttribute('aria-hidden','false');
 document.body.style.overflow='hidden';
 if(!wasOpen)$('reader').classList.remove('reader-controls-hidden');
 resetZoom(false);
 fillReader(); // details update to the target work before async image loading.
 loadWorkPreview(w,{source:sourceImg?source:null});
 prefetchNeighbors(w);
 if(!wasOpen&&!prefersReduced.matches){$('reader').animate([{opacity:.5},{opacity:1}],{duration:170,easing:'ease-out'})}
}
function closeReader(){
 if(!$('reader').classList.contains('open'))return;
 if(originalController){originalController.abort();originalController=null;}
 ++mediaSequence;++mediaPreloadSequence;clearPendingPrefetch();
 if(foregroundController)foregroundController.abort();
 const focused=state.focus;
 const start=$('viewerImage');
 const card=state.lastCard&&Number(state.lastCard.dataset.view)===focused?.id&&document.body.contains(state.lastCard)?state.lastCard.querySelector('img'):document.querySelector('[data-view="'+(focused?.id||'')+'"] img');
 if(card&&start.classList.contains('loaded')&&card.getBoundingClientRect().top<innerHeight&&card.getBoundingClientRect().bottom>0)motionClone(card,start,true);
 $('reader').classList.remove('open');$('reader').setAttribute('aria-hidden','true');
 $('viewerImage').classList.remove('loaded');$('viewerImage').removeAttribute('src');
 document.body.style.overflow='';markMedia('idle');resetZoom(false);state.focus=null;
 if(location.hash.startsWith('#art-'))try{history.replaceState(history.state,'',location.pathname+location.search)}catch{}
}


/* Conservative, explainable facets. Never pad a recommendation category with unrelated art. */
function relationScore(source,candidate,axis){
 if(source.id===candidate.id)return 0;
 const overlap=shared(source,candidate);
 const generic=new Set(['原创角色','角色未标注','原神','插画','未分类']);
 if(axis==='character'){
  if(!generic.has(source.character)&&candidate.character===source.character)return 110+overlap*9;
  // Fallback to genuinely shared named character, copyright/IP or uncommon tag.
  if(overlap>=2)return overlap*12;
  // Do not recommend merely because two posts say 1girl/solo/同人.
  return 0;
 }
 if(axis==='series')return source.seriesKey&&source.seriesKey===candidate.seriesKey?135+overlap*7:0;
 if(axis==='artist')return source.artistVerified&&candidate.artistVerified&&source.artistKey===candidate.artistKey?145+overlap*4:0;
 if(axis==='color'){
  if(!source.dominantHex||!candidate.dominantHex)return source.color!=='未分类'&&source.color===candidate.color?55+overlap*4:0;
  const parts=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
  const a=parts(source.dominantHex),b=parts(candidate.dominantHex);
  const hue=v=>{
    const [r,g,bl]=v,max=Math.max(r,g,bl),min=Math.min(r,g,bl),d=max-min;
    if(d===0)return 0;
    const h=max===r?((g-bl)/d)%6:max===g?(bl-r)/d+2:(r-g)/d+4;
    return (h/6+1)%1;
  };
  const saturation=v=>{const hi=Math.max(...v),lo=Math.min(...v);return hi? (hi-lo)/hi:0};
  const distance=Math.hypot(...a.map((x,i)=>255*(x-b[i])));
  const huediff=Math.abs(hue(a)-hue(b)),cycle=Math.min(huediff,1-huediff);
  const satDiff=Math.abs(saturation(a)-saturation(b));
  const same=source.color===candidate.color;
  const warm=new Set(['红','粉','暖','金']),cool=new Set(['蓝','紫','绿']),neutral=new Set(['黑','白','灰']);
  const adjacent=(warm.has(source.color)&&warm.has(candidate.color))||(cool.has(source.color)&&cool.has(candidate.color));
  if(same)return Math.round(160-Math.min(90,distance*.46)+overlap*2);
  if(adjacent&&cycle<.21&&satDiff<.58)return Math.round(108-cycle*240-satDiff*30+overlap*2);
  if(neutral.has(source.color)&&neutral.has(candidate.color)&&distance<135)return Math.round(95-distance*.42);
  if(distance<68)return Math.round(70-distance*.5);
  return 0;
 }
 if(axis==='mood'){
  if(!generic.has(source.mood)&&source.mood===candidate.mood)return 100+overlap*7;
  const moodTags=/夜|night|夏|summer|空|sky|風景|景色|landscape|魔法|fantasy|海|sea|花|桜|春|cyber|赛博|水着|樱|夕焼け|sunset/i;
  const same=(source.tags||[]).filter(t=>moodTags.test(t)).some(t=>(candidate.tags||[]).includes(t));
  return same?55+overlap*7:0;
 }
 return 0;
}
function related(w,path){
 return WORKS.filter(x=>x.id!==w.id).map(x=>({work:x,score:relationScore(w,x,path)}))
 .filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.work.id-b.work.id).slice(0,12).map(x=>x.work);
}
function relatedDraw(){
 const w=state.focus;if(!w)return;
 document.querySelectorAll('[data-path]').forEach(b=>b.classList.toggle('on',b.dataset.path===state.relatedPath));
 const list=related(w,state.relatedPath),axisLabel={character:'角色',series:'系列',artist:'画师',color:'色彩',mood:'氛围'}[state.relatedPath]||'同频';
 const container=$('relatedWorks');
 container.innerHTML=list.map(x=>
  '<button class="related-item" data-related="'+x.id+'" aria-label="查看相关作品：'+esc(x.title)+'">'+
  '<img src="'+esc(x.card)+'" referrerpolicy="no-referrer" alt="" loading="lazy">'+
  '<span>'+esc(x.title)+'<small class="related-reason">'+esc(state.relatedPath==='character'?x.character:state.relatedPath==='series'?x.seriesLabel:state.relatedPath==='artist'?'同一画师 · '+x.artist:state.relatedPath==='color'?(x.color===w.color?x.color+'同色':x.color+'邻近色系'):x.mood)+'</small></span></button>'
 ).join('');
 let desc=$('relatedCount');
 if(!desc){desc=document.createElement('p');desc.id='relatedCount';desc.className='reader-related-count';container.before(desc)}
 desc.textContent=list.length?'严格匹配 '+list.length+' 张'+axisLabel+'相关作品 · 按关联度排序':'当前作品没有足够的'+axisLabel+'匹配项 · 试试其他跃迁频道';
 if(!list.length)container.innerHTML='<p class="reader-related-count">本批作品暂无可靠关联，不以无关图片填充。</p>';
}
async function reportKiraWork(source,pid,button){
 if(!DB_CHANNELS.has(source)){toast('该图源尚未接入举报数据库，请从原站反馈');return}
 if(button)button.disabled=true;
 try{const response=await fetch('/api/catalog/report-anonymous',{method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({source,source_post_id:String(pid),reason:'other',visitor_id:kiraAnonymousReporterId()})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(response.status===404?'report_api_missing':result.error||String(response.status));
  toast('举报已提交审核队列，管理员审核后处理');
 }catch(e){
  const reason=e.message==='daily_report_limit'?'今日举报已达上限':
   e.message==='already_moderated'?'作品已进入审核处理':
   e.message==='report_api_missing'?'当前站点举报接口返回 404，部署尚未生效':
   e.message==='report_storage_unavailable'?'举报数据库服务暂时不可用':
   e.message==='invalid_report'?'图源作品编号无法被举报接口识别':'网络或接口连接失败';
  toast('举报未送达：'+reason);
 }
 finally{if(button)button.disabled=false}
}
function kiraAnonymousReporterId(){
 const key='kira.anonymous-report-id.v1';
 try{
  let id=localStorage.getItem(key);
  if(typeof id==='string'&&/^[a-f0-9]{32}$/.test(id))return id;
  const bytes=new Uint8Array(16);crypto.getRandomValues(bytes);
  id=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(key,id);return id;
 }catch{return ''}
}
function fillReader(){
 const w=state.focus;if(!w)return;
 const full=$('btnFullImage');
 const available=Boolean(w.originalDirect);
 full.disabled=!available;full.classList.remove('on');
 full.textContent=available?'↗ 查看原尺寸':'原图仅原站提供';
 full.title=available?'点击后由你的浏览器直接请求外部源站原始图像；可能较大。不会通过 KIRA Worker':'当前来源未提供可验证的原图直链，请到原作品页查看';
 const rawTitle=String(w.title||'').trim();
 const placeholderTitle=!rawTitle||/^(?:untitled|unknown|no title|无标题|未命名|标题未提供|作品未命名|illustration|artwork)(?:\s*[#：:]?\s*\d*)?$/i.test(rawTitle)||/^(?:konachan|safebooru|cosbooru|nekosia|pixiv|zerochan|danbooru|e[-_ ]?shuushuu)\s*[·:#]\s*(?:#?\d+)?$/i.test(rawTitle);
 const title=placeholderTitle?'#'+String(w.sourcePostId||w.pid):rawTitle;
 $('readerCrumb').textContent=title;
 $('readerTitle').textContent=title;
 $('readerKind').textContent=w.sourceName.toUpperCase()+' / '+(w.kind==='原创'?'ORIGINAL':'FAN ART');
 $('artistName').textContent=w.artist;
 $('artistFace').textContent=w.artist.slice(0,1);
 $('artistFace').style.background=colorFor(w);
 document.querySelector('.artist-info small').textContent=w.artistVerified?'图源标注画师（未独立核验身份或授权）':w.artistCredit==='source-attributed-unverified'?'来源站作者标签（身份未核验）':w.uploader?'上传用户：'+w.uploader+'（不等于画师）':'图源未标注画师 · 版权归原作者';
 $('readerDesc').textContent=''; // Tags and verified metadata replace verbose, low-value generated descriptions.
 $('readerReason').textContent='';
 const dims=w.imageWidth&&w.imageHeight?w.imageWidth+' × '+w.imageHeight+'（作品元数据尺寸）':'尺寸未标注';
 const facts=[w.sourceName+' #'+w.pid,dims,w.seriesLabel?'系列：'+w.seriesLabel:null,
  w.providerScore>0?'站点评分：'+w.providerScore:null,w.originLink?'已找到原始发表链接':'原始发表链接未提供'];
 $('workFacts').innerHTML=facts.filter(Boolean).map(x=>'<span>'+esc(x)+'</span>').join('')+'<span id="previewFact">实际预览：等待加载</span>';
 // Fixed action next to artwork title, outside the image viewing canvas.
 const reportButton=$('kiraReportWork');
 reportButton.hidden=!DB_CHANNELS.has(w.source);
 $('readerStageReport').hidden=reportButton.hidden;
 const link=$('originalPostLink');link.hidden=!w.originLink;
 if(w.originLink){link.href=w.originLink;link.textContent='↗ 到原始发布网站核对作者与作品（非图床上传）'}
 else link.removeAttribute('href');
 const tags=[w.character,w.mood,w.color+'系',...w.tags].filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,15);
 $('readerTags').innerHTML=tags.map(tag=>'<button data-term="'+esc(tag)+'"># '+esc(tag)+'</button>').join('');
 $('favArt').classList.toggle('faved',state.liked.has(w.id));
 $('favArt').querySelector('span').textContent=state.liked.has(w.id)?'已收藏':'收藏作品';
 $('followArtist').disabled=!w.artistVerified;
 $('followArtist').title=w.artistVerified?(accountAuthenticated?'已登录 · 关注会跨设备同步':'未登录 · 关注仅保存在本机'):'来源未标注可验证画师，不允许误关注上传者';
 $('followArtist').textContent=!w.artistVerified?'画师未标注':state.followed.has(w.artistKey)?'✓ 已关注':'＋ 关注';
 if($('pixivSource')){$('pixivSource').href=w.pixivUrl;$('pixivSource').textContent='↗ 在 '+w.sourceName+' 查看来源和原图';}
 $('btnOriginal').disabled=false;$('btnOriginal').classList.remove('on');
 $('btnOriginal').textContent='↗ '+w.sourceName+' 来源';
 const shown=state.shown.length?state.shown:WORKS,i=shown.findIndex(x=>x.id===w.id);
 $('stageCounter').textContent=String(i+1||1).padStart(2,'0')+' / '+String(shown.length).padStart(2,'0');
 relatedDraw();
}

function swapArt(direction){const arr=state.shown;const idx=arr.findIndex(w=>w.id===state.focus?.id);const next=arr[(idx+direction+arr.length)%arr.length];if(next)openReader(next.id,null)}

/* Single image-only uniform zoom; no 500% limit or aspect distortion. */
function resetZoom(animate=true){state.zoom=1;state.panX=0;state.panY=0;applyZoom(animate)}
function clampPan(){
 const im=$('viewerImage'),st=$('readerStage');
 const w=(Number(im.dataset.baseWidth)||im.offsetWidth)*state.zoom,h=(Number(im.dataset.baseHeight)||im.offsetHeight)*state.zoom;
 const mx=Math.max(0,(w-st.clientWidth)/2+24),my=Math.max(0,(h-st.clientHeight)/2+24);
 state.panX=Math.min(mx,Math.max(-mx,state.panX));state.panY=Math.min(my,Math.max(-my,state.panY));
}
function applyZoom(animate=true){
 const im=$('viewerImage');im.classList.toggle('dragging',!animate);
 if(!Number.isFinite(state.zoom)||state.zoom<1)state.zoom=1;
 clampPan();im.style.setProperty('--zoom',String(state.zoom));
 im.style.setProperty('--pan-x',state.panX+'px');im.style.setProperty('--pan-y',state.panY+'px');
 const pct=Math.round(state.zoom*100);
 $('zoomValue').textContent=pct+'%';
 if(document.activeElement!==$('zoomPercent'))$('zoomPercent').value=String(pct);
 $('readerStage').classList.toggle('canpan',state.zoom>1.01);
 if(!animate)requestAnimationFrame(()=>im.classList.remove('dragging'));
}
function changeZoom(next){
 if(!Number.isFinite(next))return;state.zoom=Math.max(1,next);
 if(state.zoom<=1.001)state.panX=state.panY=0;
 applyZoom();
}
function alertOriginal(text){const a=$('originalAlert');a.textContent=text;a.classList.add('show');clearTimeout(window._originalAlertTimer);window._originalAlertTimer=setTimeout(()=>a.classList.remove('show'),2400)}


function openSource(){if(state.focus)window.open(state.focus.pixivUrl,'_blank','noopener,noreferrer')}
async function openFullImageOnDemand(){
 const w=state.focus,btn=$('btnFullImage');
 if(!w||!w.originalDirect)return;
 if(state.original){
  if(originalController){originalController.abort();originalController=null;}
  state.original=false;btn.classList.remove('on');btn.textContent='↗ 查看原尺寸';
  loadWorkPreview(w);return;
 }
 const safe=validatedOriginal(w.originalDirect,w.source);
 if(!safe){toast('该来源不能安全地直连原图，请使用原站按钮');return}
 if(originalController)originalController.abort();
 if(foregroundController)foregroundController.abort();
 preemptBackgroundExcept(''); // user-requested original outranks all preview preloads
 const controller=new AbortController();originalController=controller;
 const image=$('viewerImage');
 const token=++mediaSequence;
 // No prefetch, caching, proxy or persistence of the original. The browser
 // initiates this one normal cross-origin image GET after an explicit click.
 btn.disabled=true;btn.textContent='原尺寸加载中…';
 markMedia('loading','正在从外部源站加载原图…','由你的浏览器直连图片 CDN；原图可能较大，失败可到原站');
 try{
  const candidate=await new Promise((resolve,reject)=>{
   const img=new Image();img.referrerPolicy='no-referrer';img.fetchPriority='high';
   let settled=false;
   const finish=(err)=>{
    if(settled)return;settled=true;clearTimeout(timer);
    controller.signal.removeEventListener('abort',abort);
    img.onload=img.onerror=null;
    if(err){img.src='';reject(new Error(err))}
    else resolve({url:safe,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,img});
   };
   const abort=()=>finish('cancelled');
   const timer=setTimeout(()=>finish('full_image_timeout'),22000);
   controller.signal.addEventListener('abort',abort,{once:true});
   img.onload=()=>img.naturalWidth>0&&img.naturalHeight>0?finish(null):finish('invalid_image');
   img.onerror=()=>finish('source_refused_image');
   img.src=safe;
  });
  if(controller.signal.aborted||state.focus?.id!==w.id||token!==mediaSequence)return;
  setVisibleImage(candidate,null,'original');
  const fact=$('previewFact');
  if(fact)fact.textContent='当前显示外部原图：'+candidate.naturalWidth+' × '+candidate.naturalHeight+' 像素 · 用户主动直连';
  state.original=true;originalOpenCount++;
  btn.textContent='↶ 返回高清预览';btn.classList.add('on');
  markMedia('idle');applyZoom(false);
 }catch(error){
  if(error.message!=='cancelled'){
   toast('源站原图加载失败：可能存在防盗链、网络限制或大文件超时；可点「原站」查看');
   markMedia('idle');
  }
  if(state.focus?.id===w.id){state.original=false;btn.textContent='↗ 查看原尺寸';btn.classList.remove('on')}
 }finally{
  if(originalController===controller)originalController=null;
  if(state.focus?.id===w.id)btn.disabled=false;
 }
}


function clickFromWall(e){
 const report=e.target.closest('[data-report][data-report-id]');if(report){e.preventDefault();e.stopPropagation();void reportKiraWork(report.dataset.report,report.dataset.reportId,report);return}const v=e.target.closest('[data-view]');if(v)openReader(v.dataset.view,v)}
$('artWall').addEventListener('click',clickFromWall);

let nextGalleryBatchPromise=null,lastGalleryLoadEnd=0,feedRetryTimer=null;
let feedReservePromise=null,feedReserveTimer=null,feedReserveLastAt=0;
const feedNearViewport=()=>{
 const node=$('feedMore');if(!node||node.hidden||state.focus)return false;
 const r=node.getBoundingClientRect();
 return r.top<innerHeight+FEED_PREFETCH_PX&&r.bottom>=-240;
};
function scheduleFeedContinuation(wait=1300){
 if(feedRetryTimer)clearTimeout(feedRetryTimer);
 feedRetryTimer=setTimeout(()=>{
  feedRetryTimer=null;
  if(feedNearViewport()&&!nextGalleryBatchPromise&&['推荐','精选','换一批'].includes(state.main))
   void loadNextGalleryBatch();
 },Math.max(350,wait));
}
function scheduleFeedReserveWarmup(wait=300){
 if(feedReserveTimer)clearTimeout(feedReserveTimer);
 feedReserveTimer=setTimeout(()=>{feedReserveTimer=null;void warmFeedReserve()},Math.max(80,wait));
}
async function warmFeedReserve(){
 if(feedReservePromise||nextGalleryBatchPromise||state.focus||!['推荐','精选','换一批'].includes(state.main))return feedReservePromise||0;
 const reserve=Math.max(0,state.shown.length-(state.renderedCount||0));
 if(reserve>=FEED_RESERVE_TARGET)return 0;
 const since=Date.now()-feedReserveLastAt;
 if(since<FEED_NETWORK_COOLDOWN_MS)return scheduleFeedReserveWarmup(FEED_NETWORK_COOLDOWN_MS-since+80),0;
 const identity=[state.main,state.sourceFilter,state.route,state.filter,state.search].join('|');
 const before=new Set(WORKS.map(w=>w.id)),shown=new Set(state.shown.map(w=>w.id));
 feedReserveLastAt=Date.now();
 feedReservePromise=(async()=>{
  const collect=()=>WORKS.filter(w=>!before.has(w.id)&&!shown.has(w.id)&&
   !exposedHistorySet.has(w.id)&&!viewHistory.includes(w.id)&&!contentWasExposed(w)&&
   isVisibleDiscoveryProvider(w.source)&&contentEligible(w));
  // Prefer the shared D1 inventory. Only touch upstream providers when the
  // indexed reserve could not refill at least one useful batch.
  await loadNewlyIndexedCatalog({force:true,appendOnly:true}).catch(()=>0);
  if(identity!==[state.main,state.sourceFilter,state.route,state.filter,state.search].join('|'))return 0;
  let fresh=collect();
  const needed=Math.max(FEED_BATCH,FEED_RESERVE_TARGET-reserve);
  if(fresh.length<needed){
   await loadLiveArtwork({force:true,deep:reserve<FEED_BATCH,appendOnly:true,suppressDraw:true}).catch(()=>0);
   if(identity!==[state.main,state.sourceFilter,state.route,state.filter,state.search].join('|'))return 0;
   fresh=collect();
  }
  if(!fresh.length)return 0;
  for(let i=fresh.length-1;i>0;i--){const n=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[fresh[i],fresh[n]]=[fresh[n],fresh[i]]}
  state.shown.push(...fresh);
  $('feedCount').textContent='· '+state.shown.length+' 张作品';
  return fresh.length;
 })();
 try{return await feedReservePromise}finally{
  feedReservePromise=null;
  const remaining=Math.max(0,state.shown.length-(state.renderedCount||0));
  if(remaining<FEED_RESERVE_TARGET/2)scheduleFeedReserveWarmup(FEED_NETWORK_COOLDOWN_MS+120);
 }
}
function appendFreshGalleryCards(candidates){
 if(!candidates.length)return 0;
 const existing=new Set(state.shown.map(w=>w.id));
 const fresh=candidates.filter(w=>!existing.has(w.id)&&isVisibleDiscoveryProvider(w.source));
 if(!fresh.length)return 0;
 // Shuffle only the freshly received batch; never change any mounted card.
 for(let i=fresh.length-1;i>0;i--){const n=crypto.getRandomValues(new Uint32Array(1))[0]%(i+1);[fresh[i],fresh[n]]=[fresh[n],fresh[i]]}
 state.shown.push(...fresh);
 appendFeedBatch();
 $('feedCount').textContent='· '+state.shown.length+' 张作品';
 return fresh.length;
}
async function loadNextGalleryBatch({manual=false}={}){
 if(nextGalleryBatchPromise||state.focus||!['推荐','精选','换一批'].includes(state.main))return nextGalleryBatchPromise||0;
 if(state.renderedCount<state.shown.length){appendFeedBatch();$('feedMore').classList.remove('loading');return 1}
 if(feedReservePromise){
  await feedReservePromise.catch(()=>0);
  if(state.renderedCount<state.shown.length){appendFeedBatch();$('feedMore').classList.remove('loading');return 1}
 }
 const cooldown=FEED_NETWORK_COOLDOWN_MS-(Date.now()-lastGalleryLoadEnd);
 if(cooldown>0&&!manual){scheduleFeedContinuation(cooldown+100);return 0}
 const spinner=$('feedMore'),identity=[state.main,state.sourceFilter,state.route,state.filter,state.search].join('|');
 nextGalleryBatchPromise=(async()=>{
  spinner.hidden=false;spinner.classList.add('loading');
  const known=new Set(WORKS.map(w=>w.id));
  const present=new Set(state.shown.map(w=>w.id));
  const stillSame=()=>identity===[state.main,state.sourceFilter,state.route,state.filter,state.search].join('|');
  const appendNew=()=>{
   if(!stillSame())return 0;
   const newlyFetched=WORKS.filter(w=>!known.has(w.id));
   const safeVisible=newlyFetched.filter(w=>!present.has(w.id)&&!exposedHistorySet.has(w.id)&&!viewHistory.includes(w.id)&&!contentWasExposed(w)&&isVisibleDiscoveryProvider(w.source)&&contentEligible(w));
   const added=appendFreshGalleryCards(safeVisible);
   if(added)safeVisible.slice(0,added).forEach(w=>present.add(w.id));
   return added;
  };
  try{
   // Start live discovery immediately, but do not make the user wait for a slow
   // external source if D1 already has another page ready.
   const liveTask=loadLiveArtwork({force:true,deep:true,appendOnly:true}).catch(()=>0);
   await loadNewlyIndexedCatalog({force:true,appendOnly:true}).catch(()=>0);
   let added=appendNew();
   if(added){
    void liveTask.then(()=>{
     if(!stillSame())return;
     // Live results are already in WORKS. Trigger the next early continuation so
     // they are mounted before the user reaches the physical end of the page.
     if(feedNearViewport())scheduleFeedContinuation(420);
    });
    return added;
   }
   await liveTask;
   added=appendNew();
   // When neither D1 nor upstream returned a genuinely new post, continue with
   // never-mounted indexed works instead of leaving the desktop sentinel idle.
   if(!added){
    const fallback=baseList().filter(w=>!present.has(w.id)&&!contentWasExposed(w));
    added=appendFreshGalleryCards(fallback);
   }
   return added;
  }finally{
   spinner.classList.remove('loading');
   lastGalleryLoadEnd=Date.now();
   if(feedNearViewport())scheduleFeedContinuation(FEED_NETWORK_COOLDOWN_MS+180);
  }
 })();
 try{return await nextGalleryBatchPromise}finally{nextGalleryBatchPromise=null}
}

/* Bottom upward pull: show the in-flow spinner while the user is pulling,
 * never reset the feed, and never intercept the native browser scroll. */
{
 let touchY=null,armed=false;
 const nearBottom=()=>document.documentElement.scrollHeight-window.scrollY-innerHeight<180;
 document.addEventListener('touchstart',e=>{
  touchY=e.touches.length===1&&!state.focus&&nearBottom()&&!e.target.closest('.reader,input,textarea,select,dialog')?e.touches[0].clientY:null;
  armed=false;
 },{passive:true});
 document.addEventListener('touchmove',e=>{
  if(touchY===null||e.touches.length!==1)return;
  const delta=touchY-e.touches[0].clientY;
  armed=delta>65&&nearBottom();
  if(delta>20&&nearBottom()){
   const loader=$('feedMore');loader.hidden=false;loader.classList.add('loading');
  }
 },{passive:true});
 document.addEventListener('touchend',()=>{
  const trigger=touchY!==null&&armed;
  touchY=null;armed=false;
  if(trigger){void loadNextGalleryBatch({manual:true});}
  else if(!nextGalleryBatchPromise){$('feedMore').classList.remove('loading')}
 },{passive:true});
 document.addEventListener('touchcancel',()=>{touchY=null;armed=false;if(!nextGalleryBatchPromise)$('feedMore').classList.remove('loading')},{passive:true});
}
let hoverPreloadTimer=0;
$('artWall').addEventListener('pointerover',e=>{
 if(e.pointerType!=='mouse')return;
 const cover=e.target.closest('[data-view]');if(!cover)return;
 clearTimeout(hoverPreloadTimer);
 hoverPreloadTimer=setTimeout(()=>prefetchPreview(byId(cover.dataset.view)),500);
});
$('artWall').addEventListener('pointerout',()=>clearTimeout(hoverPreloadTimer));
$('miniRank').addEventListener('click',e=>{const b=e.target.closest('[data-rank]');if(b)openReader(b.dataset.rank,null)});
$('jumpchoices').addEventListener('click',e=>{const b=e.target.closest('[data-route]');if(b)setRoute(b.dataset.route)});
$('feedFilters').addEventListener('click',e=>{const b=e.target.closest('[data-filter]');if(!b)return;
 state.main='推荐';state.route='all';state.filter=b.dataset.filter;state.search='';$('search').value='';
 state.anchor=null;state.refreshNonce++;draw();
 // Content type is a filter, not a separate network partition. If the user asks
 // for Cosplay and we have none yet, fetch both available COS-capable providers.
 if(b.dataset.filter==='Cosplay'&&!WORKS.some(w=>w.kind==='Cosplay'))
  void loadLiveArtwork({force:true,onlyProviders:['miyoushe_cos','cosbooru']});
});
$('sourceFilters').addEventListener('click',e=>{
 const external=e.target.closest('[data-adult-external]');
 if(external){if(!window.confirm('该外部 COS 图源可能包含非全年龄内容。确认你已年满 18 岁并主动打开原站？'))e.preventDefault();return;}
 const b=e.target.closest('[data-source]');if(!b)return;
 preemptBackgroundExcept(null); // abort old channel downloads, not just its pending queue
 if(b.dataset.source==='cosbooru'&&!window.confirm('Cosbooru 的站点条款要求访问者年满 18 岁。确认你已满 18 岁并主动进入独立 COS 实验频道？'))return;
  refreshOnlyIds=null;state.sourceFilter=b.dataset.source;saveCurrentSource();state.route='all';state.filter='全部';state.search='';$('search').value='';
 state.main='推荐';state.anchor=null;state.refreshNonce++;draw();
 loadDatabaseSource(b.dataset.source);
 if(['konachan','safebooru','safedonmai','zerochan','miyoushe_cos','wallhaven','nekosia','pixiv_yuki','cosbooru','e_shuushuu'].includes(b.dataset.source)){
  $('liveStatus').textContent='正在从 '+b.textContent.trim()+' 发现作品（图片由浏览器直接请求原站）…';
  loadLiveArtwork({force:true,onlyProviders:[b.dataset.source]});
 }else if(b.dataset.source==='everything')loadLiveArtwork({force:true,onlyProviders:['safebooru','konachan','nekosia','pixiv_yuki','e_shuushuu']});
});
/* Press Enter for a direct source-tag search; typing stays local-only. */
const SOURCE_TAG_ALIASES={
 '初音未来':'hatsune_miku','初音':'hatsune_miku','原神':'genshin_impact',
 '蔚蓝档案':'blue_archive','明日方舟':'arknights','东方project':'touhou',
 '东方':'touhou','甘雨':'ganyu','刻晴':'keqing','芙宁娜':'furina','雷电将军':'raiden_shogun'
};
const REMOTE_ALLOWED_TAGS=new Set(['hatsune_miku','genshin_impact','blue_archive','arknights',
 'touhou','ganyu','keqing','furina','yae_miko','raiden_shogun']);
function upstreamTagOf(value){
 const text=String(value||'').trim().toLowerCase();
 const tag=SOURCE_TAG_ALIASES[text]||text.replace(/\s+/g,'_');
 return REMOTE_ALLOWED_TAGS.has(tag)?tag:null;
}
let remoteSearchIds=null,remoteSearchSequence=0;
const remoteTagPages=new Map();
async function searchOriginalSources(input){
 const tag=upstreamTagOf(input);
 if(!tag){$('liveStatus').textContent='暂不支持该关键词的源站搜索；仍可搜索当前站内作品的标题、作者和标签';return}
 const providers=['konachan','safebooru'].filter(p=>['all','everything',p].includes(state.sourceFilter));
 if(!providers.length){$('liveStatus').textContent='当前图源不支持上游标签查询，请切换「多源推荐」或 Konachan/Safebooru';return}
 const sequence=++remoteSearchSequence,choice=state.sourceFilter;
 const pageKey=providers.join(',')+'|'+tag;
 const page=((remoteTagPages.get(pageKey)||0)%12)+1;
 const status=$('liveStatus');
 status.textContent='正在向 '+providers.join(' / ')+' 查询标签 '+tag+'…';
 const responses=await Promise.allSettled(providers.map(async provider=>{
  const endpoint='/api/discover?source='+provider+'&page='+page+'&tag='+encodeURIComponent(tag)+
   (provider==='safebooru'?'&experimental=1':'');
  const response=await fetch(endpoint,{cache:'no-store',signal:AbortSignal.timeout(11500)});
  if(!response.ok)throw Error(provider+' HTTP '+response.status);
  const body=await response.json();
  if(!body.ok||!Array.isArray(body.works))throw Error(provider+' invalid metadata');
  return normalizeSnapshot({channels:{[provider]:body.works}});
 }));
 if(sequence!==remoteSearchSequence||choice!==state.sourceFilter||$('search').value.trim()!==input.trim())return;
 if(responses.some(x=>x.status==='fulfilled'))remoteTagPages.set(pageKey,page);
 const found=responses.filter(x=>x.status==='fulfilled').flatMap(x=>x.value);
 const failed=responses.filter(x=>x.status==='rejected').map(x=>String(x.reason?.message||x.reason).slice(0,65));
 mergeWorks(found);found.forEach(w=>liveFeedIds.add(w.id));
 remoteSearchIds=new Set(found.map(w=>w.id));
 state.main='推荐';state.route='all';state.filter='全部';state.search=input;
 refreshOnlyIds=null;draw();
 status.textContent='上游标签「'+tag+'」查询返回 '+found.length+' 张作品'+
  (failed.length?'；失败：'+failed.join('、'):'')+
  (!found.length?'；没有可展示的新图片':'（上游搜索结果，并非仅重排旧作品）');
}

$('search').addEventListener('input',e=>{remoteSearchSequence++;remoteSearchIds=null;state.search=e.target.value;draw()});
$('search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchOriginalSources(e.target.value).catch(error=>{$('liveStatus').textContent='源站标签搜索失败：'+String(error.message||error).slice(0,90)})}});
document.querySelectorAll('[data-main]').forEach(b=>b.addEventListener('click',()=>setMain(b.dataset.main)));
$('home').onclick=e=>{e.preventDefault();setRoute('all');window.scrollTo({top:0,behavior:'smooth'})};
$('surprise').onclick=pickNew;$('jumpNow').onclick=pickNew;$('sideJump').onclick=()=>setRoute('character');$('upload').onclick=()=>setMain('收藏');
document.querySelectorAll('[data-rail]').forEach(b=>b.onclick=()=>{const type=b.dataset.rail;if(type==='jump')pickNew();else if(type==='rank')setMain('精选');else if(type==='follow')setMain('关注');else setMain('推荐')});
document.querySelectorAll('[data-mobile]').forEach(b=>b.onclick=()=>{const type=b.dataset.mobile;if(type==='jump')pickNew();else if(type==='rank')setMain('精选');else if(type==='follow')setMain('关注');else if(type==='upload')setMain('收藏');else setMain('推荐')});
$('closeReader').onclick=closeReader;$('btnCloseIcon').onclick=closeReader;$('prevArt').onclick=()=>swapArt(-1);$('nextArt').onclick=()=>swapArt(1);
$('btnFit').onclick=()=>resetZoom();$('btnOriginal').onclick=openSource;
$('kiraReportWork').addEventListener('click',()=>{const work=state.focus;if(work)void reportKiraWork(work.source,work.sourcePostId||work.pid,$('kiraReportWork'))});
$('btnFullImage').onclick=openFullImageOnDemand;
$('zoomPercent').addEventListener('change',e=>{changeZoom(Number(e.target.value)/100);e.target.value=String(Math.round(state.zoom*100))});
$('zoomPercent').addEventListener('keydown',e=>{if(e.key==='Enter')e.currentTarget.blur()});
$('readerPreviewRetry').onclick=()=>{if(state.focus)loadWorkPreview(state.focus,{force:true})};
$('readerStageReport').onclick=()=>{$('kiraReportWork').click()};
$('mediaRetry').onclick=()=>{if(state.focus)loadWorkPreview(state.focus,{force:true})};
let lastTouchDoubleZoom=0;
$('pictureCanvas').addEventListener('dblclick',e=>{if(e.target?.id!=='viewerImage'||state.moving||Date.now()-lastTouchDoubleZoom<550)return;e.preventDefault();state.zoom>1.01?resetZoom():changeZoom(2.5)});
$('favArt').onclick=async()=>{const w=state.focus;if(!w)return;
 const removing=state.liked.has(w.id);
 if(removing)state.liked.delete(w.id);else state.liked.add(w.id);
 try{const q=await import('/assets/archive-intents.js');
  if(removing)q.cancelFavoriteIntent(w.id,localStorage);
  else q.recordFavoriteIntent(w,localStorage);
  toast(removing?'已取消收藏':'已收藏 · 原图等待云端备份');
 }catch(e){console.warn('收藏任务待恢复',e);
  toast(removing?'已取消收藏':'已收藏 · 原图备份任务尚未建立');
 }
 try{localStorage.setItem('kira.likes.v2',JSON.stringify([...state.liked]))}catch{}
 const syncKey=favoriteSyncKey(w);
 if(syncKey){if(removing)syncedFavoriteKeys.delete(syncKey);else syncedFavoriteKeys.add(syncKey)}
 void userSyncBridge.then(m=>m?.recordFavoriteMutation(w,!removing));
 if(accountAuthenticated)void userSyncBridge.then(m=>m?.flushUserSync());
 fillFav();if(state.main==='收藏')draw()
};
function fillFav(){const active=state.liked.has(state.focus.id);$('favArt').classList.toggle('faved',active);$('favArt').querySelector('span').textContent=active?'已收藏':'收藏作品'}
$('followArtist').onclick=()=>{const w=state.focus;if(!w||!w.artistVerified)return;const active=!state.followed.has(w.artistKey);if(!active){state.followed.delete(w.artistKey);toast('已取消关注 '+w.artist)}else{state.followed.add(w.artistKey);toast('已关注画师 '+w.artist)}try{localStorage.setItem('kira.follows.v2',JSON.stringify([...state.followed]))}catch{}void userSyncBridge.then(m=>m?.recordFollowMutation(w.artistKey,active));if(accountAuthenticated)void userSyncBridge.then(m=>m?.flushUserSync());$('followArtist').textContent=state.followed.has(w.artistKey)?'✓ 已关注':'＋ 关注';if(state.main==='关注')draw()};
$('copyArt').onclick=async()=>{const w=state.focus;const u=new URL(window.location.href);u.hash='art-'+w.id;try{await navigator.clipboard.writeText(u.href);toast('已复制 KIRA 作品链接')}catch{toast(w.sourceName+' 作品编号：'+w.pid)}};

$('accountButton')?.addEventListener('click',()=>{
 const dialog=$('accountDialog');if(dialog&&!dialog.open)dialog.showModal();
 void userAuthBridge.then(m=>m?.accountStatus());
});
$('accountForm')?.addEventListener('submit',e=>e.preventDefault());
async function runAccountAction(kind){
 const email=$('accountEmail')?.value.trim()||'',password=$('accountPassword')?.value||'',status=$('accountStatus');
 if(status)status.textContent=kind==='signin'?'正在登录…':'正在创建账号…';
 const m=await userAuthBridge;if(!m){if(status)status.textContent='账号模块加载失败';return}
 const result=kind==='signin'?await m.signIn(email,password):await m.signUp(email,password);
 if(result.ok){
  if(status)status.textContent=result.data?.confirmation_required?'注册成功，请先到邮箱完成验证后再登录。':'账号已连接，正在同步本机收藏与关注…';
 }else if(status)status.textContent=result.status===503?'账号后端尚未配置，收藏仍会安全保存在本机。':'操作失败，请检查邮箱、密码或网络后重试。';
}
$('accountSignIn')?.addEventListener('click',()=>void runAccountAction('signin'));
$('accountSignUp')?.addEventListener('click',()=>void runAccountAction('signup'));
$('accountSignOut')?.addEventListener('click',()=>void userAuthBridge.then(async m=>{await m?.signOut();updateAccountUi({authenticated:false});}));
$('accountSync')?.addEventListener('click',()=>void userAuthBridge.then(async m=>{
 const status=$('accountStatus');if(status)status.textContent='正在同步收藏与关注…';
 const snapshot=await m?.pullAccountSnapshot();
 await m?.pullAccountDelta();
 if(status)status.textContent=snapshot?.ok?'同步完成 · 已合并其它设备上的收藏与关注':'同步暂不可用，本机数据不会丢失';
}));
setTimeout(()=>void userAuthBridge.then(m=>m?.accountStatus()),1800);

$('readerTags').addEventListener('click',e=>{const b=e.target.closest('[data-term]');if(!b)return;const term=b.dataset.term;closeReader();state.search=term;state.filter='全部';state.route='all';state.main='推荐';$('search').value=term;draw();window.scrollTo({top:0,behavior:'smooth'})});
$('reader').addEventListener('click',e=>{const path=e.target.closest('[data-path]');const suggestion=e.target.closest('[data-related]');if(path){state.relatedPath=path.dataset.path;relatedDraw()}else if(suggestion){openReader(suggestion.dataset.related,null)}});
// Browser Back closes the reader; Forward restores its indexed artwork without leaving KIRA.
window.addEventListener('popstate',()=>{
 const match=/^#art-(\d+)$/.exec(location.hash);
 if(!match){if(state.focus)closeReader();return}
 const target=byId(Number(match[1]));
 if(target&&state.focus?.id!==target.id)openReader(target.id,null);
});
window.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(state.focus)closeReader();$('search').focus();return}
 if(!state.focus)return;
 if(e.key==='Escape'){closeReader();return}
 if(e.target.closest?.('input,textarea,select,[contenteditable]'))return;
 if(e.key==='ArrowRight')swapArt(1);else if(e.key==='ArrowLeft')swapArt(-1);
 else if(e.key==='+'||e.key==='=')changeZoom(state.zoom*1.25);
 else if(e.key==='-'||e.key==='_')changeZoom(state.zoom/1.25);
 else if(e.key==='0')resetZoom();else if(e.key.toLowerCase()==='o')openSource();
});
$('readerStage').addEventListener('wheel',e=>{if(!state.focus||e.target.closest('input'))return;e.preventDefault();changeZoom(state.zoom*Math.exp(-Math.sign(e.deltaY)*.12))},{passive:false});
// Pointer Events support mouse dragging, swipe-to-next and pinch-to-zoom on mobile.

const pointers=new Map();let anchor=null,pinchDistance=0,pinchStartZoom=1,lastTapTime=0,lastTapX=0,lastTapY=0;
function distance(){const v=[...pointers.values()];return Math.hypot(v[0].x-v[1].x,v[0].y-v[1].y)}
$('readerStage').addEventListener('pointerdown',e=>{
 if(e.target.closest('button,input,label')||!state.focus)return;
 state.moving=false;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,onImage:e.target?.id==='viewerImage'});
 if(pointers.size===1)anchor={x:e.clientX,y:e.clientY,panX:state.panX,panY:state.panY};
 if(pointers.size===2){pinchDistance=distance();pinchStartZoom=state.zoom;anchor=null}
 try{$('readerStage').setPointerCapture(e.pointerId)}catch{}
});
$('readerStage').addEventListener('pointermove',e=>{
 if(!pointers.has(e.pointerId))return;
 pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(pointers.size===2){
  const scale=distance()/Math.max(1,pinchDistance);
  state.zoom=Math.max(1,pinchStartZoom*scale);
  applyZoom(false);state.moving=true;return;
 }
 if(!anchor)return;
 const dx=e.clientX-anchor.x,dy=e.clientY-anchor.y;
 if(Math.abs(dx)+Math.abs(dy)>8)state.moving=true;
 if(state.zoom>1.01){state.panX=anchor.panX+dx;state.panY=anchor.panY+dy;applyZoom(false)}
});
function pointerEnd(e){
 if(!pointers.has(e.pointerId))return;
 const dx=anchor?e.clientX-anchor.x:0;
 const ended=pointers.get(e.pointerId);
 if(e.type==='pointerup'&&e.pointerType==='touch'&&ended?.onImage&&!state.moving&&pointers.size===1){
  const now=Date.now();
  if(now-lastTapTime<350&&Math.hypot(e.clientX-lastTapX,e.clientY-lastTapY)<45){
   lastTapTime=0;
   lastTouchDoubleZoom=now;
   state.zoom>1.01?resetZoom():changeZoom(2.5);
  }else{lastTapTime=now;lastTapX=e.clientX;lastTapY=e.clientY}
 }
 pointers.delete(e.pointerId);
 if(pointers.size===0){
  if(state.zoom<=1.01&&Math.abs(dx)>85&&state.moving)swapArt(dx<0?1:-1);
  if(state.zoom<1.02)resetZoom(false);
  anchor=null;setTimeout(()=>state.moving=false,60);
 }else if(pointers.size===1){const p=[...pointers.values()][0];anchor={x:p.x,y:p.y,panX:state.panX,panY:state.panY}}
}
$('readerStage').addEventListener('pointerup',pointerEnd);
$('readerStage').addEventListener('pointercancel',pointerEnd);

/* Tap the image to hide/reveal controls; retain double-tap zoom and swipes. */
$('readerStage').addEventListener('click',e=>{
 if(!state.focus||state.moving||e.target.closest('button,a,input')||e.detail>1)return;
 $('reader').classList.toggle('reader-controls-hidden');
});
// Snap states: more information, balanced, almost-fullscreen artwork.
let readerSheetPosition=1;
function setReaderSheetPosition(position){
 readerSheetPosition=Math.max(0,Math.min(2,Math.round(position)));
 $('reader').dataset.sheetPosition=String(readerSheetPosition);
 $('readerSheetHandle').setAttribute('aria-valuenow',String(readerSheetPosition));
 if(state.focus){const im=$('viewerImage');if(im?.naturalWidth){requestAnimationFrame(()=>fitMedia(+im.dataset.naturalWidth||im.naturalWidth,+im.dataset.naturalHeight||im.naturalHeight));setTimeout(()=>fitMedia(+im.dataset.naturalWidth||im.naturalWidth,+im.dataset.naturalHeight||im.naturalHeight),260)}}
}
setReaderSheetPosition(1);
{
 const handle=$('readerSheetHandle');let startY=null,initial=1;
 handle.addEventListener('pointerdown',e=>{startY=e.clientY;initial=readerSheetPosition;handle.setPointerCapture(e.pointerId);e.stopPropagation()});
 handle.addEventListener('pointerup',e=>{
  if(startY===null)return;
  const dy=e.clientY-startY;startY=null;
  if(Math.abs(dy)<16){setReaderSheetPosition((initial+1)%3);return}
  setReaderSheetPosition(initial+(dy>0?1:-1));
  e.stopPropagation();
 });
 handle.addEventListener('pointercancel',()=>{startY=null});
 handle.addEventListener('keydown',e=>{
  if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setReaderSheetPosition(readerSheetPosition+(e.key==='ArrowDown'?1:-1))}
 });
}
let prevCols=innerWidth<=650?2:innerWidth<=850?3:4;window.addEventListener('resize',()=>{const n=innerWidth<=650?2:innerWidth<=850?3:4;if(n!==prevCols){prevCols=n;draw()}if(state.focus&&$('viewerImage').classList.contains('loaded'))fitMedia(+$('viewerImage').dataset.naturalWidth,+$('viewerImage').dataset.naturalHeight);});

/* Per-visitor live discovery; the bundled catalog is only a fallback / Pixiv choice.
   No original image data or server-side image storage is created by these calls. */
const SOURCE_PAGES={zerochan:100,safedonmai:75,e_shuushuu:40,konachan:250,safebooru:120,miyoushe_cos:16,wallhaven:30,nekosia:120,pixiv_yuki:30,cosbooru:100};
// One public site, two request routes selected from EdgeOne GEO.
const MAINLAND_DISCOVERY_PROVIDERS=['miyoushe_cos','konachan'];
const GLOBAL_DISCOVERY_PROVIDERS=['konachan','safebooru','nekosia','e_shuushuu','pixiv_yuki','cosbooru'];
const ALL_LIVE_PROVIDERS=['konachan','safebooru','safedonmai','zerochan','miyoushe_cos','wallhaven','nekosia','pixiv_yuki','cosbooru','e_shuushuu'];
const automaticDiscoveryProviders=()=>isMainlandRoute()?MAINLAND_DISCOVERY_PROVIDERS:GLOBAL_DISCOVERY_PROVIDERS;
const currentHomeFeedSources=()=>new Set(isMainlandRoute()?[...automaticDiscoveryProviders(),'bilibili_opus']:automaticDiscoveryProviders());
renderRanks();draw();
function currentDiscoveryProviders(){
 if(ALL_LIVE_PROVIDERS.includes(state.sourceFilter))return [state.sourceFilter];
 if(state.sourceFilter==='everything')return [...ALL_LIVE_PROVIDERS];
 if(['pixiv','danbooru','bilibili_opus','bilibili_creator'].includes(state.sourceFilter))return [];
 return automaticDiscoveryProviders();
}
const livePages=(()=>{try{const x=JSON.parse(localStorage.getItem('kira.discovery.pages.v2')||'{}');return x&&typeof x==='object'?x:{}}catch{return {}}})();
// Successful pages are persisted; reservations and failed attempts stay session-local.
const liveSessionPages=new Map(),livePageFailures=new Map(),liveSourceCursors=new Map();
const RANDOM_DISCOVERY_PROVIDERS=new Set(['nekosia','pixiv_yuki']);
function nextLivePage(provider,tag=''){
 const key=provider+(tag?':'+tag:'');
 const count=tag?10:(SOURCE_PAGES[provider]||120);
 const session=liveSessionPages.get(key)||new Set();
 liveSessionPages.set(key,session);
 if(RANDOM_DISCOVERY_PROVIDERS.has(provider)){
  const previous=new Set(Array.isArray(livePages[key])?livePages[key]:[]);
  const pool=Array.from({length:count},(_,i)=>i+1).filter(n=>!session.has(n)&&!previous.has(n));
  const available=pool.length?pool:Array.from({length:count},(_,i)=>i+1).filter(n=>!session.has(n));
  if(!available.length)return null;
  const random=crypto.getRandomValues(new Uint32Array(1))[0];
  const page=available[random%available.length];session.add(page);return page;
 }
 if(provider.startsWith('miyoushe_')){
  const more=[...session].find(page=>liveSourceCursors.has(key+':'+page)&&Date.now()>=(livePageFailures.get(key+':'+page)||0));
  if(more!==undefined)return more;
 }
 const used=new Set(Array.isArray(livePages[key])?livePages[key]:[]);
 const available=Array.from({length:count},(_,i)=>i+1).filter(n=>
  !session.has(n)&&Date.now()>=(livePageFailures.get(key+':'+n)||0));
 if(!available.length)return null; // Honest end of the currently supported page range.
 // Recheck the latest page on each visit: an old successful page can contain new posts.
 // Repeated site visits should continue the unexplored upstream page pool.
 const fresh=available.filter(n=>!used.has(n));
 let page=available.includes(1)&&session.size===0&&used.size===0?1:null;
 const candidates=fresh.length?fresh:available;
 if(page===null){
  const values=new Uint32Array(1);crypto.getRandomValues(values);
  page=candidates[values[0]%candidates.length];
 }
 session.add(page); // Reserve during this request, not in persistent storage.
 return page;
}
function finishLivePage(provider,tag,page,success){
 const key=provider+(tag?':'+tag:'');
 if(!success){
  liveSessionPages.get(key)?.delete(page);
  livePageFailures.set(key+':'+page,Date.now()+15000);
  return;
 }
 livePageFailures.delete(key+':'+page);
 if(RANDOM_DISCOVERY_PROVIDERS.has(provider)){
  const session=liveSessionPages.get(key);session?.add(page);
  if(session?.size>=(SOURCE_PAGES[provider]||120))session.clear();
  return; // Random APIs have samples, not finite pages.
 }
 const count=tag?10:(SOURCE_PAGES[provider]||120);
 livePages[key]=[...new Set([...(Array.isArray(livePages[key])?livePages[key]:[]),page])].slice(-count);
 try{localStorage.setItem('kira.discovery.pages.v2',JSON.stringify(livePages))}catch{}
}

function refreshJumpThumbnails(){
 const pool=WORKS.filter(w=>['konachan','safebooru'].includes(w.source)&&!viewHistory.includes(w.id));
 const selected=(pool.length>=3?pool:WORKS).slice(0,3);
 const positions=['character','color','mood'];
 positions.forEach((name,i)=>{
  const btn=document.querySelector('.jumpchoice[data-route="'+name+'"]'),work=selected[i];
  if(!btn||!work)return;
  let img=btn.querySelector('img');
  if(!img){img=document.createElement('img');img.alt='';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';btn.querySelector('.choice-icon')?.replaceWith(img)}
  if(img.src!==work.card)img.src=work.card;
 });
}
function mergeWorks(incoming){
 let inserted=0;const index=new Set(WORKS.map(w=>w.id));
 for(const w of incoming){
  if(w.source==='miyoushe_art')continue;
  if(!index.has(w.id)){
   WORKS.push(w);index.add(w.id);inserted++;
   const key=favoriteSyncKey(w);
   if(userSnapshotLoaded&&key){if(syncedFavoriteKeys.has(key))state.liked.add(w.id);else state.liked.delete(w.id)}
   if(accountAuthenticated&&state.liked.has(w.id))void userSyncBridge.then(m=>m?.recordFavoriteMutation(w,true));
  }
 }
 return inserted;
}
const DISCOVERY_INTEREST_TAGS={
 'genshin':'genshin_impact','vocaloid':'hatsune_miku','blue-archive':'blue_archive',
 'arknights':'arknights','touhou':'touhou'
};
function preferredDiscoveryTag(){
 if(!['推荐','换一批','精选'].includes(state.main))return '';
 const liked=WORKS.filter(w=>state.liked.has(w.id));
 if(!liked.length)return '';
 const weights=new Map();
 for(const work of liked){
  const tag=DISCOVERY_INTEREST_TAGS[work.seriesKey]||
   ['hatsune_miku','ganyu','keqing','furina','yae_miko','raiden_shogun'].find(t=>
    meaningfulTags(work).includes(t.replace(/_/g,' ')));
  if(tag)weights.set(tag,(weights.get(tag)||0)+1);
 }
 return [...weights.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
}
async function queryLive(provider,{deep=false}={}){
 const interestTag=preferredDiscoveryTag();
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),provider==='miyoushe_cos'?20500:14000);
 async function get(tag){
  const page=nextLivePage(provider,tag);
  if(page===null)throw Error('source_pages_exhausted');
  const cursorKey=provider+(tag?':'+tag:'')+':'+page;
  const cursor=liveSourceCursors.get(cursorKey);
  const url='/api/discover?source='+provider+'&page='+page+(cursor?'&cursor='+encodeURIComponent(cursor):'')+
   (['safebooru','safedonmai','zerochan','miyoushe_cos','wallhaven','nekosia','pixiv_yuki','cosbooru','e_shuushuu'].includes(provider)?'&experimental=1':'')+(tag?'&tag='+encodeURIComponent(tag):'');
  try{
  const response=await fetch(url,{cache:'no-store',signal:abort.signal});
  if(!response.ok)throw Error('live_'+provider+'_'+response.status);
  const payload=await response.json();
  if(!payload.ok||payload.source!==provider||!Array.isArray(payload.works))throw Error('invalid_live_metadata');
  if(payload.page!==page)throw Error('source_page_mismatch');
  const records=normalizeSnapshot({channels:{[provider]:payload.works}});
  if(provider.startsWith('miyoushe_')){
   if(payload.page_mode!=='keyword_cursor')throw Error('source_cursor_contract_missing');
   const next=payload.next_cursor;
   if(typeof next==='string'&&/^[a-zA-Z0-9_=.-]{1,160}$/.test(next)&&next!==cursor)liveSourceCursors.set(cursorKey,next);
   else liveSourceCursors.delete(cursorKey);
  }
  finishLivePage(provider,tag,page,true);
  return {provider,page,tag,records,viaCollector:payload.backend_route==='cloudflare-collector'};
  }catch(error){finishLivePage(provider,tag,page,false);throw error}
 }
 try{
  if(interestTag){
   try{
    const targeted=await get(interestTag);
    const known=new Set([...viewHistory,...exposedHistorySet,...WORKS.map(w=>w.id)]);
    const unseen=targeted.records.filter(w=>!known.has(w.id)&&!contentWasExposed(w));
    if(unseen.length)return {...targeted,records:unseen,pages:Number.isSafeInteger(targeted.page)?[targeted.page]:[]};
   }catch(error){console.info('KIRA interest query fallback',provider,String(error).slice(0,65))}
  }
  // Public anonymous discovery can occasionally return 502 or an empty page
  // even while other pages are healthy. Retry ONCE with a different page,
  // without making the entire gallery wait or hammering the source.
  let lastError=null;
  const maxAttempts=deep?(provider==='miyoushe_cos'?3:6):(provider==='miyoushe_cos'?2:3);
  const exposed=new Set([...viewHistory,...exposedHistorySet,...WORKS.map(w=>w.id)]);
  const fresh=new Map(),pages=[];
  for(let attempt=0;attempt<maxAttempts;attempt++){
   try{
    const result=await get('');
    const newOnPage=result.records.filter(w=>!exposed.has(w.id)&&!contentWasExposed(w));
    for(const w of newOnPage){if(!fresh.has(w.id))fresh.set(w.id,w)}
    if(newOnPage.length&&Number.isSafeInteger(result.page))pages.push(result.page);
    // A deep refresh may collect multiple genuinely new pages, not stop after 1 hit.
    if(fresh.size>=(deep?45:20)||pages.length>=(deep?3:2))break;
   }catch(error){
    lastError=error;
    if(error.message==='source_pages_exhausted')break;
    if(abort.signal.aborted)break;
   }
   if(abort.signal.aborted)break;
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(fresh.size)return {provider,records:[...fresh.values()],page:pages[0]||null,pages,tag:'',viaCollector:false};
  if(lastError&&lastError.message!=='source_pages_exhausted')console.info('No fresh records',provider,String(lastError).slice(0,70));
  return {provider,records:[],page:null,pages:[],tag:'',viaCollector:false};
 }finally{clearTimeout(timer)}
}
function isVisibleDiscoveryProvider(provider){
 if(state.sourceFilter==='everything')return ALL_LIVE_PROVIDERS.includes(provider);
 if(state.sourceFilter==='all')return automaticDiscoveryProviders().includes(provider);
 return state.sourceFilter===provider;
}
const liveProviderCooldown=new Map();
let autoDiscoveryRetryTimer=null;
function scheduleAutoDiscoveryRetry(delay){
 if(autoDiscoveryRetryTimer)clearTimeout(autoDiscoveryRetryTimer);
 autoDiscoveryRetryTimer=setTimeout(()=>{
  autoDiscoveryRetryTimer=null;
  const sentinel=$('feedMore'),rect=sentinel?.getBoundingClientRect();
  const inRange=rect&&rect.top<innerHeight+FEED_PREFETCH_PX&&rect.bottom>=-300;
  if(inRange&&!sentinel.hidden&&!state.focus&&!pendingLive&&
      ['推荐','精选','换一批'].includes(state.main)){
   lastAutoFetch=Date.now();void loadNextGalleryBatch();
  }
 },Math.min(20000,Math.max(450,delay)));
}
async function loadLiveArtwork({force=false,first=false,auto=false,deep=false,onlyProviders=null,suppressDraw=false,appendOnly=false}={}){
 const requested=onlyProviders||currentDiscoveryProviders();
 const providers=requested.filter(p=>!activeLiveProviders.has(p)&&(!auto||Date.now()>=(liveProviderCooldown.get(p)||0)));
 if(!providers.length){
  if(auto&&requested.length&&!pendingLive){
   const due=requested.map(p=>liveProviderCooldown.get(p)||0).filter(t=>t>Date.now());
   if(due.length)scheduleAutoDiscoveryRetry(Math.min(...due)-Date.now()+200);
  }
  return 0;
 }
 providers.forEach(p=>activeLiveProviders.add(p));
 pendingLive=true;
 const status=$('liveStatus');
 if(status)status.textContent='正在连接实时图源…';
 let addedTotal=0,found=0,usedCollector=false,persistedTotal=0;
 const sourceFailures=[];
 const persistTasks=[];
 try{
  // Each provider is committed to the browser immediately on success; never wait for a slower peer.
  await Promise.all(providers.map(async provider=>{
   try{
    const result=await queryLive(provider,{deep});
    // Every successful user-triggered discovery helps grow the shared D1
    // catalogue. The Worker refetches the fixed provider/page itself, so browser
    // metadata is never trusted for writes. Deep scrolls may persist up to 3 pages.
    if(DB_CHANNELS.has(provider)&&provider!=='pixiv'){
     const pages=[...new Set(Array.isArray(result.pages)?result.pages:[result.page])]
      .filter(page=>Number.isSafeInteger(page)&&page>=1&&page<=75).slice(0,deep?3:1);
     if(pages.length)persistTasks.push(fetch('/api/catalog/refresh',{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify({source:provider,pages}),
      signal:AbortSignal.timeout(deep?18000:12000)})
      .then(async response=>response.ok?response.json():null)
      .then(info=>{if(info?.ok)persistedTotal+=Number(info.new_posts)||0})
      .catch(()=>{}));
    }
    found++;
    if(result.viaCollector)usedCollector=true;
    const known=new Set(WORKS.map(w=>w.id));
    result.records.forEach(w=>liveFeedIds.add(w.id));
    const newlyReceived=result.records.filter(w=>!known.has(w.id));
    const added=mergeWorks(result.records);addedTotal+=added;
    if(refreshOnlyIds)newlyReceived.forEach(w=>refreshOnlyIds.add(w.id));
     liveProviderCooldown.set(provider,Date.now()+(added?2500:9000));
    result.records.forEach(w=>{if(!viewHistory.includes(w.id))liveHotIds.add(w.id)});
    if(added){
     refreshJumpThumbnails();
     if(result.tag&&status)status.textContent='按收藏主题 '+result.tag+' 发现相关新作品…';
     const selectedSource=isVisibleDiscoveryProvider(provider);
     if(selectedSource)state.anchor=result.records.find(w=>!viewHistory.includes(w.id))?.id||state.anchor||WORKS[0]?.id;
     if(selectedSource&&!suppressDraw&&!appendOnly&&state.main!=='收藏'&&state.main!=='关注'&&!state.focus){
      if(!state.shown.length||!document.querySelector('.art-col')){draw();}
      else if(['推荐','换一批','精选'].includes(state.main)){
       const mounted=new Set(state.shown.map(w=>w.id));
       const additional=baseList().filter(w=>!mounted.has(w.id));
       if(additional.length){state.shown.push(...additional);appendFeedBatch();
        $('feedCount').textContent='· '+state.shown.length+' 张作品';}
      }
     }
     if(status)status.textContent='已从 '+provider+' 发现 '+added+' 张 · 其他图源加载中…';
    }
   }catch(error){
     liveProviderCooldown.set(provider,Date.now()+15000);
     sourceFailures.push(provider+': '+String(error.message||error).slice(0,50));
     console.warn('KIRA source temporarily unavailable',provider,String(error).slice(0,100));
    }
  }));
  // Persistence is background work: never hold the visible feed on a D1 write.
  if(persistTasks.length)void Promise.allSettled(persistTasks).then(()=>{
   if(status&&persistedTotal>0)status.dataset.persistedPosts=String(persistedTotal);
  });
  if(status)status.textContent=(addedTotal?'实时发现 '+addedTotal+' 张作品':found?'已连接 '+found+' 个图源，本轮没有新作品':'实时图源暂不可用')+(sourceFailures.length?'；失败：'+sourceFailures.slice(0,3).join('、'):'');
  if(force&&!auto&&!suppressDraw&&!addedTotal)toast('本轮原站没有返回新作品，已保留现有结果');
  if(auto&&!appendOnly&&addedTotal>0&&state.renderedCount>=state.shown.length){
   setTimeout(()=>{
    const button=$('feedMore'),rect=button?.getBoundingClientRect();
    if(rect&&rect.top<innerHeight+650&&!pendingLive&&Date.now()-lastAutoFetch>=3600){
     lastAutoFetch=Date.now();void loadNextGalleryBatch();
    }
   },3900);
  }
  return addedTotal;
 }finally{providers.forEach(p=>activeLiveProviders.delete(p));pendingLive=activeLiveProviders.size>0}
}

async function refreshFeed(){
 if(refreshInProgress)return 0;
 refreshInProgress=true;
 const before=new Set(WORKS.map(w=>w.id));
 const spinner=$('feedMore');
 spinner.hidden=false;spinner.classList.add('loading');
 try{
  await Promise.allSettled([loadNewlyIndexedCatalog({force:true,appendOnly:true}),loadLiveArtwork({force:true,deep:true,appendOnly:true})]);
  const fresh=WORKS.filter(w=>!before.has(w.id)&&!exposedHistorySet.has(w.id)&&!viewHistory.includes(w.id)&&!contentWasExposed(w)&&contentEligible(w)&&isVisibleDiscoveryProvider(w.source));
  const count=appendFreshGalleryCards(fresh);
  $('liveStatus').textContent=count?'已在当前作品下方追加 '+count+' 张作品':'原图源本轮无新增；已保留当前位置，不重复刷出旧图';
  return count;
 }finally{refreshInProgress=false;spinner.classList.remove('loading')}
}
/* Public metadata is published as content-addressed static shards. No image bytes,
 * user collection state or private credentials are written into these files.
 * Legacy complete snapshot remains a safe fallback for cold start and old builds. */
async function fetchPublicCatalog(){
 const legacy=async()=>{
  const r=await fetch('/assets/pixiv-feed.json',{cache:'default'});
  if(!r.ok)throw Error('snapshot_'+r.status);
  return r.json();
 };
 try{
  const r=await fetch('/assets/catalog/manifest.json',{cache:'no-cache'});
  if(!r.ok)throw Error('catalog_manifest_'+r.status);
  const manifest=await r.json();
  if(manifest.schema!==1||manifest.kind!=='kira-public-metadata'||
     !Array.isArray(manifest.shards)||manifest.shards.length>512||
     manifest.total>500000||!manifest.shards.length)throw Error('catalog_manifest_invalid');
  const channels=Object.create(null);
  const edgeWanted=EDGEONE_PRIMARY
   ? new Set(state.sourceFilter==='everything'
     ? manifest.shards.map(x=>x.channel)
     : state.sourceFilter!=='all'&&state.sourceFilter!=='everything'
      ? [state.sourceFilter]
      : isMainlandRoute()
       ? ['bilibili_opus','miyoushe_cos','konachan']
       : ['konachan','safebooru','nekosia','e_shuushuu','pixiv_yuki','cosbooru'])
   : null;
  const descriptors=edgeWanted?manifest.shards.filter(x=>edgeWanted.has(x.channel)):manifest.shards;
  const expectedTotal=descriptors.reduce((sum,x)=>sum+(Number(x.count)||0),0);
  let next=0,total=0;
  const run=async()=>{
   while(next<descriptors.length){
    const item=descriptors[next++];
    if(!item||typeof item.channel!=='string'||!/^[a-z0-9_-]{1,50}$/.test(item.channel)||
       typeof item.url!=='string'||!/^\/assets\/catalog\/[a-z0-9_-]+-[0-9]{3}-[a-f0-9]{16}\.json$/.test(item.url)||
       !Number.isSafeInteger(item.count)||item.count<1||item.count>96)throw Error('catalog_descriptor_invalid');
    const response=await fetch(item.url,{cache:'force-cache'});
    if(!response.ok)throw Error('catalog_shard_'+response.status);
    const payload=await response.json();
    if(payload.channel!==item.channel||!Array.isArray(payload.works)||payload.works.length!==item.count)
      throw Error('catalog_shard_invalid');
    (channels[item.channel]??=[]).push(...payload.works);
    total+=payload.works.length;
   }
  };
  await Promise.all(Array.from({length:Math.min(4,descriptors.length)},()=>run()));
  if(total!==expectedTotal)throw Error('catalog_count_mismatch');
  return {channels};
 }catch(error){
  console.warn('Catalog shard fallback:',error?.message||error);
  return legacy();
 }
}
async function hydrateRealPixiv(){
 // D1 gets first chance to paint. Only a small live-source cohort competes with
 // first-screen thumbnails; the remaining regional sources join after paint.
 const liveProviders=currentDiscoveryProviders();
 const firstLive=liveProviders.slice(0,3),laterLive=liveProviders.slice(3);
 const live=loadLiveArtwork({first:true,onlyProviders:firstLive});
 if(laterLive.length)setTimeout(()=>{
  if(!state.focus)void loadLiveArtwork({onlyProviders:laterLive,suppressDraw:false});
 },1800);
 const snapshot=fetchPublicCatalog().then(normalizeSnapshot).catch(()=>[]);

 const archived=await snapshot;mergeWorks(archived);
 // Mainland first paint comes from EdgeOne's own static hot index. Do not hold
 // it behind a cross-region D1 request or a slow external image provider.
 if(EDGEONE_PRIMARY&&archived.length&&!state.focus){
  allowSnapshotFallback=true;draw();
  const status=$('liveStatus');if(status)status.textContent='已加载 EdgeOne 区域热索引 · 正在后台发现新作品…';
 }
 // Allow responsive live providers to paint immediately. If all live feeds stall,
 // state that we are showing a static backup rather than calling it "new".
 await Promise.race([live,new Promise(resolve=>setTimeout(resolve,4500))]);
 if(!liveFeedIds.size&&archived.length){
  allowSnapshotFallback=true;
  if(!state.focus){draw();$('liveStatus').textContent='实时图源响应较慢，当前临时显示历史索引（不是新作品）';}
 }
 await live;
 if(liveFeedIds.size){
  allowSnapshotFallback=false;
  if(!state.focus&&state.renderedCount===0)draw();
 }
 if(!WORKS.length){
  $('feedTitle').textContent='外部作品索引暂不可用';
  $('artWall').innerHTML='<div class="empty-feed"><strong>暂时没有取得真实作品</strong>请点击「实时换一批」再次请求图源。</div>';
  $('feedCount').textContent='· 0 张';
  return;
 }
 if(!state.focus&&state.renderedCount===0)draw();
 const foot=document.querySelector('.foot-note span');
 if(foot)foot.textContent='KIRA / '+liveFeedIds.size+' LIVE / '+WORKS.length+' TOTAL INDEXED / DIRECT MEDIA';
 if(/^#art-\d+$/.test(location.hash)){const w=byId(Number(location.hash.slice(5)));if(w)openReader(w.id,null)}
}

/* Read only server-indexed records. Missing D1 is an empty state, not success. */
async function loadDatabaseOpus(){
 try{
  const staticResponse=await fetch('/assets/bilibili-catalog.json',{cache:'no-cache'});
  if(staticResponse.ok){
   const snapshot=await staticResponse.json();
   if(snapshot?.schema===1&&snapshot?.channels?.bilibili_opus){
    const inserted=mergeWorks(normalizeSnapshot(snapshot));
    if(inserted&&!state.focus)draw();
   }
  }
 }catch(error){console.info('D1 snapshot unavailable',String(error).slice(0,70))}
 try{
  const response=await fetch('/api/catalog?source=bilibili_opus&limit=60',{cache:'no-store'});
  if(!response.ok)return;
  const payload=await response.json();
  if(!payload.ok||!Array.isArray(payload.works))return;
  const entries=[];
  for(const work of payload.works){
   for(const img of work.images||[]){
    if(!Number.isInteger(img.image_index)||img.image_index<0||img.image_index>31)continue;
    let hash=2166136261;
    for(const character of String(work.source_post_id)+':'+img.image_index){
     hash^=character.charCodeAt(0);hash=Math.imul(hash,16777619)
    }
    entries.push({source:'bilibili_opus',pid:hash>>>0,page:img.image_index,
     title:work.title||'',author:work.author||'',tags:['bilibili','opus','插画'],
     width:img.width,height:img.height,thumbnail_url:img.thumbnail_url,
     preview_url:img.preview_url,original_url:null,source_url:work.canonical_url,
     pixiv_url:work.canonical_url,r18:false})
   }
  }
  const added=mergeWorks(normalizeSnapshot({channels:{bilibili_opus:entries}}));
  if(added&&!state.focus)draw();
 }catch(error){console.info('KIRA public catalog unavailable',String(error).slice(0,70))}
}
loadDatabaseOpus();
/* Read the same central catalogue for any registered provider channel.
 * No browser-side image database and no per-image cross-border D1 requests.
 * If the database isn't bound, the existing live discovery adapter can still
 * serve that channel; a missing DB is never called a populated catalogue.
 */
const DB_CHANNELS=new Set(['bilibili_opus','pixiv','konachan','safebooru','safedonmai','nekosia','e_shuushuu','pixiv_yuki','zerochan','miyoushe_cos','cosbooru']);
// Bucket random seeds so hundreds of visitors can share short-lived CDN/D1 gateway cache entries.\n// 257 rotations still provide broad per-visit variety without a unique cache key per user.\nconst D1_RANDOM_SEED=1+(crypto.getRandomValues(new Uint32Array(1))[0]%257);
const DB_FETCHES=new Map();
const DB_CURSORS=new Map();
const DB_EXHAUSTED=new Set();
const DB_LAST_HEAD_CHECK=new Map();
let lastFreshCatalogCheck=0;
async function loadNewlyIndexedCatalog({force=false,appendOnly=false}={}){
 // Continue reading older indexed rows using the existing keyset cursor.
 // Revisit the head ONLY after a source is exhausted (bounded by 90s), never
 // reset its pagination cursor on every scroll. Discovery writes are separately
 // throttled through /api/catalog/refresh; ordinary catalogue reads stay read-only.
 const now=Date.now();
 if(!force&&now-lastFreshCatalogCheck<45000)return 0;
 lastFreshCatalogCheck=now;
 const all=currentDiscoveryProviders();
 const eligible=all.filter(source=>DB_CHANNELS.has(source));
 if(!eligible.length)return 0;
 const results=await Promise.allSettled(eligible.map(async source=>{
  if(DB_FETCHES.has(source))return DB_FETCHES.get(source);
  if(!DB_EXHAUSTED.has(source))
   return loadDatabaseSource(source,{pages:appendOnly?3:1,appendOnly});
  if(now-(DB_LAST_HEAD_CHECK.get(source)||0)<90000)return 0;
  DB_LAST_HEAD_CHECK.set(source,now);
  return loadDatabaseSource(source,{pages:1,restart:true,appendOnly});
 }));
 return results.reduce((sum,r)=>sum+(r.status==='fulfilled'?(Number(r.value)||0):0),0);
}
/* Read multiple small pages only on demand. Never make public visitors write D1. */
async function loadDatabaseSource(source,{pages=2,restart=false,appendOnly=false}={}){
 if(!DB_CHANNELS.has(source))return 0;
 if(DB_FETCHES.has(source))return DB_FETCHES.get(source);
 if(restart){DB_CURSORS.delete(source);DB_EXHAUSTED.delete(source)}
 if(DB_EXHAUSTED.has(source))return 0;
 const task=(async()=>{
  let addedTotal=0;
  const seenCursors=new Set();
  for(let i=0;i<Math.min(3,Math.max(1,pages));i++){
   const cursor=DB_CURSORS.get(source)||'';
   if(seenCursors.has(cursor))break;
   seenCursors.add(cursor);
   const url='/api/catalog?source='+encodeURIComponent(source)+'&limit=60&order=random&seed='+D1_RANDOM_SEED+
    (cursor?'&cursor='+encodeURIComponent(cursor):'');
   const response=await fetch(url,{cache:restart?'no-store':'default',signal:AbortSignal.timeout(10000)});
   if(!response.ok)break;
   const payload=await response.json();
   if(!payload.ok||payload.source!==source||!Array.isArray(payload.works))break;
   const records=[];
   for(const work of payload.works){
    if(work.source!==source||!Array.isArray(work.images))continue;
    const pid=source==='bilibili_opus'?kiraStablePostNumber(work.source_post_id):Number(work.source_post_id);
    if(!Number.isSafeInteger(pid)||pid<1)continue;
    for(const image of work.images.slice(0,32)){
     if(!Number.isSafeInteger(image.image_index)||image.image_index<0||image.image_index>31)continue;
     const cnThumb=isMainlandRoute()?allowedImage(image.cn_thumbnail_url):null;
     const cnPreview=isMainlandRoute()?allowedImage(image.cn_preview_url):null;
     records.push({source,pid,source_post_id:String(work.source_post_id),page:image.image_index,title:work.title||'',
      author:work.author||'',artist_verified:false,tags:Array.isArray(work.tags)?work.tags:[],
      width:image.width,height:image.height,thumbnail_url:cnThumb||image.thumbnail_url,
      preview_url:cnPreview||image.preview_url,original_url:image.original_url||null,source_url:work.canonical_url,
      pixiv_url:work.canonical_url,r18:false});
    }
   }
   const prepared=normalizeSnapshot({channels:{[source]:records}});
   prepared.forEach(w=>preparedFeedIds.add(w.id));
   addedTotal+=mergeWorks(prepared);
   if(typeof payload.next_cursor==='string'&&/^r:(?:0|[1-9][0-9]{0,5}):[1-9][0-9]{9}$/.test(payload.next_cursor)&&
      payload.next_cursor!==cursor)DB_CURSORS.set(source,payload.next_cursor);
   else {DB_EXHAUSTED.add(source);break}
  }
  if(addedTotal&&!appendOnly&&!state.focus&&isVisibleDiscoveryProvider(source)){
   if(!state.shown.length||!$('artWall').querySelector('.art-col'))draw();
   else{
    const mounted=new Set(state.shown.map(w=>w.id));
    const extra=baseList().filter(w=>!mounted.has(w.id));
    if(extra.length){state.shown.push(...extra);appendFeedBatch();}
   }
  }
  return addedTotal;
 })().catch(error=>{console.info('KIRA source catalogue unavailable',source,String(error).slice(0,60));return 0});
 DB_FETCHES.set(source,task);
 task.finally(()=>DB_FETCHES.delete(source));
 return task;
}
async function loadPreparedCatalog(){
 // Give shared D1 first-screen priority without opening many cross-region
 // requests at once. Remaining catalogue pools are warmed after first paint.
 const preferred=currentDiscoveryProviders().filter(source=>DB_CHANNELS.has(source));
 if(DB_CHANNELS.has(state.sourceFilter)&&!preferred.includes(state.sourceFilter))preferred.unshift(state.sourceFilter);
 if(isMainlandRoute()&&!preferred.includes('bilibili_opus'))preferred.unshift('bilibili_opus');
 const first=[...new Set(preferred)].slice(0,3);
 await Promise.allSettled(first.map(source=>loadDatabaseSource(source,{pages:1})));
 const archives=['bilibili_opus','pixiv','konachan','safebooru','nekosia','e_shuushuu','pixiv_yuki','miyoushe_cos','cosbooru','safedonmai','zerochan']
  .filter(x=>!first.includes(x));
 if(state.sourceFilter==='all'||state.sourceFilter==='everything'){
  setTimeout(()=>{if(!state.focus)void Promise.allSettled(archives.slice(0,4).map(source=>loadDatabaseSource(source,{pages:1,appendOnly:true})))},2600);
 }
}
void (async()=>{
 if(EDGEONE_PRIMARY){
  await Promise.race([edgeRegionReady,new Promise(resolve=>setTimeout(resolve,350))]);
  // Static shards paint immediately. The same-site /api/catalog route then
  // refreshes from EdgeOne Blob in the background; a Blob miss alone may touch D1.
  void hydrateRealPixiv();
  setTimeout(()=>{if(!state.focus)void loadPreparedCatalog()},1500);
  return;
 }
 const prepared=loadPreparedCatalog();
 // Overseas Cloudflare sits close to D1, so D1 may still seed first paint.
 await Promise.race([prepared,new Promise(resolve=>setTimeout(resolve,700))]);
 void hydrateRealPixiv();
})();

/* Share-link intake for future moderated submissions: strict source parsing, local drafts only. */
const DRAFT_KEY='kira.source.drafts.v1';
function classifySourceUrl(input){
 if(typeof input!=='string'||input.length>4096)throw Error('链接过长');
 let url;try{url=new URL(input.trim())}catch{throw Error('请输入有效的 https 分享链接')}
 if(url.protocol!=='https:'||url.username||url.password)throw Error('只接受 HTTPS 公共分享链接');
 const host=url.hostname.toLowerCase();
 let provider=null,reference=null;
 if(host==='mp.weixin.qq.com'&&(url.pathname==='/s'||url.pathname.startsWith('/s/'))){
  provider='微信公众号';reference=url.pathname.startsWith('/s/')?url.pathname.slice(3):url.searchParams.get('__biz')||'wechat';
 }else if(host==='h5.qzone.qq.com'&&url.pathname==='/universal-share/share'){
  provider='QQ空间';
  try{reference=JSON.parse(url.searchParams.get('busi_data')||'{}')?.share_id||'share-link'}catch{reference='share-link'}
 }else if(host==='b23.tv'&&/^\/[A-Za-z0-9]{4,24}$/.test(url.pathname)){
  provider='B站';reference=url.pathname.slice(1);
 }else if(['www.bilibili.com','m.bilibili.com','bilibili.com','t.bilibili.com'].includes(host)&&
    (/^\/(?:opus|dynamic)\/\d+$/.test(url.pathname)||/^\/video\/BV[0-9A-Za-z]{10}$/.test(url.pathname)||host==='t.bilibili.com'&&/^\/\d+$/.test(url.pathname))){
  provider='B站';reference=url.pathname.split('/').pop();
 }else if(host==='www.pixiv.net'&&/^\/artworks\/\d+$/.test(url.pathname)){
  provider='Pixiv';reference=url.pathname.split('/').pop();
 }else if(['konachan.net','konachan.com'].includes(host)&&/^\/post\/show\/\d+$/.test(url.pathname)){
  provider='Konachan';reference=url.pathname.split('/').pop();
 }else if(host==='safebooru.org'&&url.pathname==='/index.php'&&url.searchParams.get('page')==='post'&&url.searchParams.get('s')==='view'&&/^\d+$/.test(url.searchParams.get('id')||'')){
  provider='Safebooru';reference=url.searchParams.get('id');
 }else if(host==='yande.re'&&/^\/post\/show\/\d+$/.test(url.pathname)){
  provider='Yande.re';reference=url.pathname.split('/').pop();
 }
 if(!provider)throw Error('支持 B 站视频/图文/短链、微信文章、QQ 空间分享，以及 Pixiv/Konachan/Safebooru 等公开作品链接');
 return {source:provider,reference:String(reference).slice(0,100),url:url.href};
}
function readDrafts(){try{const d=JSON.parse(localStorage.getItem(DRAFT_KEY)||'[]');return Array.isArray(d)?d.slice(-30):[]}catch{return []}}
function updateDrafts(drafts){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts.slice(-30)))}catch{}}
function drawDrafts(){
 const drafts=readDrafts();
 $('submitDraftList').innerHTML=drafts.slice().reverse().map((d,i)=>'<div class="submit-draft-item"><span><b>'+esc(d.source)+'</b> · '+esc(d.title||d.reference)+' <small>外链 · 本机草稿（未上传）</small></span><button type="button" data-delete-draft="'+esc(String(drafts.length-i-1))+'" aria-label="删除投稿草稿">删除</button></div>').join('');
}
$('submitLink').onclick=()=>{drawDrafts();$('sourceSubmitDialog').showModal()};
$('submitClose').onclick=()=>$('sourceSubmitDialog').close();
/* Explicit user action only: inspect public metadata, never image bytes or cookies. */
function validSubmissionPreview(url){
 try{
  const u=new URL(url);
  if(u.protocol!=='https:')return null;
  return allowedImage(url)||(['i0.hdslb.com','i1.hdslb.com','i2.hdslb.com','mmbiz.qpic.cn','mmbiz.qlogo.cn','qpic.cn','a1.qpic.cn','a2.qpic.cn'].includes(u.hostname)?u.href:null);
 }catch{return null}
}
function submissionImageRoutes(input){
 try{
  const u=new URL(input);
  if(u.protocol!=='https:')return [];
  const allowed=['i0.hdslb.com','i1.hdslb.com','i2.hdslb.com'];
  if(!allowed.includes(u.hostname))return [u.href];
  return [u.href,...allowed.filter(host=>host!==u.hostname).map(host=>{
   const copy=new URL(u.href);copy.hostname=host;return copy.href;
  })];
 }catch{return []}
}
function drawSubmissionInspection(result){
 const mount=$('sourcePreviewResult');
 if(!result){mount.textContent='';return}
 const candidates=[...(result.images||[]).map(p=>p?.url),result.thumbnail_url,result.preview_url];
 const distinct=[...new Set(candidates.map(validSubmissionPreview).filter(Boolean))].slice(0,8);
 const statuses={
  public_cover:'已找到公开预览地址，正在由你的浏览器直接确认能否显示',
  known_external_artwork:'已找到站内索引元数据，图片仍是外部链接（没有复制到图床）',
  indexed_record_unavailable:'作品链接有效，但未在本次索引里找到可核验的缩略图。请从原站查看',
  metadata_unavailable:'来源平台未返回可访问的公开图片数据',
  login_or_js_render_required:'已识别分享，但图片需要登录或页面脚本，KIRA 不绕过权限',
  no_public_image_metadata:'文章链接可访问，但文章没有提供可直接核验的公开预览图',
  redirect_unavailable:'B 站短链跳转不可用',
  fetch_failed:'来源访问失败或被源站限制',
  page_without_public_preview:'该来源未提供公开预览图'
 };
 const desc=statuses[result.status]||String(result.status||'来源待核验');
 const title=result.title?'<strong>'+esc(result.title)+'</strong>':'<strong>来源：'+esc(result.kind||result.source||'外部作品')+'</strong>';
 const meta=[
  result.author?'来源标注作者：'+result.author:null,
  result.source==='bilibili'&&Number.isSafeInteger(result.author_id)&&result.author_id>0?'B 站作者 UID：'+result.author_id:null,
  result.published_at&&Number.isFinite(Number(result.published_at))?'作品发布时间：'+new Date(Number(result.published_at)*1000).toLocaleDateString('zh-CN'):null,
  result.uploader?'上传者（不代表作者）：'+result.uploader:null,
  result.width&&result.height?'作品标注尺寸：'+result.width+' × '+result.height:null,
  result.opus_id?'B 站图文 ID：'+result.opus_id:null,
  result.share_id?'QQ 分享 ID：'+result.share_id:null,
 ].filter(Boolean);
 const firstSource=typeof result.canonical_url==='string'&&/^https:\/\//.test(result.canonical_url)?result.canonical_url:null;
 mount.innerHTML='<div class="source-inspect-status">'+title+'<p>'+esc(desc)+'</p>'+
  '<small class="submission-mode-note">收录方式：原站外链 · 仅本机草稿 · 不进入 ImgBed 图床 · 不自动公开</small>'+
  meta.map(t=>'<small>'+esc(t)+'</small>').join('')+
  (firstSource?'<a href="'+esc(firstSource)+'" target="_blank" rel="noopener noreferrer">打开外部作品原站 ↗</a>':'')+
  (result.source==='bilibili'&&Number.isSafeInteger(result.author_id)&&result.author_id>0?'<a href="https://space.bilibili.com/'+result.author_id+'" target="_blank" rel="noopener noreferrer">打开 B 站作者主页 ↗</a>':'')+
  (result.source_url&&verifiedSourceLink(result.source_url)?'<a href="'+esc(result.source_url)+'" target="_blank" rel="noopener noreferrer">查看原始发布线索 ↗</a>':'')+
  '</div>'+(distinct.length?
   '<div class="source-inspect-pictures">'+distinct.map((url,index)=>
    '<figure data-status="pending"><img referrerpolicy="no-referrer" loading="eager" decoding="async" src="'+esc(url)+'" alt="外部来源可用性预览"><figcaption>预览 '+(index+1)+' · 浏览器验证中…</figcaption></figure>').join('')+'</div>':
   '<p class="source-inspect-empty">目前没有可验证的公开图片预览。只保存外链草稿；不会伪造图片，也不会上传到图床。</p>');
 mount.querySelectorAll('figure').forEach(fig=>{
  const img=fig.querySelector('img'),caption=fig.querySelector('figcaption');
  const routes=submissionImageRoutes(img.src);
  let index=0,finished=false,timer=null;
  const complete=()=>{
   if(finished)return;
   finished=true;clearTimeout(timer);fig.dataset.status='loaded';
   caption.textContent='✓ 外部图片预览可用 · '+img.naturalWidth+' × '+img.naturalHeight+'（浏览器直接加载）';
  };
  const retry=()=>{
   if(finished)return;
   clearTimeout(timer);index++;
   if(index>=routes.length){
    finished=true;fig.dataset.status='failed';
    caption.textContent='外部图片无法加载 · 可到原站查看，不代表已入库';
    return;
   }
   caption.textContent='图片线路响应慢 · 正尝试备用 CDN '+(index+1)+'/'+routes.length;
   img.src=routes[index];
   timer=setTimeout(retry,7500);
  };
  const loaded=()=>{
   if(finished)return;
   if(!(img.naturalWidth>0&&img.naturalHeight>0)){retry();return}
   const at=index;
   if(typeof img.decode==='function')img.decode().then(()=>{
    if(at===index)complete()
   },()=>{if(at===index)retry()});
   else complete();
  };
  img.addEventListener('load',loaded);
  img.addEventListener('error',retry);
  if(!routes.length){retry();return}
  timer=setTimeout(retry,7500);
  if(img.complete){if(img.naturalWidth>0)loaded();else retry()}
 });
}
function localSubmissionRecord(parsed){
 const source={Pixiv:'pixiv',Konachan:'konachan',Safebooru:'safebooru'}[parsed.source];
 if(!source)return null;
 const w=WORKS.find(a=>a.source===source&&String(a.pid)===parsed.reference);
 if(!w)return {source:parsed.source,status:'indexed_record_unavailable',kind:'外部作品链接',canonical_url:parsed.url};
 return {source:parsed.source,status:'known_external_artwork',kind:'作品索引',canonical_url:parsed.url,
  title:w.title,author:w.artistVerified?w.artist:null,uploader:w.uploader,thumbnail_url:w.card,preview_url:w.preview,
  source_url:w.originLink,width:w.imageWidth,height:w.imageHeight};
}
function publicInspectionUrl(parsed){
 if(parsed.source!=='QQ空间')return parsed.url;
 // Never send QQ share tokens or opaque "data" fields to the preview server.
 const u=new URL(parsed.url),out=new URL('https://h5.qzone.qq.com/universal-share/share');
 try{
  const j=JSON.parse(u.searchParams.get('busi_data')||'{}');
  out.searchParams.set('busi_data',JSON.stringify({share_id:String(j.share_id||'').slice(0,110)}));
 }catch{}
 return out.href;
}
$('submitValidate').onclick=async()=>{
 const button=$('submitValidate');button.disabled=true;
 try{
  const parsed=classifySourceUrl($('submitSourceUrl').value);
  const drafts=readDrafts(),same=drafts.some(x=>x.url===parsed.url);
  if(!same)drafts.push({...parsed,title:$('submitTitle').value.trim().slice(0,90),addedAt:new Date().toISOString()});
  updateDrafts(drafts);drawDrafts();drawSubmissionInspection(null);
  $('submitResult').textContent='正在核验公开来源页面（不发送登录凭据，也不下载原图）…';
  if(['Pixiv','Konachan','Safebooru'].includes(parsed.source)){
   const result=localSubmissionRecord(parsed);
   drawSubmissionInspection(result);
   $('submitResult').textContent= result.status==='known_external_artwork'?
    '已显示本机索引中的外部图片预览，仍是外链草稿，没有发布或上传到图床。':
    '作品外链已保存，但当前目录没有该作品的可验证图片预览；未上传到图床。';
  }else if(['B站','QQ空间','微信公众号'].includes(parsed.source)){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18500);
   try{
    const request=await fetch('/api/source-preview?url='+encodeURIComponent(publicInspectionUrl(parsed)),{cache:'no-store',signal:controller.signal});
    const data=await request.json();
    if(data.ok){
     drawSubmissionInspection(data);
     $('submitResult').textContent='已核实公开来源：'+(data.status||'地址已识别')+'；本机草稿'+(same?'已存在':'已保存')+'，没有公开发布或复制原图。';
     if(data.source==='bilibili'&&data.kind==='opus_images'&&data.images?.length){
      $('submitResult').textContent='成功解析 '+data.images.length+' 张公开图片；中心数据库收录需经服务端验证和管理员审批，尚未入库。';
     }
    }
    else $('submitResult').textContent='已保存本机草稿，但来源验证失败：'+(data.error||'unknown');
   }catch(err){$('submitResult').textContent='草稿已保存，来源站点暂无法联网解析；可通过原链接查看。'}
   finally{clearTimeout(timer)}
  }else $('submitResult').textContent='已保存外部作品链接到本机草稿，没有图片预览，也未上传到 ImgBed 或公开发布。';
 }catch(error){$('submitResult').textContent=error.message}
 finally{button.disabled=false}
};

$('submitDraftList').addEventListener('click',e=>{
 const btn=e.target.closest('[data-delete-draft]');if(!btn)return;
 const drafts=readDrafts();drafts.splice(Number(btn.dataset.deleteDraft),1);updateDrafts(drafts);drawDrafts();
});
$('submitCopy').onclick=async()=>{
 const data=readDrafts().map(x=>({source:x.source,reference:x.reference,url:x.url,title:x.title,addedAt:x.addedAt}));
 try{await navigator.clipboard.writeText(JSON.stringify(data,null,2));$('submitResult').textContent='已复制草稿 JSON，后续可交给审核人员导入（包含原分享地址，请注意隐私）。'}catch{$('submitResult').textContent='复制失败，请检查浏览器剪贴板权限。'}
};

/* Pull-up is naturally handled by the IntersectionObserver-backed spinner at the bottom.
 * We never intercept native touch scrolling or move the user to a new starting position. */
