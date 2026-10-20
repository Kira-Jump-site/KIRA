"""Local-only browser smoke check: 100 thumbs, no preview until click."""
import asyncio, base64, json
from urllib.parse import urlparse
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==')
async def main():
 try:
  async with async_playwright() as p:
   browser=await p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
   page=await browser.new_page(viewport={'width':1280,'height':900});requests=[]
   async def images(route):
    requests.append(route.request.url)
    await route.fulfill(content_type='image/png',body=PNG)
   await page.route('https://cdn.example/**',images)
   async def local(route):
    path=urlparse(route.request.url).path.lstrip('/')
    fp=(ROOT/'public'/path).resolve()
    if not fp.is_relative_to((ROOT/'public').resolve()) or not fp.is_file():
     return await route.fulfill(status=404,body='Not Found')
    kind='text/html' if path.endswith('.html') else 'text/javascript' if path.endswith('.js') else 'text/plain'
    return await route.fulfill(status=200,content_type=kind,body=fp.read_bytes())
   await page.route('https://local.kira.test/**',local)
   works=[dict(source='pixiv',source_post_id=str(i),title=f'审核作品 {i}',rating='safe',revision='live',quality_admission={'eligible':True,'rule':'quality_verified'},popularity_percentile=.8,media_status='verified',images=[{'image_index':0,'thumbnail_url':f'https://cdn.example/t/{i}.png','preview_url':f'https://cdn.example/p/{i}.png'},{'image_index':1,'thumbnail_url':f'https://cdn.example/t2/{i}.png','preview_url':f'https://cdn.example/p2/{i}.png'}]) for i in range(100)]
   async def queue(route):await route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'works':works,'scanned':100,'next_cursor':'100'}))
   await page.route('**/api/catalog/admin/queue?**',queue)
   await page.goto('https://local.kira.test/review.html')
   await page.fill('#secret','testSecretLongEnough')
   await page.select_option('#source','pixiv');await page.click('#load')
   await page.locator('.card').first.wait_for(timeout=10000)
   assert await page.locator('.card').count()==100,await page.locator('.card').count()
   assert await page.locator('.card input[type=checkbox]:checked').count()==100
   await page.wait_for_timeout(250)
   assert sum('/p/' in r or '/p2/' in r for r in requests)==0,requests
   await page.screenshot(path=str(ROOT/'tests/review-grid-local.png'),full_page=False)
   await page.locator('.card .thumb').first.click()
   await page.locator('dialog[open]').wait_for()
   await page.wait_for_timeout(250)
   assert sum('/p/' in r or '/p2/' in r for r in requests)==1,requests
   await page.click('#imageNext')
   await page.wait_for_timeout(250)
   assert sum('/p/' in r or '/p2/' in r for r in requests)==2,requests
   await page.click('#close')
   await page.locator('dialog[open]').wait_for(state='hidden')
   await page.locator('.card input[type=checkbox]').first.uncheck()
   assert '拟剔除 1' in await page.locator('#summary').inner_text()
   print('BROWSER REVIEW PASS: 100 checked thumbnails, 0 preview before click, then only requested previews, deselect works')
   await page.goto('https://local.kira.test/reports.html')
   report=[dict(id='20261020_'+'a'*64,source='pixiv',source_post_id='1',reason='duplicate',description='用户举报重复',revision=1,reported_at='2026-10-20T00:00:00Z',work={'title':'举报目标','thumbnail_url':'https://cdn.example/t/report.png','preview_url':'https://cdn.example/p/report.png','visibility':'public'})]
   await page.route('**/api/catalog/admin/reports?**',lambda route:route.fulfill(status=200,content_type='application/json',body=json.dumps({'ok':True,'reports':report,'scanned':1,'next_cursor':None})))
   await page.fill('#secret','testSecretLongEnough')
   await page.click('#load')
   await page.locator('.card').first.wait_for()
   before=sum('/p/' in r or '/p2/' in r for r in requests)
   assert before==2
   await page.locator('.card .thumb').click();await page.wait_for_timeout(200)
   assert sum('/p/' in r or '/p2/' in r for r in requests)==3
   print('BROWSER REPORT PASS: isolated report queue and click-to-preview')
   await browser.close()
 finally:pass
asyncio.run(main())
