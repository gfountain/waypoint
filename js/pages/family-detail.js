// ─── FAMILY DETAIL PAGE ───────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml, calcProgress, parseFieldValue, buildFieldValue, formatPhone, allSubItemsDone, formatCurrency } from '../utils/helpers.js';
import { formatDate, formatActivityTime, getDueStatus, getDueLabel, calcFutureDueDate } from '../utils/dates.js';
import { evaluateLogic, buildVariableMap } from '../utils/conditional-engine.js';
import { resolveItemText } from '../utils/variable-resolver.js';
import { labelToVariableName } from '../utils/variable-resolver.js';
import { getCurrentUser } from '../auth.js';
import { refreshNotifications } from '../notifications.js';
import { fetchActivityLog, logItemComplete, logItemUncomplete, logItemSkipped, logItemUnskipped,
         logSubComplete, logSubUncomplete, logSubSkipped, logValueSet, logValueChanged,
         logStatusChanged, logNotesEdited, logSectionAdded, logItemAdded, logSubItemAdded,
         logContactAdded, logReminderAdded, logReminderDismissed, logParentAutoComplete } from '../activity-log.js';

let currentFamily = null, currentUser = null;
let allGroups = [], allSections = [], allItems = [], allSubItems = [], allContacts = [], allReminders = [];
let showCompleted = {}, showSkipped = {};

export async function renderFamilyDetail(params, container) {
  const familyId = params?.id;
  if (!familyId) { navigate('families'); return; }
  container.innerHTML = `<div class="loading-state">Loading case…</div>`;
  try {
    currentUser = await getCurrentUser();
    await loadFamily(familyId);
    renderPage(container);
  } catch(err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-title">Case not found</div><div class="empty-desc">${escHtml(err.message)}</div></div>`;
  }
}

async function loadFamily(familyId) {
  const [{ data: family, error }, { data: groups }, { data: sections }, { data: items }, { data: subItems }, { data: contacts }, { data: reminders }] = await Promise.all([
    db.from('families').select('*').eq('id', familyId).single(),
    db.from('family_groups').select('*').eq('family_id', familyId).order('position'),
    db.from('family_sections').select('*').eq('family_id', familyId).order('position'),
    db.from('family_items').select('*').eq('family_id', familyId).order('position'),
    db.from('family_sub_items').select('*').eq('family_id', familyId).order('position'),
    db.from('family_contacts').select('*').eq('family_id', familyId).order('position'),
    db.from('reminders').select('*').eq('family_id', familyId).eq('is_dismissed', false).order('due_date')
  ]);
  if (error||!family) throw new Error('Family not found');
  currentFamily = family;
  allGroups = groups||[];
  allSections = sections||[];
  allItems = items||[];
  allSubItems = subItems||[];
  allContacts = contacts||[];
  allReminders = reminders||[];
}

