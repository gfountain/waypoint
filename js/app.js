// ─── WAYPOINT — MAIN ENTRY POINT ─────────────────────────────
import { db } from './supabase.js';
import {
  signIn, signUp, signOut, onAuthStateChange,
  startSessionWarning, refreshSession,
  getUserDisplayName, getUserInitials
} from './auth.js';
import { navigate, registerPage, parseHash } from './router.js';
import { toast } from './components/toast.js';
import { initNotifications } from './notifications.js';

// Pages
import { renderDashboard } from './pages/dashboard.js';
import { renderFamilyDetail } from './pages/family-detail.js';
import { renderSettings } from './pages/settings.js';
import { renderHelp } from './pages/help.js';

// ── Register pages ────────────────────────────────────────────
registerPage('dashboard', renderDashboard);
registerPage('families', renderDashboard); // families = dashboard
registerPage('family-detail', renderFamilyDetail);
registerPage('settings', renderSettings);
registerPage('help', renderHelp);

// ── Theme management ──────────────────────────────────────────
const THEMES = ['forest','ocean','violet','midnight','crimson','warm','rose','emerald','slate','graphite'];

export function applyTheme(theme) {
  if (!THEMES.includes(theme)) theme = 'forest';
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('waypoint-theme', theme);
}

async function loadUserTheme(userId) {
  // Try localStorage first for instant apply
  const cached = localStorage.getItem('waypoint-theme');
  if (cached) applyTheme(cached);

  // Then load from DB
  try {
    const { data } = await db.from('user_preferences').select('theme').eq('user_id', userId).single();
    if (data?.theme) applyTheme(data.theme);
  } catch {
    // No preference saved yet — use default
  }
}

export async function saveUserTheme(userId, theme) {
  applyTheme(theme);
  await db.from('user_preferences').upsert(
    { user_id: userId, theme },
    { onConflict: 'user_id' }
  );
}

// ── Auth screen logic ─────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

async function showApp(user) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Load theme
  await loadUserTheme(user.id);

  // Set user info
  const name = getUserDisplayName(user);
  const initials = getUserInitials(user);
  document.getElementById('sidebar-name').textContent = name.split(' ')[0]; // first name only in nav
  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('avatar-dropdown-name').textContent = name;

  // Start notifications
  initNotifications(user.id);

  // Navigate to hash or dashboard
  const { page, params } = parseHash();
  const validPages = ['dashboard', 'families', 'family-detail', 'settings', 'help'];
  navigate(validPages.includes(page) ? page : 'dashboard', params);
}

// ── Auth form handlers ────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');
  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.classList.remove('hidden');
    return;
  }
  const btn = document.getElementById('btn-login');
  btn.textContent = 'Signing in…'; btn.disabled = true;
  try {
    await signIn(email, password);
  } catch (err) {
    errEl.textContent = err.message || 'Sign in failed.';
    errEl.classList.remove('hidden');
    btn.textContent = 'Sign In'; btn.disabled = false;
  }
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('auth-error');
  const successEl = document.getElementById('auth-success');
  errEl.classList.add('hidden'); successEl.classList.add('hidden');
  if (!name || !email || !password) { errEl.textContent = 'Please fill in all fields.'; errEl.classList.remove('hidden'); return; }
  if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }
  const btn = document.getElementById('btn-register');
  btn.textContent = 'Creating account…'; btn.disabled = true;
  try {
    await signUp(email, password, name);
    successEl.textContent = 'Account created! Check your email to confirm, then sign in.';
    successEl.classList.remove('hidden');
    btn.textContent = 'Create Account'; btn.disabled = false;
  } catch (err) {
    errEl.textContent = err.message || 'Registration failed.';
    errEl.classList.remove('hidden');
    btn.textContent = 'Create Account'; btn.disabled = false;
  }
});

