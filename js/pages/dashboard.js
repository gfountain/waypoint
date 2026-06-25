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
let currentFilter = 'all', currentSort = 'newest', sortDir = 'desc', searchQuery = '';

export async function renderDashboard(params, container) {
  container.innerHTML = `<div class="loading-state">Loading families…</div>`;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-new-fam-dash">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New Family
    </button>`;
  document.getElementById('btn-new-fam-dash')?.addEventListener('click', () => {
    import('./families.js').then(m => m.openNewFamilyModal());
  });
  try { await loadData(); renderContent(container); }
  catch(err) { container.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-desc">${escHtml(err.message)}</div></div>`; }
}

async function loadData() {
  const { data: families, error } = await db.from('families').select('*, family_contacts(*)').order('created_at', { ascending: false });
  if (error) throw error;
  allFamilies = families || [];
  if (!allFamilies.length) return;
  const ids = allFamilies.map(f => f.id);
  const [{ data: sections }, { data: items }, { data: subItems }, { data: reminders }] = await Promise.all([
    db.from('family_sections').select('*').in('family_id', ids),
    db.from('family_items').select('*').in('family_id', ids).order('position'),
    db.from('family_sub_items').select('*').in('family_id', ids).order('position'),
    db.from('reminders').select('*').in('family_id', ids).eq('is_dismissed', false)
  ]);
  for (const f of allFamilies) {
    familySectionsCache[f.id] = (sections||[]).filter(s => s.family_id === f.id);
    familyItemsCache[f.id] = (items||[]).filter(i => i.family_id === f.id);
    familySubItemsCache[f.id] = (subItems||[]).filter(i => i.family_id === f.id);
    f._reminders = (reminders||[]).filter(r => r.family_id === f.id);
  }
}

function renderContent(container) {
  const active = allFamilies.filter(f => f.status==='active');
  const longTerm = allFamilies.filter(f => f.status==='long_term');
  const completed = allFamilies.filter(f => f.status==='completed');
  const flagged = allFamilies.filter(f => {
    const items = familyItemsCache[f.id]||[];
    return items.some(i => i.is_important && i.item_state==='incomplete');
  });
  const priorityItems = getPriorityItems();
  container.innerHTML = `
    ${renderStats(active.length, longTerm.length, completed.length, flagged.length, allFamilies.length)}
    ${priorityItems.length ? renderPriorityStrip(priorityItems) : ''}
    ${renderToolbar(active.length, longTerm.length, completed.length, flagged.length, allFamilies.length)}
    <div class="grid-label" id="grid-label"></div>
    <div class="families-grid" id="families-grid"></div>`;
  bindToolbar();
  renderGrid();
}

function renderStats(active, longTerm, completed, flagged, total) {
  return `<div class="stats-grid">
    <div class="stat-card stat-card-active" data-filter="active"><div class="stat-label">Active</div><div class="stat-value">${active}</div><div class="stat-sub">in progress</div></div>
    <div class="stat-card stat-card-longterm" data-filter="long_term"><div class="stat-label">Long Term</div><div class="stat-value">${longTerm}</div><div class="stat-sub">awaiting dates</div></div>
    <div class="stat-card stat-card-completed" data-filter="completed"><div class="stat-label">Completed</div><div class="stat-value">${completed}</div><div class="stat-sub">cases closed</div></div>
    <div class="stat-card stat-card-total" data-filter="all"><div class="stat-label">Total</div><div class="stat-value">${total}</div><div class="stat-sub">all time</div></div>
  </div>`;
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

function renderToolbar(active, longTerm, completed, flagged, total) {
  const counts = { all: total, active, long_term: longTerm, flagged, completed };
  const chips = [['all','All'],['active','Active'],['long_term','Long Term'],['flagged','Flagged'],['completed','Completed']];
  return `<div class="toolbar">
    <div class="search-wrap">
      <svg class="search-icon" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      <input class="search-input" id="dash-search" placeholder="Search by name, contact, phone, email…" value="${escHtml(searchQuery)}">
    </div>
    <div class="filter-chips">
      ${chips.map(([f,l]) => `<div class="filter-chip ${currentFilter===f?'active':''}" data-filter="${f}">${l}<span class="chip-count">${counts[f]||0}</span></div>`).join('')}
    </div>
    <div class="sort-wrap">
      <select class="sort-select" id="dash-sort">
        <option value="newest" ${currentSort==='newest'?'selected':''}>Newest</option>
        <option value="oldest" ${currentSort==='oldest'?'selected':''}>Oldest</option>
        <option value="updated" ${currentSort==='updated'?'selected':''}>Last Updated</option>
        <option value="name" ${currentSort==='name'?'selected':''}>Name A–Z</option>
        <option value="arrangement" ${currentSort==='arrangement'?'selected':''}>Arrangement Date</option>
        <option value="status" ${currentSort==='status'?'selected':''}>Status</option>
      </select>
      <button class="sort-dir-btn" id="sort-dir-btn" title="Toggle sort direction">
        ${sortDir==='asc'?'↑':'↓'}
      </button>
    </div>
  </div>`;
}

function bindToolbar() {
  document.getElementById('dash-search')?.addEventListener('input', e => { searchQuery = e.target.value; renderGrid(); });
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderGrid();
    });
  });
  document.querySelectorAll('.stat-card').forEach(card => {
    card.addEventListener('click', () => {
      currentFilter = card.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.toggle('active', c.dataset.filter===currentFilter));
      renderGrid();
    });
  });
  document.getElementById('dash-sort')?.addEventListener('change', e => { currentSort = e.target.value; renderGrid(); });
  document.getElementById('sort-dir-btn')?.addEventListener('click', () => {
    sortDir = sortDir==='asc' ? 'desc' : 'asc';
    document.getElementById('sort-dir-btn').textContent = sortDir==='asc' ? '↑' : '↓';
    renderGrid();
  });
  document.querySelectorAll('.priority-item').forEach(el => {
    el.addEventListener('click', () => { const id = el.dataset.familyId; if (id) navigate('family-detail', {id}); });
  });
}

