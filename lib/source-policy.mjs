/**
 * Source-specific upstream discovery policy. A 'popular' mode is only emitted
 * for a source with documented upstream semantics; other sources perform local ranking.
 * A tag query never silently turns into an unsupported upstream search.
 */
export const SOURCE_POLICIES=Object.freeze({
 safebooru:{mode:'score',hot:'sort:score:desc',hotAlternate:'sort:updated:desc',tag:'booru',score:'score',creator:'tags_or_source'},
 safedonmai:{mode:'rank',hot:'order:rank',hotAlternate:'order:favcount',tag:'danbooru',score:'score',creator:'tag_string_artist'},
 cosbooru:{mode:'score',hot:'order:score',hotAlternate:'order:favcount',tag:'danbooru',score:'score',creator:'tag_string_artist'},
 konachan:{mode:'score',hot:'order:score',hotAlternate:'order:mpixels',tag:'moebooru',score:'score',creator:'tag_artist'},
 nekosia:{mode:'category',hot:null,hotAlternate:null,tag:'nekosia',score:null,creator:'attribution_artist'},
 e_shuushuu:{mode:'top',hot:'images/top',hotAlternate:null,tag:null,score:'rating',creator:'artist_tags'},
 pixiv_yuki:{mode:'recommended',hot:null,hotAlternate:null,tag:'id_only',score:'totalBookmarks',creator:'user'},
 pixiv:{mode:'recommended',hot:null,hotAlternate:null,tag:'id_only',score:'totalBookmarks',creator:'user'},
 miyoushe_cos:{mode:'keyword',hot:null,hotAlternate:null,tag:'keyword_not_exact',score:'likes_if_available',creator:'poster'},
 wallhaven:{mode:'toplist',hot:'toplist',hotAlternate:'favorites',tag:'query',score:'favorites',creator:'source_or_uploader'},
 bilibili_opus:{mode:'author_feed',hot:null,hotAlternate:null,tag:null,score:'like_if_available',creator:'author_with_repost_flag'},
 zerochan:{mode:'latest',hot:null,hotAlternate:null,tag:'path_unverified',score:null,creator:'unknown'}
});
const normalize=s=>String(s||'').normalize('NFKC').trim().toLowerCase().replace(/\s+/g,'_');
const COMMON={
 'character:hatsune_miku':{booru:'hatsune_miku',danbooru:'hatsune_miku',moebooru:'hatsune_miku',query:'hatsune miku',nekosia:'hatsune-miku'},
 'ip:genshin_impact':{booru:'genshin_impact',danbooru:'genshin_impact',moebooru:'genshin_impact',query:'genshin impact',nekosia:'genshin-impact'},
 'ip:wuthering_waves':{booru:'wuthering_waves',danbooru:'wuthering_waves',moebooru:'wuthering_waves',query:'wuthering waves'},
 'appearance:blue_hair':{booru:'blue_hair',danbooru:'blue_hair',moebooru:'blue_hair',nekosia:'blue-hair',query:'blue hair'},
 'appearance:white_hair':{booru:'white_hair',danbooru:'white_hair',moebooru:'white_hair',nekosia:'white-hair',query:'white hair'},
 'type:cosplay':{booru:'cosplay',danbooru:'cosplay',moebooru:'cosplay',query:'cosplay',keyword_not_exact:'cosplay'}
};
export function sourceQuery(source,tag){
 const policy=SOURCE_POLICIES[source];if(!policy)throw Error('unsupported_source');
 const value=normalize(tag);if(!value)return {value:'',supported:true,method:'none'};
 if(policy.tag==='id_only')return /^\d{4,16}$/.test(value)?{value,supported:true,method:'id'}:{value:'',supported:false,reason:'id_only'};
 if(!policy.tag||policy.tag==='path_unverified')return {value:'',supported:false,reason:'tag_search_not_verified'};
 let candidate=value;
 if(value.includes(':')){
  const a=COMMON[value]?.[policy.tag];
  if(!a)return {value:'',supported:false,reason:'no_verified_source_tag_alias'};
  candidate=a;
 }
 if(!/^[\p{L}\p{N}_ -]{1,80}$/u.test(candidate))return {value:'',supported:false,reason:'unsafe_source_tag'};
 return {value:candidate,supported:true,method:policy.tag};
}
export function sourceSchedule(source,cycle=0){
 const p=SOURCE_POLICIES[source];if(!p)throw Error('unsupported_source');
 const hot=p.hot!==null;
 // 2/4 newest, 1/4 documented popularity, 1/4 alternate/recommendation.
 return {mode:hot&&cycle%4===1?'popular':hot&&p.hotAlternate&&cycle%4===3?'popular_alt':'new',
         schedule_slot:cycle%4,tag_method:p.tag,popular_supported:hot};
}
export const sourceProfiles=()=>Object.fromEntries(Object.entries(SOURCE_POLICIES).map(([source,p])=>[source,{
 source,primary:p.mode,popular:p.hot,alternate:p.hotAlternate,tag_mode:p.tag,score_source:p.score,creator_evidence:p.creator}]));