function renderPage(container) {
  const f = currentFamily;
  const prog = calcProgress(allItems);
  const primary = allContacts.find(c => c.is_primary)||allContacts[0];
  const veteranBadge = f.is_veteran ? `<span class="veteran-badge veteran" style="padding:3px 10px;font-size:.8rem">🎖 Veteran</span>` : f.is_veteran_spouse ? `<span class="veteran-badge veteran-spouse" style="padding:3px 10px;font-size:.8rem">⭐ Spouse of Veteran</span>` : '';
  const statusBadgeMap = { active:`<span class="badge badge-active">Active</span>`, long_term:`<span class="badge badge-longterm">Long Term</span>`, completed:`<span class="badge badge-completed">Completed</span>` };

  document.getElementById('topbar-title').textContent = `${f.decedent_last_name}, ${f.decedent_first_name}`;
  document.getElementById('topbar-actions').innerHTML = `<button class="btn btn-ghost btn-sm" id="btn-edit-family">Edit Info</button>`;
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
          <div class="detail-dates">${f.date_of_birth?`DOB: ${formatDate(f.date_of_birth)} · `:''}${f.date_of_death?`Passed: ${formatDate(f.date_of_death)}`:''}${f.arrangement_date?` · Arr: ${formatDate(f.arrangement_date)}`:''}${f.contract_number?` · #${escHtml(f.contract_number)}`:''}</div>
        </div>
        <div class="detail-header-actions">
          <button class="btn btn-ghost btn-sm" id="btn-active" ${f.status==='active'?'disabled':''} style="color:white;border-color:rgba(255,255,255,.4)">Active</button>
          <button class="btn btn-ghost btn-sm" id="btn-longterm" ${f.status==='long_term'?'disabled':''} style="color:white;border-color:rgba(255,255,255,.4)">Long Term</button>
          <button class="btn btn-emerald btn-sm" id="btn-completed" ${f.status==='completed'?'disabled':''}>✓ Completed</button>
        </div>
      </div>
      <div class="detail-meta-row">${statusBadgeMap[f.status]||''}${veteranBadge}${f.long_term_reason?`<span style="font-size:.78rem;color:rgba(255,255,255,.7);font-style:italic">${escHtml(f.long_term_reason)}</span>`:''}</div>
      <div class="detail-notes-row">
        <div class="detail-notes-label">Case Notes<span class="detail-notes-edit" id="btn-edit-notes">edit</span></div>
        <div id="notes-display">${f.notes?`<div class="detail-notes-text">${escHtml(f.notes)}</div>`:`<div style="font-size:.78rem;color:rgba(255,255,255,.5)">No notes yet. Click edit to add.</div>`}</div>
      </div>
    </div>
    <div class="detail-grid">
      <div id="checklist-col">
        <div class="checklist-wrap" id="checklist-wrap"></div>
        <div class="activity-log" id="activity-log-section">
          <div class="activity-log-header" id="activity-log-toggle">
            <span class="activity-log-title">Case Activity Log</span>
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="activity-entries hidden" id="activity-entries"><div class="loading-state">Loading…</div></div>
        </div>
      </div>
      <div class="info-panel" id="info-panel">${renderSidebar(prog, primary)}</div>
    </div>`;

  document.getElementById('detail-back')?.addEventListener('click', () => navigate('families'));
  document.getElementById('btn-active')?.addEventListener('click', () => changeStatus('active'));
  document.getElementById('btn-longterm')?.addEventListener('click', () => changeStatus('long_term'));
  document.getElementById('btn-completed')?.addEventListener('click', () => changeStatus('completed'));
  document.getElementById('btn-edit-notes')?.addEventListener('click', openNotesEditor);
  document.getElementById('activity-log-toggle')?.addEventListener('click', async () => {
    const entries = document.getElementById('activity-entries');
    entries.classList.toggle('hidden');
    if (!entries.classList.contains('hidden') && entries.children.length <= 1) await loadActivityLog();
  });
  bindSidebarActions();
  renderChecklist();
}

// ── CHECKLIST RENDER ──────────────────────────────────────────
function renderChecklist() {
  const wrap = document.getElementById('checklist-wrap');
  if (!wrap) return;

  const varMap = buildVariableMap(allItems, allSubItems);
  const importantIncomplete = allItems.filter(i => i.is_important && i.item_state==='incomplete');

  let html = '';

  // Important strip at top
  if (importantIncomplete.length) {
    html += `<div class="checklist-important-strip">
      <div class="checklist-important-title">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
        Needs attention (${importantIncomplete.length} item${importantIncomplete.length!==1?'s':''})
      </div>
      ${importantIncomplete.slice(0,5).map(i => `<div class="checklist-important-item"><div class="checklist-important-dot"></div>${escHtml(i.label)}</div>`).join('')}
      ${importantIncomplete.length>5?`<div style="font-size:.7rem;color:var(--coral-dk);font-style:italic">and ${importantIncomplete.length-5} more…</div>`:''}
    </div>`;
  }

  // Two-column layout
  html += `<div class="checklist-columns">`;

  for (const group of allGroups) {
    const groupItems = allItems.filter(i => i.group_id===group.id);
    const groupProg = calcProgress(groupItems);
    const allGroupDone = groupProg.incomplete===0 && groupProg.total>0;

    html += `<div class="group-block" id="group-${group.id}">
      <div class="group-header" data-group-id="${group.id}">
        <span class="group-header-title">${escHtml(group.title)}</span>
        ${allGroupDone?`<span class="group-complete-badge">✓ Done</span>`:''}
        <span class="group-header-progress">${groupProg.complete}/${groupProg.total}</span>
        <svg class="group-chevron ${allGroupDone?'':'open'}" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
      </div>
      <div class="group-body ${allGroupDone?'collapsed':''}" id="group-body-${group.id}">`;

    // Direct items (no section)
    const directItems = allItems.filter(i => i.group_id===group.id && !i.section_id);
    if (directItems.length) {
      html += `<div class="group-direct-items">`;
      for (const item of directItems) {
        const visible = evaluateLogic(item.conditional_logic, varMap);
        const subs = allSubItems.filter(s => s.item_id===item.id);
        html += renderItem(item, subs, varMap, !visible);
      }
      html += `<div class="add-group-item-row">
        <svg width="12" height="12" fill="none" stroke="var(--muted)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <input class="add-item-input" placeholder="Add task…" data-add-direct="${group.id}">
        <button class="btn btn-ghost btn-xs" data-add-direct-btn="${group.id}">Add</button>
      </div></div>`;
    } else {
      html += `<div class="group-direct-items"><div class="add-group-item-row">
        <svg width="12" height="12" fill="none" stroke="var(--muted)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <input class="add-item-input" placeholder="Add task directly to ${escHtml(group.title)}…" data-add-direct="${group.id}">
        <button class="btn btn-ghost btn-xs" data-add-direct-btn="${group.id}">Add</button>
      </div></div>`;
    }

    // Sections
    const groupSections = allSections.filter(s => s.group_id===group.id);
    for (const sec of groupSections) {
      const secVisible = evaluateLogic(sec.conditional_logic, varMap);
      if (!secVisible) continue;
      const secItems = allItems.filter(i => i.section_id===sec.id);
      const secProg = calcProgress(secItems);
      const allSecDone = secProg.incomplete===0 && secProg.total>0;
      const showComp = showCompleted[sec.id]||false;
      const showSkip = showSkipped[sec.id]||false;
      const compCount = secItems.filter(i => i.item_state==='complete').length;
      const skipCount = secItems.filter(i => i.item_state==='skipped').length;

      html += `<div class="section-block" id="section-${sec.id}">
        <div class="section-header" data-section-id="${sec.id}">
          <span class="section-title">${escHtml(sec.title)}</span>
          <div class="section-badges">
            ${sec.conditional_logic?`<span class="section-cond-badge">conditional</span>`:''}
            ${sec.surface_on_card?`<span class="section-surface-badge">on card</span>`:''}
          </div>
          <span class="section-progress">${secProg.complete}/${secProg.total}</span>
          <div class="section-toggle-pills">
            ${compCount?`<button class="toggle-pill ${showComp?'active':''}" data-sec="${sec.id}" data-toggle="completed">${compCount} done</button>`:''}
            ${skipCount?`<button class="toggle-pill ${showSkip?'active':''}" data-sec="${sec.id}" data-toggle="skipped">${skipCount} skipped</button>`:''}
          </div>
          <svg class="section-chevron ${allSecDone?'':'open'}" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>
        </div>
        <div class="section-body ${allSecDone?'collapsed':''}" id="sec-body-${sec.id}">
          ${allSecDone?`<div class="section-complete-banner"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>All tasks complete</div>`:''}`;

      for (const item of secItems) {
        const visible = evaluateLogic(item.conditional_logic, varMap);
        if (item.item_state==='complete' && !showComp) continue;
        if (item.item_state==='skipped' && !showSkip) continue;
        if (!visible) continue;
        const subs = allSubItems.filter(s => s.item_id===item.id);
        html += renderItem(item, subs, varMap, false);
      }

      html += `<div class="add-item-row">
        <svg width="12" height="12" fill="none" stroke="var(--muted)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <input class="add-item-input" placeholder="Add task…" data-section-id="${sec.id}">
        <button class="btn btn-ghost btn-xs" data-add-item="${sec.id}">Add</button>
      </div></div></div>`;
    }

    html += `<div style="padding:6px 14px;border-top:1px solid var(--border)">
      <button class="btn btn-ghost btn-xs" data-add-section="${group.id}" style="font-size:.72rem">+ Add section to ${escHtml(group.title)}</button>
    </div>`;

    html += `</div></div>`;
  }

  html += `</div>`; // end checklist-columns
  wrap.innerHTML = html;
  bindChecklistEvents(wrap);
}

function renderItem(item, subs, varMap, hidden) {
  const isComplete = item.item_state==='complete';
  const isSkipped = item.item_state==='skipped';
  const dueStatus = getDueStatus(item.due_date);
  const dueLabel = getDueLabel(item.due_date);
  const helperText = resolveItemText(item.helper_text, allItems, allSubItems);
  const hasSubs = subs.length > 0;

  const stateIcon = isComplete
    ? `<svg width="10" height="10" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
    : isSkipped
    ? `<svg width="10" height="10" fill="none" stroke="var(--muted)" stroke-width="3" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    : '';

  let subsHtml = '';
  if (hasSubs && !isComplete && !isSkipped) {
    subsHtml = `<div class="sub-items-wrap" id="subs-${item.id}">`;
    for (const sub of subs) {
      const subVisible = evaluateLogic(sub.conditional_logic, varMap);
      if (!subVisible) continue;
      subsHtml += renderSubItem(sub, varMap);
    }
    subsHtml += `<div class="add-sub-item-row">
      <svg width="11" height="11" fill="none" stroke="var(--muted)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <input class="add-sub-item-input" placeholder="Add sub-task…" data-add-sub="${item.id}">
      <button class="btn btn-ghost btn-xs" data-add-sub-btn="${item.id}">Add</button>
    </div></div>`;
  }

  return `<div class="checklist-item ${isComplete?'item-complete':''} ${isSkipped?'item-skipped':''} ${item.is_important&&!isComplete?'item-important':''} ${dueStatus==='overdue'&&!isComplete?'item-overdue':''} ${hidden?'item-hidden':''}" id="item-${item.id}" data-item-id="${item.id}">
    <button class="item-state-btn ${isComplete?'state-complete':''} ${isSkipped?'state-skipped':''}" data-state-btn="${item.id}" title="${isComplete?'Click to uncheck':isSkipped?'Click to restore':'Click to complete'}">${stateIcon}</button>
    <div class="item-body">
      <div class="item-label ${isComplete?'label-complete':''} ${isSkipped?'label-skipped':''}">
        ${escHtml(item.label)}
        ${item.is_important?`<span class="item-important-marker"><svg width="9" height="9" fill="var(--coral)" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></span>`:''}
      </div>
      ${item.helper_text?`<div class="item-helper">${helperText}</div>`:''}
      ${!isComplete&&!isSkipped?renderFieldInput(item):''}
      ${(isComplete||isSkipped)?renderFieldValueDisplay(item):''}
      <div class="item-meta">
        ${dueLabel&&!isComplete?`<span class="item-due ${dueStatus}">${dueLabel}</span>`:''}
        ${item.is_adhoc?`<span class="item-adhoc-label">+ Added</span>`:''}
      </div>
    </div>
    <div class="item-actions">
      <button class="btn-icon" title="Skip/N/A" data-skip-btn="${item.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="btn-icon" title="Edit" data-edit-item="${item.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn-icon" style="color:var(--coral)" title="Delete" data-delete-item="${item.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
    </div>
  </div>${subsHtml}`;
}

function renderSubItem(sub, varMap) {
  const isComplete = sub.item_state==='complete';
  const isSkipped = sub.item_state==='skipped';
  const stateIcon = isComplete
    ? `<svg width="8" height="8" fill="none" stroke="white" stroke-width="3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`
    : isSkipped
    ? `<svg width="8" height="8" fill="none" stroke="var(--muted)" stroke-width="3" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>`
    : '';
  const helperText = resolveItemText(sub.helper_text, allItems, allSubItems);
  return `<div class="sub-item ${isComplete?'item-complete':''} ${isSkipped?'item-skipped':''}" id="sub-${sub.id}" data-sub-id="${sub.id}">
    <button class="sub-state-btn ${isComplete?'state-complete':''} ${isSkipped?'state-skipped':''}" data-sub-state-btn="${sub.id}">${stateIcon}</button>
    <div class="item-body">
      <div class="item-label ${isComplete?'label-complete':''} ${isSkipped?'label-skipped':''}" style="font-size:.78rem">${escHtml(sub.label)}</div>
      ${sub.helper_text?`<div class="item-helper">${helperText}</div>`:''}
      ${!isComplete&&!isSkipped?renderFieldInput(sub):''}
    </div>
    <div class="item-actions">
      <button class="btn-icon" title="Skip" data-skip-sub="${sub.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="btn-icon" style="color:var(--coral)" title="Delete" data-delete-sub="${sub.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
    </div>
  </div>`;
}

function renderFieldInput(item) {
  const fv = parseFieldValue(item.field_value);
  const val = fv?.value ?? '';
  const checked = fv?.checked ?? false;
  const long = fv?.long ?? '';
  const short = fv?.short ?? '';
  const ft = item.field_type;
  if (ft==='checkbox') return '';
  if (ft==='yes_no') return `<div class="radio-group" data-field-item="${item.id}"><label class="radio-option ${val==='yes'?'selected':''}" data-val="yes"><input type="radio" name="yn-${item.id}" value="yes" ${val==='yes'?'checked':''}> Yes</label><label class="radio-option ${val==='no'?'selected':''}" data-val="no"><input type="radio" name="yn-${item.id}" value="no" ${val==='no'?'checked':''}> No</label></div>`;
  if (ft==='radio'||ft==='dropdown') {
    const opts = item.field_options?.options||[];
    if (ft==='dropdown') return `<select class="field-input form-select" data-field-item="${item.id}" style="margin-top:6px;max-width:260px"><option value="">Select…</option>${opts.map(o=>`<option value="${escHtml(o)}" ${val===o?'selected':''}>${escHtml(o)}</option>`).join('')}</select>`;
    return `<div class="radio-group" data-field-item="${item.id}">${opts.map(o=>`<label class="radio-option ${val===o?'selected':''}" data-val="${escHtml(o)}"><input type="radio" name="r-${item.id}" value="${escHtml(o)}" ${val===o?'checked':''}> ${escHtml(o)}</label>`).join('')}</div>`;
  }
  if (ft==='dc_quantity') return `<div class="dc-qty-group"><span class="dc-qty-label">Long form:</span><input class="dc-qty-input" type="number" min="0" data-dc-long="${item.id}" value="${escHtml(String(long))}"><span class="dc-qty-label">Short form:</span><input class="dc-qty-input" type="number" min="0" data-dc-short="${item.id}" value="${escHtml(String(short))}"></div>`;
  if (ft==='short_text'||ft==='phone'||ft==='email') return `<input class="field-input form-input" type="${ft==='phone'?'tel':ft==='email'?'email':'text'}" data-field-item="${item.id}" value="${escHtml(val)}" placeholder="${ft==='phone'?'(555) 555-5555':ft==='email'?'email@example.com':'Enter value…'}" style="margin-top:6px;max-width:280px">`;
  if (ft==='long_text') return `<textarea class="field-input form-textarea" data-field-item="${item.id}" placeholder="Enter notes…" style="margin-top:6px;min-height:55px">${escHtml(val)}</textarea>`;
  if (ft==='number') return `<input class="field-input form-input" type="number" data-field-item="${item.id}" value="${escHtml(String(val))}" placeholder="0" style="margin-top:6px;max-width:120px">`;
  if (ft==='currency') return `<div style="display:flex;align-items:center;gap:4px;margin-top:6px"><span style="color:var(--slate);font-size:.85rem">$</span><input class="field-input form-input" type="number" step="0.01" data-field-item="${item.id}" value="${escHtml(String(val))}" placeholder="0.00" style="max-width:140px"></div>`;
  if (ft==='date') return `<input class="field-input form-input" type="date" data-field-item="${item.id}" value="${escHtml(val)}" style="margin-top:6px;max-width:180px">`;
  if (ft==='datetime') return `<input class="field-input form-input" type="datetime-local" data-field-item="${item.id}" value="${escHtml(val)}" style="margin-top:6px;max-width:220px">`;
  return '';
}

function renderFieldValueDisplay(item) {
  const fv = parseFieldValue(item.field_value);
  if (!fv) return '';
  let display = '';
  if ('checked' in fv) display = fv.checked ? '✓' : '';
  else if ('long' in fv||'short' in fv) display = `Long: ${fv.long||0} · Short: ${fv.short||0}`;
  else if ('value' in fv && fv.value!==null && fv.value!=='') {
    if (item.field_type==='currency') display = formatCurrency(fv.value);
    else display = String(fv.value);
  }
  if (!display) return '';
  return `<div class="item-helper" style="font-weight:500;color:var(--teal-dk)">${escHtml(display)}</div>`;
}

function bindChecklistEvents(wrap) {
  // Group header collapse
  wrap.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', () => {
      const id = header.dataset.groupId;
      const body = document.getElementById(`group-body-${id}`);
      const chevron = header.querySelector('.group-chevron');
      body?.classList.toggle('collapsed');
      chevron?.classList.toggle('open');
    });
  });

  // Section header collapse
  wrap.querySelectorAll('.section-header').forEach(header => {
    header.addEventListener('click', e => {
      if (e.target.closest('button')||e.target.closest('.section-toggle-pills')) return;
      const id = header.dataset.sectionId;
      const body = document.getElementById(`sec-body-${id}`);
      const chevron = header.querySelector('.section-chevron');
      body?.classList.toggle('collapsed');
      chevron?.classList.toggle('open');
    });
  });

  // Toggle pills
  wrap.querySelectorAll('.toggle-pill').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const id = pill.dataset.sec;
      const type = pill.dataset.toggle;
      if (type==='completed') showCompleted[id] = !showCompleted[id];
      if (type==='skipped') showSkipped[id] = !showSkipped[id];
      renderChecklist();
    });
  });

  // Item state buttons
  wrap.querySelectorAll('[data-state-btn]').forEach(btn => btn.addEventListener('click', () => toggleItemState(btn.dataset.stateBtn)));
  wrap.querySelectorAll('[data-skip-btn]').forEach(btn => btn.addEventListener('click', () => skipItem(btn.dataset.skipBtn)));
  wrap.querySelectorAll('[data-edit-item]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); openEditItemModal(btn.dataset.editItem); }));
  wrap.querySelectorAll('[data-delete-item]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); deleteItem(btn.dataset.deleteItem); }));

  // Sub-item state buttons
  wrap.querySelectorAll('[data-sub-state-btn]').forEach(btn => btn.addEventListener('click', () => toggleSubState(btn.dataset.subStateBtn)));
  wrap.querySelectorAll('[data-skip-sub]').forEach(btn => btn.addEventListener('click', () => skipSub(btn.dataset.skipSub)));
  wrap.querySelectorAll('[data-delete-sub]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); deleteSub(btn.dataset.deleteSub); }));

  // Field inputs
  wrap.querySelectorAll('[data-field-item]').forEach(input => {
    const itemId = input.dataset.fieldItem;
    if (input.tagName==='SELECT') {
      input.addEventListener('change', () => saveFieldValue(itemId, input.value));
    } else if (input.tagName==='TEXTAREA') {
      input.addEventListener('blur', () => saveFieldValue(itemId, input.value));
    } else {
      input.addEventListener('blur', () => saveFieldValue(itemId, input.value));
      input.addEventListener('keydown', e => { if (e.key==='Enter'&&input.type!=='textarea') saveFieldValue(itemId, input.value); });
    }
  });

  // Radio groups
  wrap.querySelectorAll('.radio-group').forEach(group => {
    const itemId = group.dataset.fieldItem;
    group.querySelectorAll('.radio-option').forEach(label => {
      label.addEventListener('click', () => {
        group.querySelectorAll('.radio-option').forEach(l => l.classList.remove('selected'));
        label.classList.add('selected');
        saveFieldValue(itemId, label.dataset.val);
      });
    });
  });

  // DC quantity inputs
  wrap.querySelectorAll('[data-dc-long], [data-dc-short]').forEach(input => {
    const itemId = input.dataset.dcLong || input.dataset.dcShort;
    input.addEventListener('blur', () => saveDCQuantity(itemId));
  });

  // Add direct item to group
  wrap.querySelectorAll('[data-add-direct-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = wrap.querySelector(`[data-add-direct="${btn.dataset.addDirectBtn}"]`);
      if (input?.value.trim()) addAdhocItem(input.value.trim(), btn.dataset.addDirectBtn, null, input);
    });
  });
  wrap.querySelectorAll('[data-add-direct]').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key==='Enter'&&input.value.trim()) addAdhocItem(input.value.trim(), input.dataset.addDirect, null, input); });
  });

  // Add item to section
  wrap.querySelectorAll('[data-add-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = wrap.querySelector(`[data-section-id="${btn.dataset.addItem}"]`);
      if (input?.value.trim()) addAdhocItem(input.value.trim(), null, btn.dataset.addItem, input);
    });
  });
  wrap.querySelectorAll('[data-section-id]').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key==='Enter'&&input.value.trim()) addAdhocItem(input.value.trim(), null, input.dataset.sectionId, input); });
  });

  // Add sub-item
  wrap.querySelectorAll('[data-add-sub-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = wrap.querySelector(`[data-add-sub="${btn.dataset.addSubBtn}"]`);
      if (input?.value.trim()) addAdhocSubItem(input.value.trim(), btn.dataset.addSubBtn, input);
    });
  });
  wrap.querySelectorAll('[data-add-sub]').forEach(input => {
    input.addEventListener('keydown', e => { if (e.key==='Enter'&&input.value.trim()) addAdhocSubItem(input.value.trim(), input.dataset.addSub, input); });
  });

  // Add section
  wrap.querySelectorAll('[data-add-section]').forEach(btn => {
    btn.addEventListener('click', () => openAddSectionModal(btn.dataset.addSection));
  });
}

