/* ============================================================
   v5 — DAILY BRIEF, QUICK CAPTURE, CONFETTI, KEYBOARD HELP
   FIX: This block used to live INSIDE the <script src="…pdf.min.js">
   tag above. A <script> with a src attribute ignores its inline
   contents, so none of these features ever ran. It is now its own
   <script> element.
   ============================================================ */

function openBrief() {
  document.getElementById('brief-overlay').classList.add('open');
  renderBrief();
}
function closeBrief() {
  document.getElementById('brief-overlay').classList.remove('open');
}

function renderBrief() {
  const now = new Date();
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('brief-date').textContent = `${days[now.getDay()]} · ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;

  const hour = now.getHours();
  let greet = 'Good morning';
  if (hour >= 12 && hour < 17) greet = 'Good afternoon';
  else if (hour >= 17 || hour < 5) greet = 'Good evening';
  document.getElementById('brief-greeting').textContent = `${greet}.`;

  // Stats — read the SAME resolved numbers the headline Impact section publishes
  // (auto, or an admin-pinned value). The brief used to derive its own figures
  // (lives = events × 80), which contradicted the published numbers.
  const eff = (typeof rlEffectiveStats === 'function')
    ? rlEffectiveStats()
    : { countries: new Set(allEvents.map(e => detectCountry(e.name || ''))).size || 3,
        total_events: allEvents.length,
        lives_touched: 320 };
  const totalEvents = eff.total_events;
  const countries = eff.countries;
  const lives = eff.lives_touched;

  document.getElementById('brief-events').textContent = totalEvents;
  document.getElementById('brief-countries').textContent = countries;
  document.getElementById('brief-lives').textContent = lives;

  document.getElementById('brief-summary').innerHTML =
    `Rising Light has documented <strong>${totalEvents}</strong> events across <strong>${countries}</strong> countries, touching an estimated <strong>${lives}</strong> lives. Compassion travels where it is needed most.`;

  // Recent events
  const recent = allEvents.slice(0, 5);
  const recentEl = document.getElementById('brief-recent');
  if (recent.length === 0) {
    recentEl.innerHTML = '<div style="color:var(--text3); font-style:italic;">No events yet.</div>';
  } else {
    recentEl.innerHTML = recent.map(e => {
      const country = detectCountry(e.name || '');
      const flag = COUNTRY_FLAGS[country] || '🌍';
      return `<div class="brief-line">${flag} <strong>${escapeHtml(e.name || 'Untitled')}</strong></div>`;
    }).join('');
  }

  // By country
  const byCountry = {};
  allEvents.forEach(e => {
    const c = detectCountry(e.name || '') || 'Other';
    byCountry[c] = (byCountry[c] || 0) + 1;
  });
  const countryEl = document.getElementById('brief-by-country');
  const entries = Object.entries(byCountry);
  if (entries.length === 0) {
    countryEl.innerHTML = '<div style="color:var(--text3); font-style:italic;">No data.</div>';
  } else {
    /* v7: render each country as an animated bar (longest = 100%) */
    entries.sort((a, b) => b[1] - a[1]);
    const maxN = Math.max(...entries.map(([, n]) => n));
    countryEl.innerHTML = entries.map(([c, n]) => {
      const flag = COUNTRY_FLAGS[c] || '🌍';
      const pct = Math.round((n / maxN) * 100);
      return `<div class="brief-cbar-row">
        <span class="brief-cbar-label">${flag} <strong>${c}</strong></span>
        <div class="brief-cbar-track"><div class="brief-cbar-fill" data-w="${pct}"></div></div>
        <span class="brief-cbar-n">${n}</span>
      </div>`;
    }).join('');
    // Short timeout (not rAF) so the 0-width state paints first and the fill
    // still applies even in a backgrounded tab, where rAF callbacks pause.
    setTimeout(() => {
      countryEl.querySelectorAll('.brief-cbar-fill').forEach(f => f.style.width = f.dataset.w + '%');
    }, 60);
  }
}

/* ===== QUICK CAPTURE ===== */
const QC_KEY = 'rising-light-captures';

function getCaptures() {
  try { return JSON.parse(localStorage.getItem(QC_KEY) || '[]'); } catch { return []; }
}
function saveCaptures(arr) {
  try { localStorage.setItem(QC_KEY, JSON.stringify(arr.slice(0, 100))); } catch {}
}

function toggleQC() {
  const p = document.getElementById('qc-panel');
  if (p.classList.contains('open')) p.classList.remove('open');
  else {
    p.classList.add('open');
    setTimeout(() => document.getElementById('qc-text').focus(), 100);
    renderQCRecent();
  }
}

function saveQC() {
  const text = document.getElementById('qc-text').value.trim();
  if (!text) return;
  const captures = getCaptures();
  captures.unshift({ id: Date.now(), text, time: new Date().toISOString() });
  saveCaptures(captures);
  document.getElementById('qc-text').value = '';
  renderQCRecent();
  fireConfetti();
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function renderQCRecent() {
  const list = document.getElementById('qc-recent');
  if (!list) return;
  const captures = getCaptures().slice(0, 4);
  if (captures.length === 0) {
    list.innerHTML = '<div style="color:var(--text3); font-size:11px; font-style:italic;">No notes yet.</div>';
    return;
  }
  list.innerHTML = captures.map(c =>
    `<div class="qc-recent-item">${escapeHtml(c.text)}<span class="qc-recent-time">${timeAgo(c.time)}</span></div>`
  ).join('');
}

/* Show FAB when admin */
function updateAdminFeatures() {
  const fab = document.getElementById('qc-fab');
  if (RL_TOKEN || (window.adminMode === true)) fab.classList.add('visible');
  else fab.classList.remove('visible');
}

/* ===== CONFETTI ===== */
function fireConfetti(x, y) {
  const overlay = document.getElementById('confetti-overlay');
  if (!overlay) return;
  x = x || window.innerWidth / 2;
  y = y || window.innerHeight / 3;
  const colors = ['#15140F', '#6B685E', '#9A9589'];
  if (document.body.classList.contains('dark')) {
    colors[0] = '#FAF9F6'; colors[1] = '#C4C2B9'; colors[2] = '#9A9589';
  }
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = x + 'px';
    piece.style.top = y + 'px';
    piece.style.background = colors[i % colors.length];
    overlay.appendChild(piece);
    const angle = (Math.random() - 0.5) * Math.PI;
    const vel = 200 + Math.random() * 300;
    const dx = Math.sin(angle) * vel;
    const dy = -Math.cos(angle) * vel - 150;
    piece.animate([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) rotate(${(Math.random()-0.5)*720}deg)`, opacity: 1, offset: 0.4 },
      { transform: `translate(${dx*1.3}px, ${dy+700}px) rotate(${(Math.random()-0.5)*1080}deg)`, opacity: 0 }
    ], {
      duration: 1600 + Math.random() * 600,
      easing: 'cubic-bezier(0.2,0.6,0.4,1)',
      fill: 'forwards'
    });
    setTimeout(() => piece.remove(), 2400);
  }
}

