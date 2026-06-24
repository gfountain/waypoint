// ─── FAMILIES PAGE ────────────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml, calcProgress, getSurfacedItems, formatPhone } from '../utils/helpers.js';
import { formatDate, calcDueDate, getDueStatus } from '../utils/dates.js';
import { logCaseCreated } from '../activity-log.js';
import { getCurrentUser } from '../auth.js';
import { refreshNotifications } from '../notifications.js';

let allFamilies = [];
let familyItemsCache = {};
let familySectionsCache = {};
let currentFilter = 'all';
let currentSort = 'newest';
let searchQuery = '';

export async function renderFamilies(params, container) {
  container.innerHTML = `<div class="text-muted text-sm">Loading families…</div>`;

  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-new-family">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New Family
    </button>`;

  document.getElementById('btn-new-family')?.addEventListener('click', openNewFamilyModal);

  try {
    await loadData();
    renderContent(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Failed to load</div><div class="empty-desc">${escHtml(err.message)}</div></div>`;
  }
}

async function loadData() {
  const { data: families, error } = await db
    .from('families')
    .select('*, family_contacts(*)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  allFamilies = families || [];

  if (!allFamilies.length) return;
  const ids = allFamilies.map(f => f.id);

  const [{ data: sections }, { data: items }] = await Promise.all([
    db.from('family_sections').select('*').in('family_id', ids),
    db.from('family_items').select('*').in('family_id', ids)
  ]);

  for (const f of allFamilies) {
    familySectionsCache[f.id] = (sections || []).filter(s => s.family_id === f.id);
    familyItemsCache[f.id] = (items || []).filter(i => i.family_id === f.id);
  }
}

function renderContent(container) {
  container.innerHTML = `
    <div class="toolbar">
      <div class="search-wrap">
        <svg class="search-icon" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" id="fam-search" placeholder="Search by name, family member, phone, email…">
      </div>
      <div class="filter-chips">
        <div class="filter-chip active" data-filter="all">All</div>
        <div class="filter-chip chip-active" data-filter="active">Active</div>
        <div class="filter-chip chip-longterm" data-filter="long_term">Long Term</div>
        <div class="filter-chip chip-flagged" data-filter="flagged">Flagged</div>
        <div class="filter-chip chip-completed" data-filter="completed">Completed</div>
      </div>
      <select class="sort-select" id="fam-sort">
        <option value="newest">Newest</option>
        <option value="oldest">Oldest</option>
        <option value="updated">Last Updated</option>
        <option value="name">Name A–Z</option>
      </select>
    </div>
    <div class="grid-label" id="fam-grid-label">All families</div>
    <div class="families-grid" id="fam-grid"></div>`;

  document.getElementById('fam-search')?.addEventListener('input', e => { searchQuery = e.target.value; renderGrid(); });
  document.getElementById('fam-sort')?.addEventListener('change', e => { currentSort = e.target.value; renderGrid(); });
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      renderGrid();
    });
  });

  renderGrid();
}

function getFiltered() {
  let list = [...allFamilies];
  if (currentFilter === 'active') list = list.filter(f => f.status === 'active');
  else if (currentFilter === 'long_term') list = list.filter(f => f.status === 'long_term');
  else if (currentFilter === 'completed') list = list.filter(f => f.status === 'completed');
  else if (currentFilter === 'flagged') {
    list = list.filter(f => {
      const items = familyItemsCache[f.id] || [];
      return items.some(i => i.is_important && i.item_state === 'incomplete');
    });
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    list = list.filter(f => {
      const name = `${f.decedent_first_name} ${f.decedent_last_name}`.toLowerCase();
      const contacts = (f.family_contacts || []).some(c =>
        (c.name||'').toLowerCase().includes(q) ||
        (c.phone||'').toLowerCase().includes(q) ||
        (c.email||'').toLowerCase().includes(q)
      );
      return name.includes(q) || contacts;
    });
  }

  list.sort((a, b) => {
    if (currentSort === 'newest') return new Date(b.created_at) - new Date(a.created_at);
    if (currentSort === 'oldest') return new Date(a.created_at) - new Date(b.created_at);
    if (currentSort === 'updated') return new Date(b.updated_at) - new Date(a.updated_at);
    if (currentSort === 'name') return `${a.decedent_last_name}${a.decedent_first_name}`.localeCompare(`${b.decedent_last_name}${b.decedent_first_name}`);
    return 0;
  });
  return list;
}

function renderGrid() {
  const grid = document.getElementById('fam-grid');
  const label = document.getElementById('fam-grid-label');
  if (!grid) return;

  const families = getFiltered();
  if (label) label.textContent = `${families.length} ${families.length === 1 ? 'family' : 'families'}`;

  if (!families.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">👨‍👩‍👧</div><div class="empty-title">No families found</div><div class="empty-desc">Try adjusting your search or filter, or add a new family.</div></div>`;
    return;
  }

  grid.innerHTML = families.map(f => renderCard(f)).join('');
  grid.querySelectorAll('.family-card').forEach(card => {
    card.addEventListener('click', () => navigate('family-detail', { id: card.dataset.familyId }));
  });
}

