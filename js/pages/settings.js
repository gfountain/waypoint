// ─── SETTINGS PAGE v2 ─────────────────────────────────────────
import { db } from '../supabase.js';
import { openModal, closeModal, confirmDialog } from '../components/modal.js';
import { toast } from '../components/toast.js';
import { escHtml } from '../utils/helpers.js';
import { labelToVariableName } from '../utils/variable-resolver.js';
import { getCurrentUser } from '../auth.js';

let currentUser = null, templates = [], editingTemplate = null;
let editingGroups = [], editingSections = [], editingItems = [], editingSubItems = [];
let activeTab = 'templates';

export async function renderSettings(params, container) {
  currentUser = await getCurrentUser();
  document.getElementById('topbar-actions').innerHTML = '';
  container.innerHTML = `
    <div style="display:flex;border-bottom:2px solid var(--border);margin-bottom:20px">
      <div class="stab" data-tab="templates" style="padding:9px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='templates'?'var(--teal)':'transparent'};margin-bottom:-2px;color:${activeTab==='templates'?'var(--teal-dk)':'var(--muted)'}">Templates</div>
      <div class="stab" data-tab="account" style="padding:9px 18px;font-size:.875rem;font-weight:500;cursor:pointer;border-bottom:2px solid ${activeTab==='account'?'var(--teal)':'transparent'};margin-bottom:-2px;color:${activeTab==='account'?'var(--teal-dk)':'var(--muted)'}">Account</div>
    </div>
    <div id="settings-content"></div>`;
  document.querySelectorAll('.stab').forEach(t => t.addEventListener('click', () => { activeTab = t.dataset.tab; renderSettings(params, container); }));
  if (activeTab==='templates') await renderTemplatesTab();
  else renderAccountTab();
}

async function renderTemplatesTab() {
  const content = document.getElementById('settings-content');
  const { data } = await db.from('templates').select('*').order('name');
  templates = data||[];
  let counts = {};
  if (templates.length) {
    const ids = templates.map(t => t.id);
    const [{ data: secs }, { data: items }, { data: subs }] = await Promise.all([
      db.from('template_sections').select('id,template_id').in('template_id', ids),
      db.from('template_items').select('id,template_id').in('template_id', ids),
      db.from('template_sub_items').select('id,template_id').in('template_id', ids)
    ]);
    for (const t of templates) counts[t.id] = { sections:(secs||[]).filter(s=>s.template_id===t.id).length, items:(items||[]).filter(i=>i.template_id===t.id).length, subs:(subs||[]).filter(s=>s.template_id===t.id).length };
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
        <div class="template-card-stats"><span>${counts[t.id]?.sections||0} sections</span><span>${counts[t.id]?.items||0} tasks</span><span>${counts[t.id]?.subs||0} sub-tasks</span></div>
        <div style="display:flex;gap:6px;margin-top:12px">
          <button class="btn btn-teal btn-xs" data-edit-tpl="${t.id}">Edit</button>
          <button class="btn btn-ghost btn-xs" data-dupe-tpl="${t.id}">Duplicate</button>
          <button class="btn btn-ghost btn-xs" style="color:var(--coral)" data-del-tpl="${t.id}">Delete</button>
        </div>
      </div>`).join('')}</div>`
    : `<div class="empty-state"><div class="empty-icon">📄</div><div class="empty-title">No templates yet</div><div class="empty-desc">Create a template to standardize your workflow.</div></div>`}`;
  document.getElementById('btn-new-tpl')?.addEventListener('click', openNewTemplateModal);
  content.querySelectorAll('[data-edit-tpl]').forEach(btn => btn.addEventListener('click', () => openTemplateEditor(btn.dataset.editTpl)));
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
        toast('Template deleted', 'success'); await renderTemplatesTab();
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
    closeModal(); toast('Template created', 'success');
    openTemplateEditor(t.id);
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
  toast('Template duplicated','success'); await renderTemplatesTab();
}

async function openTemplateEditor(templateId) {
  editingTemplate = templates.find(t=>t.id===templateId)||(await db.from('templates').select('*').eq('id',templateId).single()).data;
  if (!editingTemplate) return;
  const [{ data: groups },{ data: sections },{ data: items },{ data: subs }] = await Promise.all([
    db.from('template_groups').select('*').eq('template_id',templateId).order('position'),
    db.from('template_sections').select('*').eq('template_id',templateId).order('position'),
    db.from('template_items').select('*').eq('template_id',templateId).order('position'),
    db.from('template_sub_items').select('*').eq('template_id',templateId).order('position')
  ]);
  editingGroups=groups||[]; editingSections=sections||[]; editingItems=items||[]; editingSubItems=subs||[];
  renderEditorView();
}

function renderEditorView() {
  const content = document.getElementById('settings-content');
  content.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
      <button class="btn btn-ghost btn-sm" id="btn-back-tpl">← Templates</button>
      <h2 style="font-family:var(--font-serif);font-size:1.2rem;flex:1">${escHtml(editingTemplate.name)}</h2>
      <button class="btn btn-teal btn-sm" id="btn-add-group">+ Add Group Header</button>
    </div>
    <div id="editor-body">${editingGroups.length ? editingGroups.map(g=>renderGroupEditor(g)).join('') : `<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No group headers yet</div><div class="empty-desc">Add a group header like PRE-ARRANGEMENT to start building.</div></div>`}</div>`;
  document.getElementById('btn-back-tpl')?.addEventListener('click', async () => { const {data}=await db.from('templates').select('*').order('name'); templates=data||[]; await renderTemplatesTab(); });
  document.getElementById('btn-add-group')?.addEventListener('click', addGroup);
  bindEditorEvents(content);
}

