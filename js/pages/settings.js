// ─── SETTINGS PAGE v3 ─────────────────────────────────────────
import { db } from '../supabase.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml } from '../utils/helpers.js';
import { labelToVariableName } from '../utils/variable-resolver.js';
import { getCurrentUser } from '../auth.js';
import { applyTheme, saveUserTheme } from '../app.js';

let currentUser = null, templates = [];
let activeTab = 'templates';

// Template editor state — persisted in memory so tab switching doesn't lose it
let editorTemplateId = null;
let editingTemplate = null;
let editingGroups = [], editingSections = [], editingItems = [], editingSubItems = [];
let editorOpen = false;

export async function renderSettings(params, container) {
  currentUser = await getCurrentUser();
  document.getElementById('topbar-actions').innerHTML = '';

  // If editor is open, restore it
  if (editorOpen && editorTemplateId) {
    renderEditorFullPage(container);
    return;
  }

  container.innerHTML = `
    <div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:20px">
      <div class="stab" data-tab="templates" style="padding:9px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='templates'?'var(--primary)':'transparent'};margin-bottom:-2px;color:${activeTab==='templates'?'var(--primary-dk)':'var(--muted)'}">Templates</div>
      <div class="stab" data-tab="appearance" style="padding:9px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='appearance'?'var(--primary)':'transparent'};margin-bottom:-2px;color:${activeTab==='appearance'?'var(--primary-dk)':'var(--muted)'}">Appearance</div>
      <div class="stab" data-tab="account" style="padding:9px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='account'?'var(--primary)':'transparent'};margin-bottom:-2px;color:${activeTab==='account'?'var(--primary-dk)':'var(--muted)'}">Account</div>
    </div>
    <div id="settings-content"></div>`;

  document.querySelectorAll('.stab').forEach(t => t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    renderSettings(params, container);
  }));

  if (activeTab==='templates') await renderTemplatesTab();
  else if (activeTab==='appearance') await renderAppearanceTab();
  else renderAccountTab();
}

