/** Secret comes from the deployment environment, not repository or query string. */
export async function requireAdmin(request,env={}){
 const secret=env.KIRA_ADMIN_PASSWORD||env.KIRA_REVIEW_ADMIN_SECRET||'';
 if(!secret||secret.length<12)return {ok:false,status:503,error:'admin_secret_not_configured'};
 const token=String(request.headers.get('authorization')||'');
 if(!token.startsWith('Bearer '))return {ok:false,status:401,error:'admin_auth_required'};
 const supplied=token.slice(7);
 if(supplied.length<1||supplied.length>512)return {ok:false,status:401,error:'admin_auth_required'};
 const digest=async text=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));
 const a=await digest(secret),b=await digest(supplied);let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];
 return diff===0?{ok:true}:{ok:false,status:401,error:'admin_auth_required'};
}
