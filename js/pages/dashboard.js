// ─── DASHBOARD PAGE ───────────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { escHtml, calcProgress, getImportantItems, getNextIncompleteItem, formatPhone } from '../utils/helpers.js';
import { formatDate, getDueStatus, getDueLabel } from '../utils/dates.js';
import { getPriorityItems } from '../notifications.js';
import { toast } from '../components/toast.js';
import { logQuickNote } from '../activity-log.js';
import { getCurrentUser } from '../auth.js';

let allFamilies = [], familyItemsCache = {}, familySubItemsCache = {}, familySectionsCache = {};
let currentCategory = 'active'; // 'active' or 'closed'
let activeFilter = 'all';       // 'all', 'active', 'long_term'
let closedFilter = 'all';       // 'all', 'completed', 'lost'
let currentSort = 'newest';
let sortDir = 'desc';
let searchQuery = '';

export async function renderDashboard(params, container) {
  container.innerHTML = `<div class="loading-state">Loading families…</div>`;
  document.getElementById('topbar-actions').innerHTML = '';
  try { await loadData(); renderContent(container); }
  catch(err) { container.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-desc">${escHtml(err.message)}</div></div>`; }
}

async function loadData() {
  const { data: families, error } = await db.from('families')
    .select('*, family_contacts(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  allFamilies = families || [];
  if (!allFamilies.length) return;
  const ids = allFamilies.map(f => f.id);
  const [{ data: sections }, { data: items }, { data: subItems }] = await Promise.all([
    db.from('family_sections').select('*').in('family_id', ids),
    db.from('family_items').select('*').in('family_id', ids).order('position'),
    db.from('family_sub_items').select('*').in('family_id', ids).order('position')
  ]);
  for (const f of allFamilies) {
    familySectionsCache[f.id] = (sections||[]).filter(s => s.family_id === f.id);
    familyItemsCache[f.id] = (items||[]).filter(i => i.family_id === f.id);
    familySubItemsCache[f.id] = (subItems||[]).filter(i => i.family_id === f.id);
  }
}

function renderContent(container) {
  const activeFamilies = allFamilies.filter(f => f.status !== 'completed');
  const closedFamilies = allFamilies.filter(f => f.status === 'completed');
  const lostCount = closedFamilies.filter(f => f.is_lost).length;
  const completedCount = closedFamilies.filter(f => !f.is_lost).length;
  const priorityItems = getPriorityItems();

  container.innerHTML = `
    ${renderStats(activeFamilies, closedFamilies)}
    ${currentCategory === 'active' && priorityItems.length ? renderPriorityStrip(priorityItems) : ''}
    ${renderCategoryToggle(activeFamilies.length, closedFamilies.length)}
    ${renderToolbar(activeFamilies, completedCount, lostCount)}
    <div class="grid-label" id="grid-label"></div>
    <div id="families-output"></div>`;

  bindToolbar();
  renderFamilies();
}

function renderStats(active, closed) {
  const longTerm = active.filter(f => f.status === 'long_term').length;
  const activeOnly = active.filter(f => f.status === 'active').length;
  const lost = closed.filter(f => f.is_lost).length;
  const completed = closed.length - lost;
  return `<div class="stats-bar">
    <div class="stats-bar-item">
      <div class="stats-bar-accent" style="background:var(--primary)"></div>
      <div><div class="stats-bar-label">Active</div><div class="stats-bar-value">${activeOnly}</div><div class="stats-bar-sub">in progress</div></div>
    </div>
    <div class="stats-bar-divider"></div>
    <div class="stats-bar-item">
      <div class="stats-bar-accent" style="background:var(--violet)"></div>
      <div><div class="stats-bar-label">Long Term</div><div class="stats-bar-value">${longTerm}</div><div class="stats-bar-sub">awaiting dates</div></div>
    </div>
    <div class="stats-bar-divider"></div>
    <div class="stats-bar-item">
      <div class="stats-bar-accent" style="background:var(--muted)"></div>
      <div><div class="stats-bar-label">Completed</div><div class="stats-bar-value">${completed}</div><div class="stats-bar-sub">cases closed</div></div>
    </div>
    <div class="stats-bar-divider"></div>
    <div class="stats-bar-item">
      <div class="stats-bar-accent" style="background:var(--coral)"></div>
      <div><div class="stats-bar-label">Lost</div><div class="stats-bar-value" style="color:var(--coral-dk)">${lost}</div><div class="stats-bar-sub">not retained</div></div>
    </div>
  </div>`;
}

function renderCategoryToggle(activeCount, closedCount) {
  return ''; // now integrated into toolbar
}

function renderToolbar(activeFamilies, completedCount, lostCount) {
  const activeOnly = activeFamilies.filter(f => f.status==='active').length;
  const longTerm = activeFamilies.filter(f => f.status==='long_term').length;
  const totalActive = activeFamilies.length;
  const totalClosed = completedCount + lostCount;

  const chips = currentCategory === 'active'
    ? `<div class="filter-chip ${activeFilter==='all'?'active':''}" data-filter="all">All <span class="chip-count">${totalActive}</span></div>
       <div class="filter-chip ${activeFilter==='active'?'active':''}" data-filter="active">Active <span class="chip-count">${activeOnly}</span></div>
       <div class="filter-chip ${activeFilter==='long_term'?'active':''}" data-filter="long_term">Long Term <span class="chip-count">${longTerm}</span></div>`
    : `<div class="filter-chip ${closedFilter==='all'?'active':''}" data-filter="all">All <span class="chip-count">${totalClosed}</span></div>
       <div class="filter-chip ${closedFilter==='completed'?'active':''}" data-filter="completed">Completed <span class="chip-count">${completedCount}</span></div>
       <div class="filter-chip ${closedFilter==='lost'?'active':''}" data-filter="lost">Lost <span class="chip-count">${lostCount}</span></div>`;

  return `<div class="toolbar">
    <select class="category-select" id="category-select">
      <option value="active" ${currentCategory==='active'?'selected':''}>Active Cases (${totalActive})</option>
      <option value="closed" ${currentCategory==='closed'?'selected':''}>Closed Cases (${totalClosed})</option>
    </select>
    <div class="search-wrap">
      <svg class="search-icon" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-input" id="dash-search" placeholder="Search by name, contact, phone…" value="${escHtml(searchQuery)}">
    </div>
    <div class="filter-chips" id="filter-chips">${chips}</div>
    <div class="sort-wrap">
      <select class="sort-select" id="dash-sort">
        <option value="newest" ${currentSort==='newest'?'selected':''}>Newest</option>
        <option value="oldest" ${currentSort==='oldest'?'selected':''}>Oldest</option>
        <option value="updated" ${currentSort==='updated'?'selected':''}>Last Updated</option>
        <option value="name" ${currentSort==='name'?'selected':''}>Name A–Z</option>
        <option value="arrangement" ${currentSort==='arrangement'?'selected':''}>Arrangement Date</option>
      </select>
      <button class="sort-dir-btn" id="sort-dir-btn">${sortDir==='asc'?'↑':'↓'}</button>
    </div>
  </div>`;
}

function bindToolbar() {
  // Category select
  document.getElementById('category-select')?.addEventListener('change', e => {
    currentCategory = e.target.value;
    activeFilter = 'all';
    closedFilter = 'all';
    searchQuery = '';
    renderContent(document.getElementById('page-dashboard') || document.getElementById('page-families'));
  });

  document.getElementById('dash-search')?.addEventListener('input', e => { searchQuery = e.target.value; renderFamilies(); });
  document.getElementById('dash-sort')?.addEventListener('change', e => { currentSort = e.target.value; renderFamilies(); });
  document.getElementById('sort-dir-btn')?.addEventListener('click', () => {
    sortDir = sortDir==='asc'?'desc':'asc';
    document.getElementById('sort-dir-btn').textContent = sortDir==='asc'?'↑':'↓';
    renderFamilies();
  });

  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      if (currentCategory==='active') activeFilter = chip.dataset.filter;
      else closedFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderFamilies();
    });
  });

  // Priority strip clicks
  document.querySelectorAll('.priority-item').forEach(el => {
    el.addEventListener('click', () => { const id = el.dataset.familyId; if (id) navigate('family-detail', {id}); });
  });
}

