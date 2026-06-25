// ─── CONDITIONAL LOGIC ENGINE ─────────────────────────────────
export function buildVariableMap(items, subItems = []) {
  const map = {};
  for (const item of items) { if (item.variable_name) map[item.variable_name] = item; }
  for (const sub of subItems) { if (sub.variable_name) map[sub.variable_name] = sub; }
  return map;
}
export function getItemValue(item) {
  if (!item?.field_value) return null;
  const fv = typeof item.field_value==='string' ? JSON.parse(item.field_value) : item.field_value;
  if ('checked' in fv) return fv.checked ? 'checked' : null;
  if ('long' in fv || 'short' in fv) return (fv.long||fv.short) ? `${fv.long}/${fv.short}` : null;
  return fv.value ?? null;
}
export function isItemCompleted(item) {
  if (!item) return false;
  if (item.item_state==='complete') return true;
  if (item.item_state==='skipped') return false;
  const val = getItemValue(item);
  return val!==null && val!=='' && val!==false;
}
function evaluateRule(rule, variableMap) {
  const trigger = variableMap[rule.trigger_item_variable];
  if (!trigger) return false;
  if (rule.condition==='completed') return isItemCompleted(trigger);
  if (rule.condition==='not_completed') return !isItemCompleted(trigger);
  if (rule.condition==='equals') {
    const val = getItemValue(trigger);
    return val!==null && String(val).toLowerCase()===String(rule.value).toLowerCase();
  }
  if (rule.condition==='not_equals') {
    const val = getItemValue(trigger);
    return val===null || String(val).toLowerCase()!==String(rule.value).toLowerCase();
  }
  return false;
}
export function evaluateLogic(conditionalLogic, variableMap) {
  if (!conditionalLogic) return true;
  const logic = typeof conditionalLogic==='string' ? JSON.parse(conditionalLogic) : conditionalLogic;
  if (!logic.rules?.length) return true;
  const results = logic.rules.map(r => evaluateRule(r, variableMap));
  return logic.operator==='OR' ? results.some(Boolean) : results.every(Boolean);
}
export function applyVisibility(items, subItems, sections) {
  const map = buildVariableMap(items, subItems);
  for (const item of items) {
    const el = document.getElementById(`item-${item.id}`);
    if (el) el.classList.toggle('item-hidden', !evaluateLogic(item.conditional_logic, map));
  }
  for (const sub of subItems) {
    const el = document.getElementById(`sub-${sub.id}`);
    if (el) el.classList.toggle('item-hidden', !evaluateLogic(sub.conditional_logic, map));
  }
  for (const sec of sections) {
    const el = document.getElementById(`section-${sec.id}`);
    if (el) el.classList.toggle('item-hidden', !evaluateLogic(sec.conditional_logic, map));
  }
}
export function validateLogic(logic) {
  const errors = [];
  if (!logic) return errors;
  if (!['AND','OR'].includes(logic.operator)) errors.push('Operator must be AND or OR');
  if (!Array.isArray(logic.rules)||!logic.rules.length) errors.push('At least one rule is required');
  for (const rule of (logic.rules||[])) {
    if (!rule.trigger_item_variable) errors.push('Each rule needs a trigger item');
    if (!['completed','not_completed','equals','not_equals'].includes(rule.condition)) errors.push('Invalid condition');
    if (['equals','not_equals'].includes(rule.condition)&&!rule.value) errors.push('Equals rules need a value');
  }
  return errors;
}
