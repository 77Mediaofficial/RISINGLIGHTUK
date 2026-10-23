# Fixes from the 23 Oct 2026 independent review (content-copy, design-a11y, links-seo lenses).
BS = chr(92)

def edit(p, old, new, n=1):
    s = open(p, encoding='utf-8').read()
    assert s.count(old) == n, (p, s.count(old), old[:70])
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))

H = '_src/pages/home-explore.html'
# CC-1: the disaster-alert places are not Rising Light's (the globe's own words); CC-2 neutral heading, "About"
edit(H, 'Where compassion travels: London, Arizona and Guatemala, and the places in the world where help is needed now.',
     'Where we work: London, Arizona and Guatemala. Also the world’s current disaster alerts: places where help is needed, not Rising Light projects.')
edit(H, '<div class="sect-title" id="explore-title">Our Work, Page by Page</div>', '<div class="sect-title" id="explore-title">Find Your Way</div>')
edit(H, '<span class="rl-ex-title">About Us</span>', '<span class="rl-ex-title">About</span>')
# DA-8: the card numbers are decoration; screen readers start each link with the page name
edit(H, '<span class="rl-ex-ix">', '<span class="rl-ex-ix" aria-hidden="true">', 4)

M = 'assets/js/main.js'
# CC-3: with no events at all, a country filter shows the general empty state, not "see the rest"
edit(M, "    grid.innerHTML=currentCountry!=='all'\n", "    grid.innerHTML=currentCountry!=='all'&&allEvents.length\n")

# CC-4: one meaning per label: the credits row is the email address; "Contact" is the form
edit('_src/partials/footer.html', '<div class="credits-row"><dt>Contact</dt>', '<div class="credits-row"><dt>Email</dt>')
# CC-5: the FAQ names the page by its menu name
edit('_src/pages/_faq.html', '<a href="#reach">Our Reach</a>', '<a href="#reach">Our Work</a>')

# DA-5: the two form titles are the page's sections (h2); the class keeps the look
edit('_src/pages/_give.html', '<h3 class="give-card-title">Volunteer / Partner</h3>', '<h2 class="give-card-title">Volunteer / Partner</h2>')
edit('_src/pages/_give.html', '<h3 class="give-card-title">Contact Us</h3>', '<h2 class="give-card-title">Contact Us</h2>')

# DA-6: About link separators drawn by CSS, so a dot never ends a line
edit('_src/pages/about-intro.html',
     '<p class="about-links"><a href="work.html">See where we work</a><span aria-hidden="true">·</span><a href="get-involved.html">Get involved</a><span aria-hidden="true">·</span><a href="get-involved.html#faq">Questions</a></p>',
     '<p class="about-links"><a href="work.html">See where we work</a><a href="get-involved.html">Get involved</a><a href="get-involved.html#faq">Questions</a></p>')

C = 'assets/css/site.css'
edit(C, '.about-links span{color:var(--text3)}', '.about-links a+a::before{content:"·";content:"·" / "";color:var(--text3);margin-right:14px;display:inline-block;text-decoration:none}')
# DA-2: JetBrains Mono 600 is loaded (700 is not); move by transform, not top
edit(C, """.skip-link{position:absolute;left:12px;top:-64px;z-index:1000;background:var(--text);color:var(--bg);
  font-family:var(--mono);font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;
  text-decoration:none;padding:10px 16px;border-radius:999px;transition:top .2s cubic-bezier(0.22,1,0.36,1)}
.skip-link:focus{top:12px}""", """.skip-link{position:absolute;left:12px;top:12px;z-index:1000;background:var(--text);color:var(--bg);
  font-family:var(--mono);font-size:11px;font-weight:600;letter-spacing:1.8px;text-transform:uppercase;
  text-decoration:none;padding:10px 16px;border-radius:999px;transform:translateY(-80px);
  transition:transform .2s cubic-bezier(0.22,1,0.36,1)}
.skip-link:focus{transform:none}""")
# DA-7: footer links use the house easing and respect reduced motion
edit(C, '.footer-pages a{font-family:var(--mono);font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--text2);text-decoration:none;transition:color .25s}',
     '.footer-pages a{font-family:var(--mono);font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--text2);text-decoration:none;transition:color .25s cubic-bezier(0.22,1,0.36,1)}')