function renderGroupEditor(group) {
  const groupSections = editingSections.filter(s=>s.group_id===group.id);
  const directItems = editingItems.filter(i=>i.group_id===group.id&&!i.section_id);
  return `<div class="builder-group" id="bgroup-${group.id}">
    <div class="builder-group-header">
      <input class="builder-group-title" value="${escHtml(group.title)}" data-group-title="${group.id}" placeholder="GROUP HEADER NAME…">
      <button class="btn btn-xs" style="background:rgba(255,255,255,.15);color:white;flex-shrink:0" data-add-sec-to="${group.id}">+ Section</button>
      <button class="btn-icon" style="color:rgba(255,255,255,.5)" data-del-group="${group.id}"><svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="builder-direct-items">
      ${directItems.map(i=>renderDirectItem(i)).join('')}
      <div class="builder-add-direct-row">
        <input class="builder-add-direct-input" placeholder="Add task directly to this header…" data-add-direct="${group.id}">
        <button class="btn btn-xs" style="background:rgba(255,255,255,.15);color:white" data-save-direct="${group.id}">Add</button>
      </div>
    </div>
    ${groupSections.map(s=>renderSectionEditor(s)).join('')}
  </div>`;
}

function renderDirectItem(item) {
  const subs = editingSubItems.filter(s=>s.item_id===item.id);
  return `<div class="builder-direct-item" id="bdi-${item.id}">
    <input class="builder-direct-item-label" value="${escHtml(item.label)}" data-item-label="${item.id}">
    ${item.is_important?`<span style="color:#FAC775;font-size:.8rem">★</span>`:''}
    <span style="font-size:.68rem;color:rgba(255,255,255,.5);background:rgba(255,255,255,.1);padding:1px 5px;border-radius:4px">${item.field_type}</span>
    <button class="btn-icon" style="color:rgba(255,255,255,.6)" data-edit-item="${item.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="btn-icon" style="color:rgba(255,255,255,.4)" data-del-item="${item.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div class="builder-sub-items" id="bsubs-${item.id}" style="background:rgba(255,255,255,.05);padding-left:20px">${subs.map(s=>renderSubEditorDark(s)).join('')}</div>
  <div class="builder-add-sub-row" style="padding-left:20px;background:rgba(255,255,255,.03)">
    <svg width="10" height="10" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
    <input class="builder-add-sub-input" placeholder="Add sub-task…" data-add-sub="${item.id}" style="background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.2);color:white">
    <button class="btn btn-xs" style="background:rgba(255,255,255,.15);color:white;border:none" data-save-sub="${item.id}">Add</button>
  </div>`;
}

