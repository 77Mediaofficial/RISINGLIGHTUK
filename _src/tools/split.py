# One-off migration (22 Oct 2026): split the single-page index.html (origin/main f24b775,
# 5,662 lines) into shared assets, partials and per-page fragments. Kept for the record;
# after the split, _src/ and assets/ are the source and _src/build.py assembles the pages.
# Run from the repo root:  py _src/tools/split.py <path-to-pristine-index.html>
import os, re, sys

src = open(sys.argv[1], encoding='utf-8').read().replace('\r\n', '\n')
L = src.split('\n')
assert len(L) in (5662, 5663), len(L)


def lines(a, b):
    """1-based inclusive line range"""
    return '\n'.join(L[a - 1:b])


def inner(a, b):
    """content between an opening tag on line a and its closing tag on line b"""
    return lines(a + 1, b - 1)


def put(path, text):
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text.rstrip('\n') + '\n')
    print(path, len(text))


# ── sanity anchors (fail loudly if the input is not the expected file) ──
assert L[43].strip() == '<style>' and L[1678].strip() == '</style>'
assert L[1694].startswith('<script>try{') and L[1717].startswith('<script>try{')
assert 'id="impact"' in L[1831] and 'id="momentum"' in L[1876] and 'id="globe"' in L[2054]
assert 'id="quiet-battles"' in L[2100] and 'id="rl-instagram"' in L[2278]
assert 'id="faq"' in L[2288] and 'id="get-involved"' in L[2332] and 'id="colophon"' in L[2404]
assert 'pdf.min.js' in L[2525] and L[5450].strip() == '<style>' and L[5592].strip() == '<script>'

# ── CSS: every non-boot <style> block, in document order ──
css = ['/* Rising Light UK: site stylesheet. Split from the single-page index.html on 22 Oct 2026;',
       '   the blocks keep their original order, so the cascade is unchanged. */',
       '/* ── block 1: main stylesheet (was <head>) ── */', inner(44, 1679),
       '/* ── block 2: phone layout + overflow (was inside the events band) ── */', inner(1954, 2020),
       '/* ── block 3 (was inside the events band) ── */', inner(2021, 2041),
       '/* ── block 4: Quiet Battles (was inside CH.06) ── */', inner(2169, 2274),
       '/* ── block 5: Instagram strip + late refinements (was before </body>) ── */', inner(5451, 5592)]
put('assets/css/site.css', '\n'.join(css))

# ── JS: each inline block becomes its own classic script, loaded in the same order, so a
#    throw in one still cannot stop the others (exactly as with separate inline blocks) ──
def script_body(a, b):
    first, last = L[a - 1], L[b - 1]
    body = [first[first.index('>') + 1:]] + L[a:b - 1] + [last[:last.rindex('</script>')]]
    return '\n'.join(body).strip('\n')

put('assets/js/ink.js', script_body(1718, 1740))
put('assets/js/forms.js', inner(2361, 2404))
put('assets/js/v5.js', inner(2527, 2832))
put('assets/js/main.js', inner(2833, 3791))
put('assets/js/globe.js', inner(3792, 4625))
put('assets/js/kit.js', inner(4704, 4736))
put('assets/js/v7.js', inner(4746, 5443))
put('assets/js/ig.js', inner(5593, 5659))

# ── partials ──
assert L[1686] == '</head>' and L[1687] == '<body class="dark">'
head = lines(1, 43) + '\n<!--SITE_CSS-->\n' + lines(1680, 1687)
put('_src/partials/head.html', head)
top = lines(1688, 1716) + '\n' + lines(1741, 1776) + '\n' + lines(1790, 1796)
put('_src/partials/top.html', top)
put('_src/partials/footer.html', lines(2405, 2435))
chrome = lines(2437, 2525) + '\n' + lines(4626, 4703) + '\n' + lines(4737, 4745)
put('_src/partials/chrome.html', chrome)

# ── page fragments (inner <style> blocks already moved to site.css) ──
put('_src/pages/_hero.html', lines(1801, 1810))
put('_src/pages/_reach.html', lines(1811, 1829))
put('_src/pages/_impact.html', lines(1830, 1874))
put('_src/pages/_momentum.html', lines(1876, 1912))
put('_src/pages/_events.html', lines(1914, 1953) + '\n' + lines(2042, 2042))
put('_src/pages/_globe.html', lines(2044, 2086))
put('_src/pages/_qb.html', lines(2088, 2168) + '\n' + lines(2275, 2275))
put('_src/pages/_ig.html', lines(2277, 2286))
put('_src/pages/_faq.html', lines(2288, 2332))
put('_src/pages/_give.html', lines(2333, 2360))