edit(C, '@media(prefers-reduced-motion:reduce){.rl-ex,.skip-link{transition:none}}', '@media(prefers-reduced-motion:reduce){.rl-ex,.skip-link,.footer-pages a{transition:none}}')
# DA-9: links and buttons on the admin page share one height; two by two on wide screens
edit(C, '.admin-actions .give-btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 20px;text-decoration:none;margin-top:0}',
     '.admin-actions .give-btn{display:inline-flex;align-items:center;justify-content:center;padding:13px 20px;text-decoration:none;margin-top:0;line-height:1.2;min-height:46px;min-width:240px}')
# DA-1: the empty and loading blocks span the whole events grid
open(C, 'a', encoding='utf-8', newline='\n').write(
    '/* the events grid\'s empty and loading blocks span every column, so they sit centred (review, 23 Oct 2026) */\n'
    '.events-grid > .empty,.events-grid > .loading{grid-column:1/-1}\n')

B = '_src/build.py'
# DA-4: Home marks itself current on the wordmark
edit(B, "        top = top_t.replace('<!--MAST_NAV-->', mast).replace('<!--PHONE_NAV-->', phone)",
     "        top = top_t.replace('<!--MAST_NAV-->', mast).replace('<!--PHONE_NAV-->', phone)\n"
     "        if p['key'] == 'home':\n"
     "            top = top.replace('<a class=\"mast-brand\" href=\"./\"', '<a class=\"mast-brand\" href=\"./\" aria-current=\"page\"', 1)")
# DA-3: the 404 page keeps its skip link; <base> would send "#main" home, so the link focuses <main> itself
edit(B, "            doc_body = doc_body.replace('<a class=\"skip-link\" href=\"#main\">Skip to content</a>\\n', '')",
     "            doc_body = doc_body.replace('<a class=\"skip-link\" href=\"#main\">Skip to content</a>',\n"
     "                '<a class=\"skip-link\" href=\"#main\" onclick=\"var m=document.getElementById(\\'main\\');if(m){m.focus();m.scrollIntoView();}return false;\">Skip to content</a>', 1)")
# SEO-1: the home share card keeps its own, shorter descriptions (word for word from the old page)
edit(B, "         parts=['_hero', 'home-explore', '_ig'], jsonld=True),",
     "         og_desc='A grassroots initiative helping people and animals across borders — projects in the UK, Arizona and Guatemala. Volunteer, partner, or follow our work.',\n"
     "         tw_desc='A grassroots initiative helping people and animals across borders — projects in the UK, Arizona and Guatemala.',\n"
     "         parts=['_hero', 'home-explore', '_ig'], jsonld=True),")
edit(B, "        for k, v in (('{{TITLE}}', p['title']), ('{{OG_TITLE}}', p['title']), ('{{DESC}}', p['desc']),",
     "        for k, v in (('{{TITLE}}', p['title']), ('{{OG_TITLE}}', p['title']),\n"
     "                     ('{{OG_DESC}}', p.get('og_desc', p['desc'])), ('{{TW_DESC}}', p.get('tw_desc', p['desc'])), ('{{DESC}}', p['desc']),")
# SEO-2: editor notes in page fragments stay in _src (not served); the built pages carry none
edit(B, """def fragment(name):
    return read(SRC, 'pages', name + '.html').rstrip('\\n')""",
     """def fragment(name):
    # HTML comments in fragments are notes for editors; they stay in _src/ and are not published
    text = re.sub(r'<!--.*?-->[ \\t]*\\n?', '', read(SRC, 'pages', name + '.html'), flags=re.S)
    return text.strip('\\n')""")

HD = '_src/partials/head.html'
edit(HD, '<meta property="og:description" content="{{DESC}}">', '<meta property="og:description" content="{{OG_DESC}}">')
edit(HD, '<meta name="twitter:description" content="{{DESC}}">', '<meta name="twitter:description" content="{{TW_DESC}}">')
print('ok')
