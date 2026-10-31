# Rising Light UK — page builder (22 Oct 2026).
# Assembles the site's pages from _src/partials + _src/pages and writes the finished .html files
# to the repo root (they are committed; GitHub Pages serves them as they are, so the GDACS bot,
# "Deploy from a branch" and every local tool keep working unchanged).
#
#   py _src/build.py           build every page, sitemap.xml included
#   py _src/build.py --check   exit 1 if any committed page differs from a fresh build
#
# Edit the partials, the page fragments in _src/pages, or assets/ — never the built root .html files.
import hashlib, html, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, '_src')
SITE = 'https://77mediaofficial.github.io/RISINGLIGHTUK/'
BASE_PATH = '/RISINGLIGHTUK/'   # 404.html is served at any depth, so it resolves links from here
BRAND = 'Rising Light UK'

# The pages. 'parts' are fragments in _src/pages, joined in order inside <main>.
PAGES = [
    dict(file='index.html', key='home', title=BRAND + ' — Compassion Has No Borders',
         desc='Rising Light UK — Compassion Has No Borders. A grassroots humanitarian initiative helping people and animals '
              'across borders, with projects in the UK and past work in Guatemala and Arizona (USA). Volunteer, partner, or follow our work.',
         og_desc='A grassroots initiative helping people and animals across borders — projects in the UK and past work in Guatemala and Arizona. Volunteer, partner, or follow our work.',
         tw_desc='A grassroots initiative helping people and animals across borders — projects in the UK and past work in Guatemala and Arizona.',
         parts=['_hero', 'home-explore', '_ig'], jsonld=True),
    dict(file='about.html', key='about', title='About — ' + BRAND,
         desc='Who Rising Light UK is: a grassroots humanitarian initiative born in London, what it has done so far and how its work is funded.',
         parts=['about-intro', '_story', '_partners', '_impact']),   # _story: the timeline; _partners: hidden until partners agree
    dict(file='work.html', key='work', title='Our Work — ' + BRAND,
         desc='Where Rising Light UK works and has worked (London, Arizona and Guatemala) and the world’s current Orange and Red disaster alerts '
              'from the Global Disaster Awareness and Coordination System (GDACS).',
         parts=['_reach', '_globe'], scripts=['globe']),
    dict(file='events.html', key='events', title='Events — ' + BRAND,
         desc='Rising Light UK’s events, its 2026 goal and the events calendar.',
         parts=['_events', '_momentum']),   # the list first: the page's heading is "Events"
    dict(file='quiet-battles.html', key='qb', title='Quiet Battles — ' + BRAND,
         desc='Quiet Battles: Rising Light UK’s mental health and suicide prevention work, with UK crisis numbers on the page.',
         parts=['_qb']),
    # Initiatives (29 Oct 2026, UI upgrade surface F): footer link only, never the masthead or the phone bar (Joe's brief)
    dict(file='initiatives.html', key='initiatives', title='Initiatives — ' + BRAND,
         desc='The Clothes Run: Rising Light UK collects the clothes and shoes you no longer wear, free, in London and Surrey, '
              'and takes them to a charity clothing bank. How to book, what the banks ask for, and why.',
         parts=['initiatives']),
    dict(file='get-involved.html', key='join', title='Get Involved — ' + BRAND,
         desc='Volunteer, partner with or contact Rising Light UK, and answers to common questions.',
         parts=['_give', '_faq']),
    dict(file='privacy.html', key='privacy', title='Privacy — ' + BRAND,
         desc='How Rising Light UK handles the details you send through its forms and Clothes Run bookings.',
         parts=['privacy']),
    dict(file='safeguarding.html', key='safeguarding', title='Safeguarding — ' + BRAND,
         desc='How Rising Light UK keeps people safe at its events, on its projects and through Quiet Battles, and who to contact with a concern.',
         parts=['safeguarding']),
    dict(file='accessibility.html', key='accessibility', title='Accessibility — ' + BRAND,
         desc='How accessible the Rising Light UK website is, what does not work yet, and how to report a problem.',
         parts=['accessibility']),
    dict(file='404.html', key='404', title='Page not found — ' + BRAND, desc='This page could not be found.',
         parts=['404'], robots='noindex,follow', sitemap=False, base=True),
    dict(file='admin.html', key='admin', title='Admin — ' + BRAND, desc='Admin sign-in for Rising Light UK.',
         parts=['admin'], robots='noindex,nofollow', sitemap=False),
]

