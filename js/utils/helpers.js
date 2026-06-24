// ─── SHARED HELPERS ───────────────────────────────────────────

// HTML escape
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Truncate text to N chars
export function truncate(str, n = 80) {
  if (!str) return '';
  return str.length > n ? str.substring(0, n) + '…' : str;
}

// Deep clone a plain object
export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Debounce a function
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Generate a slug from text
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 40);
}

// Capitalize first letter
export function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Format phone number for display
export function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Calculate checklist progress
export function calcProgress(items) {
  const applicable = items.filter(i => i.item_state !== 'skipped');
  const complete = items.filter(i => i.item_state === 'complete');
  const skipped = items.filter(i => i.item_state === 'skipped');
  const total = applicable.length;
  const pct = total === 0 ? 0 : Math.round((complete.length / total) * 100);
  return {
    total: applicable.length,
    complete: complete.length,
    skipped: skipped.length,
    incomplete: applicable.length - complete.length,
    pct
  };
}

// Get surfaced items for a family card
// Returns items from sections with surface_on_card=true
// plus items with is_important=true that are incomplete
export function getSurfacedItems(sections, items) {
  const surfacedSectionIds = new Set(
    sections.filter(s => s.surface_on_card).map(s => s.id)
  );

  const surfaced = [];

  // Items from "surface on card" sections that are incomplete
  for (const item of items) {
    if (
      surfacedSectionIds.has(item.section_id) &&
      item.item_state === 'incomplete'
    ) {
      surfaced.push({ ...item, _surface_reason: 'waiting' });
    }
  }

  // Important items that are incomplete (not already added)
  const addedIds = new Set(surfaced.map(i => i.id));
  for (const item of items) {
    if (
      item.is_important &&
      item.item_state === 'incomplete' &&
      !addedIds.has(item.id)
    ) {
      surfaced.push({ ...item, _surface_reason: 'important' });
    }
  }

  return surfaced.slice(0, 5); // cap at 5 to keep cards tidy
}

// Parse field_value JSON safely
export function parseFieldValue(fieldValue) {
  if (!fieldValue) return null;
  if (typeof fieldValue === 'object') return fieldValue;
  try { return JSON.parse(fieldValue); } catch { return null; }
}

// Get display string from field_value
export function getFieldDisplayValue(item) {
  const fv = parseFieldValue(item.field_value);
  if (!fv) return '';
  if ('checked' in fv) return fv.checked ? '✓ Checked' : '';
  return fv.value ?? '';
}

// Build field_value JSON for saving
export function buildFieldValue(fieldType, rawValue) {
  if (fieldType === 'checkbox') {
    return { checked: !!rawValue };
  }
  return { value: rawValue };
}
