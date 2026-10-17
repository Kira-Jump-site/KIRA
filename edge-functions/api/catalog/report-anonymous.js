export async function onRequest(){
 return new Response(JSON.stringify({ok:false,error:'service_not_configured',message:'Original service requires validated EdgeOne backing storage/authentication.'}),{status:503,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
}