// ── TEMPLATES TAB ─────────────────────────────────────────────
async function renderTemplatesTab() {
  const content = document.getElementById('settings-content');
  const { data } = await db.from('templates').select('*').order('name');
  templates = data||[];

  let counts = {};
  if (templates.length) {
    const ids = templates.map(t => t.id);
    const [{ data: secs },{ data: items },{ data: subs }] = await Promise.all([
      db.from('template_sections').select('id,template_id').in('template_id', ids),
      db.from('template_items').select('id,template_id').in('template_id', ids),
      db.from('template_sub_items').select('id,template_id').in('template_id', ids)
    ]);
    for (const t of templates) counts[t.id] = {
      sections:(secs||[]).filter(s=>s.template_id===t.id).length,
      items:(items||[]).filter(i=>i.template_id===t.id).length,
      subs:(subs||[]).filter(s=>s.template_id===t.id).length
    };
  }

  content.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-family:var(--font-serif);font-size:1.2rem">Checklist Templates</h2>
      <button class="btn btn-primary btn-sm" id="btn-new-tpl">+ New Template</button>
    </div>
    ${templates.length ? `<div class="template-list-grid">${templates.map(t=>`
      <div class="template-list-card">
        <div class="template-card-name">${escHtml(t.name)}</div>
        <div class="template-card-desc">${escHtml(t.description||'No description')}</div>
        <div class="template-card-stats">
          <span>${counts[t.id]?.sections||0} sections</span>
          <span>${counts[t.id]?.items||0} tasks</span>
          <span>${counts[t.id]?.subs||0} sub-tasks</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:12px">
          <button class="btn btn-primary btn-xs" data-edit-tpl="${t.id}">Edit</button>
          <button class="btn btn-ghost btn-xs" data-dupe-tpl="${t.id}">Duplicate</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--coral)" data-del-tpl="${t.id}">Delete</button>
        </div>
      </div>`).join('')}</div>`
    : `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No templates yet</div><div class="empty-desc">Create a template to standardize your workflow.</div></div>`}`;

  document.getElementById('btn-new-tpl')?.addEventListener('click', openNewTemplateModal);
  content.querySelectorAll('[data-edit-tpl]').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.editTpl)));
  content.querySelectorAll('[data-dupe-tpl]').forEach(btn => btn.addEventListener('click', () => duplicateTemplate(btn.dataset.dupeTpl)));
  content.querySelectorAll('[data-del-tpl]').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = templates.find(t=>t.id===btn.dataset.delTpl);
      confirmDialog({ title:'Delete Template', message:`Delete "${t?.name}"? Existing family checklists will not be affected.`, confirmText:'Delete Template', onConfirm: async () => {
        const { data: items } = await db.from('template_items').select('id').eq('template_id', btn.dataset.delTpl);
        if (items?.length) await db.from('template_sub_items').delete().in('item_id', items.map(i=>i.id));
        await db.from('template_items').delete().eq('template_id', btn.dataset.delTpl);
        await db.from('template_sections').delete().eq('template_id', btn.dataset.delTpl);
        await db.from('template_groups').delete().eq('template_id', btn.dataset.delTpl);
        await db.from('templates').delete().eq('id', btn.dataset.delTpl);
        toast('Template deleted', 'success');
        await renderTemplatesTab();
      }});
    });
  });
}

function openNewTemplateModal() {
  openModal({ title:'New Template', size:'sm', body:`
    <div class="form-group"><label class="form-label">Template Name *</label><input class="form-input" id="nt-name" placeholder="e.g. In-Person Arrangement"></div>
    <div class="form-group"><label class="form-label">Description</label><textarea class="form-textarea" id="nt-desc" placeholder="When to use this template…" style="min-height:55px"></textarea></div>`,
    footer:`<button class="btn btn-ghost" id="nt-cancel">Cancel</button><button class="btn btn-primary" id="nt-save">Create Template</button>`
  });
  document.getElementById('nt-cancel')?.addEventListener('click', closeModal);
  document.getElementById('nt-save')?.addEventListener('click', async () => {
    const name = document.getElementById('nt-name')?.value.trim();
    if (!name) { toast('Name required', 'error'); return; }
    const { data: t, error } = await db.from('templates').insert({ user_id:currentUser.id, name, description:document.getElementById('nt-desc')?.value||null }).select().single();
    if (error) { toast('Error: '+error.message, 'error'); return; }
    templates = [...templates, t];
    closeModal();
    toast('Template created', 'success');
    openEditor(t.id);
  });
}

async function duplicateTemplate(templateId) {
  const orig = templates.find(t=>t.id===templateId);
  const { data: newT } = await db.from('templates').insert({ user_id:currentUser.id, name:`${orig?.name} (Copy)`, description:orig?.description }).select().single();
  const [{ data: groups },{ data: sections },{ data: items },{ data: subs }] = await Promise.all([
    db.from('template_groups').select('*').eq('template_id',templateId).order('position'),
    db.from('template_sections').select('*').eq('template_id',templateId).order('position'),
    db.from('template_items').select('*').eq('template_id',templateId).order('position'),
    db.from('template_sub_items').select('*').eq('template_id',templateId).order('position')
  ]);
  const gm={},sm={},im={};
  for (const g of (groups||[])) { const {data:ng}=await db.from('template_groups').insert({template_id:newT.id,title:g.title,position:g.position}).select().single(); gm[g.id]=ng?.id; }
  for (const s of (sections||[])) { const {data:ns}=await db.from('template_sections').insert({template_id:newT.id,group_id:gm[s.group_id]||null,title:s.title,position:s.position,surface_on_card:s.surface_on_card,conditional_logic:s.conditional_logic}).select().single(); sm[s.id]=ns?.id; }
  for (const i of (items||[])) { const {data:ni}=await db.from('template_items').insert({template_id:newT.id,group_id:gm[i.group_id]||null,section_id:sm[i.section_id]||null,label:i.label,helper_text:i.helper_text,variable_name:i.variable_name,field_type:i.field_type,field_options:i.field_options,is_important:i.is_important,relative_due_days:i.relative_due_days,position:i.position,conditional_logic:i.conditional_logic}).select().single(); im[i.id]=ni?.id; }
  for (const s of (subs||[])) { if (im[s.item_id]) await db.from('template_sub_items').insert({template_id:newT.id,item_id:im[s.item_id],label:s.label,helper_text:s.helper_text,variable_name:s.variable_name,field_type:s.field_type,field_options:s.field_options,is_important:s.is_important,relative_due_days:s.relative_due_days,position:s.position,conditional_logic:s.conditional_logic}); }
  toast('Template duplicated','success');
  const { data } = await db.from('templates').select('*').order('name');
  templates = data||[];
  await renderTemplatesTab();
}

// ── TEMPLATE EDITOR (full page) ───────────────────────────────
async function openEditor(templateId) {
  editorTemplateId = templateId;
  editingTemplate = templates.find(t=>t.id===templateId)||(await db.from('templates').select('*').eq('id',templateId).single()).data;
  if (!editingTemplate) return;

  const [{ data: groups },{ data: sections },{ data: items },{ data: subs }] = await Promise.all([
    db.from('template_groups').select('*').eq('template_id',templateId).order('position'),
    db.from('template_sections').select('*').eq('template_id',templateId).order('position'),
    db.from('template_items').select('*').eq('template_id',templateId).order('position'),
    db.from('template_sub_items').select('*').eq('template_id',templateId).order('position')
  ]);
  editingGroups=groups||[]; editingSections=sections||[]; editingItems=items||[]; editingSubItems=subs||[];
  editorOpen = true;

  const container = document.getElementById('page-settings');
  renderEditorFullPage(container);
}

function renderEditorFullPage(container) {
  container.innerHTML = `
    <div class="tpl-editor">
      <div class="tpl-editor-topbar">
        <button class="btn btn-ghost btn-sm" id="btn-back-tpl">← Templates</button>
        <span class="tpl-editor-title">${escHtml(editingTemplate?.name||'')}</span>
        <button class="btn btn-primary btn-sm" id="btn-add-group">+ Add Group Header</button>
      </div>
      <div class="tpl-editor-body" id="tpl-editor-body">
        ${editingGroups.length ? editingGroups.map(g=>renderGroupEditor(g)).join('') :
          `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No group headers yet</div><div class="empty-desc">Add a group header like PRE-ARRANGEMENT to start building.</div></div>`}
      </div>
    </div>`;

  document.getElementById('btn-back-tpl')?.addEventListener('click', async () => {
    editorOpen = false;
    editorTemplateId = null;
    const { data } = await db.from('templates').select('*').order('name');
    templates = data||[];
    await renderTemplatesTab();
  });
  document.getElementById('btn-add-group')?.addEventListener('click', addGroup);
  bindEditorEvents(container);
}

function renderGroupEditor(group) {
  const groupSections = editingSections.filter(s=>s.group_id===group.id);
  const directItems = editingItems.filter(i=>i.group_id===group.id&&!i.section_id);
  return `<div class="tpl-group" id="bgroup-${group.id}" data-drag-id="${group.id}">
    <div class="tpl-group-header">
      <svg class="drag-handle" width="14" height="14" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <input class="tpl-group-title-input" value="${escHtml(group.title)}" data-group-title="${group.id}" placeholder="GROUP HEADER NAME…">
      <button class="btn btn-xs" style="background:rgba(255,255,255,.15);color:white;border:none;flex-shrink:0" data-add-sec-to="${group.id}">+ Section</button>
      <button class="btn-icon" style="color:rgba(255,255,255,.5)" data-del-group="${group.id}"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="tpl-direct-items">
      ${directItems.map(i=>renderItemRow(i, true)).join('')}
      <div class="tpl-add-row tpl-add-direct">
        <input class="tpl-add-input" placeholder="Add task directly to ${escHtml(group.title)}…" data-add-direct="${group.id}" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.8);::placeholder{color:rgba(255,255,255,.4)}">
        <button class="btn btn-xs" style="background:rgba(255,255,255,.15);color:white;border:none" data-save-direct="${group.id}">Add</button>
      </div>
    </div>
    ${groupSections.map(s=>renderSectionEditor(s)).join('')}
  </div>`;
}

function renderSectionEditor(sec) {
  const secItems = editingItems.filter(i=>i.section_id===sec.id);
  return `<div class="tpl-section" id="bsec-${sec.id}" data-drag-id="${sec.id}">
    <div class="tpl-section-header">
      <svg class="drag-handle" width="12" height="12" fill="none" stroke="var(--muted)" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <input class="tpl-sec-title-input" value="${escHtml(sec.title)}" data-sec-title="${sec.id}" placeholder="Section title…">
      ${sec.surface_on_card?`<span class="section-surface-badge">on card</span>`:''}
      ${sec.conditional_logic?`<span class="section-cond-badge">conditional</span>`:''}
      <button class="btn-icon" data-edit-sec="${sec.id}" title="Section settings"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
      <button class="btn-icon" style="color:var(--coral)" data-del-sec="${sec.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="tpl-items" id="bsec-items-${sec.id}">
      ${secItems.map(i=>renderItemRow(i, false)).join('')}
    </div>
    <div class="tpl-add-row">
      <input class="tpl-add-input" placeholder="Add task…" data-add-to-sec="${sec.id}">
      <button class="btn btn-ghost btn-xs" data-save-to-sec="${sec.id}">Add</button>
    </div>
  </div>`;
}

function renderItemRow(item, isDirect) {
  const subs = editingSubItems.filter(s=>s.item_id===item.id);
  const rowClass = isDirect ? 'tpl-direct-item' : 'tpl-item';
  const inputClass = isDirect ? 'tpl-direct-item-label' : 'tpl-item-label';
  const textColor = isDirect ? 'color:white' : 'color:var(--navy)';
  const bg = isDirect ? 'background:rgba(255,255,255,.06)' : 'background:var(--white)';
  const borderColor = isDirect ? 'border-bottom:1px solid rgba(255,255,255,.08)' : 'border-bottom:1px solid var(--border)';
  return `<div class="${rowClass}" id="bitem-${item.id}" data-drag-id="${item.id}" style="${bg};${borderColor}">
    <div style="display:flex;align-items:center;gap:6px;padding:7px 12px">
      <svg class="drag-handle" width="12" height="12" fill="none" stroke="${isDirect?'rgba(255,255,255,.4)':'var(--border-dk)'}" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
      <input class="${inputClass}" value="${escHtml(item.label)}" data-item-label="${item.id}" placeholder="Task label…" style="flex:1;border:none;font-size:.82rem;${textColor};outline:none;${isDirect?'background:transparent':'background:transparent'}">
      ${item.is_important?`<svg width="11" height="11" fill="var(--coral)" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`:''}
      ${item.variable_name?`<span style="font-size:.68rem;color:${isDirect?'rgba(255,255,255,.5)':'var(--violet)'};font-family:var(--font-mono)">${item.variable_name}</span>`:''}
      ${item.field_type?`<span style="font-size:.68rem;color:${isDirect?'rgba(255,255,255,.4)':'var(--muted)'};background:${isDirect?'rgba(255,255,255,.1)':'var(--surface)'};padding:1px 5px;border-radius:4px">${item.field_type}</span>`:''}
      ${item.conditional_logic?`<span style="font-size:.68rem;color:${isDirect?'rgba(255,255,255,.5)':'var(--violet)'}" title="Has conditional logic">⟳</span>`:''}
      <button class="btn-icon" style="color:${isDirect?'rgba(255,255,255,.6)':'var(--slate)'}" data-edit-item="${item.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
      <button class="btn-icon" style="color:${isDirect?'rgba(255,255,255,.4)':'var(--coral)'}" data-del-item="${item.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="tpl-sub-items" id="bsubs-${item.id}" style="padding-left:28px;background:${isDirect?'rgba(255,255,255,.03)':'#fafaf8'}">
      ${subs.map(s=>renderSubRow(s, isDirect)).join('')}
    </div>
    <div class="tpl-add-row" style="padding-left:28px;background:${isDirect?'rgba(255,255,255,.02)':'#fafaf8'}">
      <input class="tpl-add-input" placeholder="Add sub-task…" data-add-sub="${item.id}" style="${isDirect?'background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:rgba(255,255,255,.8)':''}">
      <button class="btn btn-ghost btn-xs" data-save-sub="${item.id}" style="${isDirect?'color:rgba(255,255,255,.7);border-color:rgba(255,255,255,.3)':''}">Add</button>
    </div>
  </div>`;
}

function renderSubRow(sub, isDirect) {
  return `<div class="tpl-sub-item" id="bsub-${sub.id}" data-drag-id="${sub.id}" style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid ${isDirect?'rgba(255,255,255,.06)':'var(--border)'}">
    <svg class="drag-handle" width="11" height="11" fill="none" stroke="${isDirect?'rgba(255,255,255,.3)':'var(--border-dk)'}" stroke-width="2" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/></svg>
    <input class="tpl-sub-label" value="${escHtml(sub.label)}" data-sub-label="${sub.id}" placeholder="Sub-task…" style="flex:1;border:none;font-size:.78rem;${isDirect?'color:rgba(255,255,255,.8)':'color:var(--navy)'};outline:none;background:transparent">
    ${sub.variable_name?`<span style="font-size:.65rem;color:${isDirect?'rgba(255,255,255,.4)':'var(--violet)'};font-family:var(--font-mono)">${sub.variable_name}</span>`:''}
    ${sub.field_type?`<span style="font-size:.65rem;color:${isDirect?'rgba(255,255,255,.35)':'var(--muted)'};background:${isDirect?'rgba(255,255,255,.08)':'var(--surface)'};padding:1px 4px;border-radius:3px">${sub.field_type}</span>`:''}
    <button class="btn-icon" style="color:${isDirect?'rgba(255,255,255,.5)':'var(--slate)'}" data-edit-sub="${sub.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="btn-icon" style="color:${isDirect?'rgba(255,255,255,.35)':'var(--coral)'}" data-del-sub="${sub.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>`;
}

function bindEditorEvents(container) {
  // Blur saves for titles
  container.querySelectorAll('[data-group-title]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_groups').update({title:input.value}).eq('id',input.dataset.groupTitle); const g=editingGroups.find(g=>g.id===input.dataset.groupTitle); if(g) g.title=input.value; }));
  container.querySelectorAll('[data-sec-title]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_sections').update({title:input.value}).eq('id',input.dataset.secTitle); const s=editingSections.find(s=>s.id===input.dataset.secTitle); if(s) s.title=input.value; }));
  container.querySelectorAll('[data-item-label]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_items').update({label:input.value}).eq('id',input.dataset.itemLabel); const i=editingItems.find(i=>i.id===input.dataset.itemLabel); if(i) i.label=input.value; }));
  container.querySelectorAll('[data-sub-label]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_sub_items').update({label:input.value}).eq('id',input.dataset.subLabel); const s=editingSubItems.find(s=>s.id===input.dataset.subLabel); if(s) s.label=input.value; }));

  // Add/delete
  container.querySelector('#btn-add-group')?.addEventListener('click', addGroup);
  container.querySelectorAll('[data-del-group]').forEach(btn => btn.addEventListener('click', () => deleteGroup(btn.dataset.delGroup)));
  container.querySelectorAll('[data-add-sec-to]').forEach(btn => btn.addEventListener('click', () => addSection(btn.dataset.addSecTo)));
  container.querySelectorAll('[data-edit-sec]').forEach(btn => btn.addEventListener('click', () => openSectionModal(btn.dataset.editSec)));
  container.querySelectorAll('[data-del-sec]').forEach(btn => btn.addEventListener('click', () => deleteSection(btn.dataset.delSec)));

  // Add items - Enter or button
  const addDirect = (groupId, input) => { if(input?.value.trim()) addDirectItem(groupId, input.value.trim(), input); };
  const addToSec = (secId, input) => { if(input?.value.trim()) addSectionItem(secId, input.value.trim(), input); };
  const addSub = (itemId, input) => { if(input?.value.trim()) addSubItem(itemId, input.value.trim(), input); };

  container.querySelectorAll('[data-save-direct]').forEach(btn => { btn.addEventListener('click', () => { const input=container.querySelector(`[data-add-direct="${btn.dataset.saveDirect}"]`); addDirect(btn.dataset.saveDirect, input); }); });
  container.querySelectorAll('[data-add-direct]').forEach(input => { input.addEventListener('keydown', e => { if(e.key==='Enter') addDirect(input.dataset.addDirect, input); }); });
  container.querySelectorAll('[data-save-to-sec]').forEach(btn => { btn.addEventListener('click', () => { const input=container.querySelector(`[data-add-to-sec="${btn.dataset.saveToSec}"]`); addToSec(btn.dataset.saveToSec, input); }); });
  container.querySelectorAll('[data-add-to-sec]').forEach(input => { input.addEventListener('keydown', e => { if(e.key==='Enter') addToSec(input.dataset.addToSec, input); }); });
  container.querySelectorAll('[data-save-sub]').forEach(btn => { btn.addEventListener('click', () => { const input=container.querySelector(`[data-add-sub="${btn.dataset.saveSub}"]`); addSub(btn.dataset.saveSub, input); }); });
  container.querySelectorAll('[data-add-sub]').forEach(input => { input.addEventListener('keydown', e => { if(e.key==='Enter') addSub(input.dataset.addSub, input); }); });

  container.querySelectorAll('[data-edit-item]').forEach(btn => btn.addEventListener('click', () => openItemModal(btn.dataset.editItem)));
  container.querySelectorAll('[data-del-item]').forEach(btn => btn.addEventListener('click', () => deleteItem(btn.dataset.delItem)));
  container.querySelectorAll('[data-edit-sub]').forEach(btn => btn.addEventListener('click', () => openSubModal(btn.dataset.editSub)));
  container.querySelectorAll('[data-del-sub]').forEach(btn => btn.addEventListener('click', () => deleteSub(btn.dataset.delSub)));
}

// ── CRUD ──────────────────────────────────────────────────────
async function addGroup() {
  const maxPos = editingGroups.length ? Math.max(...editingGroups.map(g=>g.position)) : -1;
  const { data: g } = await db.from('template_groups').insert({template_id:editingTemplate.id,title:'NEW GROUP',position:maxPos+1}).select().single();
  if (g) { editingGroups.push(g); renderEditorFullPage(document.getElementById('page-settings')); }
}
async function deleteGroup(id) {
  confirmDialog({ title:'Delete Group', message:'Delete this group and all its content?', confirmText:'Delete', onConfirm: async () => {
    const itemIds = editingItems.filter(i=>i.group_id===id).map(i=>i.id);
    if (itemIds.length) await db.from('template_sub_items').delete().in('item_id', itemIds);
    await db.from('template_items').delete().eq('group_id', id);
    await db.from('template_sections').delete().eq('group_id', id);
    await db.from('template_groups').delete().eq('id', id);
    editingGroups=editingGroups.filter(g=>g.id!==id);
    editingSections=editingSections.filter(s=>s.group_id!==id);
    editingItems=editingItems.filter(i=>i.group_id!==id);
    renderEditorFullPage(document.getElementById('page-settings'));
  }});
}
async function addSection(groupId) {
  const maxPos = editingSections.filter(s=>s.group_id===groupId).length ? Math.max(...editingSections.filter(s=>s.group_id===groupId).map(s=>s.position)) : -1;
  const { data: s } = await db.from('template_sections').insert({template_id:editingTemplate.id,group_id:groupId,title:'New Section',position:maxPos+1,surface_on_card:false}).select().single();
  if (s) { editingSections.push(s); renderEditorFullPage(document.getElementById('page-settings')); }
}
async function deleteSection(id) {
  const itemIds = editingItems.filter(i=>i.section_id===id).map(i=>i.id);
  if (itemIds.length) { await db.from('template_sub_items').delete().in('item_id',itemIds); await db.from('template_items').delete().eq('section_id',id); }
  await db.from('template_sections').delete().eq('id',id);
  editingSections=editingSections.filter(s=>s.id!==id);
  editingItems=editingItems.filter(i=>i.section_id!==id);
  renderEditorFullPage(document.getElementById('page-settings'));
}
async function addDirectItem(groupId, label, inputEl) {
  const existing = editingItems.filter(i=>i.group_id===groupId&&!i.section_id);
  const maxPos = existing.length ? Math.max(...existing.map(i=>i.position)) : -1;
  const varName = labelToVariableName(label);
  const { data: i } = await db.from('template_items').insert({template_id:editingTemplate.id,group_id:groupId,section_id:null,label,field_type:null,variable_name:varName,position:maxPos+1,is_important:false}).select().single();
  if (i) { editingItems.push(i); if(inputEl) inputEl.value=''; renderEditorFullPage(document.getElementById('page-settings')); }
}
async function addSectionItem(sectionId, label, inputEl) {
  const sec = editingSections.find(s=>s.id===sectionId);
  const existing = editingItems.filter(i=>i.section_id===sectionId);
  const maxPos = existing.length ? Math.max(...existing.map(i=>i.position)) : -1;
  const varName = labelToVariableName(label);
  const { data: i } = await db.from('template_items').insert({template_id:editingTemplate.id,group_id:sec?.group_id||null,section_id:sectionId,label,field_type:null,variable_name:varName,position:maxPos+1,is_important:false}).select().single();
  if (i) { editingItems.push(i); if(inputEl) inputEl.value=''; renderEditorFullPage(document.getElementById('page-settings')); }
}
async function addSubItem(itemId, label, inputEl) {
  const existing = editingSubItems.filter(s=>s.item_id===itemId);
  const maxPos = existing.length ? Math.max(...existing.map(s=>s.position)) : -1;
  const varName = labelToVariableName(label);
  const { data: s } = await db.from('template_sub_items').insert({template_id:editingTemplate.id,item_id:itemId,label,field_type:null,variable_name:varName,position:maxPos+1,is_important:false}).select().single();
  if (s) { editingSubItems.push(s); if(inputEl) inputEl.value=''; renderEditorFullPage(document.getElementById('page-settings')); }
}
async function deleteItem(id) {
  await db.from('template_sub_items').delete().eq('item_id',id);
  await db.from('template_items').delete().eq('id',id);
  editingItems=editingItems.filter(i=>i.id!==id);
  editingSubItems=editingSubItems.filter(s=>s.item_id!==id);
  renderEditorFullPage(document.getElementById('page-settings'));
}
async function deleteSub(id) {
  await db.from('template_sub_items').delete().eq('id',id);
  editingSubItems=editingSubItems.filter(s=>s.id!==id);
  renderEditorFullPage(document.getElementById('page-settings'));
}

// ── FIELD TYPES (#3, #25) ─────────────────────────────────────
const FIELD_TYPES = [
  ['yes_no','Yes / No'],
  ['radio','Choose from list (Radio)'],
  ['dropdown','Dropdown'],
  ['short_text','Short Text'],
  ['long_text','Long Text'],
  ['number','Number'],
  ['currency','Currency ($)'],
  ['dc_quantity','Death Certificate Quantity'],
  ['date','Date'],
  ['datetime','Date & Time'],
  ['phone','Phone Number'],
  ['email','Email Address']
];

function itemModalBody(item) {
  const opts = item.field_options?.options||[];
  const hasFieldType = item.field_type && item.field_type !== 'checkbox';
  const isRadio = item.field_type==='radio'||item.field_type==='dropdown';

  // Only show data-capturing items as variable references (#24)
  const dataItems = [...editingItems, ...editingSubItems].filter(i =>
    i.id !== item.id && i.variable_name && i.field_type && i.field_type !== 'checkbox'
  );

  const varOptions = dataItems.map(i =>
    `<option value="${escHtml(i.variable_name)}">${escHtml(i.label.substring(0,45))} — {{${escHtml(i.variable_name)}}}</option>`
  ).join('');

  return `
    <div class="form-group"><label class="form-label">Label *</label><input class="form-input" id="im-label" value="${escHtml(item.label)}"></div>
    <div class="form-group">
      <label class="form-label">Helper / Instruction Text</label>
      <div style="display:flex;gap:6px;align-items:flex-start">
        <textarea class="form-textarea" id="im-helper" placeholder="Context shown below the label. Use {{variable}} to reference entered values." style="min-height:55px;flex:1">${escHtml(item.helper_text||'')}</textarea>
        ${varOptions?`<div style="position:relative;flex-shrink:0">
          <button class="btn btn-ghost btn-xs" id="var-picker-btn" style="color:var(--violet-dk);white-space:nowrap">{ } Insert ref</button>
          <div id="var-picker-dropdown" style="display:none;position:absolute;top:100%;right:0;z-index:200;background:var(--white);border:1px solid var(--border-dk);border-radius:var(--radius);box-shadow:0 4px 16px rgba(0,0,0,.1);min-width:260px;max-height:180px;overflow-y:auto">
            ${dataItems.map(i=>`<div class="var-picker-option" data-var="${escHtml(i.variable_name)}" style="padding:7px 12px;cursor:pointer;font-size:.78rem;border-bottom:1px solid var(--border)">
              <div style="color:var(--navy)">${escHtml(i.label.substring(0,45))}</div>
              <div style="color:var(--violet);font-family:var(--font-mono);font-size:.7rem">{{${escHtml(i.variable_name)}}}</div>
            </div>`).join('')}
          </div>
        </div>`:''}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Field Type <span style="color:var(--muted);font-weight:400">(optional)</span></label>
        <select class="form-select" id="im-type">
          <option value="">— None (checkbox only) —</option>
          ${FIELD_TYPES.map(([v,l])=>`<option value="${v}" ${item.field_type===v?'selected':''}>${l}</option>`).join('')}
        </select>
        <div class="form-hint">Only select if this task needs to capture information</div>
      </div>
      <div class="form-group">
        <label class="form-label">Variable Name <span style="color:var(--muted);font-weight:400">(optional)</span></label>
        <input class="form-input" id="im-varname" value="${escHtml(item.variable_name||'')}" placeholder="auto-generated">
        <div class="form-hint">Required to use {{references}} in other tasks</div>
      </div>
    </div>
    <div class="form-group" id="im-options-group" style="${isRadio?'':'display:none'}">
      <label class="form-label">Options (one per line)</label>
      <textarea class="form-textarea" id="im-options" style="min-height:70px">${opts.join('\n')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="im-important" ${item.is_important?'checked':''}> Mark as important (shows on family card)</label></div>
      <div class="form-group"><label class="form-label">Due (days from case creation)</label><input class="form-input" id="im-due" type="number" min="0" value="${item.relative_due_days??''}" placeholder="e.g. 3" style="max-width:90px"></div>
    </div>
    <hr class="divider">
    <div class="form-group">
      <label class="form-label">Conditional Logic <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      ${renderCondLogicEditor(item)}
    </div>`;
}

function renderCondLogicEditor(item) {
  const logic = item.conditional_logic ? (typeof item.conditional_logic==='string'?JSON.parse(item.conditional_logic):item.conditional_logic) : null;
  const rules = logic?.rules||[];
  const operator = logic?.operator||'AND';
  const allVarItems = [...editingItems, ...editingSubItems].filter(i => i.id!==item.id && i.variable_name);

  if (!allVarItems.length) return `<div style="font-size:.78rem;color:var(--muted)">Add tasks with variable names first to set up conditional logic.</div>`;

  return `<div style="background:var(--surface);border-radius:var(--radius);padding:12px">
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">Show this item only when these conditions are met. Leave empty to always show.</p>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <span style="font-size:.78rem;color:var(--slate)">Match:</span>
      <label class="radio-option ${operator==='AND'?'selected':''}" style="font-size:.75rem;padding:3px 9px"><input type="radio" name="cond-op" value="AND" ${operator==='AND'?'checked':''}> All (AND)</label>
      <label class="radio-option ${operator==='OR'?'selected':''}" style="font-size:.75rem;padding:3px 9px"><input type="radio" name="cond-op" value="OR" ${operator==='OR'?'checked':''}> Any (OR)</label>
    </div>
    <div id="cond-rules">
      ${rules.map((r,idx)=>`<div class="cond-rule" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
        <select class="cond-select" data-rule-trigger="${idx}">
          <option value="">— Select trigger —</option>
          ${allVarItems.map(i=>`<option value="${escHtml(i.variable_name)}" ${r.trigger_item_variable===i.variable_name?'selected':''}>${escHtml(i.label.substring(0,40))}</option>`).join('')}
        </select>
        <select class="cond-select" data-rule-cond="${idx}">
          <option value="completed" ${r.condition==='completed'?'selected':''}>is completed</option>
          <option value="not_completed" ${r.condition==='not_completed'?'selected':''}>is not completed</option>
          <option value="equals" ${r.condition==='equals'?'selected':''}>equals</option>
          <option value="not_equals" ${r.condition==='not_equals'?'selected':''}>does not equal</option>
        </select>
        <input class="cond-select" data-rule-value="${idx}" value="${escHtml(r.value||'')}" placeholder="value…" style="${['equals','not_equals'].includes(r.condition)?'':'display:none'}">
        <button class="btn-icon" style="color:var(--coral)" data-remove-rule="${idx}"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      </div>`).join('')}
    </div>
    <button class="cond-add-rule" id="cond-add-rule">+ Add condition</button>
  </div>`;
}

function readCondLogic() {
  const ruleEls = document.querySelectorAll('.cond-rule');
  if (!ruleEls.length) return null;
  const operator = document.querySelector('input[name="cond-op"]:checked')?.value||'AND';
  const rules = [];
  ruleEls.forEach((el, idx) => {
    const trigger = el.querySelector(`[data-rule-trigger="${idx}"]`)?.value;
    const cond = el.querySelector(`[data-rule-cond="${idx}"]`)?.value;
    const value = el.querySelector(`[data-rule-value="${idx}"]`)?.value||'';
    if (trigger && cond) rules.push({ trigger_item_variable:trigger, condition:cond, value });
  });
  return rules.length ? { operator, rules } : null;
}

function bindCondLogicEditor() {
  // Toggle value input based on condition type
  document.querySelectorAll('[data-rule-cond]').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = sel.dataset.ruleCond;
      const valInput = document.querySelector(`[data-rule-value="${idx}"]`);
      if (valInput) valInput.style.display = ['equals','not_equals'].includes(sel.value) ? '' : 'none';
    });
  });
  // Remove rule
  document.querySelectorAll('[data-remove-rule]').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.cond-rule')?.remove();
    });
  });
  // Add rule
  document.getElementById('cond-add-rule')?.addEventListener('click', () => {
    const rulesDiv = document.getElementById('cond-rules');
    const idx = rulesDiv.querySelectorAll('.cond-rule').length;
    const allVarItems = [...editingItems, ...editingSubItems].filter(i => i.variable_name);
    const div = document.createElement('div');
    div.className = 'cond-rule';
    div.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap';
    div.innerHTML = `
      <select class="cond-select" data-rule-trigger="${idx}">
        <option value="">— Select trigger —</option>
        ${allVarItems.map(i=>`<option value="${escHtml(i.variable_name)}">${escHtml(i.label.substring(0,40))}</option>`).join('')}
      </select>
      <select class="cond-select" data-rule-cond="${idx}">
        <option value="completed">is completed</option>
        <option value="not_completed">is not completed</option>
        <option value="equals">equals</option>
        <option value="not_equals">does not equal</option>
      </select>
      <input class="cond-select" data-rule-value="${idx}" placeholder="value…" style="display:none">
      <button class="btn-icon" style="color:var(--coral)" data-remove-rule="${idx}"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    rulesDiv.appendChild(div);
    bindCondLogicEditor();
  });
}

