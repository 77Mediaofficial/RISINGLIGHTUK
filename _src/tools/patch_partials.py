# One-off (22 Oct 2026): turn the extracted head/top/footer partials into build templates.
import re

def sub1(s, old, new, count=1):
    n = s.count(old)
    assert n == count, (n, old[:80])
    return s.replace(old, new)

# ── head: page-specific values become {{placeholders}}; the NGO JSON-LD becomes {{JSONLD}} ──
p = '_src/partials/head.html'
s = open(p, encoding='utf-8').read()
s = re.sub(r'<title>.*?</title>', '<title>{{TITLE}}</title>', s, count=1)
s = re.sub(r'<meta name="description" content="[^"]*">', '<meta name="description" content="{{DESC}}">', s, count=1)
s = re.sub(r'<meta name="robots" content="[^"]*">', '<meta name="robots" content="{{ROBOTS}}">', s, count=1)
s = re.sub(r'<link rel="canonical" href="[^"]*">', '<link rel="canonical" href="{{URL}}">', s, count=1)
s = re.sub(r'<meta property="og:title" content="[^"]*">', '<meta property="og:title" content="{{OG_TITLE}}">', s, count=1)
s = re.sub(r'<meta property="og:description" content="[^"]*">', '<meta property="og:description" content="{{DESC}}">', s, count=1)
s = re.sub(r'<meta property="og:url" content="[^"]*">', '<meta property="og:url" content="{{URL}}">', s, count=1)
s = re.sub(r'<meta name="twitter:title" content="[^"]*">', '<meta name="twitter:title" content="{{OG_TITLE}}">', s, count=1)
s = re.sub(r'<meta name="twitter:description" content="[^"]*">', '<meta name="twitter:description" content="{{DESC}}">', s, count=1)
s, n = re.subn(r'<!-- Organization \(schema\.org\) -->\n<script type="application/ld\+json">\n(.*?)\n</script>\n',
               '{{JSONLD}}', s, count=1, flags=re.S)
assert n == 1
for k in ('{{TITLE}}', '{{DESC}}', '{{ROBOTS}}', '{{URL}}', '{{OG_TITLE}}', '{{JSONLD}}', '<!--SITE_CSS-->'):
    assert k in s, k
open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ── top: a deep link (page.html#section) is honoured; only a bare address opens at the top ──
p = '_src/partials/top.html'
s = open(p, encoding='utf-8').read()
s = sub1(s, "var _rlTop=function(){if(_rlHeld)return;", "var _rlTop=function(){if(_rlHeld||location.hash)return;")
s = sub1(s, "     2. scrollRestoration=manual + scroll-to-top → the page ALWAYS opens at the top",
         "     2. scrollRestoration=manual + scroll-to-top → the page opens at the top (unless the address has a #section)")
s = sub1(s, '''    <a class="mast-brand" href="#" aria-label="Rising Light UK — back to top">Rising Light</a>
    <nav class="mast-nav" aria-label="Sections">
      <a href="#reach">Reach</a>
      <a href="#impact">Impact</a>
      <a href="#momentum">Momentum</a>
      <a href="#events">Events</a>
      <a href="#quiet-battles">Quiet Battles</a>
      <a href="#faq">FAQ</a>
      <a href="#get-involved">Get Involved</a>
    </nav>
    <div class="mast-end">
    <a class="mast-join" id="mast-join" href="#get-involved">Join us</a>''',
         '''    <a class="mast-brand" href="./" aria-label="Rising Light UK — home">Rising Light</a>
    <nav class="mast-nav" aria-label="Pages">
<!--MAST_NAV-->
    </nav>
    <div class="mast-end">
    <a class="mast-join" id="mast-join" href="get-involved.html">Join us</a>''')
s = sub1(s, '''<!-- Mobile chapter bar — fixed bottom pill nav with scroll-spy -->
<nav class="chapter-bar show" id="chapter-bar" aria-label="Page sections">
  <a href="#reach" data-spy="reach">Reach</a>
  <a href="#impact" data-spy="impact">Impact</a>
  <a href="#events" data-spy="events">Events</a>
  <a href="#quiet-battles" data-spy="quiet-battles">Quiet</a>
  <a href="#faq" data-spy="faq">FAQ</a>
  <a href="#get-involved" data-spy="get-involved">Join</a>
</nav>''',
         '''<!-- Phone page bar — fixed bottom pill nav; the build marks the current page (aria-current) -->
<nav class="chapter-bar show" id="chapter-bar" aria-label="Pages">
<!--PHONE_NAV-->
</nav>''')
s = sub1(s, '<!-- Search Spotlight Overlay (Upgrade 8) -->\n<div id="search-spotlight"></div>\n',
         '<!-- Search Spotlight Overlay (Upgrade 8) -->\n<div id="search-spotlight"></div>\n'
         '<a class="skip-link" href="#main">Skip to content</a>\n')
open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ── footer: privacy note moves to privacy.html (word for word); page links, help link, site credit ──
p = '_src/partials/footer.html'
s = open(p, encoding='utf-8').read()
s = sub1(s, '      <div class="credits-row"><dt>Website</dt><dd><a href="https://77mediaofficial.net" target="_blank" rel="noopener noreferrer">77mediaofficial.net</a></dd></div>\n'
            '      <div class="credits-row"><dt>Privacy</dt><dd><a class="privacy-link" href="#privacy">How we handle your details</a></dd></div>\n',
         '      <div class="credits-row"><dt>Need help now</dt><dd><a href="quiet-battles.html#help">Crisis numbers on Quiet Battles</a></dd></div>\n'
         '      <div class="credits-row"><dt>Privacy</dt><dd><a href="privacy.html">How we handle your details</a></dd></div>\n'
         '      <div class="credits-row"><dt>Site by</dt><dd><a href="https://77mediaofficial.net" target="_blank" rel="noopener noreferrer">77 Media</a></dd></div>\n')
i, j = s.index('    <!-- Privacy note (owner-approved'), s.index('    </details>\n') + len('    </details>\n')
privacy = s[i:j]
s = s[:i] + '    <nav class="footer-pages" aria-label="All pages">\n<!--FOOTER_NAV-->\n    </nav>\n' + s[j:]
open(p, 'w', encoding='utf-8', newline='\n').write(s)
open('_src/pages/_privacy-note.html', 'w', encoding='utf-8', newline='\n').write(privacy)
print('ok')