function renderSubEditorDark(sub) {
  return `<div class="builder-sub-item" id="bsub-${sub.id}" style="border-bottom:1px solid rgba(255,255,255,.08)">
    <input class="builder-sub-item-label" value="${escHtml(sub.label)}" data-sub-label="${sub.id}" placeholder="Sub-task…" style="flex:1;color:rgba(255,255,255,.9);background:transparent;border:none">
    ${sub.variable_name?`<span style="font-size:.65rem;color:rgba(255,255,255,.4);font-family:var(--font-mono)">${sub.variable_name}</span>`:''}
    <span style="font-size:.65rem;color:rgba(255,255,255,.4);background:rgba(255,255,255,.1);padding:1px 4px;border-radius:3px">${sub.field_type}</span>
    <button class="btn-icon" style="color:rgba(255,255,255,.5)" data-edit-sub="${sub.id}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="btn-icon" style="color:rgba(255,255,255,.3)" data-del-sub="${sub.id}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>`;
}

function renderSectionEditor(sec) {
  const secItems = editingItems.filter(i=>i.section_id===sec.id);
  return `<div class="builder-section" id="bsec-${sec.id}">
    <div class="builder-section-head">
      <input class="builder-section-title-input" value="${escHtml(sec.title)}" data-sec-title="${sec.id}" placeholder="Section title…">
      ${sec.surface_on_card?`<span style="font-size:.65rem;background:rgba(29,158,117,.3);color:#5DCAA5;padding:1px 6px;border-radius:8px">on card</span>`:''}
      <button class="btn-icon" style="color:rgba(255,255,255,.5)" data-edit-sec="${sec.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></button>
      <button class="btn-icon" style="color:rgba(255,255,255,.4)" data-del-sec="${sec.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    </div>
    <div class="builder-items" id="bsec-items-${sec.id}">
      ${secItems.map(i=>renderItemEditor(i)).join('')}
    </div>
    <div class="builder-add-row">
      <input class="builder-add-input" placeholder="Add task…" data-add-to-sec="${sec.id}">
      <button class="btn btn-ghost btn-xs" data-save-to-sec="${sec.id}">Add</button>
    </div>
  </div>`;
}

function renderItemEditor(item) {
  const subs = editingSubItems.filter(s=>s.item_id===item.id);
  return `<div class="builder-item" id="bitem-${item.id}">
    <input class="builder-item-label" value="${escHtml(item.label)}" data-item-label="${item.id}" placeholder="Task label…" style="flex:1">
    ${item.is_important?`<span style="color:var(--coral);font-size:.8rem">★</span>`:''}
    ${item.variable_name?`<span style="font-size:.67rem;color:var(--violet);font-family:var(--font-mono)">${item.variable_name}</span>`:''}
    <span style="font-size:.68rem;color:var(--muted);background:var(--surface);padding:1px 5px;border-radius:4px">${item.field_type}</span>
    <button class="btn-icon" data-edit-item="${item.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="btn-icon" style="color:var(--coral)" data-del-item="${item.id}"><svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>
  <div class="builder-sub-items" id="bsubs-${item.id}">${subs.map(s=>renderSubEditor(s)).join('')}</div>
  <div class="builder-add-sub-row">
    <input class="builder-add-sub-input" placeholder="Add sub-task…" data-add-sub="${item.id}">
    <button class="btn btn-ghost btn-xs" data-save-sub="${item.id}">Add</button>
  </div>`;
}

