
// ── Global search ─────────────────────────────────────────────
let searchFamiliesCache = [];
let searchDropdownEl = null;

async function initGlobalSearch() {
  // Create search UI in topnav
  const topnavRight = document.querySelector('.topnav-right');
  if (!topnavRight) return;

  const searchWrap = document.createElement('div');
  searchWrap.id = 'global-search-wrap';
  searchWrap.style.cssText = 'position:relative;display:flex;align-items:center;';
  searchWrap.innerHTML = `
    <div style="position:relative;display:flex;align-items:center;">
      <svg style="position:absolute;left:9px;color:rgba(255,255,255,.6);pointer-events:none" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input id="global-search-input" placeholder="Search families…" style="padding:6px 10px 6px 30px;border:1px solid rgba(255,255,255,.25);border-radius:20px;background:rgba(255,255,255,.12);color:white;font-size:13px;width:200px;outline:none;" autocomplete="off">
    </div>
    <div id="global-search-dropdown" style="display:none;position:absolute;top:calc(100% + 8px);left:0;width:420px;background:white;border:0.5px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.15);z-index:500;overflow:hidden;max-height:400px;overflow-y:auto;"></div>`;
  topnavRight.insertBefore(searchWrap, topnavRight.firstChild);

  const input = document.getElementById('global-search-input');
  const dropdown = document.getElementById('global-search-dropdown');
  searchDropdownEl = dropdown;

  input.addEventListener('focus', e => { e.target.style.background='rgba(255,255,255,.2)'; e.target.style.width='240px'; });
  input.addEventListener('blur', e => { setTimeout(()=>{ e.target.style.background='rgba(255,255,255,.12)'; e.target.style.width='200px'; dropdown.style.display='none'; }, 200); });

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = input.value.trim();
    if (!q || q.length < 2) { dropdown.style.display='none'; return; }
    searchTimer = setTimeout(() => runSearch(q, dropdown), 200);
  });
}

async function runSearch(q, dropdown) {
  if (!searchFamiliesCache.length) {
    const { data } = await db.from('families').select('id,decedent_first_name,decedent_last_name,middle_name,contract_number,date_of_death,status,is_lost,template_name,family_contacts(name,phone,is_primary)').order('decedent_last_name');
    searchFamiliesCache = data || [];
  }
  const lq = q.toLowerCase();
  const matches = searchFamiliesCache.filter(f => {
    const name = `${f.decedent_last_name} ${f.decedent_first_name} ${f.middle_name||''}`.toLowerCase();
    const contract = (f.contract_number||'').toLowerCase();
    const contacts = (f.family_contacts||[]).some(c => (c.name||'').toLowerCase().includes(lq)||(c.phone||'').toLowerCase().includes(lq));
    return name.includes(lq)||contract.includes(lq)||contacts;
  }).slice(0, 8);

  if (!matches.length) {
    dropdown.style.display='block';
    dropdown.innerHTML = '<div style="padding:14px 16px;font-size:13px;color:#94a3b8;text-align:center">No families found</div>';
    return;
  }

  const active = matches.filter(f => f.status!=='completed');
  const closed = matches.filter(f => f.status==='completed');

  const highlight = (text, q) => {
    if (!text) return '';
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return text.slice(0,idx) + '<mark style="background:none;color:#2563EB;font-weight:600">' + text.slice(idx,idx+q.length) + '</mark>' + text.slice(idx+q.length);
  };

  const renderGroup = (title, items) => {
    if (!items.length) return '';
    return `<div style="padding:6px 14px 3px;font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.06em">${title}</div>
    ${items.map(f => {
      const primary = (f.family_contacts||[]).find(c=>c.is_primary)||(f.family_contacts||[])[0];
      const initials = `${f.decedent_last_name[0]||''}${f.decedent_first_name[0]||''}`;
      const statusColor = f.status==='active'?'#DBEAFE:#1E40AF':f.status==='long_term'?'#EDE9FE:#6D28D9':'#f1f5f9:#64748b';
      const [bg,fg] = statusColor.split(':');
      const statusLabel = f.is_lost?'Lost':f.status==='active'?'Active':f.status==='long_term'?'Long Term':'Completed';
      const dod = f.date_of_death ? new Date(f.date_of_death+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '';
      return `<div class="gsearch-result" data-id="${f.id}" style="display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;transition:background .1s;border-top:0.5px solid #f8fafc;">
        <div style="width:32px;height:32px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex-shrink:0">${initials}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:500;color:#1e293b">${highlight(`${f.decedent_last_name}, ${f.decedent_first_name}${f.middle_name?' '+f.middle_name:''}`, q)}</div>
          <div style="font-size:11px;color:#94a3b8;display:flex;gap:8px;margin-top:1px">
            ${f.contract_number?`<span>#${f.contract_number}</span>`:''}
            ${dod?`<span>DOD: ${dod}</span>`:''}
            ${primary?`<span>${primary.name}</span>`:''}
          </div>
        </div>
        <span style="font-size:10px;padding:2px 7px;border-radius:6px;background:${bg};color:${fg};font-weight:500;flex-shrink:0">${statusLabel}</span>
      </div>`;
    }).join('')}`;
  };

  dropdown.style.display = 'block';
  dropdown.innerHTML = renderGroup('Active Cases', active) + (active.length&&closed.length?'<div style="border-top:0.5px solid #f1f5f9;margin:4px 0"></div>':'') + renderGroup('Closed Cases', closed);

  dropdown.querySelectorAll('.gsearch-result').forEach(el => {
    el.addEventListener('mouseenter', () => el.style.background='#f8fafc');
    el.addEventListener('mouseleave', () => el.style.background='');
    el.addEventListener('mousedown', () => {
      navigate('family-detail', { id: el.dataset.id });
      dropdown.style.display='none';
      document.getElementById('global-search-input').value='';
    });
  });
}

export function invalidateSearchCache() { searchFamiliesCache = []; }

// ─── WAYPOINT — MAIN ENTRY POINT ─────────────────────────────
import { db } from './supabase.js';
import {
  signIn, signUp, signOut, onAuthStateChange,
  startSessionWarning,
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

  // Init global search
  if (!document.getElementById('global-search-wrap')) initGlobalSearch();

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
    if (page === 'help') {
      import('./pages/help.js').then(m => m.openHelpDrawer());
    } else if (page) {
      navigate(page);
    }
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
  } else {
    showAuthScreen();
  }
});

// ── Initial session check ─────────────────────────────────────
const { data: { session } } = await db.auth.getSession();
if (session?.user) {
  showApp(session.user);
} else {
  showAuthScreen();
}