# Navigation: (page key, href, masthead label, phone-bar label). Home is the wordmark on desktop.
NAV = [
    ('home', './', None, 'Home'),
    ('about', 'about.html', 'About', 'About'),
    ('work', 'work.html', 'Our Work', 'Work'),
    ('events', 'events.html', 'Events', 'Events'),
    ('qb', 'quiet-battles.html', 'Quiet Battles', 'Quiet'),
    ('join', 'get-involved.html', 'Get Involved', 'Join'),
]
FOOTER_NAV = [('home', './', 'Home'), ('about', 'about.html', 'About'), ('work', 'work.html', 'Our Work'),
              ('events', 'events.html', 'Events'), ('qb', 'quiet-battles.html', 'Quiet Battles'),
              ('initiatives', 'initiatives.html', 'Initiatives'),
              ('join', 'get-involved.html', 'Get Involved'), ('contact', 'get-involved.html#contact', 'Contact'),
              ('privacy', 'privacy.html', 'Privacy'), ('safeguarding', 'safeguarding.html', 'Safeguarding'),
              ('accessibility', 'accessibility.html', 'Accessibility')]

# Shared scripts, in the order the old single page ran them; each is its own classic <script>
# so a throw in one cannot stop the next. 'globe' only loads where its chapter is. 'motion' (the scroll
# reveal, 29 Oct 2026) runs first, so no other script's failure can leave revealed content hidden.
SCRIPTS = ['motion', 'ink', 'forms', 'v5', 'main', 'globe', 'kit', 'v7', 'ig']

# An HTML comment plus the rest of its line: editor notes, kept in _src/ and left out of the built pages.
COMMENT = r'<!--.*?-->[ \t]*\n?'

# Section ids the old single page was linked by; index.html forwards each to its new page.
LEGACY = ['reach', 'impact', 'momentum', 'events', 'globe', 'quiet-battles', 'faq', 'get-involved', 'privacy']


def read(*p):
    with open(os.path.join(*p), encoding='utf-8') as f:
        return f.read()


CRLF, LF = bytes([13, 10]), bytes([10])


def ver(rel):
    # line endings normalised, so a Windows checkout (CRLF) stamps the same version as the repository (LF)
    return hashlib.sha256(open(os.path.join(ROOT, rel), 'rb').read().replace(CRLF, LF)).hexdigest()[:10]


def fragment(name):
    # HTML comments in fragments are notes for editors; they stay in _src/ and are not published
    text = re.sub(r'<!--.*?-->[ \t]*\n?', '', read(SRC, 'pages', name + '.html'), flags=re.S)
    return text.strip('\n')


def page_url(p):
    return SITE if p['file'] == 'index.html' else SITE + p['file']


def nav_html(cur):
    mast, phone, foot = [], [], []
    for key, href, label, short in NAV:
        here = ' class="active" aria-current="page"' if key == cur else ''
        if label:
            mast.append('      <a href="%s"%s>%s</a>' % (href, ' aria-current="page"' if key == cur else '', label))
        phone.append('  <a href="%s"%s>%s</a>' % (href, here, short))
    for key, href, label in FOOTER_NAV:
        foot.append('      <a href="%s"%s>%s</a>' % (href, ' aria-current="page"' if key == cur else '', label))
    return '\n'.join(mast), '\n'.join(phone), '\n'.join(foot)


def headings(body):
    """Chapter titles become real headings: the page's first is its <h1> (unless the page has one)."""
    first = '<h1' not in body
    def rep(m):
        nonlocal first
        tag = 'h1' if first else 'h2'
        first = False
        return '<%s class="sect-title%s"%s>%s</%s>' % (tag, m.group(1), m.group(2), m.group(3), tag)
    return re.sub(r'<div class="sect-title([^"]*)"([^>]*)>(.*?)</div>', rep, body)