function renderSubEditor(sub) {
  return `<div class="builder-sub-item" id="bsub-${sub.id}">
    <input class="builder-sub-item-label" value="${escHtml(sub.label)}" data-sub-label="${sub.id}" placeholder="Sub-task…" style="flex:1">
    ${sub.variable_name?`<span style="font-size:.65rem;color:var(--violet);font-family:var(--font-mono)">${sub.variable_name}</span>`:''}
    <span style="font-size:.65rem;color:var(--muted);background:var(--surface);padding:1px 4px;border-radius:3px">${sub.field_type}</span>
    <button class="btn-icon" data-edit-sub="${sub.id}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
    <button class="btn-icon" style="color:var(--coral)" data-del-sub="${sub.id}"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
  </div>`;
}

function bindEditorEvents(container) {
  // Blur saves
  container.querySelectorAll('[data-group-title]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_groups').update({title:input.value}).eq('id',input.dataset.groupTitle); const g=editingGroups.find(g=>g.id===input.dataset.groupTitle); if(g) g.title=input.value; }));
  container.querySelectorAll('[data-sec-title]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_sections').update({title:input.value}).eq('id',input.dataset.secTitle); const s=editingSections.find(s=>s.id===input.dataset.secTitle); if(s) s.title=input.value; }));
  container.querySelectorAll('[data-item-label]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_items').update({label:input.value}).eq('id',input.dataset.itemLabel); const i=editingItems.find(i=>i.id===input.dataset.itemLabel); if(i) i.label=input.value; }));
  container.querySelectorAll('[data-sub-label]').forEach(input => input.addEventListener('blur', async () => { await db.from('template_sub_items').update({label:input.value}).eq('id',input.dataset.subLabel); const s=editingSubItems.find(s=>s.id===input.dataset.subLabel); if(s) s.label=input.value; }));
  // Add group
  container.querySelector('#btn-add-group')?.addEventListener('click', addGroup);
  // Delete group
  container.querySelectorAll('[data-del-group]').forEach(btn => btn.addEventListener('click', () => deleteGroup(btn.dataset.delGroup)));
  // Add section
  container.querySelectorAll('[data-add-sec-to]').forEach(btn => btn.addEventListener('click', () => addSection(btn.dataset.addSecTo)));
  // Edit section
  container.querySelectorAll('[data-edit-sec]').forEach(btn => btn.addEventListener('click', () => openSectionModal(btn.dataset.editSec)));
  // Delete section
  container.querySelectorAll('[data-del-sec]').forEach(btn => btn.addEventListener('click', () => deleteSection(btn.dataset.delSec)));
  // Add direct item
  const bindAdd = (inputSel, btnSel, fn) => {
    container.querySelectorAll(btnSel).forEach(btn => { btn.addEventListener('click', () => { const input = container.querySelector(`[${inputSel}="${btn.dataset[Object.keys(btn.dataset)[0]]}"]`); if (input?.value.trim()) fn(btn, input); }); });
  };
  container.querySelectorAll('[data-save-direct]').forEach(btn => { btn.addEventListener('click', () => { const input=container.querySelector(`[data-add-direct="${btn.dataset.saveDirect}"]`); if(input?.value.trim()) addDirectItem(btn.dataset.saveDirect,input.value.trim(),input); }); });
  container.querySelectorAll('[data-add-direct]').forEach(input => { input.addEventListener('keydown', e => { if(e.key==='Enter'&&input.value.trim()) addDirectItem(input.dataset.addDirect,input.value.trim(),input); }); });
  container.querySelectorAll('[data-save-to-sec]').forEach(btn => { btn.addEventListener('click', () => { const input=container.querySelector(`[data-add-to-sec="${btn.dataset.saveToSec}"]`); if(input?.value.trim()) addSectionItem(btn.dataset.saveToSec,input.value.trim(),input); }); });
  container.querySelectorAll('[data-add-to-sec]').forEach(input => { input.addEventListener('keydown', e => { if(e.key==='Enter'&&input.value.trim()) addSectionItem(input.dataset.addToSec,input.value.trim(),input); }); });
  container.querySelectorAll('[data-save-sub]').forEach(btn => { btn.addEventListener('click', () => { const input=container.querySelector(`[data-add-sub="${btn.dataset.saveSub}"]`); if(input?.value.trim()) addSubItem(btn.dataset.saveSub,input.value.trim(),input); }); });
  container.querySelectorAll('[data-add-sub]').forEach(input => { input.addEventListener('keydown', e => { if(e.key==='Enter'&&input.value.trim()) addSubItem(input.dataset.addSub,input.value.trim(),input); }); });
  // Edit/delete items and subs
  container.querySelectorAll('[data-edit-item]').forEach(btn => btn.addEventListener('click', () => openItemModal(btn.dataset.editItem)));
  container.querySelectorAll('[data-del-item]').forEach(btn => btn.addEventListener('click', () => deleteItem(btn.dataset.delItem)));
  container.querySelectorAll('[data-edit-sub]').forEach(btn => btn.addEventListener('click', () => openSubModal(btn.dataset.editSub)));
  container.querySelectorAll('[data-del-sub]').forEach(btn => btn.addEventListener('click', () => deleteSub(btn.dataset.delSub)));
}

