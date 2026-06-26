// ─── FAMILIES PAGE ────────────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { openModal, closeModal } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml, calcProgress, formatPhone } from '../utils/helpers.js';
import { formatDate, calcDueDate } from '../utils/dates.js';
import { logCaseCreated } from '../activity-log.js';
import { getCurrentUser } from '../auth.js';
import { refreshNotifications } from '../notifications.js';
import { invalidateSearchCache } from '../app.js';
import { reloadDashboard } from './dashboard.js';
import { autoFormatPhone } from '../utils/helpers.js';

export async function renderFamilies(params, container) {
  container.innerHTML = `<div class="loading-state">Loading families…</div>`;
  document.getElementById('topbar-actions').innerHTML = `
    <button class="btn btn-primary btn-sm" id="btn-new-family">
      <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      New Family
    </button>`;
  document.getElementById('btn-new-family')?.addEventListener('click', openNewFamilyModal);
  // Reuse dashboard view
  import('./dashboard.js').then(m => m.renderDashboard(params, container));
}

// ── NEW FAMILY MODAL ──────────────────────────────────────────
export async function openNewFamilyModal() {
  const { data: templates } = await db.from('templates').select('id,name').order('name');
  const templateOpts = (templates||[]).map(t => `<option value="${t.id}">${escHtml(t.name)}</option>`).join('');

  openModal({
    title: 'New Family Case',
    subtitle: 'Enter decedent and contact information',
    size: 'lg',
    body: `
      <div class="form-section-title">Decedent Information</div>
      <div style="display:grid;grid-template-columns:1fr .7fr 1fr;gap:10px">
        <div class="form-group"><label class="form-label">First Name *</label><input class="form-input" id="nf-first" placeholder="First name"></div>
        <div class="form-group"><label class="form-label">Middle</label><input class="form-input" id="nf-middle" placeholder="Middle"></div>
        <div class="form-group"><label class="form-label">Last Name *</label><input class="form-input" id="nf-last" placeholder="Last name"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Date of Birth</label><input class="form-input" id="nf-dob" type="date"></div>
        <div class="form-group"><label class="form-label">Date of Death</label><input class="form-input" id="nf-dod" type="date"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="nf-veteran"> Veteran</label></div>
        <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="nf-veteran-spouse"> Spouse of Veteran</label></div>
      </div>

      <div class="form-section-title">Case Information</div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Contract Number</label><input class="form-input" id="nf-contract" placeholder="e.g. 24-1082"></div>
        <div class="form-group"><label class="form-label">Arrangement Date &amp; Time</label><input class="form-input" id="nf-arr-date" type="datetime-local"></div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Template *</label>
          <select class="form-select" id="nf-template">
            <option value="">— Select a template —</option>
            ${templateOpts}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="nf-status">
            <option value="active">Active</option>
            <option value="long_term">Long Term</option>
          </select>
        </div>
      </div>
      <div class="form-group" id="nf-lt-group" style="display:none">
        <label class="form-label">Long Term Reason</label>
        <input class="form-input" id="nf-lt-reason" placeholder="e.g. Awaiting National Cemetery date">
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
      <div class="form-group"><label class="form-label">Role Notes</label><input class="form-input" id="nf-nok-notes" placeholder="e.g. Primary decision maker, do not contact weekends"></div>
      <div class="form-group"><label class="form-label">Case Notes</label><textarea class="form-textarea" id="nf-notes" placeholder="Any initial notes…"></textarea></div>`,
    footer: `<button class="btn btn-ghost" id="nf-cancel">Cancel</button><button class="btn btn-primary" id="nf-submit">Create Family Case</button>`
  });

  document.getElementById('nf-cancel')?.addEventListener('click', closeModal);
  document.getElementById('nf-nok-phone')?.addEventListener('input', e => autoFormatPhone(e.target));
  document.getElementById('nf-veteran')?.addEventListener('change', e => { if (e.target.checked) document.getElementById('nf-veteran-spouse').checked = false; });
  document.getElementById('nf-veteran-spouse')?.addEventListener('change', e => { if (e.target.checked) document.getElementById('nf-veteran').checked = false; });
  document.getElementById('nf-status')?.addEventListener('change', e => {
    document.getElementById('nf-lt-group').style.display = e.target.value==='long_term' ? 'block' : 'none';
  });
  document.getElementById('nf-submit')?.addEventListener('click', submitNewFamily);
}