def impact_figures():
    """The Home impact row's figures, read from the SAME places as About's (29 Oct 2026, UI upgrade surface A), so
    the two pages can never disagree: the three counters from RL_IMPACT in assets/js/v7.js, and the funds figure
    and both dates from About's own markup in _src/pages/_impact.html. Countries and total events must stay pinned
    in RL_IMPACT: Home loads no events list, so a null would put v7.js's placeholder (RL_*_FALLBACK) on Home while
    About shows the real count, and the build stops instead. A null lives_touched falls back to RL_LIVES_FALLBACK,
    which both pages show. Change a figure THERE, never on Home.
    The figures are written into the page as <data value>, so they show without JavaScript; v7.js keeps them in
    step with rlEffectiveStats() and counts them up. A source that no longer parses stops the build.
    The £ cell's own source line (29 Oct 2026, Joe's picks W1 + W4) says "Estimated · self-funded", as About's
    "Estimated total", and adds the funds month only when it differs from the month in the shared "Figures as of"
    line under the row ({{IMPACT_FUNDS_SRC}}); both forms are escaped here."""
    js = re.sub(r'/\*.*?\*/', '', read(ROOT, 'assets', 'js', 'v7.js'), flags=re.S)
    block = re.search(r'const RL_IMPACT=\{(.*?)\};', js, re.S)
    if not block:
        sys.exit('build: RL_IMPACT not found in assets/js/v7.js (the Home impact row reads it)')
    pinned = dict(re.findall(r'(\w+)\s*:\s*(null|\d+)', block.group(1)))
    vals = {}
    for key, fb in (('countries', 'RL_COUNTRIES_FALLBACK'), ('total_events', 'RL_EVENTS_FALLBACK'),
                    ('lives_touched', 'RL_LIVES_FALLBACK')):
        v = pinned.get(key)
        if v in (None, 'null') and key != 'lives_touched':
            sys.exit('build: RL_IMPACT.%s is null, but Home cannot count events, so it would show the placeholder '
                     'while About shows the real count; pin the figure in RL_IMPACT (assets/js/v7.js)' % key)
        if v in (None, 'null'):
            m = re.search(r'const %s=(\d+);' % fb, js)
            if not m:
                sys.exit('build: %s is not pinned in RL_IMPACT and %s is missing (assets/js/v7.js)' % (key, fb))
            v = m.group(1)
        vals[key] = int(v)
    about = read(SRC, 'pages', '_impact.html')
    funds = re.search(r'<div class="funds-amount">£([\d,]+)</div>', about)
    asof = re.search(r'<p class="stats-asof">([^<]+)</p>', about)
    note = re.search(r'<div class="funds-note">[^<]*·\s*([^<]+?)\s*</div>', about)
    if not (funds and asof and note):
        sys.exit('build: the funds figure, "Figures as of" line or funds note moved in _src/pages/_impact.html '
                 '(the Home impact row reads them)')
    gbp = int(funds.group(1).replace(',', ''))
    # the source text is HTML: unescape it before it is escaped again below, so an entity (&amp;, &nbsp;) shows as
    # its character on Home, not as literal text, and a &nbsp; between month and year still matches (\s takes U+00A0)
    asof_text, funds_month = html.unescape(asof.group(1)).strip(), html.unescape(note.group(1)).strip()
    if not funds_month:
        sys.exit('build: the funds note in _src/pages/_impact.html names no month after the ·')
    month_re = (r'\b(January|February|March|April|May|June|July|August|September|October|November|December)'
                r'\s+(\d{4})\b')
    def month(s):   # ('october', '2026'), or None when the text names no month
        m = re.search(month_re, s, re.I)
        return (m.group(1).lower(), m.group(2)) if m else None
    same = month(asof_text) is not None and month(asof_text) == month(funds_month)   # no month found: show it
    funds_src = 'Estimated · self-funded' + ('' if same else ' · ' + funds_month)
    t = {'{{IMPACT_ASOF}}': html.escape(asof_text), '{{IMPACT_FUNDS_MONTH}}': html.escape(funds_month),
         '{{IMPACT_FUNDS_SRC}}': html.escape(funds_src),
         '{{IMPACT_FUNDS}}': str(gbp), '{{IMPACT_FUNDS_TEXT}}': '£{:,}'.format(gbp)}
    for key, tok in (('countries', 'COUNTRIES'), ('total_events', 'EVENTS'), ('lives_touched', 'LIVES')):
        t['{{IMPACT_%s}}' % tok] = str(vals[key])
        t['{{IMPACT_%s_TEXT}}' % tok] = '{:,}'.format(vals[key])   # the same grouping as Intl.NumberFormat('en-GB')
    return t


