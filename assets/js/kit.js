


/* ═══════════════════════════════════════════════════
   UPGRADE 8: Spotlight Search
   ═══════════════════════════════════════════════════ */
(function() {
  const spotlight = document.getElementById('search-spotlight');
  const searchInput = document.getElementById('search-input');
  const searchContainer = searchInput ? searchInput.closest('.search-container') : null;
  if (!spotlight || !searchInput) return;

  // Dismiss on spotlight click
  spotlight.addEventListener('click', () => {
    searchInput.blur();
  });

  searchInput.addEventListener('focus', () => {
    spotlight.classList.add('active');
    if (searchContainer) searchContainer.classList.add('spotlit');
  });

  searchInput.addEventListener('blur', () => {
    spotlight.classList.remove('active');
    if (searchContainer) searchContainer.classList.remove('spotlit');
  });
})();

/* (v6 globe pin patch removed with the globe) */

console.log('[Rising Light v6] Film grain, lerp cursor, spotlight search, glow pins, true-black dark mode, glassmorphic modals, staggered entry, JetBrains Mono typography, sophisticated hover states, micro-transitions — all loaded.');
