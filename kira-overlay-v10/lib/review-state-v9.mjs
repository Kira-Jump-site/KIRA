/** Pure state predicates shared by Edge and Cloud Functions; no upstream imports. */
const SAFE=new Set(['safe','general']);
export const REVIEW_POLICY_VERSION=1;
export const newlyDiscovered=work=>({...work,visibility:'pending',review_policy_version:REVIEW_POLICY_VERSION,review_status:'pending',review_decision:null,reviewed_at:null,reviewed_by:null});
export function isApprovedPublic(work){
 if(!work||work.visibility!=='public'||!SAFE.has(work.rating))return false;
 // Static/v2 historical rows remain accessible until a verified migration.
 if(Number(work.review_policy_version||0)<REVIEW_POLICY_VERSION)return true;
 return work.review_status==='approved'&&work.review_decision?.action==='approve'&&
     work.media_status==='verified'&&Array.isArray(work.images)&&work.images.length>0&&
     work.images.every(i=>i.media_status==='verified');
}
