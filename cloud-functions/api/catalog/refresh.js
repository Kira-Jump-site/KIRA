import {json} from '../../../lib/catalog.mjs';
// Anonymous visitors may read approved inventory; they cannot invoke paid upstream or Blob writes.
// Daily EdgeOne schedules and authenticated /api/catalog/admin/refill own replenishment.
export async function onRequest({request}){
 if(request.method!=='POST')return json({ok:false,error:'method_not_allowed'},405);
 return json({ok:true,source:'server_managed',scheduled:false,reason:'automatic_daily_or_admin_refill'},202);
}