def fill_impact(text, figures):
    for k, v in figures.items():
        text = text.replace(k, v)
    if '{{IMPACT_' in text:
        sys.exit('build: unknown impact token %s' % re.search(r'\{\{IMPACT_\w*\}\}', text).group(0))
    return text


def reach_places():
    """Our Work's list of places under the Reach map (29 Oct 2026, UI upgrade surface C), written from the SAME data
    as the map's node buttons and card, so the two can never disagree: each place's name from LOCATIONS (label) and
    its coordinates and card text from MAP_INFO (co, body) in assets/js/main.js, in that order. Change a place THERE,
    then build. Plain text only (escaped here). A source that no longer parses stops the build."""
    js = read(ROOT, 'assets', 'js', 'main.js')
    locs = re.search(r'const LOCATIONS=\[(.*?)\];', js, re.S)
    info = re.search(r'const MAP_INFO=\[(.*?)\];', js, re.S)
    labels = re.findall(r"label:'([^'\\]*)'", locs.group(1)) if locs else []
    rows = re.findall(r"\{co:'([^'\\]*)',\s*tag:'[^'\\]*',\s*body:'([^'\\]*)'\}", info.group(1)) if info else []
    if not labels or len(labels) != len(rows):
        sys.exit('build: LOCATIONS / MAP_INFO in assets/js/main.js no longer parse into matching places '
                 '(the Our Work place list reads them)')
    items = []
    for label, (co, body) in zip(labels, rows):
        items.append('      <li class="rl-place rl-sr">\n'
                     '        <p class="rl-place-name"><span class="rl-place-mark" aria-hidden="true"></span>%s</p>\n'
                     '        <p class="rl-place-co">%s</p>\n'
                     '        <p class="rl-place-text">%s</p>\n'
                     '      </li>' % (html.escape(label), html.escape(co), html.escape(body)))
    return '\n' + '\n'.join(items) + '\n    '


