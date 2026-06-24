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
import { renderFamilies } from './pages/families.js';
import { renderFamilyDetail } from './pages/family-detail.js';
import { renderSettings } from './pages/settings.js';
import { renderHelp } from './pages/help.js';

// ── Register pages ────────────────────────────────────────────
registerPage('dashboard', renderDashboard);
registerPage('families', renderFamilies);
registerPage('family-detail', renderFamilyDetail);
registerPage('settings', renderSettings);
registerPage('help', renderHelp);

// ── Auth screen logic ─────────────────────────────────────────
function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp(user) {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  // Set user info in sidebar
  const name = getUserDisplayName(user);
  const initials = getUserInitials(user);
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('sidebar-avatar').textContent = initials;

  // Start notifications polling
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
  btn.textContent = 'Signing in…';
  btn.disabled = true;

  try {
    await signIn(email, password);
  } catch (err) {
    errEl.textContent = err.message || 'Sign in failed. Please try again.';
    errEl.classList.remove('hidden');
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
});

document.getElementById('btn-register').addEventListener('click', async () => {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl = document.getElementById('auth-error');
  const successEl = document.getElementById('auth-success');
  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  if (!name || !email || !password) {
    errEl.textContent = 'Please fill in all fields.';
    errEl.classList.remove('hidden');
    return;
  }
  if (password.length < 8) {
    errEl.textContent = 'Password must be at least 8 characters.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = document.getElementById('btn-register');
  btn.textContent = 'Creating account…';
  btn.disabled = true;

  try {
    await signUp(email, password, name);
    successEl.textContent = 'Account created! Check your email for a confirmation link, then sign in.';
    successEl.classList.remove('hidden');
    btn.textContent = 'Create Account';
    btn.disabled = false;
  } catch (err) {
    errEl.textContent = err.message || 'Registration failed. Please try again.';
    errEl.classList.remove('hidden');
    btn.textContent = 'Create Account';
    btn.disabled = false;
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

// Allow Enter key to submit login
document.getElementById('login-password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('btn-login').click();
});

// ── Sign out ──────────────────────────────────────────────────
document.getElementById('btn-signout').addEventListener('click', async () => {
  try {
    await signOut();
  } catch (err) {
    toast('Sign out failed', 'error');
  }
});

// ── Session warning ───────────────────────────────────────────
document.getElementById('btn-stay-signed-in').addEventListener('click', refreshSession);

// ── Notification bell ─────────────────────────────────────────
document.getElementById('notif-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  const wrap = document.getElementById('notif-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('notif-panel')?.classList.add('hidden');
  }
});

// ── Navigation clicks ─────────────────────────────────────────
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const page = item.dataset.page;
    if (page) navigate(page);
    // Close mobile menu if open
    document.getElementById('sidebar').classList.remove('mobile-open');
  });
});

// ── Mobile menu toggle ────────────────────────────────────────
document.getElementById('mobile-menu-btn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('mobile-open');
});

// ── Help button in topbar ─────────────────────────────────────
document.getElementById('topbar-help-btn').addEventListener('click', () => {
  navigate('help');
});

// ── Keyboard shortcuts ────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  // Don't fire if typing in an input
  const tag = document.activeElement?.tagName;
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag);

  if (e.key === 'Escape') {
    // Close modal
    const modal = document.getElementById('modal-container');
    if (modal?.innerHTML) {
      modal.innerHTML = '';
      return;
    }
    // Close notification panel
    document.getElementById('notif-panel')?.classList.add('hidden');
    // Close mobile menu
    document.getElementById('sidebar')?.classList.remove('mobile-open');
    return;
  }

  if (isInput) return;

  if (e.key === '/') {
    e.preventDefault();
    // Focus search on current page
    const search = document.querySelector('.search-input');
    if (search) search.focus();
    return;
  }

  if (e.key === 'n' || e.key === 'N') {
    // Open new family modal
    import('./pages/families.js').then(m => {
      if (typeof m.openNewFamilyModal === 'function') m.openNewFamilyModal();
    });
    return;
  }
});

// Show shortcut hint briefly on load
setTimeout(() => {
  const hint = document.getElementById('shortcut-hint');
  if (hint) {
    hint.classList.remove('hidden');
    setTimeout(() => hint.classList.add('hidden'), 4000);
  }
}, 2000);

// ── Auth state listener — main entry ─────────────────────────
onAuthStateChange((event, session) => {
  if (session?.user) {
    showApp(session.user);
    if (session.expires_at) {
      startSessionWarning(session.expires_at);
    }
  } else {
    showAuthScreen();
  }
});

// ── Initial session check ─────────────────────────────────────
const { data: { session } } = await db.auth.getSession();
if (session?.user) {
  showApp(session.user);
  if (session.expires_at) {
    startSessionWarning(session.expires_at);
  }
} else {
  showAuthScreen();
}
