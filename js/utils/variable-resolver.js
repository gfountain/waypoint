// ─── VARIABLE RESOLVER ────────────────────────────────────────
import { getItemValue } from './conditional-engine.js';
import { escHtml } from './helpers.js';

export function buildValueMap(items, subItems = []) {
  const map = {};
  const all = [...items, ...subItems];
  for (const item of all) {
    if (!item.variable_name) continue;
    const val = getItemValue(item);
    map[item.variable_name] = val!==null&&val!=='' ? String(val) : '';
  }
  return map;
}
export function resolveVariables(text, valueMap) {
  if (!text) return '';
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const key = varName.trim();
    if (key in valueMap) {
      return valueMap[key]
        ? `<span class="var-value">${escHtml(valueMap[key])}</span>`
        : `<span class="var-placeholder">{{${key}}}</span>`;
    }
    return match;
  });
}
export function resolveItemText(text, allItems, allSubItems = []) {
  return resolveVariables(text, buildValueMap(allItems, allSubItems));
}
export function extractVariableRefs(text) {
  if (!text) return [];
  const matches = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let m;
  while ((m=regex.exec(text))!==null) matches.push(m[1].trim());
  return [...new Set(matches)];
}
export function labelToVariableName(label) {
  return label.toLowerCase().replace(/[^a-z0-9\s]/g,'').trim().replace(/\s+/g,'_').substring(0,40);
}
export function isValidVariableName(name) { return /^[a-z][a-z0-9_]*$/.test(name); }