function openItemModal(itemId) {
  const item = editingItems.find(i=>i.id===itemId);
  if (!item) return;
  openModal({ title:'Edit Task', size:'lg', body:itemModalBody(item), footer:`<button class="btn btn-ghost" id="im-cancel">Cancel</button><button class="btn btn-primary" id="im-save">Save</button>` });
  bindItemModalEvents(itemId, item, 'template_items');
}
function openSubModal(subId) {
  const sub = editingSubItems.find(s=>s.id===subId);
  if (!sub) return;
  openModal({ title:'Edit Sub-task', size:'lg', body:itemModalBody(sub), footer:`<button class="btn btn-ghost" id="im-cancel">Cancel</button><button class="btn btn-primary" id="im-save">Save</button>` });
  bindItemModalEvents(subId, sub, 'template_sub_items');
}

function bindItemModalEvents(id, item, table) {
  document.getElementById('im-cancel')?.addEventListener('click', closeModal);
  document.getElementById('im-type')?.addEventListener('change', e => {
    document.getElementById('im-options-group').style.display = (e.target.value==='radio'||e.target.value==='dropdown') ? 'block' : 'none';
  });
  // Variable picker
  const vpBtn = document.getElementById('var-picker-btn');
  const vpDrop = document.getElementById('var-picker-dropdown');
  vpBtn?.addEventListener('click', e => { e.stopPropagation(); vpDrop.style.display = vpDrop.style.display==='none'?'block':'none'; });
  document.querySelectorAll('.var-picker-option').forEach(opt => {
    opt.addEventListener('mouseenter', () => opt.style.background='var(--surface)');
    opt.addEventListener('mouseleave', () => opt.style.background='');
    opt.addEventListener('click', () => {
      const ta = document.getElementById('im-helper');
      if (ta) { const pos=ta.selectionStart; ta.value=ta.value.slice(0,pos)+`{{${opt.dataset.var}}}`+ta.value.slice(pos); }
      vpDrop.style.display='none';
    });
  });
  document.addEventListener('click', e => { if(!vpBtn?.contains(e.target)&&!vpDrop?.contains(e.target)) { if(vpDrop) vpDrop.style.display='none'; } }, { once: false });
  bindCondLogicEditor();
  document.getElementById('im-save')?.addEventListener('click', async () => {
    const label = document.getElementById('im-label')?.value.trim();
    if (!label) { toast('Label required','error'); return; }
    const ft = document.getElementById('im-type')?.value||null;
    const isRadio = ft==='radio'||ft==='dropdown';
    const opts = isRadio ? (document.getElementById('im-options')?.value||'').split('\n').map(o=>o.trim()).filter(Boolean) : [];
    const varName = document.getElementById('im-varname')?.value.trim() || (ft ? labelToVariableName(label) : null);
    const updates = {
      label,
      helper_text: document.getElementById('im-helper')?.value||null,
      field_type: ft,
      variable_name: varName,
      field_options: opts.length?{options:opts}:null,
      is_important: document.getElementById('im-important')?.checked||false,
      relative_due_days: document.getElementById('im-due')?.value?parseInt(document.getElementById('im-due').value):null,
      conditional_logic: readCondLogic()
    };
    await db.from(table).update(updates).eq('id', id);
    Object.assign(item, updates);
    closeModal(); toast('Saved','success');
    renderEditorFullPage(document.getElementById('page-settings'));
  });
}