function getFiltered() {
  let list = [...allFamilies];
  if (currentFilter==='active') list = list.filter(f => f.status==='active');
  else if (currentFilter==='long_term') list = list.filter(f => f.status==='long_term');
  else if (currentFilter==='completed') list = list.filter(f => f.status==='completed');
  else if (currentFilter==='flagged') list = list.filter(f => (familyItemsCache[f.id]||[]).some(i => i.is_important&&i.item_state==='incomplete'));

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(f => {
      const name = `${f.decedent_first_name} ${f.decedent_last_name}`.toLowerCase();
      const contract = (f.contract_number||'').toLowerCase();
      const contacts = (f.family_contacts||[]).some(c => (c.name||'').toLowerCase().includes(q)||(c.phone||'').toLowerCase().includes(q)||(c.email||'').toLowerCase().includes(q));
      return name.includes(q)||contract.includes(q)||contacts;
    });
  }

  const statusOrder = { active:0, long_term:1, completed:2 };
  list.sort((a,b) => {
    let val = 0;
    if (currentSort==='newest') val = new Date(b.created_at)-new Date(a.created_at);
    else if (currentSort==='oldest') val = new Date(a.created_at)-new Date(b.created_at);
    else if (currentSort==='updated') val = new Date(b.updated_at)-new Date(a.updated_at);
    else if (currentSort==='name') val = `${a.decedent_last_name}${a.decedent_first_name}`.localeCompare(`${b.decedent_last_name}${b.decedent_first_name}`);
    else if (currentSort==='arrangement') {
      const ad = a.arrangement_date||'', bd = b.arrangement_date||'';
      val = bd.localeCompare(ad);
    }
    else if (currentSort==='status') val = (statusOrder[a.status]||0)-(statusOrder[b.status]||0);
    return sortDir==='asc' ? -val : val;
  });
  return list;
}

function renderGrid() {
  const grid = document.getElementById('families-grid');
  const label = document.getElementById('grid-label');
  if (!grid) return;
  const families = getFiltered();
  const filterLabels = { all:'All families', active:'Active cases', long_term:'Long term cases', completed:'Completed cases', flagged:'Flagged cases' };
  if (label) label.textContent = `${filterLabels[currentFilter]||'Families'} — ${families.length} ${families.length===1?'case':'cases'}`;

  if (!families.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">🔍</div><div class="empty-title">No families found</div><div class="empty-desc">Try adjusting your search or filter.</div></div>`;
    return;
  }
  grid.innerHTML = families.map(f => renderCard(f)).join('');
  grid.querySelectorAll('.family-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.quick-note-area')) return;
      navigate('family-detail', { id: card.dataset.familyId });
    });
  });
  grid.querySelectorAll('.quick-note-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      btn.closest('.card-quick-note')?.querySelector('.card-quick-note-input-row')?.classList.toggle('hidden');
    });
  });
  grid.querySelectorAll('.quick-note-submit').forEach(btn => {
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
      renderGrid();
    });
  });
}

