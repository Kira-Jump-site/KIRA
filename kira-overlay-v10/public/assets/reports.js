/* Dedicated user-report queue. Only thumbnails on the grid. Detailed view is opt-in. */
const $=id=>document.getElementById(id),state={rows:[],selected:new Set(),cursors:[''],page:0,next:null,busy:false,opened:null,dirty:false};
const node=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined&&text!==null)e.textContent=String(text);if(cls)e.className=cls;return e};
function safeURL(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
const msg=s=>{$('status').textContent=s};
async function api(url,method='GET',body){const r=await fetch(url,{method,cache:'no-store',headers:{'X-KIRA-Review-Test':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw Error(d.error||'HTTP '+r.status);return d}
function summary(){const keep=state.rows.filter(r=>state.selected.has(r.id)).length;$('summary').textContent=`第 ${state.page+1} 页｜保留 ${keep}｜拟下架 ${state.rows.length-keep}`;$('prev').disabled=state.busy||state.page===0;$('next').disabled=state.busy||!state.next}
function mark(r,keep){if(keep)state.selected.add(r.id);else state.selected.delete(r.id);state.dirty=true;render()}
function render(){const grid=$('grid');grid.replaceChildren();$('empty').hidden=state.rows.length!==0;
 for(const r of state.rows){const keep=state.selected.has(r.id),c=node('article',null,'card '+(keep?'':'remove'));
  const thumb=node('button',null,'thumb');const src=safeURL(r.work?.thumbnail_url);
  if(src){const i=node('img');i.src=src;i.loading='lazy';i.decoding='async';i.referrerPolicy='no-referrer';i.fetchPriority='low';i.alt='举报作品缩略图';thumb.append(i)}else thumb.append(node('span','作品无可用缩略图'));
  thumb.onclick=()=>openDetail(r);c.append(thumb);
  const label=node('label'),input=node('input');input.type='checkbox';input.checked=keep;input.onchange=()=>mark(r,input.checked);label.append(input,node('span',keep?'保留作品':'下架作品'));c.append(label);
  c.append(node('strong',r.work?.title||r.source+' #'+r.source_post_id));c.append(node('small',r.reason+' · '+new Date(r.reported_at).toLocaleString()));
  c.append(node('small',(r.description||'无文字说明').slice(0,120)));const button=node('button','查看详情 / 单件审核');button.onclick=()=>openDetail(r);c.append(button);grid.append(c);
 }summary()}
function busy(b){state.busy=b;for(const id of ['load','commit','prev','next','followup'])$(id).disabled=b;summary()}
async function load(page=0){if(state.busy)return;if(state.dirty&&page!==state.page&&!confirm('本页选择尚未提交，确认翻页？'))return;
 busy(true);try{const q=new URLSearchParams({limit:$('pageSize').value});if(state.cursors[page])q.set('cursor',state.cursors[page]);const res=await api('/api/catalog/admin/reports?'+q);
  state.rows=res.reports||[];state.selected=new Set(state.rows.map(r=>r.id));state.page=page;state.next=res.next_cursor||null;state.dirty=false;
  if(state.next)state.cursors[page+1]=state.next;else state.cursors.length=page+1;render();msg(`本页读取 ${res.scanned} 条举报，待处理 ${state.rows.length} 条。历史旧站举报尚未迁移。`);
 }catch(e){msg('读取失败：'+e.message)}finally{busy(false)}}
function openDetail(r){state.opened=r;$('heading').textContent=r.source+' #'+r.source_post_id+'｜'+r.reason;
 $('details').textContent=`举报时间：${r.reported_at}\n举报原因：${r.reason}\n举报说明：${r.description||'无'}\n当前公开状态：${r.work?.visibility||'旧站/未迁入 Blob'}\n报告ID：${r.id}`;
 // Never substitute a preview URL into the grid. Public detail is resolved on deliberate click.
 const i=$('preview'),full=safeURL(r.work?.preview_url);i.removeAttribute('src');if(full)i.src=full;
 $('detail').showModal()}
function close(){ $('detail').close();$('preview').removeAttribute('src');state.opened=null }
$('close').onclick=close;$('detail').addEventListener('close',()=>{$('preview').removeAttribute('src');state.opened=null});
function confirmLeave(){return confirm('将按当前选择处理本页举报：保留作品 = 驳回举报，下架 = 采纳举报。确认？')}
async function commit(mode='mixed'){if(state.busy||!state.rows.length)return;const keep=state.rows.filter(r=>state.selected.has(r.id)),hide=state.rows.filter(r=>!state.selected.has(r.id));
 const pairs=mode==='followup'?[[keep,'followup']]:[[keep,'keep'],[hide,'hide']];
 if(!confirmLeave())return;if(mode!=='followup'&&hide.length&&!confirm(`再次确认：将尝试下架 ${hide.length} 组已公开作品；旧站未迁入 Blob 的作品无法直接下架，失败会保留待审。`))return;
 busy(true);const done=new Set(),failed=[];try{
  for(const [items,action] of pairs){for(let p=0;p<items.length;p+=20){const batch=items.slice(p,p+20).map(r=>({id:r.id,expected_revision:r.revision}));const res=await api('/api/catalog/admin/reports','POST',{action,items:batch});
   for(const r of res.results){if(r.ok)done.add(r.id);else failed.push(`${r.id||''}:${r.error}`)}msg(`${action} 已处理 ${Math.min(p+20,items.length)}/${items.length}`);
  }}state.rows=state.rows.filter(r=>!done.has(r.id));state.selected=new Set(state.rows.filter(r=>state.selected.has(r.id)).map(r=>r.id));state.dirty=failed.length>0;render();msg(`成功 ${done.size}，失败 ${failed.length}${failed.length?'：'+failed.join('；'):''}`);
 }catch(e){msg('处理意外中断，请重新读取确认进度：'+e.message)}finally{busy(false)}}
async function decide(action){const r=state.opened;if(!r)return;if(!confirm(`确认执行「${action}」：${r.source} #${r.source_post_id}？`))return;busy(true);try{const out=await api('/api/catalog/admin/reports','POST',{id:r.id,action,expected_revision:r.revision});state.rows=state.rows.filter(v=>v.id!==r.id);state.selected.delete(r.id);close();render();msg(`处理成功：${out.status}`)}catch(e){msg('处理失败：'+e.message)}finally{busy(false)}}
$('all').onclick=()=>{state.selected=new Set(state.rows.map(r=>r.id));state.dirty=true;render()};$('none').onclick=()=>{state.selected.clear();state.dirty=true;render()};$('invert').onclick=()=>{state.selected=new Set(state.rows.filter(r=>!state.selected.has(r.id)).map(r=>r.id));state.dirty=true;render()};
$('load').onclick=()=>{state.cursors=[''];load(0)};$('prev').onclick=()=>load(Math.max(0,state.page-1));$('next').onclick=()=>load(state.page+1);
$('pageSize').onchange=()=>{state.cursors=[''];state.page=0;state.next=null;state.rows=[];state.selected.clear();render()};
$('commit').onclick=()=>commit();$('followup').onclick=()=>commit('followup');$('keep').onclick=()=>decide('keep');$('hide').onclick=()=>decide('hide');$('defer').onclick=()=>decide('followup');summary();
void load(0);