// ── CRUD OPERATIONS ───────────────────────────────────────────
async function addGroup() {
  const maxPos = editingGroups.length ? Math.max(...editingGroups.map(g=>g.position)) : -1;
  const { data: g } = await db.from('template_groups').insert({ template_id:editingTemplate.id, title:'NEW GROUP', position:maxPos+1 }).select().single();
  if (g) { editingGroups.push(g); renderEditorView(); }
}

async function deleteGroup(id) {
  confirmDialog({ title:'Delete Group Header', message:'Delete this group and all its sections and tasks? This cannot be undone.', confirmText:'Delete', onConfirm: async () => {
    const secIds = editingSections.filter(s=>s.group_id===id).map(s=>s.id);
    const itemIds = editingItems.filter(i=>i.group_id===id).map(i=>i.id);
    if (itemIds.length) await db.from('template_sub_items').delete().in('item_id', itemIds);
    if (secIds.length) { const secItemIds = editingItems.filter(i=>secIds.includes(i.section_id)).map(i=>i.id); if (secItemIds.length) await db.from('template_sub_items').delete().in('item_id', secItemIds); }
    await db.from('template_items').delete().eq('group_id', id);
    await db.from('template_sections').delete().eq('group_id', id);
    await db.from('template_groups').delete().eq('id', id);
    editingGroups=editingGroups.filter(g=>g.id!==id);
    editingSections=editingSections.filter(s=>s.group_id!==id);
    editingItems=editingItems.filter(i=>i.group_id!==id);
    renderEditorView();
  }});
}

async function addSection(groupId) {
  const maxPos = editingSections.filter(s=>s.group_id===groupId).length ? Math.max(...editingSections.filter(s=>s.group_id===groupId).map(s=>s.position)) : -1;
  const { data: s } = await db.from('template_sections').insert({ template_id:editingTemplate.id, group_id:groupId, title:'New Section', position:maxPos+1, surface_on_card:false }).select().single();
  if (s) { editingSections.push(s); renderEditorView(); }
}

async function deleteSection(id) {
  const itemIds = editingItems.filter(i=>i.section_id===id).map(i=>i.id);
  if (itemIds.length) { await db.from('template_sub_items').delete().in('item_id', itemIds); await db.from('template_items').delete().eq('section_id', id); }
  await db.from('template_sections').delete().eq('id', id);
  editingSections=editingSections.filter(s=>s.id!==id);
  editingItems=editingItems.filter(i=>i.section_id!==id);
  renderEditorView();
}

