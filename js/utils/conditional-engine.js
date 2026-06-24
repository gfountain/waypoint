// ─── CONDITIONAL LOGIC ENGINE ─────────────────────────────────
// Evaluates whether a section or item should be visible
// based on its conditional_logic rules and the current
// state of all items in the checklist.
//
// Logic shape:
// {
//   "operator": "AND" | "OR",
//   "rules": [
//     {
//       "trigger_item_variable": "variable_name",
//       "condition": "completed" | "not_completed" | "equals" | "not_equals",
//       "value": "some value"
//     }
//   ]
// }

// Build a lookup map of variable_name → item for fast access
export function buildVariableMap(items) {
  const map = {};
  for (const item of items) {
    if (item.variable_name) {
      map[item.variable_name] = item;
    }
  }
  return map;
}

// Get the current string value of an item's field_value
export function getItemValue(item) {
  if (!item || !item.field_value) return null;
  const fv = typeof item.field_value === 'string'
    ? JSON.parse(item.field_value)
    : item.field_value;

  // checkbox: { checked: true/false }
  if ('checked' in fv) return fv.checked ? 'checked' : null;
  // all others: { value: "..." }
  return fv.value ?? null;
}

// Is an item considered "completed" (has any meaningful value)?
export function isItemCompleted(item) {
  if (!item) return false;
  if (item.item_state === 'complete') return true;
  if (item.item_state === 'skipped') return false;
  // For non-checkbox types in incomplete state, check if value exists
  const val = getItemValue(item);
  return val !== null && val !== '' && val !== false;
}

// Evaluate a single rule
function evaluateRule(rule, variableMap) {
  const triggerItem = variableMap[rule.trigger_item_variable];
  if (!triggerItem) return false; // trigger item not found — hide by default

  const condition = rule.condition;

  if (condition === 'completed') {
    return isItemCompleted(triggerItem);
  }

  if (condition === 'not_completed') {
    return !isItemCompleted(triggerItem);
  }

  if (condition === 'equals') {
    const val = getItemValue(triggerItem);
    return val !== null && String(val).toLowerCase() === String(rule.value).toLowerCase();
  }

  if (condition === 'not_equals') {
    const val = getItemValue(triggerItem);
    return val === null || String(val).toLowerCase() !== String(rule.value).toLowerCase();
  }

  return false;
}

// Main evaluation function — returns true if item/section should be visible
export function evaluateLogic(conditionalLogic, variableMap) {
  // No logic defined → always visible
  if (!conditionalLogic) return true;

  const logic = typeof conditionalLogic === 'string'
    ? JSON.parse(conditionalLogic)
    : conditionalLogic;

  if (!logic.rules || logic.rules.length === 0) return true;

  const operator = logic.operator || 'AND';
  const results = logic.rules.map(rule => evaluateRule(rule, variableMap));

  if (operator === 'OR') {
    return results.some(Boolean);
  }
  // Default: AND
  return results.every(Boolean);
}

// Evaluate visibility for all items in a section, returns Set of visible item IDs
export function evaluateAllItems(items) {
  const variableMap = buildVariableMap(items);
  const visibleIds = new Set();

  for (const item of items) {
    if (evaluateLogic(item.conditional_logic, variableMap)) {
      visibleIds.add(item.id);
    }
  }
  return visibleIds;
}

// Evaluate visibility for all sections, returns Set of visible section IDs
export function evaluateAllSections(sections, items) {
  const variableMap = buildVariableMap(items);
  const visibleIds = new Set();

  for (const section of sections) {
    if (evaluateLogic(section.conditional_logic, variableMap)) {
      visibleIds.add(section.id);
    }
  }
  return visibleIds;
}

// Re-evaluate and update DOM visibility after a value changes
export function applyVisibility(items, sections) {
  const variableMap = buildVariableMap(items);

  // Update item visibility
  for (const item of items) {
    const el = document.getElementById(`item-${item.id}`);
    if (!el) continue;
    const visible = evaluateLogic(item.conditional_logic, variableMap);
    el.classList.toggle('item-hidden', !visible);
  }

  // Update section visibility
  for (const section of sections) {
    const el = document.getElementById(`section-${section.id}`);
    if (!el) continue;
    const visible = evaluateLogic(section.conditional_logic, variableMap);
    el.classList.toggle('item-hidden', !visible);
  }
}

// Get all item variable names available as trigger options
export function getTriggerOptions(items, excludeItemId = null) {
  return items
    .filter(i => i.variable_name && i.id !== excludeItemId)
    .map(i => ({ id: i.id, variable_name: i.variable_name, label: i.label }));
}

// Validate conditional logic object — returns array of error strings
export function validateLogic(logic) {
  const errors = [];
  if (!logic) return errors;
  if (!['AND', 'OR'].includes(logic.operator)) {
    errors.push('Operator must be AND or OR');
  }
  if (!Array.isArray(logic.rules) || logic.rules.length === 0) {
    errors.push('At least one rule is required');
  }
  for (const rule of (logic.rules || [])) {
    if (!rule.trigger_item_variable) errors.push('Each rule needs a trigger item');
    if (!['completed','not_completed','equals','not_equals'].includes(rule.condition)) {
      errors.push('Invalid condition type');
    }
    if (['equals','not_equals'].includes(rule.condition) && !rule.value) {
      errors.push('Equals/not_equals rules need a value');
    }
  }
  return errors;
}
