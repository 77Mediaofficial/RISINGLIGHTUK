# (1) Old single-page links (/#section) must land on the page that now holds that section, scrolled to it.
# (2) Every visible sentence of the old single page must still exist on some new page (or be a known removal).
#   py _src/tools/check_redirects_parity.py <pristine-old-index.html> [base-url]
import re, sys, html as H
from playwright.sync_api import sync_playwright

OLD = sys.argv[1]
BASE = sys.argv[2] if len(sys.argv) > 2 else 'http://127.0.0.1:4433/RISINGLIGHTUK/'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
EXPECT = {'events': 'events.html', 'get-involved': 'get-involved.html', 'quiet-battles': 'quiet-battles.html',
          'faq': 'get-involved.html#faq', 'privacy': 'privacy.html', 'reach': 'work.html', 'impact': 'about.html#impact',
          'globe': 'work.html#globe', 'momentum': 'events.html#momentum'}

fails = 0
with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME)
    for w in (1440, 390):
        for hsh, want in EXPECT.items():
            pg = br.new_page(viewport={'width': w, 'height': 900})
            pg.route('**/*', lambda r: r.fulfill(status=201, body='') if r.request.method != 'GET' else r.continue_())
            pg.goto(BASE + '#' + hsh, wait_until='networkidle')
            pg.wait_for_timeout(1800)
            url = pg.url.replace(BASE, '')
            frag = want.split('#')[1] if '#' in want else None
            top = pg.evaluate("f=>{const e=f&&document.getElementById(f);return e?Math.round(e.getBoundingClientRect().top):null}", frag)
            ok = url == want and (frag is None or (top is not None and -5 <= top <= 140))
            fails += not ok
            print('%s %4d /#%-14s -> %-26s %s' % ('ok  ' if ok else 'FAIL', w, hsh, url, '' if frag is None else 'target top=%s' % top))
            pg.close()

    # parity: visible text of the old page vs the union of the new pages
    def texts(page):
        return page.evaluate("""() => { const out=[]; const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
          let n; while(n=w.nextNode()){ const t=n.textContent.replace(/\\s+/g,' ').trim(); const el=n.parentElement;
            if(!t||!el||el.closest('script,style,noscript,svg'))continue; out.push(t);} return out; }""")
    pg = br.new_page(viewport={'width': 1440, 'height': 900})
    pg.route('**/*', lambda r: r.abort() if r.request.method != 'GET' else r.continue_())
    pg.set_content(open(OLD, encoding='utf-8').read().replace('<head>', '<head><base href="%s">' % BASE, 1), wait_until='networkidle')
    old = set(texts(pg))
    new = set()
    for f in ['', 'about.html', 'work.html', 'events.html', 'quiet-battles.html', 'get-involved.html', 'privacy.html', 'admin.html']:
        pg.goto(BASE + f, wait_until='networkidle')
        new |= set(texts(pg))
    br.close()

missing = sorted(t for t in old if t not in new and not re.fullmatch(r'[\d\W]*', t))
print('\nOLD TEXT NOT FOUND ON ANY NEW PAGE (%d):' % len(missing))
for t in missing:
    print('  -', t[:140])
print('\nREDIRECTS', 'CLEAN' if not fails else '%d FAIL' % fails)
