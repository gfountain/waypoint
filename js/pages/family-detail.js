// ─── FAMILY DETAIL PAGE ───────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml, calcProgress, parseFieldValue, buildFieldValue, formatPhone } from '../utils/helpers.js';
import { formatDate, formatActivityTime, getDueStatus, getDueLabel, calcFutureDueDate, todayStr } from '../utils/dates.js';
import { evaluateLogic, buildVariableMap, getItemValue } from '../utils/conditional-engine.js';
import { resolveItemText, buildValueMap } from '../utils/variable-resolver.js';
import { getCurrentUser } from '../auth.js';
import { refreshNotifications } from '../notifications.js';
import { fetchActivityLog, logItemComplete, logItemUncomplete, logItemSkipped, logItemUnskipped, logValueSet, logValueChanged, logStatusChanged, logNotesEdited, logSectionAdded, logItemAdded, logContactAdded, logReminderAdded, logReminderDismissed } from '../activity-log.js';

let currentFamily = null;
let currentUser = null;
let allPhases = [];
let allSections = [];
let allItems = [];
let allContacts = [];
let allReminders = [];
let activePhaseId = null;
let showCompleted = {};  // sectionId → bool
let showSkipped = {};    // sectionId → bool

export async function renderFamilyDetail(params, container) {
  const familyId = params?.id;
  if (!familyId) { navigate('families'); return; }

  container.innerHTML = `<div class="text-muted text-sm">Loading case…</div>`;

  try {
    currentUser = await getCurrentUser();
    await loadFamily(familyId);
    renderPage(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Case not found</div><div class="empty-desc">${escHtml(err.message)}</div></div>`;
  }
}

async function loadFamily(familyId) {
  const [
    { data: family, error },
    { data: phases },
    { data: sections },
    { data: items },
    { data: contacts },
    { data: reminders }
  ] = await Promise.all([
    db.from('families').select('*').eq('id', familyId).single(),
    db.from('family_phases').select('*').eq('family_id', familyId).order('position'),
    db.from('family_sections').select('*').eq('family_id', familyId).order('position'),
    db.from('family_items').select('*').eq('family_id', familyId).order('position'),
    db.from('family_contacts').select('*').eq('family_id', familyId).order('position'),
    db.from('reminders').select('*').eq('family_id', familyId).eq('is_dismissed', false).order('due_date')
  ]);

  if (error || !family) throw new Error('Family not found');

  currentFamily = family;
  allPhases = phases || [];
  allSections = sections || [];
  allItems = items || [];
  allContacts = contacts || [];
  allReminders = reminders || [];

  if (allPhases.length && !activePhaseId) {
    activePhaseId = allPhases[0].id;
  }
}

function renderPage(container) {
  const f = currentFamily;
  const prog = calcProgress(allItems);
  const primary = allContacts.find(c => c.is_primary) || allContacts[0];
  const dob = formatDate(f.date_of_birth);
  const dod = formatDate(f.date_of_death);

  const veteranBadge = f.is_veteran
    ? `<span class="veteran-badge veteran" style="font-size:.85rem;padding:4px 10px">🎖 Veteran</span>`
    : f.is_veteran_spouse
    ? `<span class="veteran-badge veteran-spouse" style="font-size:.85rem;padding:4px 10px">⭐ Spouse of Veteran</span>`
    : '';

  const statusBadgeMap = {
    active: `<span class="badge badge-active" style="font-size:.8rem">Active</span>`,
    long_term: `<span class="badge badge-longterm" style="font-size:.8rem">Long Term</span>`,
    completed: `<span class="badge badge-completed" style="font-size:.8rem">Completed</span>`
  };

  // Update topbar
  document.getElementById('topbar-title').textContent = `${f.decedent_last_name}, ${f.decedent_first_name}`;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-ghost btn-sm" id="btn-edit-family">Edit Info</button>`;
  document.getElementById('btn-edit-family')?.addEventListener('click', openEditFamilyModal);

  container.innerHTML = `
    <div class="detail-back" id="detail-back">
      <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      Back to Families
    </div>

    <div class="detail-header-card">
      <div class="detail-name-row">
        <div>
          <div class="detail-name">${escHtml(f.decedent_last_name)}, ${escHtml(f.decedent_first_name)}</div>
          <div class="detail-dates">${f.date_of_birth ? `DOB: ${dob} · ` : ''}${f.date_of_death ? `Passed: ${dod}` : ''}</div>
        </div>
        <div class="detail-header-actions">
          <button class="btn btn-ghost btn-sm" id="btn-status-active" ${f.status==='active'?'disabled':''}>Active</button>
          <button class="btn btn-ghost btn-sm" id="btn-status-longterm" ${f.status==='long_term'?'disabled':''}>Long Term</button>
          <button class="btn btn-emerald btn-sm" id="btn-status-completed" ${f.status==='completed'?'disabled':''}>✓ Completed</button>
        </div>
      </div>
      <div class="detail-meta-row">
        ${statusBadgeMap[f.status] || ''}
        ${veteranBadge}
        ${f.long_term_reason ? `<span class="text-sm text-muted">${escHtml(f.long_term_reason)}</span>` : ''}
      </div>
      <div class="detail-notes-row">
        <div class="detail-notes-label">
          Case Notes
          <span class="detail-notes-edit" id="btn-edit-notes">edit</span>
        </div>
        <div id="notes-display">
          ${f.notes
            ? `<div class="detail-notes-text">${escHtml(f.notes)}</div>`
            : `<div class="text-muted text-sm">No notes yet. Click edit to add.</div>`}
        </div>
      </div>
    </div>

    <div class="detail-grid">
      <div id="checklist-col">
        ${renderChecklistTabs()}
        <div id="checklist-content"></div>
        <div class="activity-log" id="activity-log-section">
          <div class="activity-log-header" id="activity-log-toggle">
            <span class="activity-log-title">Case Activity Log</span>
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="activity-entries hidden" id="activity-entries">
            <div class="text-muted text-sm" style="padding:12px 16px">Loading…</div>
          </div>
        </div>
      </div>
      <div class="info-panel" id="info-panel">
        ${renderSidebar(prog, primary)}
      </div>
    </div>`;

  // Bind back button
  document.getElementById('detail-back')?.addEventListener('click', () => navigate('families'));

  // Bind status buttons
  document.getElementById('btn-status-active')?.addEventListener('click', () => changeStatus('active'));
  document.getElementById('btn-status-longterm')?.addEventListener('click', () => changeStatus('long_term'));
  document.getElementById('btn-status-completed')?.addEventListener('click', () => changeStatus('completed'));

  // Bind notes edit
  document.getElementById('btn-edit-notes')?.addEventListener('click', openNotesEditor);

  // Bind tab clicks
  document.querySelectorAll('.checklist-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activePhaseId = tab.dataset.phaseId;
      document.querySelectorAll('.checklist-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderChecklistContent();
    });
  });

  // Bind activity log toggle
  document.getElementById('activity-log-toggle')?.addEventListener('click', async () => {
    const entries = document.getElementById('activity-entries');
    entries.classList.toggle('hidden');
    if (!entries.classList.contains('hidden') && entries.children.length <= 1) {
      await loadActivityLog();
    }
  });

  // Bind sidebar actions
  bindSidebarActions();

  renderChecklistContent();
}

