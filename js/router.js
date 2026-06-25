// ─── ROUTER ───────────────────────────────────────────────────
// Hash-based router — no server required for GitHub Pages

const routes = {};
let currentPage = null;
let currentParams = {};

// ── Register a page ───────────────────────────────────────────
export function registerPage(name, renderFn) {
  routes[name] = renderFn;
}

// ── Navigate to a page ────────────────────────────────────────
export function navigate(page, params = {}) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));

  // Update nav active state
  document.querySelectorAll('.topnav-tab').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page || (page === 'families' && n.dataset.page === 'dashboard'));
  });

  // Show target page
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) {
    pageEl.classList.remove('hidden');
    pageEl.innerHTML = '';
  }

  // Update topbar title
  const titles = {
    dashboard: 'Dashboard',
    families: 'Families',
    'family-detail': '',
    settings: 'Settings',
    help: 'Help'
  };
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = titles[page] || '';

  // Clear topbar actions
  const actionsEl = document.getElementById('topbar-actions');
  if (actionsEl) actionsEl.innerHTML = '';

  // Update hash
  const hashParams = Object.keys(params).length
    ? '?' + new URLSearchParams(params).toString()
    : '';
  window.history.pushState({ page, params }, '', `#${page}${hashParams}`);

  currentPage = page;
  currentParams = params;

  // Render the page
  if (routes[page]) {
    routes[page](params, pageEl);
  }
}

// ── Get current page ──────────────────────────────────────────
export function getCurrentPage() {
  return { page: currentPage, params: currentParams };
}

// ── Parse hash URL ────────────────────────────────────────────
export function parseHash() {
  const hash = window.location.hash.slice(1); // remove #
  if (!hash) return { page: 'dashboard', params: {} };

  const [pagePart, queryPart] = hash.split('?');
  const params = queryPart
    ? Object.fromEntries(new URLSearchParams(queryPart))
    : {};

  return { page: pagePart || 'dashboard', params };
}

// ── Handle browser back/forward ───────────────────────────────
window.addEventListener('popstate', (e) => {
  if (e.state?.page) {
    navigate(e.state.page, e.state.params || {});
  } else {
    const { page, params } = parseHash();
    navigate(page, params);
  }
});