document.getElementById('btn-show-register').addEventListener('click', () => {
  document.getElementById('auth-login').classList.add('hidden');
  document.getElementById('auth-register').classList.remove('hidden');
  document.getElementById('auth-error').classList.add('hidden');
});
document.getElementById('btn-show-login').addEventListener('click', () => {
  document.getElementById('auth-register').classList.add('hidden');
  document.getElementById('auth-login').classList.remove('hidden');
  document.getElementById('auth-error').classList.add('hidden');
});
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

// ── Sign out ──────────────────────────────────────────────────
document.getElementById('btn-signout').addEventListener('click', async () => {
  try { await signOut(); } catch { toast('Sign out failed', 'error'); }
  document.getElementById('avatar-dropdown').classList.add('hidden');
});

// ── Session warning ───────────────────────────────────────────
document.getElementById('btn-stay-signed-in').addEventListener('click', refreshSession);

// ── Avatar dropdown ───────────────────────────────────────────
document.getElementById('avatar-btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('avatar-dropdown').classList.toggle('hidden');
  document.getElementById('notif-panel').classList.add('hidden');
});
document.getElementById('btn-goto-account').addEventListener('click', () => {
  document.getElementById('avatar-dropdown').classList.add('hidden');
  navigate('settings');
  // Switch to account tab after settings renders
  setTimeout(() => {
    document.querySelector('[data-tab="account"]')?.click();
  }, 100);
});
document.addEventListener('click', e => {
  if (!document.getElementById('avatar-wrap')?.contains(e.target)) {
    document.getElementById('avatar-dropdown')?.classList.add('hidden');
  }
  if (!document.getElementById('notif-wrap')?.contains(e.target)) {
    document.getElementById('notif-panel')?.classList.add('hidden');
  }
});

// ── Notification bell ─────────────────────────────────────────
document.getElementById('notif-btn').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('notif-panel').classList.toggle('hidden');
  document.getElementById('avatar-dropdown').classList.add('hidden');
});

// ── Top nav tab clicks ────────────────────────────────────────
document.querySelectorAll('.topnav-tab').forEach(tab => {
  tab.addEventListener('click', e => {
    e.preventDefault();
    const page = tab.dataset.page;
    if (page) navigate(page);
  });
});

// ── Floating action button ────────────────────────────────────
document.getElementById('fab-new-family').addEventListener('click', () => {
  import('./pages/families.js').then(m => {
    if (typeof m.openNewFamilyModal === 'function') m.openNewFamilyModal();
  });
});

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal-container');
    if (modal?.innerHTML) { modal.innerHTML = ''; return; }
    document.getElementById('notif-panel')?.classList.add('hidden');
    document.getElementById('avatar-dropdown')?.classList.add('hidden');
    return;
  }
  if (isInput) return;
  if (e.key === '/') {
    e.preventDefault();
    document.querySelector('.search-input')?.focus();
    return;
  }
  if (e.key === 'n' || e.key === 'N') {
    import('./pages/families.js').then(m => {
      if (typeof m.openNewFamilyModal === 'function') m.openNewFamilyModal();
    });
  }
});

// Show shortcut hint briefly
setTimeout(() => {
  const hint = document.getElementById('shortcut-hint');
  if (hint) {
    hint.classList.remove('hidden');
    hint.classList.add('visible');
    setTimeout(() => { hint.classList.remove('visible'); hint.classList.add('hidden'); }, 3000);
  }
}, 1500);

// ── Auth state listener ───────────────────────────────────────
onAuthStateChange((event, session) => {
  if (session?.user) {
    showApp(session.user);
    if (session.expires_at) startSessionWarning(session.expires_at);
  } else {
    showAuthScreen();
  }
});

// ── Initial session check ─────────────────────────────────────
const { data: { session } } = await db.auth.getSession();
if (session?.user) {
  showApp(session.user);
  if (session.expires_at) startSessionWarning(session.expires_at);
} else {
  showAuthScreen();
}
