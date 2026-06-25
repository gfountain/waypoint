// ─── SHARED HELPERS ───────────────────────────────────────────
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function truncate(str, n = 80) { if (!str) return ''; return str.length > n ? str.substring(0,n)+'…' : str; }
export function debounce(fn, ms = 300) { let t; return (...a) => { clearTimeout(t); t = setTimeout(()=>fn(...a), ms); }; }
export function capitalize(str) { if (!str) return ''; return str.charAt(0).toUpperCase()+str.slice(1); }
export function formatPhone(phone) {
  if (!phone) return '';
  const d = phone.replace(/\D/g,'');
  if (d.length===10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  return phone;
}

// Progress calculation — excludes skipped items
export function calcProgress(items) {
  const skipped = items.filter(i=>i.item_state==='skipped').length;
  const complete = items.filter(i=>i.item_state==='complete').length;
  const total = items.length - skipped;
  const pct = total===0 ? 0 : Math.round((complete/total)*100);
  return { total, complete, skipped, incomplete: total-complete, pct };
}

// Get next incomplete item across all items in order
export function getNextIncompleteItem(items) {
  return items.find(i => i.item_state === 'incomplete') || null;
}

// Get important incomplete items, capped at 3 with overflow count
export function getImportantItems(items, subItems = []) {
  const important = items.filter(i => i.is_important && i.item_state === 'incomplete');
  const importantSubs = subItems.filter(i => i.is_important && i.item_state === 'incomplete');
  const all = [...important, ...importantSubs];
  return { shown: all.slice(0,3), overflow: Math.max(0, all.length-3) };
}

// Get surfaced items for card (items from surface_on_card sections)
export function getSurfacedItems(sections, items) {
  const surfacedIds = new Set(sections.filter(s=>s.surface_on_card).map(s=>s.id));
  return items.filter(i=>surfacedIds.has(i.section_id) && i.item_state==='incomplete').slice(0,5);
}

// Parse field_value JSON safely
export function parseFieldValue(fv) {
  if (!fv) return null;
  if (typeof fv === 'object') return fv;
  try { return JSON.parse(fv); } catch { return null; }
}

// Get display string from field_value
export function getFieldDisplayValue(item) {
  const fv = parseFieldValue(item.field_value);
  if (!fv) return '';
  if ('checked' in fv) return fv.checked ? '✓' : '';
  if ('long' in fv || 'short' in fv) return `Long: ${fv.long||0} · Short: ${fv.short||0}`;
  if ('value' in fv) return String(fv.value ?? '');
  return '';
}

// Build field_value for saving
export function buildFieldValue(fieldType, rawValue) {
  if (fieldType==='checkbox') return { checked: !!rawValue };
  if (fieldType==='dc_quantity') return rawValue; // pass { long, short } directly
  return { value: rawValue };
}

// Check if all sub-items of a parent item are complete/skipped
export function allSubItemsDone(subItems) {
  if (!subItems.length) return false;
  return subItems.every(s => s.item_state === 'complete' || s.item_state === 'skipped');
}

// Format currency
export function formatCurrency(val) {
  if (val === null || val === undefined || val === '') return '';
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(val);
}
