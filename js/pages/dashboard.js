// ─── DASHBOARD PAGE ───────────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { escHtml, calcProgress, getSurfacedItems, formatPhone } from '../utils/helpers.js';
import { formatDate, getDueStatus, getDueLabel } from '../utils/dates.js';
import { getPriorityItems } from '../notifications.js';
import { toast } from '../components/toast.js';
import { logQuickNote } from '../activity-log.js';
import { getCurrentUser } from '../auth.js';

let allFamilies = [];
let familyItemsCache = {};
let familySectionsCache = {};
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';

export async function renderDashboard(params, container) {
  container.innerHTML = `<div class="loading-state text-muted text-sm">Loading families…</div>`;

  // Set topbar actions
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-new-family-dash">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New Family
    </button>`;

  document.getElementById('btn-new-family-dash')?.addEventListener('click', () => {
    import('./families.js').then(m => m.openNewFamilyModal());
  });

  try {
    await loadFamiliesData();
    renderDashboardContent(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load dashboard</div><div class="empty-desc">${escHtml(err.message)}</div></div>`;
  }
}

async function loadFamiliesData() {
  const { data: families, error } = await db
    .from('families')
    .select(`
      *,
      family_contacts(*)
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  allFamilies = families || [];

  // Fetch items and sections for all families
  if (allFamilies.length === 0) return;

  const familyIds = allFamilies.map(f => f.id);

  const [{ data: sections }, { data: items }, { data: reminders }] = await Promise.all([
    db.from('family_sections').select('*').in('family_id', familyIds),
    db.from('family_items').select('*').in('family_id', familyIds),
    db.from('reminders').select('*').in('family_id', familyIds).eq('is_dismissed', false)
  ]);

  // Cache by family ID
  familySectionsCache = {};
  familyItemsCache = {};

  for (const f of allFamilies) {
    familySectionsCache[f.id] = (sections || []).filter(s => s.family_id === f.id);
    familyItemsCache[f.id] = (items || []).filter(i => i.family_id === f.id);
    f._reminders = (reminders || []).filter(r => r.family_id === f.id);
  }
}

function renderDashboardContent(container) {
  const active = allFamilies.filter(f => f.status === 'active');
  const longTerm = allFamilies.filter(f => f.status === 'long_term');
  const completed = allFamilies.filter(f => f.status === 'completed');
  const priorityItems = getPriorityItems();

  container.innerHTML = `
    ${renderStats(active.length, longTerm.length, completed.length, allFamilies.length)}
    ${priorityItems.length ? renderPriorityStrip(priorityItems) : ''}
    ${renderToolbar()}
    <div class="grid-label" id="grid-label">All active families — ${active.length} cases</div>
    <div class="families-grid" id="families-grid"></div>`;

  bindToolbar();
  renderGrid();
}

function renderStats(active, longTerm, completed, total) {
  return `
    <div class="stats-grid">
      <div class="stat-card stat-card-active" data-filter="active" id="stat-active">
        <div class="stat-label">Active</div>
        <div class="stat-value">${active}</div>
        <div class="stat-sub">in progress</div>
      </div>
      <div class="stat-card stat-card-longterm" data-filter="long_term" id="stat-longterm">
        <div class="stat-label">Long Term</div>
        <div class="stat-value">${longTerm}</div>
        <div class="stat-sub">awaiting dates</div>
      </div>
      <div class="stat-card stat-card-completed" data-filter="completed" id="stat-completed">
        <div class="stat-label">Completed</div>
        <div class="stat-value">${completed}</div>
        <div class="stat-sub">cases closed</div>
      </div>
      <div class="stat-card stat-card-total" data-filter="all" id="stat-total">
        <div class="stat-label">Total</div>
        <div class="stat-value">${total}</div>
        <div class="stat-sub">all time</div>
      </div>
    </div>`;
}

function renderPriorityStrip(items) {
  const rows = items.slice(0, 5).map(item => {
    const label = item._type === 'reminder' ? item.description : item.label;
    return `
      <div class="priority-item" data-family-id="${item.family_id}">
        <div class="priority-dot ${item.dueStatus}"></div>
        <span class="priority-family">${escHtml(item.familyName)}</span>
        <span class="priority-task">${escHtml(label)}</span>
        <span class="priority-due ${item.dueStatus}">${escHtml(item.dueLabel)}</span>
      </div>`;
  }).join('');

  return `
    <div class="priority-strip">
      <div class="priority-strip-header">
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span class="priority-strip-title">Needs attention today</span>
      </div>
      <div class="priority-items">${rows}</div>
    </div>`;
}

function renderToolbar() {
  return `
    <div class="toolbar">
      <div class="search-wrap">
        <svg class="search-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="dash-search" placeholder="Search by name, family member, phone, email…" value="${escHtml(searchQuery)}">
      </div>
      <div class="filter-chips">
        <div class="filter-chip ${currentFilter==='all'?'active':''}" data-filter="all">All</div>
        <div class="filter-chip chip-active ${currentFilter==='active'?'active':''}" data-filter="active">Active</div>
        <div class="filter-chip chip-longterm ${currentFilter==='long_term'?'active':''}" data-filter="long_term">Long Term</div>
        <div class="filter-chip chip-flagged ${currentFilter==='flagged'?'active':''}" data-filter="flagged">Flagged</div>
        <div class="filter-chip chip-completed ${currentFilter==='completed'?'active':''}" data-filter="completed">Completed</div>
      </div>
      <select class="sort-select" id="dash-sort">
        <option value="newest" ${currentSort==='newest'?'selected':''}>Newest</option>
        <option value="oldest" ${currentSort==='oldest'?'selected':''}>Oldest</option>
        <option value="updated" ${currentSort==='updated'?'selected':''}>Last Updated</option>
        <option value="name" ${currentSort==='name'?'selected':''}>Name A–Z</option>
      </select>
    </div>`;
}

function bindToolbar() {
  // Search
  document.getElementById('dash-search')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderGrid();
  });

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderGrid();
    });
  });

  // Stat card filters
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      currentFilter = filter;
      document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === filter);
      });
      renderGrid();
    });
  });

  // Sort
  document.getElementById('dash-sort')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderGrid();
  });

  // Priority strip clicks
  document.querySelectorAll('.priority-item').forEach(el => {
    el.addEventListener('click', () => {
      const familyId = el.dataset.familyId;
      if (familyId) navigate('family-detail', { id: familyId });
    });
  });
}

function getFilteredFamilies() {
  let families = [...allFamilies];

  // Status filter
  if (currentFilter === 'active') families = families.filter(f => f.status === 'active');
  else if (currentFilter === 'long_term') families = families.filter(f => f.status === 'long_term');
  else if (currentFilter === 'completed') families = families.filter(f => f.status === 'completed');
  else if (currentFilter === 'flagged') {
    families = families.filter(f => {
      const items = familyItemsCache[f.id] || [];
      return items.some(i => i.is_important && i.item_state === 'incomplete');
    });
  }

  // Search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    families = families.filter(f => {
      const nameMatch = `${f.decedent_first_name} ${f.decedent_last_name}`.toLowerCase().includes(q);
      const contacts = f.family_contacts || [];
      const contactMatch = contacts.some(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      );
      return nameMatch || contactMatch;
    });
  }

  // Sort
  families.sort((a, b) => {
    if (currentSort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (currentSort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (currentSort === 'updated') return new Date(b.updated_at) - new Date(a.updated_at);
    if (currentSort === 'name') return `${a.decedent_last_name}${a.decedent_first_name}`.localeCompare(`${b.decedent_last_name}${b.decedent_first_name}`);
    return 0;
  });

  return families;
}

function renderGrid() {
  const grid = document.getElementById('families-grid');
  const label = document.getElementById('grid-label');
  if (!grid) return;

  const families = getFilteredFamilies();

  if (label) {
    const filterLabels = { all: 'All families', active: 'Active cases', long_term: 'Long term cases', completed: 'Completed cases', flagged: 'Flagged cases' };
    label.textContent = `${filterLabels[currentFilter] || 'Families'} — ${families.length} ${families.length === 1 ? 'case' : 'cases'}`;
  }

  if (families.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">No families found</div>
        <div class="empty-desc">Try adjusting your search or filter.</div>
      </div>`;
    return;
  }

  grid.innerHTML = families.map(f => renderFamilyCard(f)).join('');

  // Bind card clicks
  grid.querySelectorAll('.family-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.quick-note-area')) return;
      navigate('family-detail', { id: card.dataset.familyId });
    });
  });

  // Bind quick note toggles
  grid.querySelectorAll('.quick-note-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const area = btn.closest('.card-quick-note')?.querySelector('.card-quick-note-input-row');
      if (area) area.classList.toggle('hidden');
    });
  });

  // Bind quick note submissions
  grid.querySelectorAll('.quick-note-submit').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const card = btn.closest('.family-card');
      const familyId = card?.dataset.familyId;
      const input = card?.querySelector('.card-quick-note-input');
      const note = input?.value?.trim();
      if (!note || !familyId) return;

      const family = allFamilies.find(f => f.id === familyId);
      const existingNotes = family?.notes || '';
      const timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      const newNotes = existingNotes ? `${existingNotes}\n\n[${timestamp}] ${note}` : `[${timestamp}] ${note}`;

      await db.from('families').update({ notes: newNotes }).eq('id', familyId);
      if (family) family.notes = newNotes;

      const user = await getCurrentUser();
      await logQuickNote(familyId, user.id, note);

      input.value = '';
      toast('Note added', 'success');
      renderGrid();
    });
  });
}

