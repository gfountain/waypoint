// ─── SETTINGS PAGE ────────────────────────────────────────────
import { db } from '../supabase.js';
import { navigate } from '../router.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml } from '../utils/helpers.js';
import { labelToVariableName } from '../utils/variable-resolver.js';
import { getCurrentUser } from '../auth.js';
import { initDragSort } from '../utils/drag-sort.js';

let currentUser = null;
let templates = [];
let editingTemplate = null;
let editingPhases = [];
let editingSections = [];
let editingItems = [];
let activeTab = 'templates';

export async function renderSettings(params, container) {
  currentUser = await getCurrentUser();

  document.getElementById('topbar-actions').innerHTML = '';

  container.innerHTML = `
    <div class="tab-bar" style="display:flex;border-bottom:2px solid var(--border);margin-bottom:20px">
      <div class="settings-tab ${activeTab==='templates'?'settings-tab-active':''}" data-tab="templates" style="padding:10px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='templates'?'var(--teal)':'transparent'};margin-bottom:-2px;color:${activeTab==='templates'?'var(--teal-dk)':'var(--muted)'}">Templates</div>
      <div class="settings-tab ${activeTab==='account'?'settings-tab-active':''}" data-tab="account" style="padding:10px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='account'?'var(--teal)':'transparent'};margin-bottom:-2px;color:${activeTab==='account'?'var(--teal-dk)':'var(--muted)'}">Account</div>
    </div>
    <div id="settings-content"></div>`;

  document.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      renderSettings(params, container);
    });
  });

  if (activeTab === 'templates') await renderTemplatesTab();
  else renderAccountTab();
}

