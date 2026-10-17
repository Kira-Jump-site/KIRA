from pathlib import Path
import sqlite3,json,hashlib,collections,re,time
root=Path(__file__).resolve().parent.parent
conn=sqlite3.connect(':memory:'); conn.row_factory=sqlite3.Row
conn.executescript(Path(__import__('os').environ.get('KIRA_D1_SQL_FILE',str(root/'evidence/d1/cloudflare-20261017.sql'))).read_text())
works=[dict(x) for x in conn.execute("SELECT * FROM source_works WHERE visibility='public' ORDER BY source,source_post_id")]
images=[dict(x) for x in conn.execute("SELECT * FROM source_images ORDER BY source,source_post_id,image_index")]
print('source rows',len(works),len(images))
imagegroups=collections.defaultdict(list)
for im in images:imagegroups[(im['source'],im['source_post_id'])].append(im)
def pid(s):
 try:
  x=int(s)
  if 0<x<10000000000:return x
 except ValueError: pass
 h=2166136261
 for c in str(s):
  h=((h^ord(c))*16777619)&0xffffffff
 return 100000+h%9900000
all_by_source=collections.defaultdict(list)
api_by_source=collections.defaultdict(list)
for w in works:
 imgs=imagegroups.get((w['source'],w['source_post_id']),[])
 if not imgs:continue
 try:tags=json.loads(w['tags_json'] or '[]')
 except:tags=[]
 if not isinstance(tags,list):tags=[]
 rows=[]
 for im in imgs:
  rows.append(dict(id=f"{w['source']}:{w['source_post_id']}:{im['image_index']}",pid=pid(w['source_post_id']),page=im['image_index'],source=w['source'],source_post_id=w['source_post_id'],title=w['title'],author=w['author_name'],uid=int(w['author_id']) if str(w['author_id']).isdigit() else None,tags=[t for t in tags if isinstance(t,str)][:120],width=im['width'],height=im['height'],thumbnail_url=im['cn_thumbnail_url'] or im['thumbnail_url'],preview_url=im['cn_preview_url'] or im['preview_url'],original_url=im['original_url'],source_url=w['canonical_url'],created_at=w['published_at'],indexed_at=w['indexed_at'],artist_verified=bool(w['author_name'])))
 all_by_source[w['source']].extend(rows)
 api_by_source[w['source']].append(dict(source=w['source'],source_post_id=w['source_post_id'],canonical_url=w['canonical_url'],title=w['title'],author=w['author_name'],author_id=w['author_id'],published_at=w['published_at'],indexed_at=w['indexed_at'],tags=tags,images=[dict(image_index=im['image_index'],thumbnail_url=im['thumbnail_url'],preview_url=im['preview_url'],original_url=im['original_url'],cn_thumbnail_url=im['cn_thumbnail_url'],cn_preview_url=im['cn_preview_url'],cn_mirror_provider=im['cn_mirror_provider'],cn_mirror_updated_at=im['cn_mirror_updated_at'],width=im['width'],height=im['height']) for im in imgs]))
assets=root/'public/assets/catalog';assets.mkdir(parents=True,exist_ok=True)
manifest=dict(schema=1,kind='kira-public-metadata',total=sum(map(len,all_by_source.values())),created_at='2026-10-17T09:30:00Z',shards=[])
for source,rows in sorted(all_by_source.items()):
 rows.sort(key=lambda r:(-r['indexed_at'] if r['indexed_at'] else 0,str(r['id'])))
 for p in range(0,len(rows),96):
  batch=dict(channel=source,works=rows[p:p+96])
  contents=json.dumps(batch,ensure_ascii=False,separators=(',',':'))
  hash=hashlib.sha256(contents.encode()).hexdigest()
  name=f'{source}-{p//96:03}-{hash[:16]}.json'
  (assets/name).write_text(contents)
  manifest['shards'].append(dict(channel=source,url='/assets/catalog/'+name,count=len(batch['works']),sha256=hash))
(assets/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,separators=(',',':')))
apidir=root/'public/assets/catalog-api';apidir.mkdir(exist_ok=True)
for source,rows in api_by_source.items():
 rows.sort(key=lambda r:(-(r['indexed_at'] or 0),str(r['source_post_id'])))
 (apidir/(source+'.json')).write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
report={'works':len(works),'images':len(images),'catalogRows':manifest['total'],'shards':len(manifest['shards']),'sources':{s:len(v) for s,v in all_by_source.items()},'filesValidated':False,'safety':'All exports are read-only from D1 and no private reports are placed in public.'}
(root/'evidence/migration-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps(report,ensure_ascii=False))