function getFiltered() {
  let list = currentCategory === 'active'
    ? allFamilies.filter(f => f.status !== 'completed')
    : allFamilies.filter(f => f.status === 'completed');

  // Sub-filter
  if (currentCategory === 'active') {
    if (activeFilter === 'active') list = list.filter(f => f.status === 'active');
    else if (activeFilter === 'long_term') list = list.filter(f => f.status === 'long_term');
  } else {
    if (closedFilter === 'completed') list = list.filter(f => !f.is_lost);
    else if (closedFilter === 'lost') list = list.filter(f => f.is_lost);
  }

  // Search
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(f => {
      const name = `${f.decedent_first_name} ${f.decedent_last_name}`.toLowerCase();
      const contract = (f.contract_number||'').toLowerCase();
      const contacts = (f.family_contacts||[]).some(c =>
        (c.name||'').toLowerCase().includes(q) ||
        (c.phone||'').toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q)
      );
      return name.includes(q) || contract.includes(q) || contacts;
    });
  }

  // Sort
  list.sort((a, b) => {
    let val = 0;
    if (currentSort==='newest') val = new Date(b.created_at)-new Date(a.created_at);
    else if (currentSort==='oldest') val = new Date(a.created_at)-new Date(b.created_at);
    else if (currentSort==='updated') val = new Date(b.updated_at)-new Date(a.updated_at);
    else if (currentSort==='name') val = `${a.decedent_last_name}${a.decedent_first_name}`.localeCompare(`${b.decedent_last_name}${b.decedent_first_name}`);
    else if (currentSort==='arrangement') val = (b.arrangement_date||'').localeCompare(a.arrangement_date||'');
    return sortDir==='asc' ? -val : val;
  });
  return list;
}

