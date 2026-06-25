// ─── NOTIFICATIONS ────────────────────────────────────────────
import { db } from './supabase.js';
import { getDueStatus, getDueLabel, formatDate } from './utils/dates.js';
import { escHtml } from './utils/helpers.js';
import { navigate } from './router.js';
import { REMINDER_LOOKAHEAD_DAYS } from './config.js';

let pollInterval = null;
let currentUserId = null;
let allDueItems = [];
let allDueReminders = [];

// ── Initialize polling ────────────────────────────────────────
export function initNotifications(userId) {
  currentUserId = userId;
  fetchAndRender();
  // Poll every 5 minutes
  pollInterval = setInterval(fetchAndRender, 5 * 60 * 1000);
}

export function stopNotifications() {
  if (pollInterval) clearInterval(pollInterval);
}

// ── Fetch due items + reminders ───────────────────────────────
async function fetchAndRender() {
  if (!currentUserId) return;
  try {
    await Promise.all([fetchDueItems(), fetchDueReminders()]);
    renderBadge();
    renderPanel();
  } catch (err) {
    console.warn('Notifications fetch failed:', err.message);
  }
}

async function fetchDueItems() {
  // Get incomplete items with due dates within lookahead window or overdue
  // that haven't been dismissed
  const today = new Date().toISOString().split('T')[0];
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + REMINDER_LOOKAHEAD_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  // Get dismissed item IDs
  const { data: dismissed } = await db
    .from('dismissed_reminders')
    .select('family_item_id')
    .eq('user_id', currentUserId);
  const dismissedIds = new Set((dismissed || []).map(d => d.family_item_id));

  // Get due items
  const { data: items } = await db
    .from('family_items')
    .select('id, label, due_date, is_important, item_state, family_id')
    .eq('item_state', 'incomplete')
    .not('due_date', 'is', null)
    .lte('due_date', cutoffStr)
    .order('due_date');

  if (!items) { allDueItems = []; return; }

  // Filter out dismissed and get family names
  const undismissed = items.filter(i => !dismissedIds.has(i.id));

  if (undismissed.length === 0) { allDueItems = []; return; }

  // Get family names for display
  const familyIds = [...new Set(undismissed.map(i => i.family_id))];
  const { data: families } = await db
    .from('families')
    .select('id, decedent_first_name, decedent_last_name, status')
    .in('id', familyIds)
    .eq('user_id', currentUserId)
    .neq('status', 'completed');

  const familyMap = {};
  (families || []).forEach(f => {
    familyMap[f.id] = `${f.decedent_last_name}, ${f.decedent_first_name}`;
  });

  allDueItems = undismissed
    .filter(i => familyMap[i.family_id]) // only active families
    .map(i => ({
      ...i,
      familyName: familyMap[i.family_id] || 'Unknown family',
      dueStatus: getDueStatus(i.due_date),
      dueLabel: getDueLabel(i.due_date)
    }));
}

async function fetchDueReminders() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + REMINDER_LOOKAHEAD_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data: reminders } = await db
    .from('reminders')
    .select(`
      id, description, due_date, family_id,
      families!inner(decedent_first_name, decedent_last_name, status)
    `)
    .eq('user_id', currentUserId)
    .eq('is_dismissed', false)
    .lte('due_date', cutoffStr)
    .order('due_date');

  if (!reminders) { allDueReminders = []; return; }

  allDueReminders = reminders
    .filter(r => r.families?.status !== 'completed')
    .map(r => ({
      ...r,
      familyName: r.families
        ? `${r.families.decedent_last_name}, ${r.families.decedent_first_name}`
        : 'Unknown family',
      dueStatus: getDueStatus(r.due_date),
      dueLabel: getDueLabel(r.due_date),
      _type: 'reminder'
    }));
}