// ── ITEM STATE ────────────────────────────────────────────────
async function toggleItemState(itemId) {
  const item = allItems.find(i => i.id===itemId);
  if (!item) return;
  const newState = item.item_state==='incomplete' ? 'complete' : 'incomplete';
  const updates = { item_state: newState };
  if (newState==='complete' && item.field_type==='checkbox') updates.field_value = { checked: true };
  await db.from('family_items').update(updates).eq('id', itemId);
  item.item_state = newState;
  if (item.field_type==='checkbox' && newState==='complete') item.field_value = { checked: true };
  if (newState==='complete') await logItemComplete(currentFamily.id, currentUser.id, item.label);
  else await logItemUncomplete(currentFamily.id, currentUser.id, item.label);
  refreshNotifications(); updateSidebarProgress(); renderChecklist();
}

async function skipItem(itemId) {
  const item = allItems.find(i => i.id===itemId);
  if (!item) return;
  if (item.item_state==='skipped') {
    await db.from('family_items').update({ item_state: 'incomplete' }).eq('id', itemId);
    item.item_state = 'incomplete';
    await logItemUnskipped(currentFamily.id, currentUser.id, item.label);
    toast('Item restored', 'success');
  } else {
    await db.from('family_items').update({ item_state: 'skipped' }).eq('id', itemId);
    item.item_state = 'skipped';
    await logItemSkipped(currentFamily.id, currentUser.id, item.label);
  }
  refreshNotifications(); updateSidebarProgress(); renderChecklist();
}