function renderCard(family) {
  const items = familyItemsCache[family.id]||[];
  const subItems = familySubItemsCache[family.id]||[];
  const sections = familySectionsCache[family.id]||[];
  const prog = calcProgress(items);
  const contacts = family.family_contacts||[];
  const primary = contacts.find(c => c.is_primary)||contacts[0];
  const important = getImportantItems(items, subItems);
  const nextItem = getNextIncompleteItem(items);
  const hasFlagged = items.some(i => i.is_important&&i.item_state==='incomplete');
  const statusClass = hasFlagged ? 'card-flagged' : { active:'card-active', long_term:'card-longterm', completed:'card-completed' }[family.status]||'';
  const statusBadge = { active:`<span class="badge badge-active">Active</span>`, long_term:`<span class="badge badge-longterm">Long Term</span>`, completed:`<span class="badge badge-completed">Completed</span>` }[family.status]||'';
  const veteranBadge = family.is_veteran ? `<span class="veteran-badge veteran">🎖 Veteran</span>` : family.is_veteran_spouse ? `<span class="veteran-badge veteran-spouse">⭐ Vet Spouse</span>` : '';
  const fillClass = family.status==='completed'?'completed':family.status==='long_term'?'longterm':'';

  const importantHtml = important.shown.length ? `
    <div class="card-important-strip">
      <div class="card-important-title">
        <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        Needs attention
      </div>
      ${important.shown.map(i => `<div class="card-important-item"><div class="priority-dot overdue"></div>${escHtml(i.label)}</div>`).join('')}
      ${important.overflow ? `<div class="card-important-more">and ${important.overflow} more…</div>` : ''}
    </div>` : '';

  const upNextHtml = nextItem ? `
    <div class="card-up-next">
      <span class="card-up-next-label">Up next:</span>
      <span>${escHtml(nextItem.label)}</span>
    </div>` : '';

  return `<div class="family-card ${statusClass}" data-family-id="${family.id}">
    <div class="card-top">
      <div>
        <div class="card-dec-name">${escHtml(family.decedent_last_name)}, ${escHtml(family.decedent_first_name)}</div>
        <div class="card-dec-dates">${family.date_of_death?`Passed ${formatDate(family.date_of_death)}`:''}</div>
      </div>
      <div class="card-badges">${statusBadge}${veteranBadge}</div>
    </div>
    <div class="card-meta">
      ${family.contract_number?`<span class="card-meta-item"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="12" x2="16" y2="12"/></svg>${escHtml(family.contract_number)}</span>`:''}
      ${family.arrangement_date?`<span class="card-meta-item"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>Arr: ${formatDate(family.arrangement_date)}</span>`:''}
      ${family.template_name?`<span class="template-tag">${escHtml(family.template_name)}</span>`:''}
    </div>
    ${primary?`<div class="card-contact"><span class="card-contact-name">${escHtml(primary.name)}</span>${primary.relationship?` · ${escHtml(primary.relationship)}`:''}${primary.phone?` · ${escHtml(formatPhone(primary.phone))}`:''}${primary.email&&!primary.phone?` · ${escHtml(primary.email)}`:''}</div>`:''}
    ${family.status==='long_term'&&family.long_term_reason?`<div class="card-longterm-reason">${escHtml(family.long_term_reason)}</div>`:''}
    <div class="card-progress">
      <div class="progress-row"><span class="progress-label">${prog.complete} of ${prog.total} tasks${prog.skipped?` · ${prog.skipped} skipped`:''}</span><span class="progress-pct">${prog.pct}%</span></div>
      <div class="progress-track"><div class="progress-fill ${fillClass}" style="width:${prog.pct}%"></div></div>
    </div>
    ${importantHtml}
    ${upNextHtml}
    ${family.notes?`<div class="card-notes">"${escHtml(family.notes)}"</div>`:''}
    <div class="card-quick-note quick-note-area">
      <div class="quick-note-toggle"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Quick note</div>
      <div class="card-quick-note-input-row hidden"><input class="card-quick-note-input" placeholder="Add a note…" onclick="event.stopPropagation()"><button class="btn btn-teal btn-xs quick-note-submit">Save</button></div>
    </div>
  </div>`;
}

export function invalidateFamilyCache() { allFamilies=[]; familyItemsCache={}; familySubItemsCache={}; familySectionsCache={}; }