function openSectionModal(sectionId) {
  const sec = editingSections.find(s=>s.id===sectionId);
  if (!sec) return;
  const allVarItems = [...editingItems, ...editingSubItems].filter(i => i.variable_name);
  const logic = sec.conditional_logic?(typeof sec.conditional_logic==='string'?JSON.parse(sec.conditional_logic):sec.conditional_logic):null;
  const rules = logic?.rules||[];
  const operator = logic?.operator||'AND';
  openModal({ title:'Section Settings', size:'md', body:`
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="ss-title" value="${escHtml(sec.title)}"></div>
    <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="ss-surface" ${sec.surface_on_card?'checked':''}> Surface incomplete items on family card</label></div>
    <hr class="divider">
    <div class="form-group">
      <label class="form-label">Conditional Logic <span style="color:var(--muted);font-weight:400">(optional)</span></label>
      ${allVarItems.length ? `<div style="background:var(--surface);border-radius:var(--radius);padding:12px">
        <p style="font-size:.78rem;color:var(--muted);margin-bottom:10px">Show this section only when these conditions are met.</p>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <label class="radio-option ${operator==='AND'?'selected':''}" style="font-size:.75rem;padding:3px 9px"><input type="radio" name="cond-op" value="AND" ${operator==='AND'?'checked':''}> All (AND)</label>
          <label class="radio-option ${operator==='OR'?'selected':''}" style="font-size:.75rem;padding:3px 9px"><input type="radio" name="cond-op" value="OR" ${operator==='OR'?'checked':''}> Any (OR)</label>
        </div>
        <div id="cond-rules">
          ${rules.map((r,idx)=>`<div class="cond-rule" style="display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap">
            <select class="cond-select" data-rule-trigger="${idx}"><option value="">— Select trigger —</option>${allVarItems.map(i=>`<option value="${escHtml(i.variable_name)}" ${r.trigger_item_variable===i.variable_name?'selected':''}>${escHtml(i.label.substring(0,40))}</option>`).join('')}</select>
            <select class="cond-select" data-rule-cond="${idx}"><option value="completed" ${r.condition==='completed'?'selected':''}>is completed</option><option value="not_completed" ${r.condition==='not_completed'?'selected':''}>is not completed</option><option value="equals" ${r.condition==='equals'?'selected':''}>equals</option><option value="not_equals" ${r.condition==='not_equals'?'selected':''}>does not equal</option></select>
            <input class="cond-select" data-rule-value="${idx}" value="${escHtml(r.value||'')}" placeholder="value…" style="${['equals','not_equals'].includes(r.condition)?'':'display:none'}">
            <button class="btn-icon" style="color:var(--coral)" data-remove-rule="${idx}"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
          </div>`).join('')}
        </div>
        <button class="cond-add-rule" id="cond-add-rule">+ Add condition</button>
      </div>` : `<div style="font-size:.78rem;color:var(--muted)">Add tasks with variable names first.</div>`}
    </div>`,
    footer:`<button class="btn btn-ghost" id="ss-cancel">Cancel</button><button class="btn btn-primary" id="ss-save">Save</button>`
  });
  document.getElementById('ss-cancel')?.addEventListener('click', closeModal);
  bindCondLogicEditor();
  document.getElementById('ss-save')?.addEventListener('click', async () => {
    const title = document.getElementById('ss-title')?.value.trim();
    if (!title) { toast('Title required','error'); return; }
    const surface = document.getElementById('ss-surface')?.checked||false;
    const cond = readCondLogic();
    await db.from('template_sections').update({title,surface_on_card:surface,conditional_logic:cond}).eq('id',sectionId);
    sec.title=title; sec.surface_on_card=surface; sec.conditional_logic=cond;
    closeModal(); toast('Section updated','success');
    renderEditorFullPage(document.getElementById('page-settings'));
  });
}