async function addDirectItem(groupId, label, inputEl) {
  const existing = editingItems.filter(i=>i.group_id===groupId&&!i.section_id);
  const maxPos = existing.length ? Math.max(...existing.map(i=>i.position)) : -1;
  const varName = labelToVariableName(label);
  const { data: i } = await db.from('template_items').insert({ template_id:editingTemplate.id, group_id:groupId, section_id:null, label, field_type:'checkbox', variable_name:varName, position:maxPos+1, is_important:false }).select().single();
  if (i) { editingItems.push(i); if(inputEl) inputEl.value=''; renderEditorView(); }
}

async function addSectionItem(sectionId, label, inputEl) {
  const sec = editingSections.find(s=>s.id===sectionId);
  const existing = editingItems.filter(i=>i.section_id===sectionId);
  const maxPos = existing.length ? Math.max(...existing.map(i=>i.position)) : -1;
  const varName = labelToVariableName(label);
  const { data: i } = await db.from('template_items').insert({ template_id:editingTemplate.id, group_id:sec?.group_id||null, section_id:sectionId, label, field_type:'checkbox', variable_name:varName, position:maxPos+1, is_important:false }).select().single();
  if (i) { editingItems.push(i); if(inputEl) inputEl.value=''; renderEditorView(); }
}

async function addSubItem(itemId, label, inputEl) {
  const existing = editingSubItems.filter(s=>s.item_id===itemId);
  const maxPos = existing.length ? Math.max(...existing.map(s=>s.position)) : -1;
  const varName = labelToVariableName(label);
  const { data: s } = await db.from('template_sub_items').insert({ template_id:editingTemplate.id, item_id:itemId, label, field_type:'checkbox', variable_name:varName, position:maxPos+1, is_important:false }).select().single();
  if (s) { editingSubItems.push(s); if(inputEl) inputEl.value=''; renderEditorView(); }
}

async function deleteItem(id) {
  await db.from('template_sub_items').delete().eq('item_id', id);
  await db.from('template_items').delete().eq('id', id);
  editingItems=editingItems.filter(i=>i.id!==id);
  editingSubItems=editingSubItems.filter(s=>s.item_id!==id);
  renderEditorView();
}

async function deleteSub(id) {
  await db.from('template_sub_items').delete().eq('id', id);
  editingSubItems=editingSubItems.filter(s=>s.id!==id);
  renderEditorView();
}

// ── ITEM SETTINGS MODAL ───────────────────────────────────────
const FIELD_TYPES = [
  ['checkbox','Checkbox'],['yes_no','Yes / No'],['radio','Choose from list (Radio)'],['dropdown','Dropdown'],
  ['short_text','Short Text'],['long_text','Long Text'],['number','Number'],['currency','Currency'],
  ['dc_quantity','Death Certificate Quantity (Long/Short)'],['date','Date'],['datetime','Date & Time'],
  ['phone','Phone Number'],['email','Email Address']
];