async function submitNewFamily() {
  const first = document.getElementById('nf-first')?.value.trim();
  const last = document.getElementById('nf-last')?.value.trim();
  const nokName = document.getElementById('nf-nok-name')?.value.trim();
  const templateId = document.getElementById('nf-template')?.value;
  if (!first||!last) { toast('Decedent name is required', 'error'); return; }
  if (!templateId) { toast('Please select a template', 'error'); return; }

  const btn = document.getElementById('nf-submit');
  btn.disabled = true; btn.textContent = 'Creating…';

  try {
    const user = await getCurrentUser();
    const status = document.getElementById('nf-status')?.value||'active';
    const template = (await db.from('templates').select('name').eq('id', templateId).single()).data;

    const { data: family, error } = await db.from('families').insert({
      user_id: user.id,
      template_id: templateId,
      template_name: template?.name||null,
      decedent_first_name: first,
      middle_name: document.getElementById('nf-middle')?.value||null,
      decedent_last_name: last,
      date_of_birth: document.getElementById('nf-dob')?.value||null,
      date_of_death: document.getElementById('nf-dod')?.value||null,
      arrangement_date: document.getElementById('nf-arr-date')?.value||null,
      contract_number: document.getElementById('nf-contract')?.value||null,
      is_veteran: document.getElementById('nf-veteran')?.checked||false,
      is_veteran_spouse: document.getElementById('nf-veteran-spouse')?.checked||false,
      status,
      long_term_reason: document.getElementById('nf-lt-reason')?.value||null,
      notes: document.getElementById('nf-notes')?.value||null
    }).select().single();
    if (error) throw error;

    if (nokName) {
      await db.from('family_contacts').insert({
        family_id: family.id, is_primary: true, name: nokName,
        relationship: document.getElementById('nf-nok-rel')?.value||null,
        phone: document.getElementById('nf-nok-phone')?.value||null,
        email: document.getElementById('nf-nok-email')?.value||null,
        role_notes: document.getElementById('nf-nok-notes')?.value||null,
        position: 0
      });
    }

    await applyTemplate(family.id, templateId, family.created_at);
    await logCaseCreated(family.id, user.id, `${first} ${last}`);
    invalidateSearchCache();
    refreshNotifications();
    closeModal();
    toast(`Case created for ${last}, ${first}`, 'success');
    navigate('family-detail', { id: family.id });
  } catch(err) {
    toast('Error creating family: '+err.message, 'error');
    btn.disabled = false; btn.textContent = 'Create Family Case';
  }
}

export async function applyTemplate(familyId, templateId, createdAt) {
  const [{ data: groups }, { data: sections }, { data: items }, { data: subItems }] = await Promise.all([
    db.from('template_groups').select('*').eq('template_id', templateId).order('position'),
    db.from('template_sections').select('*').eq('template_id', templateId).order('position'),
    db.from('template_items').select('*').eq('template_id', templateId).order('position'),
    db.from('template_sub_items').select('*').eq('template_id', templateId).order('position')
  ]);

  if (!groups?.length) return;

  for (const group of groups) {
    const { data: newGroup } = await db.from('family_groups').insert({
      family_id: familyId, template_group_id: group.id, title: group.title, position: group.position
    }).select().single();
    if (!newGroup) continue;

    // Direct items (no section)
    const directItems = (items||[]).filter(i => i.group_id===group.id && !i.section_id);
    if (directItems.length) {
      for (const item of directItems) {
        const { data: newItem } = await db.from('family_items').insert({
          family_id: familyId, group_id: newGroup.id, section_id: null,
          template_item_id: item.id, label: item.label, helper_text: item.helper_text,
          variable_name: item.variable_name, field_type: item.field_type,
          field_options: item.field_options, is_important: item.is_important,
          due_date: item.relative_due_days!=null ? calcDueDate(createdAt, item.relative_due_days) : null,
          position: item.position, is_adhoc: false, item_state: 'incomplete',
          conditional_logic: item.conditional_logic
        }).select().single();
        if (!newItem) continue;
        const itemSubs = (subItems||[]).filter(s => s.item_id===item.id);
        if (itemSubs.length) {
          await db.from('family_sub_items').insert(itemSubs.map(s => ({
            family_id: familyId, item_id: newItem.id, template_sub_item_id: s.id,
            label: s.label, helper_text: s.helper_text, variable_name: s.variable_name,
            field_type: s.field_type, field_options: s.field_options, is_important: s.is_important,
            due_date: s.relative_due_days!=null ? calcDueDate(createdAt, s.relative_due_days) : null,
            position: s.position, is_adhoc: false, item_state: 'incomplete',
            conditional_logic: s.conditional_logic
          })));
        }
      }
    }

    // Sections
    const groupSections = (sections||[]).filter(s => s.group_id===group.id);
    for (const sec of groupSections) {
      const { data: newSec } = await db.from('family_sections').insert({
        family_id: familyId, group_id: newGroup.id, template_section_id: sec.id,
        title: sec.title, position: sec.position, is_adhoc: false,
        surface_on_card: sec.surface_on_card, conditional_logic: sec.conditional_logic
      }).select().single();
      if (!newSec) continue;

      const secItems = (items||[]).filter(i => i.section_id===sec.id);
      for (const item of secItems) {
        const { data: newItem } = await db.from('family_items').insert({
          family_id: familyId, group_id: newGroup.id, section_id: newSec.id,
          template_item_id: item.id, label: item.label, helper_text: item.helper_text,
          variable_name: item.variable_name, field_type: item.field_type,
          field_options: item.field_options, is_important: item.is_important,
          due_date: item.relative_due_days!=null ? calcDueDate(createdAt, item.relative_due_days) : null,
          position: item.position, is_adhoc: false, item_state: 'incomplete',
          conditional_logic: item.conditional_logic
        }).select().single();
        if (!newItem) continue;
        const itemSubs = (subItems||[]).filter(s => s.item_id===item.id);
        if (itemSubs.length) {
          await db.from('family_sub_items').insert(itemSubs.map(s => ({
            family_id: familyId, item_id: newItem.id, template_sub_item_id: s.id,
            label: s.label, helper_text: s.helper_text, variable_name: s.variable_name,
            field_type: s.field_type, field_options: s.field_options, is_important: s.is_important,
            due_date: s.relative_due_days!=null ? calcDueDate(createdAt, s.relative_due_days) : null,
            position: s.position, is_adhoc: false, item_state: 'incomplete',
            conditional_logic: s.conditional_logic
          })));
        }
      }
    }
  }
}