/* ===== KEYBOARD HELP ===== */
function openKbdHelp() { document.getElementById('kbd-help-overlay').classList.add('open'); }
function closeKbdHelp() { document.getElementById('kbd-help-overlay').classList.remove('open'); }

/* ===== SEARCH HIGHLIGHT ===== */
function installSearchHighlight() {
  const _origRenderEvents = typeof renderEvents === 'function' ? renderEvents : null;
  if (!_origRenderEvents) return;
  window.renderEvents = function() {
    _origRenderEvents();
    // Highlight search matches
    const query = (document.getElementById('search-input')?.value || '').trim();
    if (!query) return;
    setTimeout(() => {
      // SECURITY: highlight by building real DOM nodes (textContent), never by
      // assigning text to innerHTML — event names can contain HTML characters
      // and would otherwise be re-parsed and executed (stored DOM-XSS). Using a
      // fresh regex per text node also avoids the shared-lastIndex bug that a
      // reused /g regex causes across .test()/.exec() calls.
      const pattern = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      document.querySelectorAll('.events-grid h3, .events-grid p, .events-grid .event-title, .events-grid .event-card').forEach(el => {
        el.childNodes.forEach(n => {
          if (n.nodeType !== 3) return; // text nodes only — leave nested elements alone
          const text = n.textContent;
          const re = new RegExp(pattern, 'gi');
          if (!re.test(text)) return;
          re.lastIndex = 0;
          const frag = document.createDocumentFragment();
          let last = 0, m;
          while ((m = re.exec(text)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            const mark = document.createElement('mark');
            mark.className = 'search-highlight';
            mark.textContent = m[0]; // textContent — auto-escaped, no HTML parsing
            frag.appendChild(mark);
            last = m.index + m[0].length;
            if (m[0].length === 0) re.lastIndex++; // guard against zero-width matches
          }
          if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
          n.replaceWith(frag);
        });
      });
    }, 50);
  };
}

/* ===== GLOBAL KEYBOARD ===== */
document.addEventListener('keydown', e => {
  if (['INPUT','TEXTAREA'].includes(e.target.tagName)) {
    // In textareas, Cmd+Enter to save QC
    if (e.target.id === 'qc-text' && (e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      saveQC();
    }
    return;
  }

  // Cmd+N for quick capture (admin only)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
    if (RL_TOKEN || window.adminMode) {
      e.preventDefault();
      toggleQC();
    }
    return;
  }

  // Ignore browser/OS combos (Ctrl+R reload, Cmd+T new tab, etc.) so the
  // single-key shortcuts below don't hijack them. Cmd/Ctrl+N is handled above.
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // The single-key shortcuts are owner tools: signed-in only (22 Oct 2026). A visitor
  // pressing R used to filter the events away without knowing why.
  if (!(RL_TOKEN || window.adminMode)) return;

  const k = e.key.toLowerCase();
  if (k === 't') { toggleTheme(); }
  else if (k === 'b') { openBrief(); }
  else if (k === '?') { e.preventDefault(); openKbdHelp(); }
  else if (k === 'a') { if (typeof filterEvents === 'function') filterEvents('all'); }
  else if (k === 'r') { if (typeof filterEvents === 'function') filterEvents('recent'); }
  else if (k === 'escape') {
    closeKbdHelp();
    closeBrief();
    const qc = document.getElementById('qc-panel');
    if (qc) qc.classList.remove('open');
  }
});

/* ===== HOOK UPLOAD SUCCESS TO FIRE CONFETTI ===== */
let _lastEventCount = 0;
setInterval(() => {
  if (typeof allEvents !== 'undefined' && allEvents.length > _lastEventCount && _lastEventCount > 0) {
    fireConfetti();
  }
  _lastEventCount = (typeof allEvents !== 'undefined') ? allEvents.length : _lastEventCount;
  updateAdminFeatures();
}, 1500);

/* ===== STAT PULSE on counter update ===== */
function installStatPulse() {
  const _origAnimateCounter = typeof animateCounter === 'function' ? animateCounter : null;
  if (!_origAnimateCounter) return;
  window.animateCounter = function(el, target, duration) {
    _origAnimateCounter(el, target, duration);
    if (el) {
      el.classList.remove('stat-pulse');
      void el.offsetWidth;
      el.classList.add('stat-pulse');
    }
  };
}

/* ===== INIT ===== */
window.addEventListener('DOMContentLoaded', () => {
  installSearchHighlight();
  installStatPulse();
  renderQCRecent();
  updateAdminFeatures();
  console.log('[Rising Light v5] Daily Brief + Quick Capture + Keyboard shortcuts + Confetti loaded');
  console.log('[Rising Light v5] Press ? for keyboard shortcuts');
});