function renderCard(family) {
  const items = familyItemsCache[family.id] || [];
  const sections = familySectionsCache[family.id] || [];
  const prog = calcProgress(items);
  const surfaced = getSurfacedItems(sections, items);
  const contacts = family.family_contacts || [];
  const primary = contacts.find(c => c.is_primary) || contacts[0];
  const hasFlagged = items.some(i => i.is_important && i.item_state === 'incomplete');
  const statusClass = hasFlagged ? 'card-flagged' : { active: 'card-active', long_term: 'card-longterm', completed: 'card-completed' }[family.status] || '';
  const statusBadge = { active: `<span class="badge badge-active">Active</span>`, long_term: `<span class="badge badge-longterm">Long Term</span>`, completed: `<span class="badge badge-completed">Completed</span>` }[family.status] || '';
  const veteranBadge = family.is_veteran ? `<span class="veteran-badge veteran">🎖 Veteran</span>` : family.is_veteran_spouse ? `<span class="veteran-badge veteran-spouse">⭐ Vet Spouse</span>` : '';
  const fillClass = family.status === 'completed' ? 'completed' : family.status === 'long_term' ? 'longterm' : '';

  return `
    <div class="family-card ${statusClass}" data-family-id="${family.id}">
      <div class="card-top">
        <div>
          <div class="card-dec-name">${escHtml(family.decedent_last_name)}, ${escHtml(family.decedent_first_name)}</div>
          <div class="card-dec-dates">${family.date_of_death ? `Passed ${formatDate(family.date_of_death)}` : ''}</div>
        </div>
        <div class="card-badges">${statusBadge}${veteranBadge}</div>
      </div>
      ${primary ? `<div class="card-contact"><span class="card-contact-name">${escHtml(primary.name)}</span>${primary.relationship ? ` · ${escHtml(primary.relationship)}` : ''}${primary.phone ? ` · ${escHtml(formatPhone(primary.phone))}` : ''}</div>` : ''}
      <div class="card-progress">
        <div class="progress-row">
          <span class="progress-label">${prog.complete} of ${prog.total} tasks${prog.skipped ? ` · ${prog.skipped} skipped` : ''}</span>
          <span class="progress-pct">${prog.pct}%</span>
        </div>
        <div class="progress-track"><div class="progress-fill ${fillClass}" style="width:${prog.pct}%"></div></div>
      </div>
      ${surfaced.length ? `<div class="card-surface-items">${surfaced.map(i => `<div class="surface-item"><div class="surface-dot ${i._surface_reason}"></div><span class="surface-item-text">${escHtml(i.label)}</span></div>`).join('')}</div>` : ''}
      ${family.notes ? `<div class="card-notes">"${escHtml(family.notes)}"</div>` : ''}
    </div>`;
}

// ── NEW FAMILY MODAL ──────────────────────────────────────────
export async function openNewFamilyModal() {
  const { data: templates } = await db.from('templates').select('id, name').order('name');
  const templateOpts = (templates || []).map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');

  openModal({
    title: 'New Family Case',
    subtitle: 'Enter decedent and contact information',
    size: 'lg',
    body: `
      <div class="form-section-title">Decedent Information</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">First Name *</label><input class="form-input" id="nf-first" placeholder="First name"></div>
        <div class="form-group"><label class="form-label">Last Name *</label><input class="form-input" id="nf-last" placeholder="Last name"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date of Birth</label><input class="form-input" id="nf-dob" type="date"></div>
        <div class="form-group"><label class="form-label">Date of Death</label><input class="form-input" id="nf-dod" type="date"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label-inline checkbox-wrap">
            <input type="checkbox" id="nf-veteran"> Veteran
          </label>
        </div>
        <div class="form-group">
          <label class="form-label-inline checkbox-wrap">
            <input type="checkbox" id="nf-veteran-spouse"> Spouse of Veteran
          </label>
        </div>
      </div>

      <div class="form-section-title">Primary Contact (NOK)</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="nf-nok-name" placeholder="Full name"></div>
        <div class="form-group"><label class="form-label">Relationship</label><input class="form-input" id="nf-nok-rel" placeholder="Spouse, Child, etc."></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="nf-nok-phone" type="tel" placeholder="(555) 555-5555"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="nf-nok-email" type="email" placeholder="email@example.com"></div>
      </div>
      <div class="form-group"><label class="form-label">Notes / Role</label><input class="form-input" id="nf-nok-notes" placeholder="e.g. Primary decision maker, incapacitated — contact son James"></div>

      <div class="form-section-title">Case Information</div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Template *</label>
          <select class="form-select" id="nf-template">
            <option value="">— Select a template —</option>
            ${templateOpts}
          </select>
          <div class="form-hint">The checklist template to use for this case</div>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="nf-status">
            <option value="active">Active</option>
            <option value="long_term">Long Term</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="nf-longterm-reason-group" style="display:none">
        <label class="form-label">Long Term Reason</label>
        <input class="form-input" id="nf-longterm-reason" placeholder="e.g. Awaiting National Cemetery date">
      </div>
      <div class="form-group"><label class="form-label">Case Notes</label><textarea class="form-textarea" id="nf-notes" placeholder="Any initial notes about this case…"></textarea></div>`,
    footer: `
      <button class="btn btn-ghost" id="nf-cancel">Cancel</button>
      <button class="btn btn-primary" id="nf-submit">Create Family Case</button>`
  });

  document.getElementById('nf-cancel')?.addEventListener('click', closeModal);
  document.getElementById('nf-veteran')?.addEventListener('change', (e) => {
    if (e.target.checked) document.getElementById('nf-veteran-spouse').checked = false;
  });
  document.getElementById('nf-veteran-spouse')?.addEventListener('change', (e) => {
    if (e.target.checked) document.getElementById('nf-veteran').checked = false;
  });
  document.getElementById('nf-status')?.addEventListener('change', (e) => {
    document.getElementById('nf-longterm-reason-group').style.display =
      e.target.value === 'long_term' ? 'block' : 'none';
  });
  document.getElementById('nf-submit')?.addEventListener('click', submitNewFamily);
}