function renderFamilies() {
  const output = document.getElementById('families-output');
  const label = document.getElementById('grid-label');
  if (!output) return;
  const families = getFiltered();
  const catLabel = currentCategory==='active' ? 'active cases' : 'closed cases';
  if (label) label.textContent = `${families.length} ${families.length===1?catLabel.replace('cases','case'):catLabel}`;

  if (!families.length) {
    output.innerHTML = `<div class="empty-state"><div class="empty-icon">${currentCategory==='closed'?'📁':'🔍'}</div><div class="empty-title">No ${catLabel} found</div><div class="empty-desc">Try adjusting your search or filter.</div></div>`;
    return;
  }

  if (currentCategory === 'active') {
    output.innerHTML = `<div class="families-grid">${families.map(f => renderCard(f)).join('')}</div>`;
    bindCardEvents(output);
  } else {
    output.innerHTML = renderListView(families);
    bindListEvents(output);
  }
}

// ── ACTIVE: Card view ─────────────────────────────────────────
function renderCard(family) {
  const items = familyItemsCache[family.id]||[];
  const subItems = familySubItemsCache[family.id]||[];
  const prog = calcProgress(items);
  const contacts = family.family_contacts||[];
  const primary = contacts.find(c => c.is_primary)||contacts[0];
  const important = getImportantItems(items, subItems);
  const nextItem = getNextIncompleteItem(items);
  const statusClass = { active:'card-active', long_term:'card-longterm' }[family.status]||'';
  const statusBadge = { active:`<span class="badge badge-active">Active</span>`, long_term:`<span class="badge badge-longterm">Long Term</span>` }[family.status]||'';
  const veteranBadge = family.is_veteran ? `<span class="veteran-badge veteran">🎖 Veteran</span>` : family.is_veteran_spouse ? `<span class="veteran-badge veteran-spouse">⭐ Vet Spouse</span>` : '';

  return `<div class="family-card ${statusClass}" data-family-id="${family.id}">
    <div class="card-top">
      <div>
        <div class="card-dec-name">${escHtml(family.decedent_last_name)}, ${escHtml(family.decedent_first_name)}</div>
        <div class="card-dec-dates">${family.date_of_death?`Passed ${formatDate(family.date_of_death)}`:''}</div>
      </div>
      <div class="card-badges">${statusBadge}${veteranBadge}</div>
    </div>
    <div class="card-meta">
      ${family.contract_number?`<span class="card-meta-item">#${escHtml(family.contract_number)}</span>`:''}
      ${family.arrangement_date?`<span class="card-meta-item">Arr: ${formatDate(family.arrangement_date)}</span>`:''}
      ${family.template_name?`<span class="template-tag">${escHtml(family.template_name)}</span>`:''}
    </div>
    ${primary?`<div class="card-contact"><span class="card-contact-name">${escHtml(primary.name)}</span>${primary.relationship?` · ${escHtml(primary.relationship)}`:''}${primary.phone?` · ${escHtml(formatPhone(primary.phone))}`:''}</div>`:''}
    ${family.status==='long_term'&&family.long_term_reason?`<div class="card-longterm-reason">${escHtml(family.long_term_reason)}</div>`:''}
    <div class="card-progress">
      <div class="progress-row"><span class="progress-label">${prog.complete} of ${prog.total} tasks${prog.skipped?` · ${prog.skipped} skipped`:''}</span><span class="progress-pct">${prog.pct}%</span></div>
      <div class="progress-track"><div class="progress-fill" style="width:${prog.pct}%"></div></div>
    </div>
    ${important.shown.length?`<div class="card-important-strip">
      <div class="card-important-title"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> Needs attention</div>
      ${important.shown.map(i=>`<div class="card-important-item"><div class="priority-dot overdue"></div>${escHtml(i.label)}</div>`).join('')}
      ${important.overflow?`<div class="card-important-more">and ${important.overflow} more…</div>`:''}
    </div>`:''}
    ${nextItem?`<div class="card-up-next"><span class="card-up-next-label">Up next:</span><span>${escHtml(nextItem.label)}</span></div>`:''}
    ${family.notes?`<div class="card-notes">"${escHtml(family.notes)}"</div>`:''}
    <div class="card-quick-note quick-note-area">
      <div class="quick-note-toggle"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Quick note</div>
      <div class="card-quick-note-input-row hidden"><input class="card-quick-note-input" placeholder="Add a note…" onclick="event.stopPropagation()"><button class="btn btn-teal btn-xs quick-note-submit">Save</button></div>
    </div>
  </div>`;
}

function bindCardEvents(container) {
  container.querySelectorAll('.family-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.quick-note-area')) return;
      navigate('family-detail', { id: card.dataset.familyId });
    });
  });
  container.querySelectorAll('.quick-note-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.closest('.card-quick-note')?.querySelector('.card-quick-note-input-row')?.classList.toggle('hidden');
    });
  });
  container.querySelectorAll('.quick-note-submit').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const card = btn.closest('.family-card');
      const familyId = card?.dataset.familyId;
      const input = card?.querySelector('.card-quick-note-input');
      const note = input?.value?.trim();
      if (!note||!familyId) return;
      const family = allFamilies.find(f => f.id===familyId);
      const ts = new Date().toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      const newNotes = family?.notes ? `${family.notes}\n\n[${ts}] ${note}` : `[${ts}] ${note}`;
      await db.from('families').update({ notes: newNotes }).eq('id', familyId);
      if (family) family.notes = newNotes;
      const user = await getCurrentUser();
      await logQuickNote(familyId, user.id, note);
      input.value = '';
      toast('Note added', 'success');
      renderFamilies();
    });
  });
}

// ── CLOSED: List view ─────────────────────────────────────────
function renderListView(families) {
  return `
    <div class="closed-list">
      <div class="closed-list-header">
        <div class="cl-name">Name</div>
        <div class="cl-contract">Contract #</div>
        <div class="cl-dod">Date of Death</div>
        <div class="cl-arr">Arrangement</div>
        <div class="cl-template">Template</div>
        <div class="cl-status">Status</div>
      </div>
      ${families.map(f => `
        <div class="closed-list-row" data-family-id="${f.id}">
          <div class="cl-name">
            <span class="cl-dec-name">${escHtml(f.decedent_last_name)}, ${escHtml(f.decedent_first_name)}</span>
            ${f.is_veteran?`<span class="veteran-badge veteran" style="font-size:.62rem;padding:1px 4px">🎖</span>`:f.is_veteran_spouse?`<span class="veteran-badge veteran-spouse" style="font-size:.62rem;padding:1px 4px">⭐</span>`:''}
          </div>
          <div class="cl-contract">${f.contract_number?escHtml(f.contract_number):'<span class="text-muted">—</span>'}</div>
          <div class="cl-dod">${f.date_of_death?formatDate(f.date_of_death):'<span class="text-muted">—</span>'}</div>
          <div class="cl-arr">${f.arrangement_date?formatDate(f.arrangement_date):'<span class="text-muted">—</span>'}</div>
          <div class="cl-template">${f.template_name?`<span class="template-tag">${escHtml(f.template_name)}</span>`:'<span class="text-muted">—</span>'}</div>
          <div class="cl-status">
            ${f.is_lost
              ? `<span class="badge badge-lost">⊘ Lost</span>${f.lost_reason?`<div class="cl-lost-reason">${escHtml(f.lost_reason)}</div>`:''}`
              : `<span class="badge badge-completed">✓ Completed</span>`}
          </div>
        </div>`).join('')}
    </div>`;
}

function bindListEvents(container) {
  container.querySelectorAll('.closed-list-row').forEach(row => {
    row.addEventListener('click', () => navigate('family-detail', { id: row.dataset.familyId }));
  });
}

function renderPriorityStrip(items) {
  return `<div class="priority-strip">
    <div class="priority-strip-header">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Needs attention today
    </div>
    <div class="priority-items">
      ${items.slice(0,5).map(item => `
        <div class="priority-item" data-family-id="${item.family_id}">
          <div class="priority-dot ${item.dueStatus}"></div>
          <span class="priority-family">${escHtml(item.familyName)}</span>
          <span class="priority-task">${escHtml(item._type==='reminder'?item.description:item.label)}</span>
          <span class="priority-due ${item.dueStatus}">${escHtml(item.dueLabel)}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

export function invalidateFamilyCache() {
  allFamilies=[]; familyItemsCache={}; familySubItemsCache={}; familySectionsCache={};
}