function itemModalBody(item, allVarItems) {
  const opts = item.field_options?.options||[];
  const isRadio = item.field_type==='radio'||item.field_type==='dropdown';
  const varOptions = allVarItems.filter(i=>i.id!==item.id&&i.variable_name).map(i=>`<option value="${escHtml(i.variable_name)}">${escHtml(i.label.substring(0,40))} — {{${escHtml(i.variable_name)}}}</option>`).join('');
  return `
    <div class="form-group"><label class="form-label">Label *</label><input class="form-input" id="im-label" value="${escHtml(item.label)}"></div>
    <div class="form-group"><label class="form-label">Helper / Instruction Text</label>
      <div style="display:flex;gap:6px;align-items:flex-start">
        <textarea class="form-textarea" id="im-helper" placeholder="Context shown below the label. Use {{variable}} to reference other fields." style="min-height:55px;flex:1">${escHtml(item.helper_text||'')}</textarea>
        ${varOptions?`<div style="position:relative"><button class="btn btn-ghost btn-xs" id="var-picker-btn" style="color:var(--violet-dk);white-space:nowrap">{ } Insert ref</button><select id="var-picker-select" size="1" style="position:absolute;top:100%;left:0;z-index:100;background:var(--white);border:1px solid var(--border-dk);border-radius:var(--radius);font-size:.78rem;min-width:220px;display:none"><option value="">— pick a variable —</option>${varOptions}</select></div>`:''}
      </div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Field Type</label><select class="form-select" id="im-type">${FIELD_TYPES.map(([v,l])=>`<option value="${v}" ${item.field_type===v?'selected':''}>${l}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">Variable Name</label><input class="form-input" id="im-varname" value="${escHtml(item.variable_name||'')}" placeholder="e.g. veteran_status"><div class="form-hint">Use {{variable_name}} in helper text to reference this</div></div>
    </div>
    <div class="form-group" id="im-options-group" style="${isRadio?'':'display:none'}">
      <label class="form-label">Options (one per line)</label>
      <textarea class="form-textarea" id="im-options" style="min-height:70px">${opts.join('\n')}</textarea>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="im-important" ${item.is_important?'checked':''}> Mark as important</label></div>
      <div class="form-group"><label class="form-label">Due (days from case creation)</label><input class="form-input" id="im-due" type="number" min="0" value="${item.relative_due_days??''}" placeholder="e.g. 3" style="max-width:90px"></div>
    </div>`;
}

function openItemModal(itemId) {
  const item = editingItems.find(i=>i.id===itemId);
  if (!item) return;
  const allVarItems = [...editingItems, ...editingSubItems];
  openModal({ title:'Edit Task Settings', size:'lg', body:itemModalBody(item, allVarItems), footer:`<button class="btn btn-ghost" id="im-cancel">Cancel</button><button class="btn btn-primary" id="im-save">Save</button>` });
  document.getElementById('im-cancel')?.addEventListener('click', closeModal);
  document.getElementById('im-type')?.addEventListener('change', e => { document.getElementById('im-options-group').style.display=(e.target.value==='radio'||e.target.value==='dropdown')?'block':'none'; });
  const vpBtn = document.getElementById('var-picker-btn');
  const vpSel = document.getElementById('var-picker-select');
  vpBtn?.addEventListener('click', () => { vpSel.style.display=vpSel.style.display==='none'?'block':'none'; });
  vpSel?.addEventListener('change', () => { if(vpSel.value) { const ta=document.getElementById('im-helper'); ta.value+=`{{${vpSel.value}}}`; vpSel.style.display='none'; vpSel.value=''; } });
  document.getElementById('im-save')?.addEventListener('click', async () => {
    const label = document.getElementById('im-label')?.value.trim();
    if (!label) { toast('Label required','error'); return; }
    const ft = document.getElementById('im-type')?.value;
    const isRadio = ft==='radio'||ft==='dropdown';
    const opts = isRadio ? (document.getElementById('im-options')?.value||'').split('\n').map(o=>o.trim()).filter(Boolean) : [];
    const updates = { label, helper_text:document.getElementById('im-helper')?.value||null, field_type:ft, variable_name:document.getElementById('im-varname')?.value.trim()||null, field_options:opts.length?{options:opts}:null, is_important:document.getElementById('im-important')?.checked||false, relative_due_days:document.getElementById('im-due')?.value?parseInt(document.getElementById('im-due').value):null };
    await db.from('template_items').update(updates).eq('id', itemId);
    Object.assign(item, updates);
    closeModal(); toast('Task saved','success'); renderEditorView();
  });
}

function openSubModal(subId) {
  const sub = editingSubItems.find(s=>s.id===subId);
  if (!sub) return;
  const allVarItems = [...editingItems, ...editingSubItems];
  openModal({ title:'Edit Sub-task Settings', size:'lg', body:itemModalBody(sub, allVarItems), footer:`<button class="btn btn-ghost" id="im-cancel">Cancel</button><button class="btn btn-primary" id="im-save">Save</button>` });
  document.getElementById('im-cancel')?.addEventListener('click', closeModal);
  document.getElementById('im-type')?.addEventListener('change', e => { document.getElementById('im-options-group').style.display=(e.target.value==='radio'||e.target.value==='dropdown')?'block':'none'; });
  document.getElementById('im-save')?.addEventListener('click', async () => {
    const label = document.getElementById('im-label')?.value.trim();
    if (!label) { toast('Label required','error'); return; }
    const ft = document.getElementById('im-type')?.value;
    const isRadio = ft==='radio'||ft==='dropdown';
    const opts = isRadio ? (document.getElementById('im-options')?.value||'').split('\n').map(o=>o.trim()).filter(Boolean) : [];
    const updates = { label, helper_text:document.getElementById('im-helper')?.value||null, field_type:ft, variable_name:document.getElementById('im-varname')?.value.trim()||null, field_options:opts.length?{options:opts}:null, is_important:document.getElementById('im-important')?.checked||false, relative_due_days:document.getElementById('im-due')?.value?parseInt(document.getElementById('im-due').value):null };
    await db.from('template_sub_items').update(updates).eq('id', subId);
    Object.assign(sub, updates);
    closeModal(); toast('Sub-task saved','success'); renderEditorView();
  });
}

function openSectionModal(sectionId) {
  const sec = editingSections.find(s=>s.id===sectionId);
  if (!sec) return;
  openModal({ title:'Section Settings', size:'sm', body:`
    <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="sm-title" value="${escHtml(sec.title)}"></div>
    <div class="form-group"><label class="form-label-inline checkbox-wrap"><input type="checkbox" id="sm-surface" ${sec.surface_on_card?'checked':''}> Surface incomplete items on family card</label></div>`,
    footer:`<button class="btn btn-ghost" id="sm-cancel">Cancel</button><button class="btn btn-primary" id="sm-save">Save</button>`
  });
  document.getElementById('sm-cancel')?.addEventListener('click', closeModal);
  document.getElementById('sm-save')?.addEventListener('click', async () => {
    const title = document.getElementById('sm-title')?.value.trim();
    if (!title) { toast('Title required','error'); return; }
    const surface = document.getElementById('sm-surface')?.checked||false;
    await db.from('template_sections').update({title, surface_on_card:surface}).eq('id', sectionId);
    sec.title=title; sec.surface_on_card=surface;
    closeModal(); toast('Section updated','success'); renderEditorView();
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
      <div class="card-header" style="background:var(--surface);padding:8px 14px;font-size:.72rem;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.05em">Profile</div>
      <div class="card-body" style="padding:14px">
        <div class="form-group"><label class="form-label">Full Name</label><input class="form-input" id="acc-name" value="${escHtml(name)}"></div>
        <div class="form-group"><label class="form-label">Email</label><input class="form-input" value="${escHtml(email)}" disabled style="opacity:.6"></div>
        <button class="btn btn-teal btn-sm" id="acc-save-name">Save Name</button>
      </div>
    </div>
    <div class="card" style="max-width:460px;margin-top:16px;border:1px solid var(--border);border-radius:var(--radius-lg)">
      <div class="card-header" style="background:var(--surface);padding:8px 14px;font-size:.72rem;font-weight:700;color:var(--slate);text-transform:uppercase;letter-spacing:.05em">Change Password</div>
      <div class="card-body" style="padding:14px">
        <div class="form-group"><label class="form-label">New Password</label><input class="form-input" id="acc-pw" type="password" placeholder="••••••••"></div>
        <div class="form-group"><label class="form-label">Confirm Password</label><input class="form-input" id="acc-pw2" type="password" placeholder="••••••••"></div>
        <button class="btn btn-teal btn-sm" id="acc-save-pw">Update Password</button>
      </div>
    </div>`;
  document.getElementById('acc-save-name')?.addEventListener('click', async () => {
    const name = document.getElementById('acc-name')?.value.trim();
    if (!name) return;
    const { error } = await db.auth.updateUser({ data:{ full_name:name } });
    if (error) { toast('Error: '+error.message,'error'); return; }
    document.getElementById('sidebar-name').textContent = name;
    const initials = name.split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
    document.getElementById('sidebar-avatar').textContent = initials;
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