// ── SUB-ITEM STATE ────────────────────────────────────────────
async function toggleSubState(subId) {
  const sub = allSubItems.find(s => s.id===subId);
  if (!sub) return;
  const newState = sub.item_state==='incomplete' ? 'complete' : 'incomplete';
  const updates = { item_state: newState };
  if (newState==='complete' && sub.field_type==='checkbox') updates.field_value = { checked: true };
  await db.from('family_sub_items').update(updates).eq('id', subId);
  sub.item_state = newState;
  if (newState==='complete') await logSubComplete(currentFamily.id, currentUser.id, sub.label);
  else await logSubUncomplete(currentFamily.id, currentUser.id, sub.label);
  // Check if parent should auto-complete
  await checkParentAutoComplete(sub.item_id);
  updateSidebarProgress(); renderChecklist();
}

async function skipSub(subId) {
  const sub = allSubItems.find(s => s.id===subId);
  if (!sub) return;
  if (sub.item_state==='skipped') {
    await db.from('family_sub_items').update({ item_state: 'incomplete' }).eq('id', subId);
    sub.item_state = 'incomplete';
  } else {
    await db.from('family_sub_items').update({ item_state: 'skipped' }).eq('id', subId);
    sub.item_state = 'skipped';
    await logSubSkipped(currentFamily.id, currentUser.id, sub.label);
    await checkParentAutoComplete(sub.item_id);
  }
  updateSidebarProgress(); renderChecklist();
}