function renderChecklistTabs() {
  if (!allPhases.length) return '';
  return `
    <div class="checklist-tabs">
      ${allPhases.map(phase => {
        const phaseItems = allItems.filter(i => {
          const sec = allSections.find(s => s.id === i.section_id);
          return sec && sec.phase_id === phase.id;
        });
        const prog = calcProgress(phaseItems);
        return `
          <div class="checklist-tab ${phase.id === activePhaseId ? 'active' : ''}" data-phase-id="${phase.id}">
            ${escHtml(phase.title)}
            <span class="tab-progress-pill">${prog.complete}/${prog.total}</span>
          </div>`;
      }).join('')}
    </div>`;
}

function renderChecklistContent() {
  const content = document.getElementById('checklist-content');
  if (!content) return;

  const activePhase = allPhases.find(p => p.id === activePhaseId);
  if (!activePhase) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No sections yet</div></div>`;
    return;
  }

  const phaseSections = allSections.filter(s => s.phase_id === activePhaseId);
  const variableMap = buildVariableMap(allItems);
  const valueMap = buildValueMap(allItems);

  let html = '';
  for (const section of phaseSections) {
    const isVisible = evaluateLogic(section.conditional_logic, variableMap);
    if (!isVisible) continue;

    const sectionItems = allItems.filter(i => i.section_id === section.id);
    const prog = calcProgress(sectionItems);
    const incompleteItems = sectionItems.filter(i => i.item_state === 'incomplete');
    const completeItems = sectionItems.filter(i => i.item_state === 'complete');
    const skippedItems = sectionItems.filter(i => i.item_state === 'skipped');
    const isAllDone = incompleteItems.length === 0;
    const showComp = showCompleted[section.id] || false;
    const showSkip = showSkipped[section.id] || false;

    const visibleItems = [
      ...incompleteItems.filter(i => evaluateLogic(i.conditional_logic, variableMap)),
      ...(showComp ? completeItems : []),
      ...(showSkip ? skippedItems : [])
    ];

    html += `
      <div class="checklist-section" id="section-${section.id}">
        <div class="section-header" data-section-id="${section.id}">
          <span class="section-title">${escHtml(section.title)}</span>
          ${section.conditional_logic ? `<span class="section-cond-badge">conditional</span>` : ''}
          ${section.surface_on_card ? `<span class="section-surface-badge">on card</span>` : ''}
          <span class="section-progress">${prog.complete}/${prog.total}</span>
          <div class="section-toggle-pills">
            ${completeItems.length ? `<button class="toggle-pill ${showComp?'active':''}" data-section="${section.id}" data-toggle="completed">Show completed · ${completeItems.length}</button>` : ''}
            ${skippedItems.length ? `<button class="toggle-pill ${showSkip?'active':''}" data-section="${section.id}" data-toggle="skipped">Show skipped · ${skippedItems.length}</button>` : ''}
          </div>
          <button class="btn-icon" style="color:rgba(255,255,255,.6)" title="Edit section" data-edit-section="${section.id}">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <svg class="section-chevron ${isAllDone?'':'open'}" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
        <div class="section-body ${isAllDone ? 'collapsed' : ''}" id="sec-body-${section.id}">
          ${isAllDone ? `
            <div class="section-complete-banner">
              <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              All tasks complete
            </div>` : ''}
          ${visibleItems.map(item => renderItem(item, valueMap, variableMap)).join('')}
          <div class="add-item-row">
            <svg width="13" height="13" fill="none" stroke="var(--muted)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <input class="add-item-input" placeholder="Add task to this section…" data-section-id="${section.id}">
            <button class="btn btn-ghost btn-xs" data-add-item="${section.id}">Add</button>
          </div>
        </div>
      </div>`;
  }

  html += `
    <div style="margin-top:10px">
      <button class="btn btn-ghost btn-sm" id="btn-add-section">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Add Section to This Phase
      </button>
    </div>`;

  content.innerHTML = html;
  bindChecklistEvents(content);
}

function renderItem(item, valueMap, variableMap) {
  const isComplete = item.item_state === 'complete';
  const isSkipped = item.item_state === 'skipped';
  const dueStatus = getDueStatus(item.due_date);
  const dueLabel = getDueLabel(item.due_date);
  const helperResolved = resolveItemText(item.helper_text, allItems);

  const stateIcon = isComplete
    ? `<svg width="11" height="11" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
    : isSkipped
    ? `<svg width="11" height="11" fill="none" stroke="var(--muted)" stroke-width="3" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    : '';

  return `
    <div class="checklist-item ${isComplete?'item-complete':''} ${isSkipped?'item-skipped':''} ${dueStatus==='overdue'&&!isComplete?'item-overdue':''}"
         id="item-${item.id}" data-item-id="${item.id}">
      <button class="item-state-btn ${isComplete?'state-complete':''} ${isSkipped?'state-skipped':''}"
              title="${isComplete?'Click to uncheck':isSkipped?'Click to restore':'Click to complete'}"
              data-state-btn="${item.id}">
        ${stateIcon}
      </button>
      <div class="item-body">
        <div class="item-label ${isComplete?'label-complete':''} ${isSkipped?'label-skipped':''}">${escHtml(item.label)}</div>
        ${item.helper_text ? `<div class="item-helper">${helperResolved}</div>` : ''}
        ${!isComplete && !isSkipped ? renderFieldInput(item, valueMap) : renderFieldValue(item, valueMap)}
        <div class="item-meta">
          ${item.is_important ? `<span class="item-important-flag"><svg width="10" height="10" fill="currentColor" viewBox="0 0 24 24"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/></svg> Follow up</span>` : ''}
          ${dueLabel && !isComplete ? `<span class="item-due ${dueStatus}">${dueLabel}</span>` : ''}
          ${item.is_adhoc ? `<span class="item-adhoc-label">+ Added</span>` : ''}
          ${item.conditional_logic ? `<span class="item-cond-indicator">conditional</span>` : ''}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon" title="Skip / N/A" data-skip-btn="${item.id}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
        <button class="btn-icon" title="Edit item" data-edit-item="${item.id}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="btn-icon" title="Delete item" style="color:var(--coral)" data-delete-item="${item.id}">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </div>
    </div>`;
}

function renderFieldInput(item, valueMap) {
  const fv = parseFieldValue(item.field_value);
  const currentVal = fv?.value ?? '';
  const currentChecked = fv?.checked ?? false;

  switch (item.field_type) {
    case 'checkbox': return ''; // handled by state button
    case 'yes_no':
      return `<div class="radio-group" data-field-item="${item.id}">
        <label class="radio-option ${currentVal==='yes'?'selected':''}" data-val="yes"><input type="radio" name="yn-${item.id}" value="yes" ${currentVal==='yes'?'checked':''}> Yes</label>
        <label class="radio-option ${currentVal==='no'?'selected':''}" data-val="no"><input type="radio" name="yn-${item.id}" value="no" ${currentVal==='no'?'checked':''}> No</label>
      </div>`;
    case 'radio': {
      const opts = item.field_options?.options || [];
      return `<div class="radio-group" data-field-item="${item.id}">
        ${opts.map(o => `<label class="radio-option ${currentVal===o?'selected':''}" data-val="${escHtml(o)}"><input type="radio" name="r-${item.id}" value="${escHtml(o)}" ${currentVal===o?'checked':''}> ${escHtml(o)}</label>`).join('')}
      </div>`;
    }
    case 'short_text':
      return `<input class="field-input form-input" data-field-item="${item.id}" value="${escHtml(currentVal)}" placeholder="Enter value…" style="margin-top:6px">`;
    case 'long_text':
      return `<textarea class="field-input form-textarea" data-field-item="${item.id}" placeholder="Enter notes…" style="margin-top:6px;min-height:60px">${escHtml(currentVal)}</textarea>`;
    case 'date':
      return `<input class="field-input form-input" type="date" data-field-item="${item.id}" value="${escHtml(currentVal)}" style="margin-top:6px;max-width:200px">`;
    case 'datetime':
      return `<input class="field-input form-input" type="datetime-local" data-field-item="${item.id}" value="${escHtml(currentVal)}" style="margin-top:6px;max-width:240px">`;
    case 'phone':
      return `<input class="field-input form-input" type="tel" data-field-item="${item.id}" value="${escHtml(currentVal)}" placeholder="(555) 555-5555" style="margin-top:6px;max-width:200px">`;
    case 'email':
      return `<input class="field-input form-input" type="email" data-field-item="${item.id}" value="${escHtml(currentVal)}" placeholder="email@example.com" style="margin-top:6px;max-width:260px">`;
    default: return '';
  }
}

function renderFieldValue(item, valueMap) {
  const fv = parseFieldValue(item.field_value);
  if (!fv) return '';
  const val = fv.value ?? (fv.checked ? 'Checked' : '');
  if (!val) return '';
  return `<div class="item-helper" style="font-weight:500;color:var(--teal-dk)">${escHtml(String(val))}</div>`;
}

function bindChecklistEvents(container) {
  // Section header collapse
  container.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('.section-toggle-pills')) return;
      const sectionId = header.dataset.sectionId;
      const body = document.getElementById(`sec-body-${sectionId}`);
      const chevron = header.querySelector('.section-chevron');
      body?.classList.toggle('collapsed');
      chevron?.classList.toggle('open');
    });
  });

  // Toggle pills
  container.querySelectorAll('.toggle-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const sectionId = pill.dataset.section;
      const type = pill.dataset.toggle;
      if (type === 'completed') showCompleted[sectionId] = !showCompleted[sectionId];
      if (type === 'skipped') showSkipped[sectionId] = !showSkipped[sectionId];
      renderChecklistContent();
    });
  });

  // State buttons (complete/uncomplete)
  container.querySelectorAll('[data-state-btn]').forEach(btn => {
    btn.addEventListener('click', () => toggleItemState(btn.dataset.stateBtn));
  });

  // Skip buttons
  container.querySelectorAll('[data-skip-btn]').forEach(btn => {
    btn.addEventListener('click', () => skipItem(btn.dataset.skipBtn));
  });

  // Edit item buttons
  container.querySelectorAll('[data-edit-item]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditItemModal(btn.dataset.editItem); });
  });

  // Delete item buttons
  container.querySelectorAll('[data-delete-item]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); deleteItem(btn.dataset.deleteItem); });
  });

  // Edit section buttons
  container.querySelectorAll('[data-edit-section]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); openEditSectionModal(btn.dataset.editSection); });
  });

  // Field inputs — save on change/blur
  container.querySelectorAll('[data-field-item]').forEach(input => {
    const itemId = input.dataset.fieldItem;
    const isRadio = input.closest('.radio-group');

    if (isRadio) {
      // Bind to the radio group container, not individual inputs
      return;
    }

    const saveHandler = async () => { await saveFieldValue(itemId, input); };
    if (input.tagName === 'INPUT' && ['text','date','datetime-local','tel','email'].includes(input.type)) {
      input.addEventListener('blur', saveHandler);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') saveHandler(); });
    } else if (input.tagName === 'TEXTAREA') {
      input.addEventListener('blur', saveHandler);
    }
  });

  // Radio group clicks
  container.querySelectorAll('.radio-group').forEach(group => {
    const itemId = group.dataset.fieldItem;
    group.querySelectorAll('.radio-option').forEach(label => {
      label.addEventListener('click', async () => {
        const val = label.dataset.val;
        group.querySelectorAll('.radio-option').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        await saveRadioValue(itemId, val);
      });
    });
  });

  // Add item inputs
  container.querySelectorAll('[data-add-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = container.querySelector(`[data-section-id="${btn.dataset.addItem}"]`);
      if (input) addAdhocItem(input.value.trim(), btn.dataset.addItem);
    });
  });
  container.querySelectorAll('.add-item-input').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') addAdhocItem(input.value.trim(), input.dataset.sectionId);
    });
  });

  // Add section button
  document.getElementById('btn-add-section')?.addEventListener('click', openAddSectionModal);
}

// ── Item state changes ────────────────────────────────────────
async function toggleItemState(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  let newState, logFn;
  if (item.item_state === 'incomplete') {
    newState = 'complete';
    logFn = () => logItemComplete(currentFamily.id, currentUser.id, item.label);
    // For checkbox type, also set field_value
    if (item.field_type === 'checkbox') {
      await db.from('family_items').update({ item_state: newState, field_value: { checked: true } }).eq('id', itemId);
    } else {
      await db.from('family_items').update({ item_state: newState }).eq('id', itemId);
    }
  } else {
    newState = 'incomplete';
    logFn = () => logItemUncomplete(currentFamily.id, currentUser.id, item.label);
    await db.from('family_items').update({ item_state: newState }).eq('id', itemId);
  }

  item.item_state = newState;
  await logFn();
  refreshNotifications();
  updateProgressDisplay();
  renderChecklistContent();
  updateTabProgress();
}

async function skipItem(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  if (item.item_state === 'skipped') {
    // Unskip
    await db.from('family_items').update({ item_state: 'incomplete' }).eq('id', itemId);
    item.item_state = 'incomplete';
    await logItemUnskipped(currentFamily.id, currentUser.id, item.label);
    toast('Item restored', 'success');
  } else {
    // Skip
    await db.from('family_items').update({ item_state: 'skipped' }).eq('id', itemId);
    item.item_state = 'skipped';
    await logItemSkipped(currentFamily.id, currentUser.id, item.label);
  }

  updateProgressDisplay();
  renderChecklistContent();
  updateTabProgress();
}

// ── Field value saving ────────────────────────────────────────
async function saveFieldValue(itemId, inputEl) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  const newValue = inputEl.value;
  const oldFv = parseFieldValue(item.field_value);
  const oldVal = oldFv?.value ?? '';
  if (newValue === oldVal) return;

  const fieldValue = buildFieldValue(item.field_type, newValue);
  await db.from('family_items').update({ field_value: fieldValue }).eq('id', itemId);
  item.field_value = fieldValue;

  oldVal
    ? await logValueChanged(currentFamily.id, currentUser.id, item.label, oldVal, newValue)
    : await logValueSet(currentFamily.id, currentUser.id, item.label, newValue);

  // Re-evaluate conditional logic since a value changed
  renderChecklistContent();
}

async function saveRadioValue(itemId, value) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  const oldFv = parseFieldValue(item.field_value);
  const oldVal = oldFv?.value ?? '';
  const fieldValue = { value };

  await db.from('family_items').update({ field_value: fieldValue }).eq('id', itemId);
  item.field_value = fieldValue;

  oldVal
    ? await logValueChanged(currentFamily.id, currentUser.id, item.label, oldVal, value)
    : await logValueSet(currentFamily.id, currentUser.id, item.label, value);

  renderChecklistContent();
}

// ── Add ad-hoc item ───────────────────────────────────────────
async function addAdhocItem(label, sectionId) {
  if (!label) return;
  const maxPos = Math.max(0, ...allItems.filter(i => i.section_id === sectionId).map(i => i.position));

  const { data: newItem, error } = await db.from('family_items').insert({
    family_id: currentFamily.id,
    section_id: sectionId,
    label,
    field_type: 'checkbox',
    item_state: 'incomplete',
    is_adhoc: true,
    position: maxPos + 1
  }).select().single();

  if (error) { toast('Error adding task', 'error'); return; }
  allItems.push(newItem);
  await logItemAdded(currentFamily.id, currentUser.id, label);
  renderChecklistContent();
  updateTabProgress();
}

// ── Status change ─────────────────────────────────────────────
async function changeStatus(newStatus) {
  const oldStatus = currentFamily.status;
  if (oldStatus === newStatus) return;

  if (newStatus === 'long_term') {
    openModal({
      title: 'Mark as Long Term',
      size: 'sm',
      body: `<div class="form-group"><label class="form-label">Reason (optional)</label><input class="form-input" id="lt-reason" placeholder="e.g. Awaiting National Cemetery date" value="${escHtml(currentFamily.long_term_reason||'')}"></div>`,
      footer: `<button class="btn btn-ghost" id="lt-cancel">Cancel</button><button class="btn btn-violet" id="lt-confirm">Mark Long Term</button>`
    });
    document.getElementById('lt-cancel')?.addEventListener('click', closeModal);
    document.getElementById('lt-confirm')?.addEventListener('click', async () => {
      const reason = document.getElementById('lt-reason')?.value || null;
      await db.from('families').update({ status: 'long_term', long_term_reason: reason }).eq('id', currentFamily.id);
      currentFamily.status = 'long_term';
      currentFamily.long_term_reason = reason;
      await logStatusChanged(currentFamily.id, currentUser.id, oldStatus, 'long_term');
      closeModal();
      renderPage(document.getElementById('page-family-detail'));
    });
    return;
  }

  await db.from('families').update({ status: newStatus }).eq('id', currentFamily.id);
  currentFamily.status = newStatus;
  await logStatusChanged(currentFamily.id, currentUser.id, oldStatus, newStatus);
  toast(`Status updated to ${newStatus === 'active' ? 'Active' : 'Completed'}`, 'success');
  renderPage(document.getElementById('page-family-detail'));
}

// ── Notes editor ──────────────────────────────────────────────
function openNotesEditor() {
  const display = document.getElementById('notes-display');
  if (!display) return;

  display.innerHTML = `
    <textarea class="detail-notes-textarea" id="notes-textarea" rows="4">${escHtml(currentFamily.notes||'')}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-teal btn-sm" id="notes-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="notes-cancel">Cancel</button>
    </div>`;

  document.getElementById('notes-cancel')?.addEventListener('click', () => {
    display.innerHTML = currentFamily.notes
      ? `<div class="detail-notes-text">${escHtml(currentFamily.notes)}</div>`
      : `<div class="text-muted text-sm">No notes yet. Click edit to add.</div>`;
  });

  document.getElementById('notes-save')?.addEventListener('click', async () => {
    const newNotes = document.getElementById('notes-textarea')?.value || '';
    await db.from('families').update({ notes: newNotes }).eq('id', currentFamily.id);
    currentFamily.notes = newNotes;
    await logNotesEdited(currentFamily.id, currentUser.id);
    display.innerHTML = newNotes
      ? `<div class="detail-notes-text">${escHtml(newNotes)}</div>`
      : `<div class="text-muted text-sm">No notes yet. Click edit to add.</div>`;
    toast('Notes saved', 'success');
  });
}

// ── Edit item modal ───────────────────────────────────────────
function openEditItemModal(itemId) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;
  const fv = parseFieldValue(item.field_value);

  openModal({
    title: 'Edit Task',
    size: 'md',
    body: `
      <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="ei-label" value="${escHtml(item.label)}"></div>
      <div class="form-group"><label class="form-label">Helper Text</label><input class="form-input" id="ei-helper" value="${escHtml(item.helper_text||'')}" placeholder="Instruction or context…"></div>
      <div class="form-group">
        <label class="form-label-inline checkbox-wrap">
          <input type="checkbox" id="ei-important" ${item.is_important?'checked':''}> Mark as important (shows on family card)
        </label>
      </div>
      <div class="form-group"><label class="form-label">Due Date</label><input class="form-input" id="ei-due" type="date" value="${escHtml(item.due_date||'')}" style="max-width:200px"></div>`,
    footer: `<button class="btn btn-ghost" id="ei-cancel">Cancel</button><button class="btn btn-primary" id="ei-save">Save</button>`
  });

  document.getElementById('ei-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ei-save')?.addEventListener('click', async () => {
    const label = document.getElementById('ei-label')?.value.trim();
    if (!label) { toast('Label required', 'error'); return; }

    await db.from('family_items').update({
      label,
      helper_text: document.getElementById('ei-helper')?.value || null,
      is_important: document.getElementById('ei-important')?.checked || false,
      due_date: document.getElementById('ei-due')?.value || null
    }).eq('id', itemId);

    Object.assign(item, {
      label,
      helper_text: document.getElementById('ei-helper')?.value || null,
      is_important: document.getElementById('ei-important')?.checked || false,
      due_date: document.getElementById('ei-due')?.value || null
    });

    closeModal();
    toast('Task updated', 'success');
    renderChecklistContent();
  });
}

// ── Delete item ───────────────────────────────────────────────
function deleteItem(itemId) {
  const item = allItems.find(i => i.id === itemId);
  confirmDialog({
    title: 'Delete Task',
    message: `Delete "${item?.label || 'this task'}"? This cannot be undone.`,
    confirmText: 'Delete',
    onConfirm: async () => {
      await db.from('family_items').delete().eq('id', itemId);
      allItems = allItems.filter(i => i.id !== itemId);
      toast('Task deleted', 'success');
      renderChecklistContent();
      updateTabProgress();
    }
  });
}

// ── Edit/add section modal ────────────────────────────────────
function openAddSectionModal() {
  openModal({
    title: 'Add Section',
    size: 'sm',
    body: `<div class="form-group"><label class="form-label">Section Title</label><input class="form-input" id="as-title" placeholder="e.g. Documentation"></div>
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="as-surface"> Surface incomplete items on family card</label></div>`,
    footer: `<button class="btn btn-ghost" id="as-cancel">Cancel</button><button class="btn btn-primary" id="as-save">Add Section</button>`
  });
  document.getElementById('as-cancel')?.addEventListener('click', closeModal);
  document.getElementById('as-save')?.addEventListener('click', async () => {
    const title = document.getElementById('as-title')?.value.trim();
    if (!title) { toast('Title required', 'error'); return; }
    const maxPos = Math.max(0, ...allSections.filter(s => s.phase_id === activePhaseId).map(s => s.position));
    const { data: newSec, error } = await db.from('family_sections').insert({
      family_id: currentFamily.id,
      phase_id: activePhaseId,
      title,
      position: maxPos + 1,
      is_adhoc: true,
      surface_on_card: document.getElementById('as-surface')?.checked || false
    }).select().single();
    if (error) { toast('Error adding section', 'error'); return; }
    allSections.push(newSec);
    await logSectionAdded(currentFamily.id, currentUser.id, title);
    closeModal();
    toast('Section added', 'success');
    renderChecklistContent();
  });
}

function openEditSectionModal(sectionId) {
  const section = allSections.find(s => s.id === sectionId);
  if (!section) return;
  openModal({
    title: 'Edit Section',
    size: 'sm',
    body: `<div class="form-group"><label class="form-label">Title</label><input class="form-input" id="es-title" value="${escHtml(section.title)}"></div>
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="es-surface" ${section.surface_on_card?'checked':''}> Surface incomplete items on family card</label></div>
      <hr class="divider">
      <button class="btn btn-ghost btn-sm" style="color:var(--coral)" id="es-delete">Delete this section…</button>`,
    footer: `<button class="btn btn-ghost" id="es-cancel">Cancel</button><button class="btn btn-primary" id="es-save">Save</button>`
  });
  document.getElementById('es-cancel')?.addEventListener('click', closeModal);
  document.getElementById('es-save')?.addEventListener('click', async () => {
    const title = document.getElementById('es-title')?.value.trim();
    if (!title) { toast('Title required', 'error'); return; }
    await db.from('family_sections').update({ title, surface_on_card: document.getElementById('es-surface')?.checked || false }).eq('id', sectionId);
    section.title = title;
    section.surface_on_card = document.getElementById('es-surface')?.checked || false;
    closeModal();
    toast('Section updated', 'success');
    renderChecklistContent();
  });
  document.getElementById('es-delete')?.addEventListener('click', () => {
    closeModal();
    confirmDialog({
      title: 'Delete Section',
      message: 'Delete this section and all its tasks? This cannot be undone.',
      confirmText: 'Delete Section',
      onConfirm: async () => {
        await db.from('family_items').delete().eq('section_id', sectionId);
        await db.from('family_sections').delete().eq('id', sectionId);
        allSections = allSections.filter(s => s.id !== sectionId);
        allItems = allItems.filter(i => i.section_id !== sectionId);
        toast('Section deleted', 'success');
        renderChecklistContent();
      }
    });
  });
}

// ── Sidebar ───────────────────────────────────────────────────
function renderSidebar(prog, primary) {
  const otherContacts = allContacts.filter(c => !c.is_primary);

  return `
    <div class="card info-card">
      <div class="card-header">Progress</div>
      <div class="card-body">
        <div class="progress-row">
          <span class="text-sm text-muted" id="prog-label">${prog.complete} of ${prog.total} tasks${prog.skipped ? ` · ${prog.skipped} skipped` : ''}</span>
          <span class="fw-500" id="prog-pct">${prog.pct}%</span>
        </div>
        <div class="progress-track" style="margin-top:6px">
          <div class="progress-fill" id="prog-fill" style="width:${prog.pct}%"></div>
        </div>
      </div>
    </div>

    <div class="card info-card">
      <div class="card-header">Primary Contact (NOK)</div>
      <div class="card-body">
        ${primary ? `
          <div class="info-field"><div class="info-key">Name</div><div class="info-val">${escHtml(primary.name)}</div>${primary.relationship ? `<div class="info-sub">${escHtml(primary.relationship)}</div>` : ''}</div>
          ${primary.phone ? `<div class="info-field"><div class="info-key">Phone</div><div class="info-val"><a href="tel:${escHtml(primary.phone)}">${escHtml(formatPhone(primary.phone))}</a></div></div>` : ''}
          ${primary.email ? `<div class="info-field"><div class="info-key">Email</div><div class="info-val" style="font-size:.8rem"><a href="mailto:${escHtml(primary.email)}">${escHtml(primary.email)}</a></div></div>` : ''}
          ${primary.role_notes ? `<div class="info-field"><div class="info-sub" style="color:var(--coral);font-size:.78rem">${escHtml(primary.role_notes)}</div></div>` : ''}
        ` : `<div class="text-muted text-sm">No contact added yet.</div>`}
      </div>
    </div>

    ${otherContacts.length ? `
      <div class="card info-card">
        <div class="card-header">Additional Contacts</div>
        <div class="card-body">
          ${otherContacts.map(c => `
            <div class="info-field">
              <div class="info-key">${escHtml(c.name)}${c.relationship ? ` — ${escHtml(c.relationship)}` : ''}</div>
              ${c.phone ? `<div class="info-val" style="font-size:.82rem"><a href="tel:${escHtml(c.phone)}">${escHtml(formatPhone(c.phone))}</a></div>` : ''}
              ${c.email ? `<div class="info-sub"><a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a></div>` : ''}
              ${c.role_notes ? `<div class="info-sub" style="color:var(--violet)">${escHtml(c.role_notes)}</div>` : ''}
            </div>`).join('<hr class="divider" style="margin:8px 0">')}
        </div>
      </div>` : ''}

    <div class="card info-card">
      <div class="card-header" style="display:flex;justify-content:space-between;align-items:center">
        Reminders
        <button class="btn btn-teal btn-xs" id="btn-add-reminder">+ Add</button>
      </div>
      <div class="card-body" id="reminders-list">
        ${renderRemindersList()}
      </div>
    </div>

    <div class="card info-card">
      <div class="card-header">Actions</div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-ghost btn-sm" style="justify-content:flex-start" id="btn-add-contact">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Contact
        </button>
        <button class="btn btn-ghost btn-sm" style="justify-content:flex-start;color:var(--coral)" id="btn-delete-case">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          Delete Case
        </button>
      </div>
    </div>`;
}

function renderRemindersList() {
  if (!allReminders.length) return `<div class="text-muted text-sm">No reminders.</div>`;
  return allReminders.map(r => {
    const status = getDueStatus(r.due_date);
    const label = getDueLabel(r.due_date);
    return `
      <div class="info-field" style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
        <div>
          <div class="info-val" style="font-size:.82rem">${escHtml(r.description)}</div>
          <div class="info-sub ${status==='overdue'?'color-coral':status==='today'?'color-amber':''}">${label}</div>
        </div>
        <button class="btn-icon" title="Dismiss" data-dismiss-reminder="${r.id}" style="flex-shrink:0">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>`;
  }).join('<hr class="divider" style="margin:6px 0">');
}

function bindSidebarActions() {
  document.getElementById('btn-add-reminder')?.addEventListener('click', openAddReminderModal);
  document.getElementById('btn-add-contact')?.addEventListener('click', openAddContactModal);
  document.getElementById('btn-delete-case')?.addEventListener('click', () => {
    confirmDialog({
      title: 'Delete Case',
      message: `Permanently delete the case for ${currentFamily.decedent_last_name}, ${currentFamily.decedent_first_name}? All checklist data will be lost. This cannot be undone.`,
      confirmText: 'Delete Case',
      onConfirm: async () => {
        await db.from('family_items').delete().eq('family_id', currentFamily.id);
        await db.from('family_sections').delete().eq('family_id', currentFamily.id);
        await db.from('family_phases').delete().eq('family_id', currentFamily.id);
        await db.from('family_contacts').delete().eq('family_id', currentFamily.id);
        await db.from('reminders').delete().eq('family_id', currentFamily.id);
        await db.from('activity_log').delete().eq('family_id', currentFamily.id);
        await db.from('families').delete().eq('id', currentFamily.id);
        toast('Case deleted', 'success');
        navigate('families');
      }
    });
  });

  // Dismiss reminder buttons
  document.querySelectorAll('[data-dismiss-reminder]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const reminderId = btn.dataset.dismissReminder;
      const reminder = allReminders.find(r => r.id === reminderId);
      await db.from('reminders').update({ is_dismissed: true, dismissed_at: new Date().toISOString() }).eq('id', reminderId);
      allReminders = allReminders.filter(r => r.id !== reminderId);
      if (reminder) await logReminderDismissed(currentFamily.id, currentUser.id, reminder.description);
      refreshNotifications();
      document.getElementById('reminders-list').innerHTML = renderRemindersList();
      bindSidebarActions();
    });
  });
}

function openAddReminderModal() {
  openModal({
    title: 'Add Reminder',
    size: 'sm',
    body: `
      <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="rem-desc" placeholder="e.g. Check on payment status"></div>
      <div class="form-group">
        <label class="form-label">When</label>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <span style="font-size:.85rem">In</span>
          <input class="form-input" id="rem-value" type="number" min="1" value="7" style="width:70px">
          <select class="form-select" id="rem-unit" style="width:110px">
            <option value="days">days</option>
            <option value="weeks">weeks</option>
            <option value="months">months</option>
          </select>
          <span style="font-size:.85rem;color:var(--muted)">— or —</span>
          <input class="form-input" id="rem-date" type="date" style="width:160px">
        </div>
        <div class="form-hint">Enter either a relative time or a specific date</div>
      </div>`,
    footer: `<button class="btn btn-ghost" id="rem-cancel">Cancel</button><button class="btn btn-primary" id="rem-save">Add Reminder</button>`
  });
  document.getElementById('rem-cancel')?.addEventListener('click', closeModal);
  document.getElementById('rem-save')?.addEventListener('click', async () => {
    const desc = document.getElementById('rem-desc')?.value.trim();
    if (!desc) { toast('Description required', 'error'); return; }

    let dueDate = document.getElementById('rem-date')?.value;
    if (!dueDate) {
      const val = document.getElementById('rem-value')?.value;
      const unit = document.getElementById('rem-unit')?.value;
      dueDate = calcFutureDueDate(val, unit);
    }
    if (!dueDate) { toast('Please set a due date', 'error'); return; }

    const { data: reminder, error } = await db.from('reminders').insert({
      family_id: currentFamily.id,
      user_id: currentUser.id,
      description: desc,
      due_date: dueDate
    }).select().single();

    if (error) { toast('Error adding reminder', 'error'); return; }
    allReminders.push(reminder);
    await logReminderAdded(currentFamily.id, currentUser.id, desc, dueDate);
    refreshNotifications();
    closeModal();
    toast('Reminder added', 'success');
    document.getElementById('reminders-list').innerHTML = renderRemindersList();
    bindSidebarActions();
  });
}

function openAddContactModal() {
  openModal({
    title: 'Add Contact',
    size: 'md',
    body: `
      <div class="form-row">
        <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="ac-name" placeholder="Full name"></div>
        <div class="form-group"><label class="form-label">Relationship</label><input class="form-input" id="ac-rel" placeholder="Son, Daughter, Attorney…"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="ac-phone" type="tel" placeholder="(555) 555-5555"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="ac-email" type="email" placeholder="email@example.com"></div>
      </div>
      <div class="form-group"><label class="form-label">Role / Notes</label><input class="form-input" id="ac-notes" placeholder="e.g. Primary decision maker, Do not contact"></div>`,
    footer: `<button class="btn btn-ghost" id="ac-cancel">Cancel</button><button class="btn btn-primary" id="ac-save">Add Contact</button>`
  });
  document.getElementById('ac-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ac-save')?.addEventListener('click', async () => {
    const name = document.getElementById('ac-name')?.value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const maxPos = Math.max(0, ...allContacts.map(c => c.position));
    const { data: contact, error } = await db.from('family_contacts').insert({
      family_id: currentFamily.id,
      is_primary: false,
      name,
      relationship: document.getElementById('ac-rel')?.value || null,
      phone: document.getElementById('ac-phone')?.value || null,
      email: document.getElementById('ac-email')?.value || null,
      role_notes: document.getElementById('ac-notes')?.value || null,
      position: maxPos + 1
    }).select().single();
    if (error) { toast('Error adding contact', 'error'); return; }
    allContacts.push(contact);
    await logContactAdded(currentFamily.id, currentUser.id, name);
    closeModal();
    toast('Contact added', 'success');
    // Re-render sidebar
    const prog = calcProgress(allItems);
    const primary = allContacts.find(c => c.is_primary) || allContacts[0];
    document.getElementById('info-panel').innerHTML = renderSidebar(prog, primary);
    bindSidebarActions();
  });
}

// ── Edit family modal ─────────────────────────────────────────
function openEditFamilyModal() {
  const f = currentFamily;
  openModal({
    title: 'Edit Family Information',
    size: 'lg',
    body: `
      <div class="form-section-title">Decedent Information</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">First Name</label><input class="form-input" id="ef-first" value="${escHtml(f.decedent_first_name)}"></div>
        <div class="form-group"><label class="form-label">Last Name</label><input class="form-input" id="ef-last" value="${escHtml(f.decedent_last_name)}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date of Birth</label><input class="form-input" id="ef-dob" type="date" value="${escHtml(f.date_of_birth||'')}"></div>
        <div class="form-group"><label class="form-label">Date of Death</label><input class="form-input" id="ef-dod" type="date" value="${escHtml(f.date_of_death||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ef-veteran" ${f.is_veteran?'checked':''}> Veteran</label></div>
        <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ef-veteran-spouse" ${f.is_veteran_spouse?'checked':''}> Spouse of Veteran</label></div>
      </div>`,
    footer: `<button class="btn btn-ghost" id="ef-cancel">Cancel</button><button class="btn btn-primary" id="ef-save">Save Changes</button>`
  });
  document.getElementById('ef-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ef-veteran')?.addEventListener('change', e => { if (e.target.checked) document.getElementById('ef-veteran-spouse').checked = false; });
  document.getElementById('ef-veteran-spouse')?.addEventListener('change', e => { if (e.target.checked) document.getElementById('ef-veteran').checked = false; });
  document.getElementById('ef-save')?.addEventListener('click', async () => {
    const first = document.getElementById('ef-first')?.value.trim();
    const last = document.getElementById('ef-last')?.value.trim();
    if (!first || !last) { toast('Name required', 'error'); return; }
    await db.from('families').update({
      decedent_first_name: first,
      decedent_last_name: last,
      date_of_birth: document.getElementById('ef-dob')?.value || null,
      date_of_death: document.getElementById('ef-dod')?.value || null,
      is_veteran: document.getElementById('ef-veteran')?.checked || false,
      is_veteran_spouse: document.getElementById('ef-veteran-spouse')?.checked || false
    }).eq('id', f.id);
    Object.assign(currentFamily, { decedent_first_name: first, decedent_last_name: last, date_of_birth: document.getElementById('ef-dob')?.value || null, date_of_death: document.getElementById('ef-dod')?.value || null, is_veteran: document.getElementById('ef-veteran')?.checked||false, is_veteran_spouse: document.getElementById('ef-veteran-spouse')?.checked||false });
    closeModal();
    toast('Family info updated', 'success');
    renderPage(document.getElementById('page-family-detail'));
  });
}

// ── Progress display update ───────────────────────────────────
function updateProgressDisplay() {
  const prog = calcProgress(allItems);
  const fill = document.getElementById('prog-fill');
  const label = document.getElementById('prog-label');
  const pct = document.getElementById('prog-pct');
  if (fill) fill.style.width = `${prog.pct}%`;
  if (label) label.textContent = `${prog.complete} of ${prog.total} tasks${prog.skipped ? ` · ${prog.skipped} skipped` : ''}`;
  if (pct) pct.textContent = `${prog.pct}%`;
}

function updateTabProgress() {
  document.querySelectorAll('.checklist-tab').forEach(tab => {
    const phaseId = tab.dataset.phaseId;
    const phaseItems = allItems.filter(i => {
      const sec = allSections.find(s => s.id === i.section_id);
      return sec && sec.phase_id === phaseId;
    });
    const prog = calcProgress(phaseItems);
    const pill = tab.querySelector('.tab-progress-pill');
    if (pill) pill.textContent = `${prog.complete}/${prog.total}`;
  });
}

// ── Activity log ──────────────────────────────────────────────
async function loadActivityLog() {
  const entries = document.getElementById('activity-entries');
  if (!entries) return;

  try {
    const log = await fetchActivityLog(currentFamily.id);
    if (!log.length) {
      entries.innerHTML = `<div class="text-muted text-sm" style="padding:12px 16px">No activity yet.</div>`;
      return;
    }
    entries.innerHTML = log.map(entry => `
      <div class="activity-entry">
        <span class="activity-time">${formatActivityTime(entry.created_at)}</span>
        <span class="activity-desc">${escHtml(entry.description)}</span>
      </div>`).join('');
  } catch (err) {
    entries.innerHTML = `<div class="text-muted text-sm" style="padding:12px 16px">Failed to load activity log.</div>`;
  }
}