// ── TEMPLATES TAB ─────────────────────────────────────────────
async function renderTemplatesTab() {
  const content = document.getElementById('settings-content');
  const { data, error } = await db.from('templates').select('*').order('name');
  templates = data || [];

  // Get section/item counts
  const counts = {};
  if (templates.length) {
    const ids = templates.map(t => t.id);
    const { data: sections } = await db.from('template_sections').select('id,template_id').in('template_id', ids);
    const { data: items } = await db.from('template_items').select('id,template_id').in('template_id', ids);
    for (const t of templates) {
      counts[t.id] = {
        sections: (sections||[]).filter(s => s.template_id === t.id).length,
        items: (items||[]).filter(i => i.template_id === t.id).length
      };
    }
  }

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-family:var(--font-serif);font-size:1.2rem">Checklist Templates</h2>
      <button class="btn btn-primary btn-sm" id="btn-new-template">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New Template
      </button>
    </div>
    ${templates.length ? `
      <div class="template-list-grid">
        ${templates.map(t => `
          <div class="template-list-card" data-template-id="${t.id}">
            <div class="template-card-name">${escHtml(t.name)}</div>
            <div class="template-card-desc">${escHtml(t.description||'No description')}</div>
            <div class="template-card-stats">
              <span>${counts[t.id]?.sections || 0} sections</span>
              <span>${counts[t.id]?.items || 0} tasks</span>
            </div>
            <div style="display:flex;gap:7px;margin-top:12px">
              <button class="btn btn-teal btn-xs btn-edit-template" data-id="${t.id}">Edit</button>
              <button class="btn btn-ghost btn-xs btn-dupe-template" data-id="${t.id}">Duplicate</button>
              <button class="btn btn-ghost btn-xs" style="color:var(--coral)" data-delete-template="${t.id}">Delete</button>
            </div>
          </div>`).join('')}
      </div>` : `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <div class="empty-title">No templates yet</div>
        <div class="empty-desc">Create a template to standardize your workflow for each case type.</div>
      </div>`}`;

  document.getElementById('btn-new-template')?.addEventListener('click', openNewTemplateModal);

  document.querySelectorAll('.btn-edit-template').forEach(btn => {
    btn.addEventListener('click', () => openTemplateEditor(btn.dataset.id));
  });

  document.querySelectorAll('.btn-dupe-template').forEach(btn => {
    btn.addEventListener('click', () => duplicateTemplate(btn.dataset.id));
  });

  document.querySelectorAll('[data-delete-template]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = templates.find(t => t.id === btn.dataset.deleteTemplate);
      confirmDialog({
        title: 'Delete Template',
        message: `Delete "${t?.name}"? Existing family checklists created from this template will not be affected.`,
        confirmText: 'Delete Template',
        onConfirm: async () => {
          const { data: secs } = await db.from('template_sections').select('id').eq('template_id', btn.dataset.deleteTemplate);
          if (secs?.length) {
            await db.from('template_items').delete().in('section_id', secs.map(s => s.id));
            await db.from('template_sections').delete().eq('template_id', btn.dataset.deleteTemplate);
          }
          await db.from('template_phases').delete().eq('template_id', btn.dataset.deleteTemplate);
          await db.from('templates').delete().eq('id', btn.dataset.deleteTemplate);
          toast('Template deleted', 'success');
          renderTemplatesTab();
        }
      });
    });
  });
}

function openNewTemplateModal() {
  openModal({
    title: 'New Template',
    size: 'sm',
    body: `
      <div class="form-group"><label class="form-label">Template Name *</label><input class="form-input" id="nt-name" placeholder="e.g. In-Person Arrangement"></div>
      <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="nt-desc" placeholder="When to use this template…" style="min-height:60px"></textarea></div>`,
    footer: `<button class="btn btn-ghost" id="nt-cancel">Cancel</button><button class="btn btn-primary" id="nt-save">Create Template</button>`
  });
  document.getElementById('nt-cancel')?.addEventListener('click', closeModal);
  document.getElementById('nt-save')?.addEventListener('click', async () => {
    const name = document.getElementById('nt-name')?.value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const { data: t, error } = await db.from('templates').insert({
      user_id: currentUser.id,
      name,
      description: document.getElementById('nt-desc')?.value || null
    }).select().single();
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    closeModal();
    toast('Template created', 'success');
    openTemplateEditor(t.id);
  });
}

async function duplicateTemplate(templateId) {
  const original = templates.find(t => t.id === templateId);
  if (!original) return;

  const { data: newTemplate } = await db.from('templates').insert({
    user_id: currentUser.id,
    name: `${original.name} (Copy)`,
    description: original.description
  }).select().single();

  const { data: phases } = await db.from('template_phases').select('*').eq('template_id', templateId).order('position');
  const { data: sections } = await db.from('template_sections').select('*').eq('template_id', templateId).order('position');
  const { data: items } = await db.from('template_items').select('*').eq('template_id', templateId).order('position');

  const phaseMap = {};
  for (const phase of (phases || [])) {
    const { data: np } = await db.from('template_phases').insert({ template_id: newTemplate.id, title: phase.title, position: phase.position }).select().single();
    phaseMap[phase.id] = np?.id;
  }

  const sectionMap = {};
  for (const sec of (sections || [])) {
    const { data: ns } = await db.from('template_sections').insert({
      template_id: newTemplate.id,
      phase_id: phaseMap[sec.phase_id] || null,
      title: sec.title,
      position: sec.position,
      surface_on_card: sec.surface_on_card,
      conditional_logic: sec.conditional_logic
    }).select().single();
    sectionMap[sec.id] = ns?.id;
  }

  for (const item of (items || [])) {
    await db.from('template_items').insert({
      template_id: newTemplate.id,
      section_id: sectionMap[item.section_id] || null,
      label: item.label,
      helper_text: item.helper_text,
      variable_name: item.variable_name,
      field_type: item.field_type,
      field_options: item.field_options,
      is_important: item.is_important,
      relative_due_days: item.relative_due_days,
      position: item.position,
      conditional_logic: item.conditional_logic
    });
  }

  toast('Template duplicated', 'success');
  renderTemplatesTab();
}

// ── TEMPLATE EDITOR ───────────────────────────────────────────
async function openTemplateEditor(templateId) {
  editingTemplate = templates.find(t => t.id === templateId);
  if (!editingTemplate) return;

  const [{ data: phases }, { data: sections }, { data: items }] = await Promise.all([
    db.from('template_phases').select('*').eq('template_id', templateId).order('position'),
    db.from('template_sections').select('*').eq('template_id', templateId).order('position'),
    db.from('template_items').select('*').eq('template_id', templateId).order('position')
  ]);

  editingPhases = phases || [];
  editingSections = sections || [];
  editingItems = items || [];

  const content = document.getElementById('settings-content');
  renderTemplateEditorView(content);
}

function renderTemplateEditorView(container) {
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <button class="btn btn-ghost btn-sm" id="btn-back-templates">← Templates</button>
      <h2 style="font-family:var(--font-serif);font-size:1.2rem;flex:1">${escHtml(editingTemplate.name)}</h2>
      <button class="btn btn-teal btn-sm" id="btn-add-phase">+ Add Phase/Tab</button>
    </div>
    <div id="template-editor-body">
      ${editingPhases.length === 0 ? `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No phases yet</div>
          <div class="empty-desc">Add a phase (tab) to start building your checklist template.</div>
        </div>` : editingPhases.map(phase => renderPhaseEditor(phase)).join('')}
    </div>`;

  document.getElementById('btn-back-templates')?.addEventListener('click', () => {
    activeTab = 'templates';
    document.getElementById('settings-content').innerHTML = '';
    renderTemplatesTab();
  });

  document.getElementById('btn-add-phase')?.addEventListener('click', addPhase);
  bindTemplateEditorEvents(container);
}

