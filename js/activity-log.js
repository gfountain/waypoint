// ─── ACTIVITY LOG ─────────────────────────────────────────────
import { db } from './supabase.js';

// Log an activity entry
export async function logActivity(familyId, userId, actionType, description, metadata = null) {
  try {
    await db.from('activity_log').insert({
      family_id: familyId,
      user_id: userId,
      action_type: actionType,
      description,
      metadata
    });
  } catch (err) {
    // Activity logging should never block the main action
    console.warn('Activity log failed:', err.message);
  }
}

// Fetch activity log for a family (most recent first)
export async function fetchActivityLog(familyId, limit = 50) {
  const { data, error } = await db
    .from('activity_log')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// Pre-built log helpers for common actions

export function logItemComplete(familyId, userId, itemLabel) {
  return logActivity(familyId, userId, 'item_completed',
    `Marked "${itemLabel}" as complete`);
}

export function logItemUncomplete(familyId, userId, itemLabel) {
  return logActivity(familyId, userId, 'item_uncompleted',
    `Unmarked "${itemLabel}"`);
}

export function logItemSkipped(familyId, userId, itemLabel) {
  return logActivity(familyId, userId, 'item_skipped',
    `Skipped "${itemLabel}" (N/A)`);
}

export function logItemUnskipped(familyId, userId, itemLabel) {
  return logActivity(familyId, userId, 'item_unskipped',
    `Restored "${itemLabel}" from skipped`);
}

export function logValueSet(familyId, userId, itemLabel, value) {
  return logActivity(familyId, userId, 'item_value_set',
    `Set "${itemLabel}": ${value}`,
    { value });
}

export function logValueChanged(familyId, userId, itemLabel, oldValue, newValue) {
  return logActivity(familyId, userId, 'item_value_changed',
    `Updated "${itemLabel}": ${oldValue} → ${newValue}`,
    { old_value: oldValue, new_value: newValue });
}

export function logItemAdded(familyId, userId, itemLabel) {
  return logActivity(familyId, userId, 'item_added',
    `Added task: "${itemLabel}"`);
}

export function logSectionAdded(familyId, userId, sectionTitle) {
  return logActivity(familyId, userId, 'section_added',
    `Added section: "${sectionTitle}"`);
}

export function logStatusChanged(familyId, userId, oldStatus, newStatus) {
  const labels = { active: 'Active', long_term: 'Long Term', completed: 'Completed' };
  return logActivity(familyId, userId, 'status_changed',
    `Status changed: ${labels[oldStatus] || oldStatus} → ${labels[newStatus] || newStatus}`,
    { old_status: oldStatus, new_status: newStatus });
}

export function logNotesEdited(familyId, userId) {
  return logActivity(familyId, userId, 'notes_edited', 'Case notes updated');
}

export function logQuickNote(familyId, userId, note) {
  return logActivity(familyId, userId, 'notes_quick_added',
    `Quick note added: "${note.substring(0, 80)}${note.length > 80 ? '…' : ''}"`);
}

export function logReminderAdded(familyId, userId, description, dueDate) {
  return logActivity(familyId, userId, 'reminder_added',
    `Reminder added: "${description}" — due ${dueDate}`);
}

export function logReminderDismissed(familyId, userId, description) {
  return logActivity(familyId, userId, 'reminder_dismissed',
    `Reminder dismissed: "${description}"`);
}

export function logContactAdded(familyId, userId, contactName) {
  return logActivity(familyId, userId, 'contact_added',
    `Contact added: ${contactName}`);
}

export function logCaseCreated(familyId, userId, decedentName) {
  return logActivity(familyId, userId, 'case_created',
    `Case created for ${decedentName}`);
}
