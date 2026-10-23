# Safety fix (23 Oct 2026): PAPYRUS Prevention of Young Suicide entered administration on 7 Sep 2026 and
# its administrators state "HopeLine24/7 is no longer operating" (opusllp.com case page, which papyrus-uk.org
# now redirects to; also ITV News 8 Sep 2026, South West Yorkshire Partnership NHS Foundation Trust 11 Sep 2026).
# The dead row is REMOVED; nothing is added or reworded. The other five numbers were re-checked on each
# organisation's own site on 23 Oct 2026.

def edit(p, old, new):
    s = open(p, encoding='utf-8').read()
    assert s.count(old) == 1, (p, s.count(old), old[:70])
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))

Q = '_src/pages/_qb.html'
edit(Q, """        <li class="qb-line">
          <span class="qb-who">Papyrus HOPELINE247</span>
          <a class="qb-num" href="tel:03001022470">0300 102 2470</a>
          <span class="qb-when">24/7 · Under 35s, or anyone supporting one</span>
        </li>
""", "")
edit(Q, """       2. Numbers and hours drift — PAPYRUS moved from 0800 068 4141 to the
          number below. Re-verify each against the charity's own site before
          any redesign of this block ships.  Verified 31 Aug 2026. ── -->""",
     """       2. Numbers and hours drift, and services close. Re-verify each against
          the charity's own site before any redesign of this block ships.
          Verified 31 Aug 2026; re-verified 23 Oct 2026, when PAPYRUS HOPELINE247
          was REMOVED: the charity entered administration on 7 Sep 2026 and its
          administrators say "HopeLine24/7 is no longer operating". ── -->""")
print('ok')