// ── APPEARANCE TAB ────────────────────────────────────────────
async function renderAppearanceTab() {
  const content = document.getElementById('settings-content');
  const themes = [
    {id:'forest',name:'Forest',color:'#1D9E75'},{id:'ocean',name:'Ocean',color:'#2563EB'},
    {id:'violet',name:'Violet',color:'#7C3AED'},{id:'midnight',name:'Midnight',color:'#1E293B'},
    {id:'crimson',name:'Crimson',color:'#DC2626'},{id:'warm',name:'Warm',color:'#B45309'},
    {id:'rose',name:'Rose',color:'#E11D48'},{id:'emerald',name:'Emerald',color:'#059669'},
    {id:'slate',name:'Slate',color:'#475569'},{id:'graphite',name:'Graphite',color:'#374151'}
  ];
  const currentTheme = document.documentElement.getAttribute('data-theme')||'forest';
  content.innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.2rem;margin-bottom:6px">Appearance</h2>
    <p style="font-size:.82rem;color:var(--muted);margin-bottom:16px">Choose a color theme. Your selection is saved to your account.</p>
    <div class="theme-grid">
      ${themes.map(t=>`<div class="theme-swatch ${t.id===currentTheme?'active':''}" data-theme-id="${t.id}">
        <div class="theme-swatch-color" style="background:${t.color}"></div>
        <div class="theme-swatch-name">${t.name}</div>
      </div>`).join('')}
    </div>`;
  content.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.addEventListener('click', async () => {
      content.querySelectorAll('.theme-swatch').forEach(s=>s.classList.remove('active'));
      swatch.classList.add('active');
      await saveUserTheme(currentUser.id, swatch.dataset.themeId);
      toast('Theme saved','success');
    });
  });
}

// ── ACCOUNT TAB ───────────────────────────────────────────────
function renderAccountTab() {
  const content = document.getElementById('settings-content');
  const name = currentUser?.user_metadata?.full_name||'';
  const email = currentUser?.email||'';
  content.innerHTML = `
    <h2 style="font-family:var(--font-serif);font-size:1.2rem;margin-bottom:16px">Account Settings</h2>
    <div class="card" style="max-width:460px;border:1px solid var(--border);border-radius:var(--radius-lg)">
      <div style="background:var(--surface);padding:8px 14px;font-size:.72rem;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.05em">Profile</div>
      <div style="padding:14px">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="acc-name" value="${escHtml(name)}"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" value="${escHtml(email)}" disabled style="opacity:.6"></div>
        <button class="btn btn-primary btn-sm" id="acc-save-name">Save Name</button>
      </div>
    </div>
    <div class="card" style="max-width:460px;margin-top:16px;border:1px solid var(--border);border-radius:var(--radius-lg)">
      <div style="background:var(--surface);padding:8px 14px;font-size:.72rem;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.05em">Change Password</div>
      <div style="padding:14px">
        <div class="form-group"><label class="form-label">New Password</label><input class="form-input" id="acc-pw" type="password" placeholder="••••••••"></div>
        <div class="form-group"><label class="form-label">Confirm Password</label><input class="form-input" id="acc-pw2" type="password" placeholder="••••••••"></div>
        <button class="btn btn-primary btn-sm" id="acc-save-pw">Update Password</button>
      </div>
    </div>`;
  document.getElementById('acc-save-name')?.addEventListener('click', async () => {
    const name = document.getElementById('acc-name')?.value.trim();
    if (!name) return;
    const { error } = await db.auth.updateUser({ data:{full_name:name} });
    if (error) { toast('Error: '+error.message,'error'); return; }
    document.getElementById('sidebar-name').textContent = name.split(' ')[0];
    toast('Name updated','success');
  });
  document.getElementById('acc-save-pw')?.addEventListener('click', async () => {
    const pw = document.getElementById('acc-pw')?.value;
    const pw2 = document.getElementById('acc-pw2')?.value;
    if (!pw||pw.length<8) { toast('Password must be at least 8 characters','error'); return; }
    if (pw!==pw2) { toast('Passwords do not match','error'); return; }
    const { error } = await db.auth.updateUser({ password:pw });
    if (error) { toast('Error: '+error.message,'error'); return; }
    document.getElementById('acc-pw').value='';
    document.getElementById('acc-pw2').value='';
    toast('Password updated','success');
  });
}