function renderPhaseEditor(phase) {
  const phaseSections = editingSections.filter(s => s.phase_id === phase.id);
  return `
    <div class="builder-phase" data-drag-id="${phase.id}" id="phase-${phase.id}">
      <div class="builder-phase-header">
        <svg class="drag-handle" width="14" height="14" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <input class="builder-phase-title" value="${escHtml(phase.title)}" data-phase-title="${phase.id}" placeholder="Phase name…">
        <button class="btn btn-xs" style="background:rgba(255,255,255,.15);color:white" data-add-section="${phase.id}">+ Section</button>
        <button class="btn-icon" style="color:rgba(255,255,255,.6)" data-delete-phase="${phase.id}" title="Delete phase">
          <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
      <div id="phase-sections-${phase.id}">
        ${phaseSections.map(sec => renderSectionEditor(sec)).join('')}
      </div>
    </div>`;
}

function renderSectionEditor(sec) {
  const secItems = editingItems.filter(i => i.section_id === sec.id);
  return `
    <div class="builder-section" id="tsec-${sec.id}">
      <div class="builder-section-head">
        <svg class="drag-handle" width="12" height="12" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <input class="builder-section-title-input" value="${escHtml(sec.title)}" data-sec-title="${sec.id}" placeholder="Section title…">
        ${sec.surface_on_card ? `<span style="font-size:.68rem;background:rgba(13,148,136,.3);color:#5eead4;padding:1px 7px;border-radius:10px">on card</span>` : ''}
        <button class="btn-icon" style="color:rgba(255,255,255,.6)" data-edit-section-settings="${sec.id}" title="Section settings">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>
        <button class="btn-icon" style="color:rgba(255,255,255,.5)" data-delete-section="${sec.id}" title="Delete section">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="builder-items" id="tsec-items-${sec.id}">
        ${secItems.map(item => renderItemEditor(item)).join('')}
      </div>
      <div class="builder-add-row">
        <svg width="12" height="12" fill="none" stroke="var(--muted)" stroke-width="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <input class="builder-add-input" placeholder="Add task…" data-add-item-to="${sec.id}">
        <button class="btn btn-ghost btn-xs" data-save-new-item="${sec.id}">Add</button>
      </div>
    </div>`;
}

function renderItemEditor(item) {
  return `
    <div class="builder-item" id="titem-${item.id}" data-drag-id="${item.id}">
      <svg class="drag-handle" width="12" height="12" fill="none" stroke="var(--border-dk)" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <input class="builder-item-label" value="${escHtml(item.label)}" data-item-label="${item.id}" placeholder="Task label…" style="flex:1;border:none;font-size:.83rem;color:var(--navy);outline:none;background:transparent">
      ${item.is_important ? `<span style="color:var(--coral);font-size:.8rem" title="Important">★</span>` : ''}
      ${item.variable_name ? `<span style="font-size:.68rem;color:var(--violet);font-family:var(--font-mono)" title="Variable: {{${item.variable_name}}}">${item.variable_name}</span>` : ''}
      <span style="font-size:.72rem;color:var(--muted);background:var(--surface-dk);padding:1px 6px;border-radius:4px">${item.field_type}</span>
      ${item.conditional_logic ? `<span style="font-size:.68rem;color:var(--violet)" title="Has conditional logic">⟳</span>` : ''}
      <button class="btn-icon" data-edit-template-item="${item.id}" title="Edit item settings">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="btn-icon" style="color:var(--coral)" data-delete-template-item="${item.id}" title="Remove item">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`;
}