async function checkParentAutoComplete(itemId) {
  const item = allItems.find(i => i.id===itemId);
  if (!item || item.item_state==='complete') return;
  const subs = allSubItems.filter(s => s.item_id===itemId);
  if (!subs.length) return;
  if (allSubItemsDone(subs)) {
    await db.from('family_items').update({ item_state: 'complete' }).eq('id', itemId);
    item.item_state = 'complete';
    await logParentAutoComplete(currentFamily.id, currentUser.id, item.label);
  }
}

// ── FIELD VALUES ──────────────────────────────────────────────
async function saveFieldValue(itemId, value) {
  const item = allItems.find(i => i.id===itemId) || allSubItems.find(i => i.id===itemId);
  if (!item) return;
  const oldFv = parseFieldValue(item.field_value);
  const oldVal = oldFv?.value ?? '';
  if (String(value) === String(oldVal)) return;
  const fieldValue = buildFieldValue(item.field_type, value);
  const table = allItems.find(i => i.id===itemId) ? 'family_items' : 'family_sub_items';
  await db.from(table).update({ field_value: fieldValue }).eq('id', itemId);
  item.field_value = fieldValue;
  oldVal ? await logValueChanged(currentFamily.id, currentUser.id, item.label, String(oldVal), String(value))
         : await logValueSet(currentFamily.id, currentUser.id, item.label, String(value));
  renderChecklist();
}

async function saveDCQuantity(itemId) {
  const item = allItems.find(i => i.id===itemId);
  if (!item) return;
  const longEl = document.querySelector(`[data-dc-long="${itemId}"]`);
  const shortEl = document.querySelector(`[data-dc-short="${itemId}"]`);
  const long = parseInt(longEl?.value||0)||0;
  const short = parseInt(shortEl?.value||0)||0;
  const fieldValue = { long, short };
  await db.from('family_items').update({ field_value: fieldValue }).eq('id', itemId);
  item.field_value = fieldValue;
  await logValueSet(currentFamily.id, currentUser.id, item.label, `Long: ${long}, Short: ${short}`);
  renderChecklist();
}

// ── ADD ITEMS ─────────────────────────────────────────────────
async function addAdhocItem(label, groupId, sectionId, inputEl) {
  if (!label) return;
  const filtered = sectionId ? allItems.filter(i => i.section_id===sectionId) : allItems.filter(i => i.group_id===groupId && !i.section_id);
  const maxPos = filtered.length ? Math.max(...filtered.map(i => i.position)) : -1;
  const { data: newItem, error } = await db.from('family_items').insert({
    family_id: currentFamily.id, group_id: groupId, section_id: sectionId,
    label, field_type: 'checkbox', item_state: 'incomplete', is_adhoc: true, position: maxPos+1
  }).select().single();
  if (error) { toast('Error adding task', 'error'); return; }
  allItems.push(newItem);
  await logItemAdded(currentFamily.id, currentUser.id, label);
  if (inputEl) inputEl.value = '';
  updateSidebarProgress(); renderChecklist();
}

async function addAdhocSubItem(label, itemId, inputEl) {
  if (!label) return;
  const existing = allSubItems.filter(s => s.item_id===itemId);
  const maxPos = existing.length ? Math.max(...existing.map(s => s.position)) : -1;
  const { data: newSub, error } = await db.from('family_sub_items').insert({
    family_id: currentFamily.id, item_id: itemId,
    label, field_type: 'checkbox', item_state: 'incomplete', is_adhoc: true, position: maxPos+1
  }).select().single();
  if (error) { toast('Error adding sub-task', 'error'); return; }
  allSubItems.push(newSub);
  await logSubItemAdded(currentFamily.id, currentUser.id, label);
  if (inputEl) inputEl.value = '';
  renderChecklist();
}

