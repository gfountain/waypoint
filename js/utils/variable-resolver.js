// ─── VARIABLE RESOLVER ────────────────────────────────────────
// Resolves {{variable_name}} references in item labels and
// helper text, replacing them with the current entered value
// of the referenced item.

import { getItemValue } from './conditional-engine.js';

// Build a value map: variable_name → display string
export function buildValueMap(items) {
  const map = {};
  for (const item of items) {
    if (!item.variable_name) continue;
    const val = getItemValue(item);
    map[item.variable_name] = val !== null && val !== '' ? String(val) : '';
  }
  return map;
}

// Replace all {{variable_name}} in a string with current values
export function resolveVariables(text, valueMap) {
  if (!text) return '';
  return text.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmed = varName.trim();
    if (trimmed in valueMap) {
      const val = valueMap[trimmed];
      if (val) {
        return `<span class="var-value">${escHtml(val)}</span>`;
      } else {
        return `<span class="var-placeholder">{{${trimmed}}}</span>`;
      }
    }
    return match; // unknown variable — leave as-is
  });
}

// Resolve variables for a single item given all items
export function resolveItemText(text, allItems) {
  const valueMap = buildValueMap(allItems);
  return resolveVariables(text, valueMap);
}

// Extract all variable names referenced in a text string
export function extractVariableRefs(text) {
  if (!text) return [];
  const matches = [];
  const regex = /\{\{([^}]+)\}\}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[1].trim());
  }
  return [...new Set(matches)];
}

// Generate a safe variable name slug from a label string
export function labelToVariableName(label) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .substring(0, 40);
}

// Validate a variable name
export function isValidVariableName(name) {
  return /^[a-z][a-z0-9_]*$/.test(name);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
