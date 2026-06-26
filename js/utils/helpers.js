// ─── SHARED HELPERS ───────────────────────────────────────────
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function truncate(str, n = 80) { if (!str) return ''; return str.length > n ? str.substring(0,n)+'…' : str; }
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
export function formatPhone(phone) {
  if (!phone) return '';
  const d = phone.replace(/\D/g,'');
  if (d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length===11&&d[0]==='1') return `(${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`;
  return phone;
}
// Auto-format phone as user types
export function autoFormatPhone(input) {
  let val = input.value.replace(/\D/g,'');
  if (val.length===0) { input.value=''; return; }
  if (val.length<=3) { input.value=`(${val}`; return; }
  if (val.length<=6) { input.value=`(${val.slice(0,3)}) ${val.slice(3)}`; return; }
  input.value=`(${val.slice(0,3)}) ${val.slice(3,6)}-${val.slice(6,10)}`;
}
// Progress calculation — only subtasks count if parent has subtasks
// If no subtasks, parent counts as 1
export function calcProgress(items, subItems = []) {
  let total = 0, complete = 0, skipped = 0;
  for (const item of items) {
    const itemSubs = subItems.filter(s => s.item_id === item.id);
    if (itemSubs.length > 0) {
      // Count sub-items only
      for (const sub of itemSubs) {
        if (sub.item_state === 'skipped') { skipped++; continue; }
        total++;
        if (sub.item_state === 'complete') complete++;
      }
    } else {
      // No sub-items — count parent
      if (item.item_state === 'skipped') { skipped++; continue; }
      total++;
      if (item.item_state === 'complete') complete++;
    }
  }
  const pct = total === 0 ? 0 : Math.round((complete/total)*100);
  return { total, complete, skipped, incomplete: total-complete, pct };
}
export function getNextIncompleteItem(items, subItems = []) {
  const sorted = [...items].sort((a,b) => (a.position||0)-(b.position||0));
  for (const item of sorted) {
    const itemSubs = subItems.filter(s => s.item_id === item.id);
    if (itemSubs.length > 0) {
      const nextSub = itemSubs.sort((a,b)=>(a.position||0)-(b.position||0)).find(s => s.item_state==='incomplete');
      if (nextSub) return { label: `${item.label} → ${nextSub.label}` };
    } else {
      if (item.item_state === 'incomplete') return item;
    }
  }
  return null;
}
export function getImportantItems(items, subItems = []) {
  const important = [
    ...items.filter(i => i.is_important && i.item_state==='incomplete'),
    ...subItems.filter(s => s.is_important && s.item_state==='incomplete')
  ];
  return { shown: important.slice(0,3), overflow: Math.max(0, important.length-3) };
}
export function getSurfacedItems(sections, items) {
  const surfacedIds = new Set(sections.filter(s=>s.surface_on_card).map(s=>s.id));
  return items.filter(i=>surfacedIds.has(i.section_id)&&i.item_state==='incomplete').slice(0,5);
}
export function parseFieldValue(fv) {
  if (!fv) return null;
  if (typeof fv === 'object') return fv;
  try { return JSON.parse(fv); } catch { return null; }
}
export function getFieldDisplayValue(item) {
  const fv = parseFieldValue(item.field_value);
  if (!fv) return '';
  if ('long' in fv || 'short' in fv) return `Long: ${fv.long||0} · Short: ${fv.short||0}`;
  if ('value' in fv) return String(fv.value ?? '');
  return '';
}
export function buildFieldValue(fieldType, rawValue) {
  if (fieldType==='dc_quantity') return rawValue;
  return { value: rawValue };
}
export function allSubItemsDone(subItems) {
  if (!subItems.length) return false;
  return subItems.every(s => s.item_state==='complete'||s.item_state==='skipped');
}
export function formatCurrency(val) {
  if (val===null||val===undefined||val==='') return '';
  return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(val);
}