// ── DELETE ────────────────────────────────────────────────────
function deleteItem(itemId) {
  const item = allItems.find(i => i.id===itemId);
  confirmDialog({ title:'Delete Task', message:`Delete "${item?.label||'this task'}"? This cannot be undone.`, confirmText:'Delete', onConfirm: async () => {
    await db.from('family_sub_items').delete().eq('item_id', itemId);
    await db.from('family_items').delete().eq('id', itemId);
    allItems = allItems.filter(i => i.id!==itemId);
    allSubItems = allSubItems.filter(s => s.item_id!==itemId);
    updateSidebarProgress(); renderChecklist();
    toast('Task deleted', 'success');
  }});
}

function deleteSub(subId) {
  const sub = allSubItems.find(s => s.id===subId);
  confirmDialog({ title:'Delete Sub-task', message:`Delete "${sub?.label||'this sub-task'}"?`, confirmText:'Delete', onConfirm: async () => {
    await db.from('family_sub_items').delete().eq('id', subId);
    allSubItems = allSubItems.filter(s => s.id!==subId);
    renderChecklist();
    toast('Sub-task deleted', 'success');
  }});
}

// ── ADD SECTION ───────────────────────────────────────────────
function openAddSectionModal(groupId) {
  openModal({ title:'Add Section', size:'sm', body:`
    <div class="form-group"><label class="form-label">Section Title</label><input class="form-input" id="as-title" placeholder="e.g. Documentation"></div>
    <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="as-surface"> Surface incomplete items on family card</label></div>`,
    footer:`<button class="btn btn-ghost" id="as-cancel">Cancel</button><button class="btn btn-primary" id="as-save">Add Section</button>`
  });
  document.getElementById('as-cancel')?.addEventListener('click', closeModal);
  document.getElementById('as-save')?.addEventListener('click', async () => {
    const title = document.getElementById('as-title')?.value.trim();
    if (!title) { toast('Title required', 'error'); return; }
    const secItems = allSections.filter(s => s.group_id===groupId);
    const maxPos = secItems.length ? Math.max(...secItems.map(s => s.position)) : -1;
    const { data: newSec, error } = await db.from('family_sections').insert({
      family_id: currentFamily.id, group_id: groupId, title, position: maxPos+1,
      is_adhoc: true, surface_on_card: document.getElementById('as-surface')?.checked||false
    }).select().single();
    if (error) { toast('Error adding section', 'error'); return; }
    allSections.push(newSec);
    await logSectionAdded(currentFamily.id, currentUser.id, title);
    closeModal(); toast('Section added', 'success'); renderChecklist();
  });
}

// ── EDIT ITEM MODAL ───────────────────────────────────────────
function openEditItemModal(itemId) {
  const item = allItems.find(i => i.id===itemId);
  if (!item) return;
  openModal({ title:'Edit Task', size:'md', body:`
    <div class="form-group"><label class="form-label">Label</label><input class="form-input" id="ei-label" value="${escHtml(item.label)}"></div>
    <div class="form-group"><label class="form-label">Helper Text</label><input class="form-input" id="ei-helper" value="${escHtml(item.helper_text||'')}" placeholder="Context or instruction…"></div>
    <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ei-important" ${item.is_important?'checked':''}> Mark as important</label></div>
    <div class="form-group"><label class="form-label">Due Date</label><input class="form-input" id="ei-due" type="date" value="${escHtml(item.due_date||'')}" style="max-width:180px"></div>`,
    footer:`<button class="btn btn-ghost" id="ei-cancel">Cancel</button><button class="btn btn-primary" id="ei-save">Save</button>`
  });
  document.getElementById('ei-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ei-save')?.addEventListener('click', async () => {
    const label = document.getElementById('ei-label')?.value.trim();
    if (!label) { toast('Label required', 'error'); return; }
    const updates = { label, helper_text: document.getElementById('ei-helper')?.value||null, is_important: document.getElementById('ei-important')?.checked||false, due_date: document.getElementById('ei-due')?.value||null };
    await db.from('family_items').update(updates).eq('id', itemId);
    Object.assign(item, updates);
    closeModal(); toast('Task updated', 'success'); renderChecklist();
  });
}

// ── STATUS CHANGE ─────────────────────────────────────────────
async function changeStatus(newStatus) {
  const old = currentFamily.status;
  if (old===newStatus) return;
  if (newStatus==='long_term') {
    openModal({ title:'Mark as Long Term', size:'sm', body:`
      <div class="form-group"><label class="form-label">Reason (optional)</label><input class="form-input" id="lt-reason" placeholder="e.g. Awaiting National Cemetery date" value="${escHtml(currentFamily.long_term_reason||'')}"></div>`,
      footer:`<button class="btn btn-ghost" id="lt-cancel">Cancel</button><button class="btn btn-violet" id="lt-confirm">Mark Long Term</button>`
    });
    document.getElementById('lt-cancel')?.addEventListener('click', closeModal);
    document.getElementById('lt-confirm')?.addEventListener('click', async () => {
      const reason = document.getElementById('lt-reason')?.value||null;
      await db.from('families').update({ status:'long_term', long_term_reason:reason }).eq('id', currentFamily.id);
      currentFamily.status='long_term'; currentFamily.long_term_reason=reason;
      await logStatusChanged(currentFamily.id, currentUser.id, old, 'long_term');
      closeModal(); renderPage(document.getElementById('page-family-detail'));
    });
    return;
  }
  await db.from('families').update({ status: newStatus }).eq('id', currentFamily.id);
  currentFamily.status = newStatus;
  await logStatusChanged(currentFamily.id, currentUser.id, old, newStatus);
  toast(`Status updated`, 'success');
  renderPage(document.getElementById('page-family-detail'));
}

// ── NOTES EDITOR ──────────────────────────────────────────────
function openNotesEditor() {
  const display = document.getElementById('notes-display');
  if (!display) return;
  display.innerHTML = `<textarea class="detail-notes-textarea" id="notes-ta" rows="4">${escHtml(currentFamily.notes||'')}</textarea>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn btn-teal btn-sm" id="notes-save">Save</button>
      <button class="btn btn-ghost btn-sm" id="notes-cancel" style="color:rgba(255,255,255,.7);border-color:rgba(255,255,255,.3)">Cancel</button>
    </div>`;
  document.getElementById('notes-cancel')?.addEventListener('click', () => {
    display.innerHTML = currentFamily.notes ? `<div class="detail-notes-text">${escHtml(currentFamily.notes)}</div>` : `<div style="font-size:.78rem;color:rgba(255,255,255,.5)">No notes yet. Click edit to add.</div>`;
  });
  document.getElementById('notes-save')?.addEventListener('click', async () => {
    const newNotes = document.getElementById('notes-ta')?.value||'';
    await db.from('families').update({ notes: newNotes }).eq('id', currentFamily.id);
    currentFamily.notes = newNotes;
    await logNotesEdited(currentFamily.id, currentUser.id);
    display.innerHTML = newNotes ? `<div class="detail-notes-text">${escHtml(newNotes)}</div>` : `<div style="font-size:.78rem;color:rgba(255,255,255,.5)">No notes yet. Click edit to add.</div>`;
    toast('Notes saved', 'success');
  });
}