function renderFamilyCard(family) {
  const items = familyItemsCache[family.id] || [];
  const sections = familySectionsCache[family.id] || [];
  const prog = calcProgress(items);
  const surfaced = getSurfacedItems(sections, items);
  const contacts = family.family_contacts || [];
  const primaryContact = contacts.find(c => c.is_primary) || contacts[0];
  const reminders = family._reminders || [];

  const statusClass = { active: 'card-active', long_term: 'card-longterm', completed: 'card-completed' }[family.status] || 'card-active';
  const hasFlagged = items.some(i => i.is_important && i.item_state === 'incomplete');
  const cardClass = hasFlagged ? 'card-flagged' : statusClass;

  const statusBadge = {
    active: `<span class="badge badge-active">Active</span>`,
    long_term: `<span class="badge badge-longterm">Long Term</span>`,
    completed: `<span class="badge badge-completed">Completed</span>`
  }[family.status] || '';

  const veteranBadge = family.is_veteran
    ? `<span class="veteran-badge veteran">🎖 Veteran</span>`
    : family.is_veteran_spouse
    ? `<span class="veteran-badge veteran-spouse">⭐ Vet Spouse</span>`
    : '';

  const dod = family.date_of_death ? `Passed ${formatDate(family.date_of_death)}` : '';

  const surfacedHtml = surfaced.length ? `
    <div class="card-surface-items">
      ${surfaced.map(item => `
        <div class="surface-item">
          <div class="surface-dot ${item._surface_reason}"></div>
          <span class="surface-item-text">${escHtml(item.label)}</span>
        </div>`).join('')}
      ${reminders.filter(r => getDueStatus(r.due_date) === 'overdue' || getDueStatus(r.due_date) === 'today').slice(0,2).map(r => `
        <div class="surface-item">
          <div class="surface-dot reminder"></div>
          <span class="surface-item-text">${escHtml(r.description)}</span>
        </div>`).join('')}
    </div>` : '';

  const notesPreview = family.notes
    ? `<div class="card-notes">"${escHtml(family.notes)}"</div>`
    : '';

  const fillClass = family.status === 'completed' ? 'completed' : family.status === 'long_term' ? 'longterm' : '';

  return `
    <div class="family-card ${cardClass}" data-family-id="${family.id}">
      <div class="card-top">
        <div>
          <div class="card-dec-name">${escHtml(family.decedent_last_name)}, ${escHtml(family.decedent_first_name)}</div>
          <div class="card-dec-dates">${dod}</div>
        </div>
        <div class="card-badges">
          ${statusBadge}
          ${veteranBadge}
        </div>
      </div>
      ${primaryContact ? `
        <div class="card-contact">
          <span class="card-contact-name">${escHtml(primaryContact.name)}</span>
          ${primaryContact.relationship ? ` · ${escHtml(primaryContact.relationship)}` : ''}
          ${primaryContact.phone ? ` · ${escHtml(formatPhone(primaryContact.phone))}` : ''}
        </div>` : ''}
      <div class="card-progress">
        <div class="progress-row">
          <span class="progress-label">${prog.complete} of ${prog.total} tasks${prog.skipped ? ` · ${prog.skipped} skipped` : ''}</span>
          <span class="progress-pct">${prog.pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill ${fillClass}" style="width:${prog.pct}%"></div>
        </div>
      </div>
      ${surfacedHtml}
      ${notesPreview}
      <div class="card-quick-note quick-note-area">
        <div class="quick-note-toggle">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Quick note
        </div>
        <div class="card-quick-note-input-row hidden">
          <input class="card-quick-note-input" placeholder="Add a note…" onclick="event.stopPropagation()">
          <button class="btn btn-teal btn-xs quick-note-submit">Save</button>
        </div>
      </div>
    </div>`;
}

// Export for use by other pages when they need to refresh dashboard cache
export function invalidateFamilyCache() {
  allFamilies = [];
  familyItemsCache = {};
  familySectionsCache = {};
}
