/* New-work review. Thumbnails only in grid. Preview URL assigned EXCLUSIVELY on dialog open/user navigation. */
const SOURCES=['safebooru','safedonmai','cosbooru','konachan','nekosia','e_shuushuu','pixiv','pixiv_yuki','miyoushe_cos','wallhaven','bilibili_opus','zerochan'];
const $=id=>document.getElementById(id),grid=$('grid'),dialog=$('detail');
const state={items:[],selected:new Set(),cursors:[''],page:0,nextCursor:null,busy:false,dirty:false,opened:null,image:0};
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined&&text!==null)n.textContent=String(text);if(cls)n.className=cls;return n}
function safeURL(str){try{const u=new URL(str);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}}
async function api(path,method='GET',body=null){const response=await fetch(path,{method,cache:'no-store',headers:{'X-KIRA-Review-Test':'1',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw Error(data.error||`HTTP ${response.status}`);return data}
function status(t){$('status').textContent=t}
function identity(w){return w.source+'|'+w.source_post_id}
function imageList(w){return Array.isArray(w.images)?w.images:[]}
function summary(){const a=state.items.filter(w=>state.selected.has(identity(w))).length,b=state.items.length-a;$('summary').textContent=`本页 ${state.items.length} 组｜拟批准 ${a}｜拟剔除 ${b}｜第 ${state.page+1} 页`;
 $('prev').disabled=state.busy||state.page===0;$('next').disabled=state.busy||!state.nextCursor;}
function toggleWork(w,keep){const id=identity(w);if(keep)state.selected.add(id);else state.selected.delete(id);state.dirty=true;const card=document.querySelector(`[data-key="${CSS.escape(id)}"]`);if(card){card.classList.toggle('selected',keep);card.classList.toggle('removed',!keep);card.querySelector('input[type=checkbox]').checked=keep}summary()}
function render(){grid.replaceChildren();$('empty').hidden=state.items.length>0;
 for(const w of state.items){const keep=state.selected.has(identity(w));const card=el('article',null,'card '+(keep?'selected':'removed'));card.dataset.key=identity(w);
  const imgs=imageList(w),thumb=safeURL(imgs[0]?.thumbnail_url);
  const imageButton=el('button',null,'thumb');imageButton.type='button';imageButton.title='打开高清预览（仅点击后加载）';
  if(thumb){const img=el('img');img.src=thumb;img.alt='作品缩略图';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.fetchPriority='low';imageButton.append(img)}
  else imageButton.append(el('span','无缩略图','missing'));
  if(imgs.length>1)imageButton.append(el('em',`${imgs.length} 张`));imageButton.onclick=()=>openDetail(w);card.append(imageButton);
  const bar=el('div',null,'meta'),label=el('label');const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=keep;checkbox.setAttribute('aria-label',`保留 ${w.source_post_id}`);checkbox.onchange=()=>toggleWork(w,checkbox.checked);
  label.append(checkbox,el('span',keep?'保留':'剔除'));checkbox.addEventListener('change',()=>{label.querySelector('span').textContent=checkbox.checked?'保留':'剔除'});bar.append(label,el('span',w.source,'source'));card.append(bar);
  const title=el('strong',w.title||w.raw_title||'#'+w.source_post_id);title.title=title.textContent;card.append(title);
  const parts=[];if(Number.isFinite(w.popularity_percentile))parts.push(`源内热度 ${Math.round(w.popularity_percentile*100)}%`);
  if(w.quality_admission?.rule)parts.push('质量筛选通过');parts.push(w.rating||'评级未知');
  card.append(el('div',parts.join(' · '),'hint'));
  const details=el('button','查看 / 单件处理','mini');details.onclick=()=>openDetail(w);card.append(details);grid.append(card);
 }summary()}
function setBusy(flag){state.busy=flag;for(const id of ['load','commit','rejectAll','next','prev'])$(id).disabled=flag;summary()}
function confirmLeave(){return !state.dirty||confirm('本页存在尚未提交的选择，确认丢弃并翻页？')}
async function load(page=0){if(state.busy)return;if(page!==state.page&&!confirmLeave())return;setBusy(true);
 try{const cursor=state.cursors[page]||'',size=+$('pageSize').value,query=new URLSearchParams({source:$('source').value,limit:String(size)});if(cursor)query.set('cursor',cursor);
  const out=await api('/api/catalog/admin/queue?'+query);state.items=out.works||[];state.selected=new Set(state.items.map(identity));state.page=page;state.nextCursor=out.next_cursor||null;state.dirty=false;
  if(state.nextCursor)state.cursors[page+1]=state.nextCursor;else state.cursors.length=page+1;
  render();status(`扫描 ${out.scanned} 条索引，符合质量门槛且等待管理员审核 ${state.items.length} 组。每页只加载首张缩略图。`);
 }catch(e){status('读取失败：'+e.message)}finally{setBusy(false)}}
function openDetail(w){state.opened=w;state.image=0;$('detailTitle').textContent=(w.title||w.raw_title||'未命名')+' · '+w.source+' #'+w.source_post_id;
 $('rating').value=['safe','general'].includes(w.rating)?w.rating:'';
 const report=[`原始标签：${(w.raw_tags||[]).slice(0,60).join('、')||'无'}`,`标准标签：${(w.normalized_tag_ids||[]).slice(0,60).join('、')||'无'}`,`质量证据：${w.quality_admission?.rule||'待确认'}`,`作者：${w.source_artist_name||'未知'}；上传者：${w.uploader_name||'未知'}`];$('details').textContent=report.join('\n');$('details').style.whiteSpace='pre-wrap';
 dialog.showModal();displayPreview();}
function displayPreview(){const w=state.opened;if(!w)return;const imgs=imageList(w),img=imgs[state.image],preview=$('preview');
 preview.removeAttribute('src');const url=safeURL(img?.preview_url);if(url){preview.src=url;preview.alt=`高清预览 ${state.image+1}/${imgs.length}`;}else preview.alt='该作品没有合法的 HTTPS 预览地址';
 $('imageCount').textContent=`第 ${state.image+1} / ${imgs.length} 张（仅打开本张高清预览）`;
 $('imagePrev').disabled=state.image===0;$('imageNext').disabled=state.image>=imgs.length-1;}
function closeDetail(){dialog.close();$('preview').removeAttribute('src');state.opened=null}
$('close').onclick=closeDetail;dialog.addEventListener('close',()=>{$('preview').removeAttribute('src');state.opened=null});
$('imagePrev').onclick=()=>{state.image=Math.max(0,state.image-1);displayPreview()};
$('imageNext').onclick=()=>{state.image=Math.min(imageList(state.opened).length-1,state.image+1);displayPreview()};
$('rating').onchange=()=>{if(state.opened){state.opened.rating=$('rating').value||'unknown';state.dirty=true;render()}};
$('toggle').onclick=()=>{if(state.opened)toggleWork(state.opened,!state.selected.has(identity(state.opened)))};
$('selectAll').onclick=()=>{state.selected=new Set(state.items.map(identity));state.dirty=true;render()};
$('selectNone').onclick=()=>{state.selected.clear();state.dirty=true;render()};
$('invert').onclick=()=>{state.selected=new Set(state.items.filter(w=>!state.selected.has(identity(w))).map(identity));state.dirty=true;render()};
async function runBatch(items,action){const results=[];for(let i=0;i<items.length;i+=20){const chunk=items.slice(i,i+20).map(w=>({source:w.source,source_post_id:w.source_post_id,expected_revision:w.revision||'live',...(action==='approve'?{rating:w.rating}:{reason:'管理员筛选剔除'})}));
 const out=await api('/api/catalog/admin/bulk-review','POST',{action,items:chunk});results.push(...out.results);status(`正在处理 ${action==='approve'?'批准':'剔除'}：${Math.min(i+20,items.length)}/${items.length}，成功 ${results.filter(x=>x.ok).length}`);
 }return results}
async function commit({onlyReject=false}={}){if(state.busy||!state.items.length)return;
 const keep=onlyReject?[]:state.items.filter(w=>state.selected.has(identity(w))),remove=onlyReject?state.items:state.items.filter(w=>!state.selected.has(identity(w)));
 if(keep.some(w=>!['safe','general'].includes(w.rating))){status('选中作品存在评级未知项。请点开对应卡片人工设定安全/一般评级，才可批准。');return}
 if(!confirm(`本页 ${state.items.length} 组作品：批准 ${keep.length}，永久标记为拒绝 ${remove.length}。将逐件验证全部媒体，失败者不会公开。确定提交？`))return;
 if(remove.length&& !confirm(`再次确认：本轮将剔除 ${remove.length} 组作品，剔除项不会进入公开图库。`))return;
 setBusy(true);const successes=new Set(),failures=[];
 try{for(const [subset,action] of [[keep,'approve'],[remove,'reject']]){
  if(!subset.length)continue;const outcome=await runBatch(subset,action);
  for(const r of outcome){if(r.ok)successes.add(r.source+'|'+r.source_post_id);else failures.push('#'+(r.source_post_id||'')+': '+r.error)}
 }
 state.items=state.items.filter(w=>!successes.has(identity(w)));state.selected=new Set(state.items.filter(w=>state.selected.has(identity(w))).map(identity));state.dirty=failures.length>0;
 render();status(`本次成功 ${successes.size} / ${keep.length+remove.length}。${failures.length?'失败（保留本页，可重试）：'+failures.join('；'):'已处理完毕，可继续下一页。'}`);
 }catch(e){status('批量操作中断，已成功项目仍保留在服务端，请重新读取核对：'+e.message)}finally{setBusy(false)}}
$('commit').onclick=()=>commit();$('rejectAll').onclick=()=>commit({onlyReject:true});
async function one(action){const w=state.opened;if(!w||state.busy)return;const keep=action==='approve';if(keep&&!['safe','general'].includes(w.rating))return status('先为这组作品确定安全评级');
 if(!confirm(`${keep?'批准':'剔除'}作品 ${w.source_post_id}？`))return;setBusy(true);try{
  const out=await api('/api/catalog/admin/review','POST',{source:w.source,source_post_id:w.source_post_id,expected_revision:w.revision||'live',action,rating:w.rating,reason:keep?'':'管理员剔除'});
  state.items=state.items.filter(v=>identity(v)!==identity(w));state.selected.delete(identity(w));closeDetail();render();status('已处理：'+out.action+' #'+w.source_post_id);
 }catch(e){status('单件操作失败：'+e.message)}finally{setBusy(false)}}
$('singleApprove').onclick=()=>one('approve');$('singleReject').onclick=()=>one('reject');
$('editTags').onclick=async()=>{const w=state.opened;if(!w)return;
 const raw=prompt('输入已确认的 KIRA 标准标签 ID（英文逗号分隔，必须为知识库现有 ID）',(w.admin_confirmed_tag_ids||[]).join(','));if(raw===null)return;
 try{const ids=raw.split(',').map(x=>x.trim()).filter(Boolean);const out=await api('/api/catalog/admin/review','POST',{
  source:w.source,source_post_id:w.source_post_id,expected_revision:w.revision||'live',action:'retag',canonical_tag_ids:ids});
  w.admin_confirmed_tag_ids=ids;w.normalized_tag_ids=ids;w.revision=out.revision;render();status('标签人工覆盖已保存，修订号已更新');
 }catch(e){status('修改标签失败：'+e.message)}};
$('addTag').onclick=async()=>{const category=prompt('标准标签类别（character / franchise / artist / coser / photographer / content_type / other）','character');if(!category)return;
 const id=prompt('新的稳定标签 ID');if(!id)return;const name=prompt('标签名');if(!name)return;const evidence=prompt('身份依据链接或人工审核证据');if(!evidence)return;
 try{const out=await api('/api/catalog/admin/tags','POST',{action:'add_entity',version:'kira-'+Date.now(),payload:{category,id,names:{zh:name},aliases:[name],evidence}});
  status('已新建标签，字典版本：'+out.version)}catch(e){status('创建失败：'+e.message)}};
$('mapTag').onclick=async()=>{const raw=prompt('来源 '+$('source').value+' 的原生标签名');if(!raw)return;const target=prompt('要对应的稳定 KIRA 标签 ID');if(!target)return;
 const evidence=prompt('准确同义关系的人工证据');if(!evidence)return;
 try{const out=await api('/api/catalog/admin/tags','POST',{action:'approve_mapping',version:'kira-'+Date.now(),payload:{source:$('source').value,raw_tag:raw,target_tag_id:target,type:'exact_alias',evidence}});status('来源标签映射已保存，字典版本：'+out.version)}
 catch(e){status('映射失败：'+e.message)}};
const reindexCursors=new Map();$('reindex').onclick=async()=>{const source=$('source').value,cursor=reindexCursors.get(source)||'';
 if(!confirm('将重算 '+source+' 的下一批标签，不会重下载图片或改变审核状态。继续？'))return;
 try{const out=await api('/api/catalog/admin/reindex','POST',{source,cursor,limit:20});if(out.next_cursor)reindexCursors.set(source,out.next_cursor);else reindexCursors.delete(source);status(`扫描 ${out.scanned} / 更新 ${out.updated} / 失败 ${out.failed}，${out.next_cursor?'仍有下一批':'当前源已结束'}`)}
 catch(e){status('重算失败：'+e.message)}};

$('load').onclick=()=>{state.cursors=[''];load(0)};$('prev').onclick=()=>load(Math.max(0,state.page-1));$('next').onclick=()=>load(state.page+1);
$('pageSize').onchange=()=>{state.cursors=[''];state.page=0;state.nextCursor=null;state.items=[];state.selected.clear();render()};
$('source').onchange=()=>{state.cursors=[''];state.page=0;state.nextCursor=null;state.items=[];state.selected.clear();render()};
$('refill').onclick=async()=>{const source=$('source').value;if(!confirm('对 '+source+' 执行额外采集？新作品将先经过高质量筛选和媒体核验，合格后进入待审队列；失败不会凑数。'))return;
 setBusy(true);try{const result=await api('/api/catalog/admin/refill','POST',{source});status(`本次新增待审 ${result.pending||0}、采集 ${result.pages||0} 页、质量失败 ${(result.skipped_invalid||0)}。不自动公开。`)}catch(e){status('补充失败：'+e.message)}finally{setBusy(false)}};
for(const source of SOURCES){const option=el('option',source);option.value=source;$('source').append(option)}summary();
$('refill').disabled=true;
void load(0);
