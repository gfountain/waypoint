// ─── AUTH ─────────────────────────────────────────────────────
import { db } from './supabase.js';
import { SESSION_WARNING_SECONDS } from './config.js';
import { toast } from './components/toast.js';

let sessionWarningTimer = null;
let sessionCountdownTimer = null;
let countdownSeconds = 60;

// ── Get current user ──────────────────────────────────────────
export async function getCurrentUser() {
  const { data: { user } } = await db.auth.getUser();
  return user;
}

// ── Sign in ───────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

// ── Sign up ───────────────────────────────────────────────────
export async function signUp(email, password, fullName) {
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });
  if (error) throw error;
  return data;
}

// ── Sign out ──────────────────────────────────────────────────
export async function signOut() {
  clearSessionTimers();
  const { error } = await db.auth.signOut();
  if (error) throw error;
}

// ── Session warning system ────────────────────────────────────
export function startSessionWarning(expiresAt) {
  clearSessionTimers();
  if (!expiresAt) return;

  const expiryMs = new Date(expiresAt * 1000).getTime();
  const nowMs = Date.now();
  const msUntilWarning = expiryMs - nowMs - (SESSION_WARNING_SECONDS * 1000);

  if (msUntilWarning <= 0) {
    showSessionWarning(expiresAt);
    return;
  }

  sessionWarningTimer = setTimeout(() => {
    showSessionWarning(expiresAt);
  }, msUntilWarning);
}

function showSessionWarning(expiresAt) {
  const warning = document.getElementById('session-warning');
  const countdownEl = document.getElementById('session-countdown');
  if (!warning || !countdownEl) return;

  const expiryMs = new Date(expiresAt * 1000).getTime();
  countdownSeconds = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
  countdownEl.textContent = countdownSeconds;
  warning.classList.remove('hidden');

  sessionCountdownTimer = setInterval(() => {
    countdownSeconds--;
    countdownEl.textContent = Math.max(0, countdownSeconds);
    if (countdownSeconds <= 0) {
      clearSessionTimers();
      warning.classList.add('hidden');
    }
  }, 1000);
}

export function clearSessionTimers() {
  if (sessionWarningTimer) clearTimeout(sessionWarningTimer);
  if (sessionCountdownTimer) clearInterval(sessionCountdownTimer);
  sessionWarningTimer = null;
  sessionCountdownTimer = null;
}

// ── Stay signed in (refresh session) ─────────────────────────
export async function refreshSession() {
  const { data, error } = await db.auth.refreshSession();
  if (error) {
    toast('Could not refresh session. Please sign in again.', 'error');
    return;
  }
  clearSessionTimers();
  document.getElementById('session-warning')?.classList.add('hidden');
  if (data.session?.expires_at) {
    startSessionWarning(data.session.expires_at);
  }
  toast('Session extended', 'success');
}

// ── Auth state listener ───────────────────────────────────────
export function onAuthStateChange(callback) {
  return db.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// ── User display helpers ──────────────────────────────────────
export function getUserDisplayName(user) {
  return user?.user_metadata?.full_name || user?.email || 'Director';
}

export function getUserInitials(user) {
  const name = getUserDisplayName(user);
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