// ── EDIT FAMILY MODAL ─────────────────────────────────────────
function openEditFamilyModal() {
  const f = currentFamily;
  openModal({ title:'Edit Family Information', size:'lg', body:`
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
      <div class="form-group"><label class="form-label">Arrangement Date</label><input class="form-input" id="ef-arr" type="date" value="${escHtml(f.arrangement_date||'')}"></div>
      <div class="form-group"><label class="form-label">Contract Number</label><input class="form-input" id="ef-contract" value="${escHtml(f.contract_number||'')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ef-veteran" ${f.is_veteran?'checked':''}> Veteran</label></div>
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ef-vet-spouse" ${f.is_veteran_spouse?'checked':''}> Spouse of Veteran</label></div>
    </div>`,
    footer:`<button class="btn btn-ghost" id="ef-cancel">Cancel</button><button class="btn btn-primary" id="ef-save">Save Changes</button>`
  });
  document.getElementById('ef-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ef-veteran')?.addEventListener('change', e => { if (e.target.checked) document.getElementById('ef-vet-spouse').checked=false; });
  document.getElementById('ef-vet-spouse')?.addEventListener('change', e => { if (e.target.checked) document.getElementById('ef-veteran').checked=false; });
  document.getElementById('ef-save')?.addEventListener('click', async () => {
    const first = document.getElementById('ef-first')?.value.trim();
    const last = document.getElementById('ef-last')?.value.trim();
    if (!first||!last) { toast('Name required', 'error'); return; }
    const updates = { decedent_first_name:first, decedent_last_name:last, date_of_birth:document.getElementById('ef-dob')?.value||null, date_of_death:document.getElementById('ef-dod')?.value||null, arrangement_date:document.getElementById('ef-arr')?.value||null, contract_number:document.getElementById('ef-contract')?.value||null, is_veteran:document.getElementById('ef-veteran')?.checked||false, is_veteran_spouse:document.getElementById('ef-vet-spouse')?.checked||false };
    await db.from('families').update(updates).eq('id', f.id);
    Object.assign(currentFamily, updates);
    closeModal(); toast('Family info updated', 'success');
    renderPage(document.getElementById('page-family-detail'));
  });
}

// ── SIDEBAR ───────────────────────────────────────────────────
function renderSidebar(prog, primary) {
  const others = allContacts.filter(c => !c.is_primary);
  return `
    <div class="card info-card">
      <div class="card-header">Progress</div>
      <div class="card-body">
        <div class="progress-row"><span class="text-sm text-muted" id="prog-label">${prog.complete} of ${prog.total} tasks${prog.skipped?` · ${prog.skipped} skipped`:''}</span><span class="fw-500" id="prog-pct">${prog.pct}%</span></div>
        <div class="progress-track" style="margin-top:6px"><div class="progress-fill" id="prog-fill" style="width:${prog.pct}%"></div></div>
      </div>
    </div>
    <div class="card info-card">
      <div class="card-header">Primary Contact (NOK)</div>
      <div class="card-body">
        ${primary?`<div class="info-field"><div class="info-key">Name</div><div class="info-val">${escHtml(primary.name)}</div>${primary.relationship?`<div class="info-sub">${escHtml(primary.relationship)}</div>`:''}</div>${primary.phone?`<div class="info-field"><div class="info-key">Phone</div><div class="info-val"><a href="tel:${escHtml(primary.phone)}">${escHtml(formatPhone(primary.phone))}</a></div></div>`:''} ${primary.email?`<div class="info-field"><div class="info-key">Email</div><div class="info-val" style="font-size:.78rem"><a href="mailto:${escHtml(primary.email)}">${escHtml(primary.email)}</a></div></div>`:''} ${primary.role_notes?`<div class="info-field"><div class="info-sub" style="color:var(--coral);font-size:.75rem">${escHtml(primary.role_notes)}</div></div>`:''}`:`<div class="text-muted text-sm">No contact added yet.</div>`}
      </div>
    </div>
    ${others.length?`<div class="card info-card"><div class="card-header">Additional Contacts</div><div class="card-body">${others.map(c=>`<div class="info-field"><div class="info-key">${escHtml(c.name)}${c.relationship?` — ${escHtml(c.relationship)}`:''}</div>${c.phone?`<div class="info-val" style="font-size:.8rem"><a href="tel:${escHtml(c.phone)}">${escHtml(formatPhone(c.phone))}</a></div>`:''} ${c.email?`<div class="info-sub"><a href="mailto:${escHtml(c.email)}">${escHtml(c.email)}</a></div>`:''} ${c.role_notes?`<div class="info-sub" style="color:var(--violet)">${escHtml(c.role_notes)}</div>`:''}</div>`).join('<hr class="divider" style="margin:6px 0">')}</div></div>`:''}
    <div class="card info-card">
      <div class="card-header">Reminders<button class="btn btn-teal btn-xs" id="btn-add-reminder">+ Add</button></div>
      <div class="card-body" id="reminders-list">${renderRemindersList()}</div>
    </div>
    <div class="card info-card">
      <div class="card-header">Actions</div>
      <div class="card-body" style="display:flex;flex-direction:column;gap:8px">
        <button class="btn btn-ghost btn-sm" style="justify-content:flex-start" id="btn-add-contact">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Contact
        </button>
        <button class="btn btn-ghost btn-sm" style="justify-content:flex-start;color:var(--coral)" id="btn-delete-case">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Delete Case
        </button>
      </div>
    </div>`;
}

function renderRemindersList() {
  if (!allReminders.length) return `<div class="text-muted text-sm">No reminders.</div>`;
  return allReminders.map(r => {
    const status = getDueStatus(r.due_date);
    const label = getDueLabel(r.due_date);
    return `<div class="info-field" style="display:flex;justify-content:space-between;gap:8px">
      <div><div class="info-val" style="font-size:.8rem">${escHtml(r.description)}</div><div class="info-sub ${status==='overdue'?'color-coral':status==='today'?'color-amber':''}">${label}</div></div>
      <button class="btn-icon" data-dismiss-reminder="${r.id}" title="Dismiss"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>`;
  }).join('<hr class="divider" style="margin:5px 0">');
}