function bindTemplateEditorEvents(container) {
  // Phase title blur save
  container.querySelectorAll('[data-phase-title]').forEach(input => {
    input.addEventListener('blur', async () => {
      await db.from('template_phases').update({ title: input.value }).eq('id', input.dataset.phaseTitle);
      const phase = editingPhases.find(p => p.id === input.dataset.phaseTitle);
      if (phase) phase.title = input.value;
    });
  });

  // Section title blur save
  container.querySelectorAll('[data-sec-title]').forEach(input => {
    input.addEventListener('blur', async () => {
      await db.from('template_sections').update({ title: input.value }).eq('id', input.dataset.secTitle);
      const sec = editingSections.find(s => s.id === input.dataset.secTitle);
      if (sec) sec.title = input.value;
    });
  });

  // Item label blur save
  container.querySelectorAll('[data-item-label]').forEach(input => {
    input.addEventListener('blur', async () => {
      await db.from('template_items').update({ label: input.value }).eq('id', input.dataset.itemLabel);
      const item = editingItems.find(i => i.id === input.dataset.itemLabel);
      if (item) item.label = input.value;
    });
  });

  // Add section to phase
  container.querySelectorAll('[data-add-section]').forEach(btn => {
    btn.addEventListener('click', () => addSectionToPhase(btn.dataset.addSection));
  });

  // Delete phase
  container.querySelectorAll('[data-delete-phase]').forEach(btn => {
    btn.addEventListener('click', () => deletePhase(btn.dataset.deletePhase));
  });

  // Delete section
  container.querySelectorAll('[data-delete-section]').forEach(btn => {
    btn.addEventListener('click', () => deleteTemplateSection(btn.dataset.deleteSection));
  });

  // Section settings
  container.querySelectorAll('[data-edit-section-settings]').forEach(btn => {
    btn.addEventListener('click', () => openSectionSettingsModal(btn.dataset.editSectionSettings));
  });

  // Add item to section
  container.querySelectorAll('[data-save-new-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = container.querySelector(`[data-add-item-to="${btn.dataset.saveNewItem}"]`);
      if (input?.value.trim()) addTemplateItem(btn.dataset.saveNewItem, input.value.trim(), input);
    });
  });
  container.querySelectorAll('[data-add-item-to]').forEach(input => {
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) addTemplateItem(input.dataset.addItemTo, input.value.trim(), input);
    });
  });

  // Edit template item
  container.querySelectorAll('[data-edit-template-item]').forEach(btn => {
    btn.addEventListener('click', () => openEditTemplateItemModal(btn.dataset.editTemplateItem));
  });

  // Delete template item
  container.querySelectorAll('[data-delete-template-item]').forEach(btn => {
    btn.addEventListener('click', () => deleteTemplateItem(btn.dataset.deleteTemplateItem));
  });
}

async function addPhase() {
  const maxPos = Math.max(0, ...editingPhases.map(p => p.position));
  const { data: phase } = await db.from('template_phases').insert({
    template_id: editingTemplate.id,
    title: 'New Phase',
    position: maxPos + 1
  }).select().single();
  if (phase) {
    editingPhases.push(phase);
    renderTemplateEditorView(document.getElementById('settings-content'));
  }
}

async function deletePhase(phaseId) {
  const phaseSections = editingSections.filter(s => s.phase_id === phaseId);
  for (const sec of phaseSections) {
    await db.from('template_items').delete().eq('section_id', sec.id);
  }
  if (phaseSections.length) await db.from('template_sections').delete().eq('phase_id', phaseId);
  await db.from('template_phases').delete().eq('id', phaseId);
  editingPhases = editingPhases.filter(p => p.id !== phaseId);
  editingSections = editingSections.filter(s => s.phase_id !== phaseId);
  renderTemplateEditorView(document.getElementById('settings-content'));
}

async function addSectionToPhase(phaseId) {
  const maxPos = Math.max(0, ...editingSections.filter(s => s.phase_id === phaseId).map(s => s.position));
  const { data: sec } = await db.from('template_sections').insert({
    template_id: editingTemplate.id,
    phase_id: phaseId,
    title: 'New Section',
    position: maxPos + 1,
    surface_on_card: false
  }).select().single();
  if (sec) {
    editingSections.push(sec);
    renderTemplateEditorView(document.getElementById('settings-content'));
  }
}

