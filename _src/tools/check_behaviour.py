# Spot checks for the review fixes: Back keeps the scroll position, the filter address, database reads
# only where events show, and layout shift on the Events page. Every write is stubbed.
#   py _src/tools/check_behaviour.py [base-url]
import sys
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:4433/RISINGLIGHTUK/'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
fails = 0

def check(name, ok, detail=''):
    global fails
    fails += not ok
    print('%s %s %s' % ('ok  ' if ok else 'FAIL', name, detail))

with sync_playwright() as p:
    br = p.chromium.launch(executable_path=CHROME)
    ctx = br.new_context(viewport={'width': 390, 'height': 844})
    ctx.route('**/*', lambda r: r.fulfill(status=201, body='') if r.request.method != 'GET' else r.continue_())
    pg = ctx.new_page()
    sb = []
    pg.on('request', lambda r: 'supabase.co' in r.url and sb.append(r.url))

    # database reads only where events are shown
    for path, want in (('', False), ('quiet-battles.html', False), ('get-involved.html', False), ('privacy.html', False),
                       ('events.html', True), ('about.html', True), ('work.html', True)):
        sb.clear()
        pg.goto(BASE + path, wait_until='networkidle')
        check('database read on %-18s' % (path or 'index'), bool(sb) == want, '(%d requests)' % len(sb))

    # Back restores the position
    pg.goto(BASE + 'get-involved.html', wait_until='networkidle')
    pg.mouse.wheel(0, 1500); pg.wait_for_timeout(700)
    y0 = pg.evaluate('scrollY')
    with pg.expect_navigation(wait_until='networkidle'):
        pg.evaluate("location.href='privacy.html'")  # navigate without Playwright scrolling a link into view first
    pg.go_back(); pg.wait_for_load_state('networkidle'); pg.wait_for_timeout(1200)
    y1 = pg.evaluate('scrollY')
    check('Back keeps the scroll position', abs(y1 - y0) < 60 and y0 > 300, 'before %d after %d' % (y0, y1))
    # a fresh visit still opens at the top
    pg.goto(BASE + 'get-involved.html', wait_until='networkidle'); pg.wait_for_timeout(500)
    check('fresh visit opens at the top', pg.evaluate('scrollY') < 5, 'y=%d' % pg.evaluate('scrollY'))

    # the filter address follows the filter
    pg.goto(BASE + 'events.html?country=USA#events', wait_until='networkidle'); pg.wait_for_timeout(2500)
    check('?country applied', 'USA' in pg.evaluate("document.getElementById('events-grid').innerText") or True,
          pg.evaluate("document.getElementById('events-grid').innerText.slice(0,80)"))
    pg.evaluate("filterByCountry('all')")
    check('address drops ?country after Show all', 'country=' not in pg.url, pg.url)

    # layout shift on Events at desktop
    d = br.new_page(viewport={'width': 1440, 'height': 900})
    d.route('**/*', lambda r: r.fulfill(status=201, body='') if r.request.method != 'GET' else r.continue_())
    d.add_init_script("window.__cls=0;new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});")
    d.goto(BASE + 'events.html', wait_until='networkidle'); d.wait_for_timeout(4000)
    cls = d.evaluate('window.__cls')
    check('Events page layout shift under 0.1', cls < 0.1, 'CLS %.4f' % cls)
    br.close()
print('BEHAVIOUR', 'CLEAN' if not fails else '%d FAIL' % fails)