function bindSidebarActions() {
  document.getElementById('btn-add-reminder')?.addEventListener('click', openAddReminderModal);
  document.getElementById('btn-add-contact')?.addEventListener('click', openAddContactModal);
  document.getElementById('btn-delete-case')?.addEventListener('click', () => {
    confirmDialog({ title:'Delete Case', message:`Permanently delete the case for ${currentFamily.decedent_last_name}, ${currentFamily.decedent_first_name}? All data will be lost and cannot be undone.`, confirmText:'Delete Case', onConfirm: async () => {
      await db.from('family_sub_items').delete().eq('family_id', currentFamily.id);
      await db.from('family_items').delete().eq('family_id', currentFamily.id);
      await db.from('family_sections').delete().eq('family_id', currentFamily.id);
      await db.from('family_groups').delete().eq('family_id', currentFamily.id);
      await db.from('family_contacts').delete().eq('family_id', currentFamily.id);
      await db.from('reminders').delete().eq('family_id', currentFamily.id);
      await db.from('activity_log').delete().eq('family_id', currentFamily.id);
      await db.from('families').delete().eq('id', currentFamily.id);
      toast('Case deleted', 'success'); navigate('families');
    }});
  });
  document.querySelectorAll('[data-dismiss-reminder]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.dismissReminder;
      const r = allReminders.find(r => r.id===id);
      await db.from('reminders').update({ is_dismissed:true, dismissed_at:new Date().toISOString() }).eq('id', id);
      allReminders = allReminders.filter(r => r.id!==id);
      if (r) await logReminderDismissed(currentFamily.id, currentUser.id, r.description);
      refreshNotifications();
      document.getElementById('reminders-list').innerHTML = renderRemindersList();
      bindSidebarActions();
    });
  });
}

function updateSidebarProgress() {
  const prog = calcProgress(allItems);
  const fill = document.getElementById('prog-fill');
  const label = document.getElementById('prog-label');
  const pct = document.getElementById('prog-pct');
  if (fill) fill.style.width = `${prog.pct}%`;
  if (label) label.textContent = `${prog.complete} of ${prog.total} tasks${prog.skipped?` · ${prog.skipped} skipped`:''}`;
  if (pct) pct.textContent = `${prog.pct}%`;
}

function openAddReminderModal() {
  openModal({ title:'Add Reminder', size:'sm', body:`
    <div class="form-group"><label class="form-label">Description</label><input class="form-input" id="rem-desc" placeholder="e.g. Follow up on payment"></div>
    <div class="form-group"><label class="form-label">When</label>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:.82rem">In</span>
        <input class="form-input" id="rem-val" type="number" min="1" value="7" style="width:65px">
        <select class="form-select" id="rem-unit" style="width:100px"><option value="days">days</option><option value="weeks">weeks</option><option value="months">months</option></select>
        <span style="font-size:.8rem;color:var(--muted)">— or —</span>
        <input class="form-input" id="rem-date" type="date" style="width:155px">
      </div>
    </div>`,
    footer:`<button class="btn btn-ghost" id="rem-cancel">Cancel</button><button class="btn btn-primary" id="rem-save">Add Reminder</button>`
  });
  document.getElementById('rem-cancel')?.addEventListener('click', closeModal);
  document.getElementById('rem-save')?.addEventListener('click', async () => {
    const desc = document.getElementById('rem-desc')?.value.trim();
    if (!desc) { toast('Description required', 'error'); return; }
    let dueDate = document.getElementById('rem-date')?.value;
    if (!dueDate) dueDate = calcFutureDueDate(document.getElementById('rem-val')?.value, document.getElementById('rem-unit')?.value);
    if (!dueDate) { toast('Please set a due date', 'error'); return; }
    const { data: r, error } = await db.from('reminders').insert({ family_id:currentFamily.id, user_id:currentUser.id, description:desc, due_date:dueDate }).select().single();
    if (error) { toast('Error adding reminder', 'error'); return; }
    allReminders.push(r);
    await logReminderAdded(currentFamily.id, currentUser.id, desc, dueDate);
    refreshNotifications(); closeModal(); toast('Reminder added', 'success');
    document.getElementById('reminders-list').innerHTML = renderRemindersList();
    bindSidebarActions();
  });
}

function openAddContactModal() {
  openModal({ title:'Add Contact', size:'md', body:`
    <div class="form-row">
      <div class="form-group"><label class="form-label">Name *</label><input class="form-input" id="ac-name" placeholder="Full name"></div>
      <div class="form-group"><label class="form-label">Relationship</label><input class="form-input" id="ac-rel" placeholder="Son, Daughter, Attorney…"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="ac-phone" type="tel" placeholder="(555) 555-5555"></div>
      <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="ac-email" type="email" placeholder="email@example.com"></div>
    </div>
    <div class="form-group"><label class="form-label">Role / Notes</label><input class="form-input" id="ac-notes" placeholder="e.g. Primary decision maker"></div>`,
    footer:`<button class="btn btn-ghost" id="ac-cancel">Cancel</button><button class="btn btn-primary" id="ac-save">Add Contact</button>`
  });
  document.getElementById('ac-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ac-save')?.addEventListener('click', async () => {
    const name = document.getElementById('ac-name')?.value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const maxPos = allContacts.length ? Math.max(...allContacts.map(c => c.position)) : -1;
    const { data: contact, error } = await db.from('family_contacts').insert({ family_id:currentFamily.id, is_primary:false, name, relationship:document.getElementById('ac-rel')?.value||null, phone:document.getElementById('ac-phone')?.value||null, email:document.getElementById('ac-email')?.value||null, role_notes:document.getElementById('ac-notes')?.value||null, position:maxPos+1 }).select().single();
    if (error) { toast('Error adding contact', 'error'); return; }
    allContacts.push(contact);
    await logContactAdded(currentFamily.id, currentUser.id, name);
    closeModal(); toast('Contact added', 'success');
    const prog = calcProgress(allItems);
    const primary = allContacts.find(c => c.is_primary)||allContacts[0];
    document.getElementById('info-panel').innerHTML = renderSidebar(prog, primary);
    bindSidebarActions();
  });
}

async function loadActivityLog() {
  const entries = document.getElementById('activity-entries');
  if (!entries) return;
  try {
    const log = await fetchActivityLog(currentFamily.id);
    if (!log.length) { entries.innerHTML = `<div class="text-muted text-sm" style="padding:12px 16px">No activity yet.</div>`; return; }
    entries.innerHTML = log.map(e => `<div class="activity-entry"><span class="activity-time">${formatActivityTime(e.created_at)}</span><span class="activity-desc">${escHtml(e.description)}</span></div>`).join('');
  } catch { entries.innerHTML = `<div class="text-muted text-sm" style="padding:12px 16px">Failed to load.</div>`; }
}