async function deleteTemplateSection(sectionId) {
  await db.from('template_items').delete().eq('section_id', sectionId);
  await db.from('template_sections').delete().eq('id', sectionId);
  editingSections = editingSections.filter(s => s.id !== sectionId);
  editingItems = editingItems.filter(i => i.section_id !== sectionId);
  renderTemplateEditorView(document.getElementById('settings-content'));
}

async function addTemplateItem(sectionId, label, inputEl) {
  const maxPos = Math.max(0, ...editingItems.filter(i => i.section_id === sectionId).map(i => i.position));
  const varName = labelToVariableName(label);
  const { data: item } = await db.from('template_items').insert({
    template_id: editingTemplate.id,
    section_id: sectionId,
    label,
    field_type: 'checkbox',
    variable_name: varName,
    position: maxPos + 1,
    is_important: false
  }).select().single();
  if (item) {
    editingItems.push(item);
    if (inputEl) inputEl.value = '';
    const itemsContainer = document.getElementById(`tsec-items-${sectionId}`);
    if (itemsContainer) {
      const div = document.createElement('div');
      div.innerHTML = renderItemEditor(item);
      itemsContainer.appendChild(div.firstElementChild);
      bindTemplateEditorEvents(document.getElementById('settings-content'));
    }
  }
}

async function deleteTemplateItem(itemId) {
  await db.from('template_items').delete().eq('id', itemId);
  editingItems = editingItems.filter(i => i.id !== itemId);
  document.getElementById(`titem-${itemId}`)?.remove();
}