async function submitNewFamily() {
  const first = document.getElementById('nf-first')?.value.trim();
  const last = document.getElementById('nf-last')?.value.trim();
  const nokName = document.getElementById('nf-nok-name')?.value.trim();
  const templateId = document.getElementById('nf-template')?.value;

  if (!first || !last) { toast('Decedent name is required', 'error'); return; }
  if (!templateId) { toast('Please select a template', 'error'); return; }

  const btn = document.getElementById('nf-submit');
  btn.disabled = true; btn.textContent = 'Creating…';

  try {
    const user = await getCurrentUser();
    const status = document.getElementById('nf-status')?.value || 'active';

    const { data: family, error } = await db.from('families').insert({
      user_id: user.id,
      template_id: templateId,
      decedent_first_name: first,
      decedent_last_name: last,
      date_of_birth: document.getElementById('nf-dob')?.value || null,
      date_of_death: document.getElementById('nf-dod')?.value || null,
      is_veteran: document.getElementById('nf-veteran')?.checked || false,
      is_veteran_spouse: document.getElementById('nf-veteran-spouse')?.checked || false,
      status,
      long_term_reason: document.getElementById('nf-longterm-reason')?.value || null,
      notes: document.getElementById('nf-notes')?.value || null
    }).select().single();

    if (error) throw error;

    // Add primary contact
    if (nokName) {
      await db.from('family_contacts').insert({
        family_id: family.id,
        is_primary: true,
        name: nokName,
        relationship: document.getElementById('nf-nok-rel')?.value || null,
        phone: document.getElementById('nf-nok-phone')?.value || null,
        email: document.getElementById('nf-nok-email')?.value || null,
        role_notes: document.getElementById('nf-nok-notes')?.value || null,
        position: 0
      });
    }

    // Apply template
    await applyTemplate(family.id, templateId, family.created_at);

    await logCaseCreated(family.id, user.id, `${first} ${last}`);
    refreshNotifications();
    closeModal();
    toast(`Case created for ${last}, ${first}`, 'success');
    navigate('family-detail', { id: family.id });

  } catch (err) {
    toast('Error creating family: ' + err.message, 'error');
    btn.disabled = false; btn.textContent = 'Create Family Case';
  }
}

export async function applyTemplate(familyId, templateId, createdAt) {
  // Fetch full template
  const { data: phases } = await db.from('template_phases').select('*').eq('template_id', templateId).order('position');
  const { data: sections } = await db.from('template_sections').select('*').eq('template_id', templateId).order('position');
  const { data: items } = await db.from('template_items').select('*').eq('template_id', templateId).order('position');

  if (!phases?.length) return;

  for (const phase of phases) {
    const { data: newPhase } = await db.from('family_phases').insert({
      family_id: familyId,
      template_phase_id: phase.id,
      title: phase.title,
      position: phase.position
    }).select().single();

    if (!newPhase) continue;

    const phaseSections = (sections || []).filter(s => s.phase_id === phase.id);

    for (const sec of phaseSections) {
      const { data: newSec } = await db.from('family_sections').insert({
        family_id: familyId,
        phase_id: newPhase.id,
        template_section_id: sec.id,
        title: sec.title,
        position: sec.position,
        is_adhoc: false,
        surface_on_card: sec.surface_on_card,
        conditional_logic: sec.conditional_logic
      }).select().single();

      if (!newSec) continue;

      const secItems = (items || []).filter(i => i.section_id === sec.id);
      if (!secItems.length) continue;

      await db.from('family_items').insert(secItems.map(item => ({
        family_id: familyId,
        section_id: newSec.id,
        template_item_id: item.id,
        label: item.label,
        helper_text: item.helper_text,
        variable_name: item.variable_name,
        field_type: item.field_type,
        field_options: item.field_options,
        is_important: item.is_important,
        due_date: item.relative_due_days != null ? calcDueDate(createdAt, item.relative_due_days) : null,
        position: item.position,
        is_adhoc: false,
        conditional_logic: item.conditional_logic,
        item_state: 'incomplete'
      })));
    }
  }
}