// ── Badge ─────────────────────────────────────────────────────
function renderBadge() {
  const total = allDueItems.length + allDueReminders.length;
  const badge = document.getElementById('notif-badge');
  if (!badge) return;

  if (total > 0) {
    badge.textContent = total > 99 ? '99+' : total;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ── Panel ─────────────────────────────────────────────────────
export function renderPanel() {
  const panel = document.getElementById('notif-panel');
  if (!panel) return;

  const total = allDueItems.length + allDueReminders.length;

  if (total === 0) {
    panel.innerHTML = `
      <div class="notif-panel-header">
        <span class="notif-panel-title">Reminders</span>
      </div>
      <div class="notif-empty">
        <div style="font-size:1.5rem;margin-bottom:6px">✓</div>
        Nothing due right now. You're all caught up!
      </div>`;
    return;
  }

  // Combine and group by family
  const allItems = [
    ...allDueItems.map(i => ({ ...i, _type: 'item' })),
    ...allDueReminders
  ].sort((a, b) => {
    // Sort: overdue first, then today, then upcoming; within group by family name
    const order = { overdue: 0, today: 1, tomorrow: 2, upcoming: 3 };
    const ao = order[a.dueStatus] ?? 4;
    const bo = order[b.dueStatus] ?? 4;
    if (ao !== bo) return ao - bo;
    return (a.familyName || '').localeCompare(b.familyName || '');
  });

  // Group by family
  const groups = {};
  for (const item of allItems) {
    if (!groups[item.family_id]) groups[item.family_id] = { name: item.familyName, items: [] };
    groups[item.family_id].items.push(item);
  }

  const overdueCount = allItems.filter(i => i.dueStatus === 'overdue').length;
  const todayCount = allItems.filter(i => i.dueStatus === 'today').length;

  let html = `
    <div class="notif-panel-header">
      <span class="notif-panel-title">${total} reminder${total !== 1 ? 's' : ''}</span>
      <span class="notif-dismiss-all" id="notif-dismiss-all">Dismiss all</span>
    </div>`;

  for (const [familyId, group] of Object.entries(groups)) {
    html += `
      <div class="notif-group">
        <div class="notif-group-label">${escHtml(group.name)}</div>`;

    for (const item of group.items) {
      const label = item._type === 'reminder' ? item.description : item.label;
      html += `
        <div class="notif-item" data-family-id="${familyId}">
          <div>
            <div class="notif-item-label">${escHtml(label)}</div>
          </div>
          <div class="notif-item-right">
            <span class="notif-due ${item.dueStatus}">${escHtml(item.dueLabel)}</span>
            <span class="notif-dismiss-item"
              data-id="${item.id}"
              data-type="${item._type}">dismiss</span>
          </div>
        </div>`;
    }
    html += `</div><div class="notif-divider"></div>`;
  }

  panel.innerHTML = html;

  // Click on item → navigate to family
  panel.querySelectorAll('.notif-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.classList.contains('notif-dismiss-item')) return;
      const familyId = el.dataset.familyId;
      if (familyId) {
        panel.classList.add('hidden');
        navigate('family-detail', { id: familyId });
      }
    });
  });

  // Dismiss individual
  panel.querySelectorAll('.notif-dismiss-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = el.dataset.id;
      const type = el.dataset.type;
      await dismissItem(id, type);
      el.closest('.notif-item')?.remove();
      await fetchAndRender();
    });
  });

  // Dismiss all
  document.getElementById('notif-dismiss-all')?.addEventListener('click', async () => {
    await dismissAll();
    panel.classList.add('hidden');
  });
}

// ── Dismiss actions ───────────────────────────────────────────
export async function dismissItem(id, type) {
  if (type === 'reminder') {
    await db.from('reminders')
      .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
      .eq('id', id);
    allDueReminders = allDueReminders.filter(r => r.id !== id);
  } else {
    // Checklist item — add to dismissed_reminders table
    await db.from('dismissed_reminders').upsert({
      user_id: currentUserId,
      family_item_id: id,
      dismissed_at: new Date().toISOString()
    }, { onConflict: 'user_id,family_item_id' });
    allDueItems = allDueItems.filter(i => i.id !== id);
  }
  renderBadge();
  renderPanel();
}

async function dismissAll() {
  // Dismiss all item reminders
  if (allDueItems.length > 0) {
    const rows = allDueItems.map(i => ({
      user_id: currentUserId,
      family_item_id: i.id,
      dismissed_at: new Date().toISOString()
    }));
    await db.from('dismissed_reminders').upsert(rows, { onConflict: 'user_id,family_item_id' });
  }

  // Dismiss all standalone reminders
  if (allDueReminders.length > 0) {
    const ids = allDueReminders.map(r => r.id);
    await db.from('reminders')
      .update({ is_dismissed: true, dismissed_at: new Date().toISOString() })
      .in('id', ids);
  }

  allDueItems = [];
  allDueReminders = [];
  renderBadge();
  renderPanel();
}

// ── Get items for priority strip on dashboard ─────────────────
export function getPriorityItems() {
  return [
    ...allDueItems
      .filter(i => i.dueStatus === 'overdue' || i.dueStatus === 'today')
      .map(i => ({ ...i, _type: 'item' })),
    ...allDueReminders
      .filter(r => r.dueStatus === 'overdue' || r.dueStatus === 'today')
  ].sort((a, b) => {
    const order = { overdue: 0, today: 1 };
    return (order[a.dueStatus] ?? 2) - (order[b.dueStatus] ?? 2);
  });
}

// ── Refresh after an item state change ───────────────────────
export function refreshNotifications() {
  fetchAndRender();
}