function openEditTemplateItemModal(itemId) {
  const item = editingItems.find(i => i.id === itemId);
  if (!item) return;

  const fieldTypes = ['checkbox','yes_no','radio','short_text','long_text','date','datetime','phone','email'];
  const fieldTypeLabels = { checkbox:'Checkbox', yes_no:'Yes/No', radio:'Choose from list', short_text:'Short text', long_text:'Long text', date:'Date', datetime:'Date & time', phone:'Phone number', email:'Email address' };

  openModal({
    title: 'Edit Template Task',
    size: 'lg',
    body: `
      <div class="form-group"><label class="form-label">Label *</label><input class="form-input" id="eti-label" value="${escHtml(item.label)}"></div>
      <div class="form-group"><label class="form-label">Helper / Instruction Text</label><textarea class="form-textarea" id="eti-helper" placeholder="Additional context shown below the label. Use {{variable_name}} to reference other fields." style="min-height:60px">${escHtml(item.helper_text||'')}</textarea></div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Field Type</label>
          <select class="form-select" id="eti-type">
            ${fieldTypes.map(ft => `<option value="${ft}" ${item.field_type===ft?'selected':''}>${fieldTypeLabels[ft]}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Variable Name</label>
          <input class="form-input" id="eti-varname" value="${escHtml(item.variable_name||'')}" placeholder="e.g. veteran_status">
          <div class="form-hint">Use {{variable_name}} in other items to reference this value</div>
        </div>
      </div>
      <div class="form-group" id="eti-options-group" style="${item.field_type==='radio'?'':'display:none'}">
        <label class="form-label">List Options (one per line)</label>
        <textarea class="form-textarea" id="eti-options" placeholder="Option A&#10;Option B&#10;Option C" style="min-height:80px">${(item.field_options?.options||[]).join('\n')}</textarea>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label-inline checkbox-wrap">
            <input type="checkbox" id="eti-important" ${item.is_important?'checked':''}> Mark as important (shows on family card)
          </label>
        </div>
        <div class="form-group">
          <label class="form-label">Due (days from case creation)</label>
          <input class="form-input" id="eti-due" type="number" min="0" value="${item.relative_due_days ?? ''}" placeholder="e.g. 3" style="max-width:100px">
        </div>
      </div>
      <hr class="divider">
      <div class="cond-editor">
        <div class="cond-editor-title">Conditional Logic (optional)</div>
        ${renderCondEditor(item, editingItems)}
      </div>`,
    footer: `<button class="btn btn-ghost" id="eti-cancel">Cancel</button><button class="btn btn-primary" id="eti-save">Save</button>`
  });

  document.getElementById('eti-type')?.addEventListener('change', e => {
    document.getElementById('eti-options-group').style.display = e.target.value === 'radio' ? 'block' : 'none';
  });
  document.getElementById('eti-cancel')?.addEventListener('click', closeModal);
  document.getElementById('eti-save')?.addEventListener('click', async () => {
    const label = document.getElementById('eti-label')?.value.trim();
    if (!label) { toast('Label required', 'error'); return; }
    const fieldType = document.getElementById('eti-type')?.value;
    const varName = document.getElementById('eti-varname')?.value.trim() || labelToVariableName(label);
    const optionsRaw = document.getElementById('eti-options')?.value || '';
    const options = fieldType === 'radio' ? optionsRaw.split('\n').map(o => o.trim()).filter(Boolean) : [];
    const dueDays = document.getElementById('eti-due')?.value;
    const condLogic = readCondEditor();

    const updates = {
      label,
      helper_text: document.getElementById('eti-helper')?.value || null,
      field_type: fieldType,
      variable_name: varName,
      field_options: options.length ? { options } : null,
      is_important: document.getElementById('eti-important')?.checked || false,
      relative_due_days: dueDays ? parseInt(dueDays) : null,
      conditional_logic: condLogic
    };

    await db.from('template_items').update(updates).eq('id', itemId);
    Object.assign(item, updates);
    closeModal();
    toast('Task updated', 'success');
    renderTemplateEditorView(document.getElementById('settings-content'));
  });
}

function openSectionSettingsModal(sectionId) {
  const sec = editingSections.find(s => s.id === sectionId);
  if (!sec) return;

  openModal({
    title: 'Section Settings',
    size: 'md',
    body: `
      <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="ss-title" value="${escHtml(sec.title)}"></div>
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ss-surface" ${sec.surface_on_card?'checked':''}> Surface incomplete items on family card</label></div>
      <hr class="divider">
      <div class="cond-editor">
        <div class="cond-editor-title">Conditional Logic (optional)</div>
        ${renderCondEditor(sec, editingItems)}
      </div>`,
    footer: `<button class="btn btn-ghost" id="ss-cancel">Cancel</button><button class="btn btn-primary" id="ss-save">Save</button>`
  });
  document.getElementById('ss-cancel')?.addEventListener('click', closeModal);
  document.getElementById('ss-save')?.addEventListener('click', async () => {
    const title = document.getElementById('ss-title')?.value.trim();
    if (!title) { toast('Title required', 'error'); return; }
    const surface = document.getElementById('ss-surface')?.checked || false;
    const cond = readCondEditor();
    await db.from('template_sections').update({ title, surface_on_card: surface, conditional_logic: cond }).eq('id', sectionId);
    sec.title = title; sec.surface_on_card = surface; sec.conditional_logic = cond;
    closeModal();
    toast('Section updated', 'success');
    renderTemplateEditorView(document.getElementById('settings-content'));
  });
}

// ── CONDITIONAL LOGIC UI ──────────────────────────────────────
function renderCondEditor(target, allItems) {
  const logic = target.conditional_logic
    ? (typeof target.conditional_logic === 'string' ? JSON.parse(target.conditional_logic) : target.conditional_logic)
    : null;

  const operator = logic?.operator || 'AND';
  const rules = logic?.rules || [];

  const itemOptions = allItems
    .filter(i => i.variable_name && i.id !== target.id)
    .map(i => `<option value="${escHtml(i.variable_name)}">${escHtml(i.label.substring(0,50))}</option>`)
    .join('');

  const condTypes = [
    { value: 'completed', label: 'is completed / has any value' },
    { value: 'not_completed', label: 'is NOT completed / has no value' },
    { value: 'equals', label: 'equals value' },
    { value: 'not_equals', label: 'does not equal value' }
  ];

  const rulesHtml = rules.map((rule, idx) => `
    <div class="cond-rule" data-rule="${idx}">
      <select class="cond-select" data-rule-trigger="${idx}">
        <option value="">— Select trigger item —</option>
        ${allItems.filter(i => i.variable_name && i.id !== target.id).map(i =>
          `<option value="${escHtml(i.variable_name)}" ${rule.trigger_item_variable===i.variable_name?'selected':''}>${escHtml(i.label.substring(0,50))}</option>`
        ).join('')}
      </select>
      <select class="cond-select" data-rule-cond="${idx}" style="min-width:200px">
        ${condTypes.map(ct => `<option value="${ct.value}" ${rule.condition===ct.value?'selected':''}>${ct.label}</option>`).join('')}
      </select>
      <input class="cond-select" data-rule-value="${idx}" value="${escHtml(rule.value||'')}" placeholder="value…" style="${['equals','not_equals'].includes(rule.condition)?'':'display:none'}">
      <button class="cond-remove-rule" data-remove-rule="${idx}" title="Remove rule">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>`).join('');

  return `
    <p style="font-size:.8rem;color:var(--muted);margin-bottom:10px">Show this item/section only when these conditions are met:</p>
    <div class="cond-operator-row">
      <label style="font-size:.8rem;color:var(--slate)">Match:</label>
      <label class="radio-option ${operator==='AND'?'selected':''}" data-op="AND" style="font-size:.78rem;padding:4px 10px"><input type="radio" name="cond-op" value="AND" ${operator==='AND'?'checked':''}> All rules (AND)</label>
      <label class="radio-option ${operator==='OR'?'selected':''}" data-op="OR" style="font-size:.78rem;padding:4px 10px"><input type="radio" name="cond-op" value="OR" ${operator==='OR'?'checked':''}> Any rule (OR)</label>
    </div>
    <div id="cond-rules-list">${rulesHtml}</div>
    ${rules.length === 0 ? `<p style="font-size:.78rem;color:var(--muted);margin:8px 0">No conditions — item always shows. Add a rule to make it conditional.</p>` : ''}
    <button class="cond-add-rule" id="cond-add-rule-btn">+ Add rule</button>
    ${rules.length ? '' : `<div style="font-size:.75rem;color:var(--muted);margin-top:6px">Leave empty to always show this item.</div>`}`;
}

function readCondEditor() {
  const ruleEls = document.querySelectorAll('.cond-rule');
  if (!ruleEls.length) return null;

  const operatorEl = document.querySelector('input[name="cond-op"]:checked');
  const operator = operatorEl?.value || 'AND';
  const rules = [];

  ruleEls.forEach((el, idx) => {
    const trigger = el.querySelector(`[data-rule-trigger="${idx}"]`)?.value;
    const cond = el.querySelector(`[data-rule-cond="${idx}"]`)?.value;
    const value = el.querySelector(`[data-rule-value="${idx}"]`)?.value || '';
    if (trigger && cond) {
      rules.push({ trigger_item_variable: trigger, condition: cond, value });
    }
  });

  return rules.length ? { operator, rules } : null;
}

// ── ACCOUNT TAB ───────────────────────────────────────────────
function renderAccountTab() {
  const content = document.getElementById('settings-content');
  const user = currentUser;
  const name = user?.user_metadata?.full_name || '';
  const email = user?.email || '';

  content.innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.2rem;margin-bottom:16px">Account Settings</h2>
    <div class="card" style="max-width:480px">
      <div class="card-header">Profile</div>
      <div class="card-body">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="acc-name" value="${escHtml(name)}"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="acc-email" type="email" value="${escHtml(email)}" disabled style="opacity:.6"></div>
        <button class="btn btn-teal btn-sm" id="acc-save-name">Save Name</button>
      </div>
    </div>
    <div class="card" style="max-width:480px;margin-top:16px">
      <div class="card-header">Change Password</div>
      <div class="card-body">
        <div class="form-group"><label class="form-label">New Password</label><input class="form-input" id="acc-pw" type="password" placeholder="••••••••"></div>
        <div class="form-group"><label class="form-label">Confirm Password</label><input class="form-input" id="acc-pw2" type="password" placeholder="••••••••"></div>
        <button class="btn btn-teal btn-sm" id="acc-save-pw">Update Password</button>
      </div>
    </div>`;

  document.getElementById('acc-save-name')?.addEventListener('click', async () => {
    const name = document.getElementById('acc-name')?.value.trim();
    if (!name) return;
    const { error } = await db.auth.updateUser({ data: { full_name: name } });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('sidebar-name').textContent = name;
    const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    document.getElementById('sidebar-avatar').textContent = initials;
    toast('Name updated', 'success');
  });

  document.getElementById('acc-save-pw')?.addEventListener('click', async () => {
    const pw = document.getElementById('acc-pw')?.value;
    const pw2 = document.getElementById('acc-pw2')?.value;
    if (!pw || pw.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
    if (pw !== pw2) { toast('Passwords do not match', 'error'); return; }
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) { toast('Error: ' + error.message, 'error'); return; }
    document.getElementById('acc-pw').value = '';
    document.getElementById('acc-pw2').value = '';
    toast('Password updated', 'success');
  });
}
