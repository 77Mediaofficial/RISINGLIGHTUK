# Load every page in headless Chrome and report errors, structure and overflow.
#   py _src/tools/check_pages.py [base-url] [out-dir]
# Writes to the shared production database are NEVER sent: every POST/PATCH/PUT/DELETE is
# answered locally (the page sees a success), and nothing signs in. GET reads are allowed.
import json, os, sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4433/RISINGLIGHTUK/'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.environ.get('TEMP', '.'), 'rl-pages-check')
os.makedirs(OUT, exist_ok=True)
PAGES = ['', 'about.html', 'work.html', 'events.html', 'quiet-battles.html', 'get-involved.html',
         'privacy.html', 'admin.html', 'no-such-page']
WIDTHS = [(1440, 900), (390, 844)]
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'

PROBE = """() => {
  const d=document.documentElement, b=document.body;
  const cur=[...document.querySelectorAll('[aria-current="page"]')].map(a=>a.closest('nav')?.className+':'+a.textContent.trim());
  const wide=[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.right>d.clientWidth+1&&getComputedStyle(e).position!=='fixed'}).slice(0,5).map(e=>e.tagName+'.'+(e.className&&e.className.baseVal===undefined?e.className:'')+'#'+e.id);
  return {title:document.title, h1:[...document.querySelectorAll('h1')].map(h=>h.textContent.trim()),
    h2:document.querySelectorAll('h2').length, main:!!document.querySelector('main#main'),
    current:cur, height:d.scrollHeight, overflowX:d.scrollWidth>d.clientWidth, wide,
    dark:b.classList.contains('dark'), admin:b.classList.contains('admin'),
    lock:!!document.querySelector('.admin-entry'), briefVisible:(()=>{const x=document.querySelector('.brief-fab');return !!x&&getComputedStyle(x).display!=='none'})(),
    canonical:document.querySelector('link[rel=canonical]')?.href, robots:document.querySelector('meta[name=robots]')?.content};
}"""

res = []
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME)
    for theme in ('dark', 'light'):
        for w, h in WIDTHS:
            for path in PAGES:
                ctx = br.new_context(viewport={'width': w, 'height': h}, reduced_motion='reduce')
                if theme == 'light':
                    ctx.add_init_script("try{localStorage.setItem('rl_theme','light')}catch(e){}")
                pg = ctx.new_page()
                errs, bad, writes = [], [], []
                pg.on('console', lambda m: m.type == 'error' and not (path == 'no-such-page' and '404' in m.text and not errs) and errs.append('console: ' + m.text[:300]))
                pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)[:300]))
                pg.on('requestfailed', lambda r: bad.append('failed ' + r.url[:160] + ' ' + str(r.failure)))
                pg.on('response', lambda r: r.status >= 400 and not r.url.endswith('no-such-page') and bad.append('%d %s' % (r.status, r.url[:160])))

                def guard(route):
                    if route.request.method in ('POST', 'PATCH', 'PUT', 'DELETE'):
                        writes.append(route.request.method + ' ' + route.request.url[:120])
                        return route.fulfill(status=201, body='')
                    return route.continue_()
                pg.route('**/*', guard)
                pg.goto(BASE + path, wait_until='networkidle', timeout=60000)
                # scroll through so lazy chapters (globe, reveals) run
                for y in range(0, 6000, 600):
                    pg.evaluate('y=>window.scrollTo(0,y)', y)
                    pg.wait_for_timeout(120)
                pg.wait_for_timeout(1500)
                info = pg.evaluate(PROBE)
                pg.evaluate('window.scrollTo(0,0)')
                pg.wait_for_timeout(300)
                name = '%s-%s-%d' % ((path or 'index').replace('.html', ''), theme, w)
                pg.screenshot(path=os.path.join(OUT, name + '.png'))
                pg.screenshot(path=os.path.join(OUT, name + '-full.png'), full_page=True) if info['height'] < 8000 else None
                res.append(dict(page=path or 'index', theme=theme, width=w, errors=errs, bad=bad, writes=writes, **info))
                ctx.close()
    br.close()

json.dump(res, open(os.path.join(OUT, 'check.json'), 'w'), indent=1)
problems = 0
for r in res:
    flag = r['errors'] or r['bad'] or r['writes'] or r['overflowX'] or not r['main'] or len(r['h1']) != 1 or r['lock'] or r['briefVisible']
    problems += bool(flag)
    print('%-4s %-18s %-5s %4d h=%5d h1=%s cur=%s%s%s%s%s' % ('FAIL' if flag else 'ok', r['page'], r['theme'], r['width'], r['height'],
          r['h1'], r['current'], (' ERR ' + ' | '.join(r['errors'][:3])) if r['errors'] else '', (' BAD ' + ' | '.join(r['bad'][:3])) if r['bad'] else '',
          (' OVERFLOW ' + str(r['wide'])) if r['overflowX'] else '', (' WRITES ' + str(r['writes'])) if r['writes'] else ''))
print('PAGES CHECK', 'CLEAN' if not problems else '%d FAIL' % problems, '->', OUT)