def build():
    head_t, top_t = read(SRC, 'partials', 'head.html'), read(SRC, 'partials', 'top.html')
    foot_t, chrome = read(SRC, 'partials', 'footer.html'), read(SRC, 'partials', 'chrome.html')

    bodies = {}
    figures = impact_figures()
    places = reach_places()
    for p in PAGES:
        b = fill_impact('\n'.join(fragment(n) for n in p['parts']), figures).replace('{{REACH_PLACES}}', places)
        b = re.sub(r'(<span class="sect-eyebrow">)CH\. \d\d — ', r'\1', b)   # chapter numbers meant one long page
        bodies[p['file']] = headings(b)

    # where each id lives, so "#section" links can point at the right page
    home_of, first_id = {}, {}
    for p in PAGES:
        ids = re.findall(r'\sid="([^"]+)"', bodies[p['file']])
        for i in ids:
            home_of.setdefault(i, p['file'])
        if ids:
            first_id[p['file']] = ids[0]

    def relink(text, fname):
        local = set(re.findall(r'\sid="([^"]+)"', text))
        def rep(m):
            i = m.group(1)
            if i in local or i == 'main' or i not in home_of:
                return m.group(0)
            target = home_of[i]
            href = target if first_id.get(target) == i else '%s#%s' % (target, i)
            return 'href="%s"' % ('./' if href == 'index.html' else href.replace('index.html#', './#'))
        return re.sub(r'href="#([A-Za-z][\w-]*)"', rep, text)

    css_v = ver('assets/css/site.css')
    out = {}
    for p in PAGES:
        f = p['file']
        mast, phone, footnav = nav_html(p['key'])
        head = head_t
        for k, v in (('{{TITLE}}', p['title']), ('{{OG_TITLE}}', p['title']),
                     ('{{OG_DESC}}', p.get('og_desc', p['desc'])), ('{{TW_DESC}}', p.get('tw_desc', p['desc'])), ('{{DESC}}', p['desc']),
                     ('{{ROBOTS}}', p.get('robots', 'index,follow')), ('{{URL}}', page_url(p))):
            head = head.replace(k, html.escape(v, quote=True))
        jsonld = ''
        if p.get('jsonld'):
            jsonld = ('<!-- Organization (schema.org) -->\n<script type="application/ld+json">\n'
                      + read(SRC, 'partials', 'org.jsonld').strip() + '\n</script>\n')
        head = head.replace('{{JSONLD}}', jsonld)
        head = head.replace('<!--SITE_CSS-->', '<link rel="stylesheet" href="assets/css/site.css?v=%s">' % css_v)
        if p.get('base'):
            head = head.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<base href="%s">' % BASE_PATH, 1)
        if f == 'index.html':
            # Old single-page links (/#events, /#get-involved, shared posts, the Instagram bio) land on
            # the page that now holds that section. Runs before any stylesheet, so nothing flashes,
            # and location.replace adds no extra back-button step.
            m = {}
            for i in LEGACY:
                t = home_of[i]
                m[i] = t if first_id.get(t) == i else '%s#%s' % (t, i)
            redirect = ('<!-- Old single-page links: send /#section to the page that now holds it -->\n'
                        '<script>(function(){var m=%s;var h=location.hash.slice(1);if(m.hasOwnProperty(h))location.replace(m[h]);})();</script>\n'
                        % json.dumps(m, separators=(',', ':')))
            anchor = '<link rel="preconnect" href="https://fonts.googleapis.com">'
            assert head.count(anchor) == 1
            head = head.replace(anchor, redirect + anchor)
        top = top_t.replace('<!--MAST_NAV-->', mast).replace('<!--PHONE_NAV-->', phone)
        if p['key'] == 'home':
            top = top.replace('<a class="mast-brand" href="./"', '<a class="mast-brand" href="./" aria-current="page"', 1)
        foot = foot_t.replace('<!--FOOTER_NAV-->', footnav)
        body = bodies[f]
        doc_body = top + '\n\n<div class="container">\n<main id="main" tabindex="-1">\n' + body + '\n</main>\n' + foot + '\n</div>\n' + chrome
        doc_body = relink(doc_body, f)
        if p.get('base'):
            doc_body = doc_body.replace('<a class="skip-link" href="#main">Skip to content</a>',
                '<a class="skip-link" href="#main" onclick="var m=document.getElementById(\'main\');if(m){m.focus();m.scrollIntoView();}return false;">Skip to content</a>', 1)
        scripts = ''.join('<script src="assets/js/%s.js?v=%s"></script>\n' % (s, ver('assets/js/%s.js' % s))
                          for s in SCRIPTS if s != 'globe' or 'globe' in p.get('scripts', []))
        # editor notes in the partials stay in _src/ too: the published page carries only the build banner
        head = re.sub(COMMENT, '', head, flags=re.S)
        doc_body = re.sub(COMMENT, '', doc_body, flags=re.S)
        doc = ('<!DOCTYPE html>\n<html lang="en">\n<!-- Built by _src/build.py from _src/ and assets/. Do not edit this file; '
               'edit the source and run: py _src/build.py -->\n') + head.split('<html lang="en">\n', 1)[1] + '\n' + doc_body + '\n' + scripts + '</body>\n</html>\n'
        out[f] = doc

    urls = ''.join('  <url><loc>%s</loc></url>\n' % page_url(p) for p in PAGES if p.get('sitemap', True))
    out['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + '</urlset>\n'
    return out


def main():
    out = build()
    check = '--check' in sys.argv
    bad = []
    for name, text in out.items():
        path = os.path.join(ROOT, name)
        old = open(path, encoding='utf-8').read().replace('\r\n', '\n') if os.path.exists(path) else None
        if check:
            if old != text:
                bad.append(name)
        elif old != text:
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(text)
            print('wrote', name, len(text.encode('utf-8')))
    if check:
        print('stale: ' + ', '.join(bad) if bad else 'all pages match the source')
        sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
