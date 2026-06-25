// ─── ACTIVITY LOG ─────────────────────────────────────────────
import { db } from './supabase.js';

export async function logActivity(familyId, userId, actionType, description, metadata=null) {
  try {
    await db.from('activity_log').insert({ family_id:familyId, user_id:userId, action_type:actionType, description, metadata });
  } catch(err) { console.warn('Activity log failed:', err.message); }
}
export function fetchActivityLog(familyId, limit=50) {
  return db.from('activity_log').select('*').eq('family_id',familyId).order('created_at',{ascending:false}).limit(limit).then(({data,error})=>{ if(error) throw error; return data||[]; });
}
export const logItemComplete    = (fid,uid,label) => logActivity(fid,uid,'item_completed',`Completed: "${label}"`);
export const logItemUncomplete  = (fid,uid,label) => logActivity(fid,uid,'item_uncompleted',`Unchecked: "${label}"`);
export const logItemSkipped     = (fid,uid,label) => logActivity(fid,uid,'item_skipped',`Skipped (N/A): "${label}"`);
export const logItemUnskipped   = (fid,uid,label) => logActivity(fid,uid,'item_unskipped',`Restored: "${label}"`);
export const logSubComplete     = (fid,uid,label) => logActivity(fid,uid,'sub_completed',`Sub-task completed: "${label}"`);
export const logSubUncomplete   = (fid,uid,label) => logActivity(fid,uid,'sub_uncompleted',`Sub-task unchecked: "${label}"`);
export const logSubSkipped      = (fid,uid,label) => logActivity(fid,uid,'sub_skipped',`Sub-task skipped: "${label}"`);
export const logValueSet        = (fid,uid,label,val) => logActivity(fid,uid,'item_value_set',`Set "${label}": ${val}`);
export const logValueChanged    = (fid,uid,label,old,nw) => logActivity(fid,uid,'item_value_changed',`Updated "${label}": ${old} → ${nw}`);
export const logItemAdded       = (fid,uid,label) => logActivity(fid,uid,'item_added',`Added task: "${label}"`);
export const logSubItemAdded    = (fid,uid,label) => logActivity(fid,uid,'sub_item_added',`Added sub-task: "${label}"`);
export const logSectionAdded    = (fid,uid,title) => logActivity(fid,uid,'section_added',`Added section: "${title}"`);
export const logStatusChanged   = (fid,uid,o,n) => { const L={active:'Active',long_term:'Long Term',completed:'Completed'}; return logActivity(fid,uid,'status_changed',`Status: ${L[o]||o} → ${L[n]||n}`); };
export const logNotesEdited     = (fid,uid) => logActivity(fid,uid,'notes_edited','Case notes updated');
export const logQuickNote       = (fid,uid,note) => logActivity(fid,uid,'quick_note',`Quick note: "${note.substring(0,80)}${note.length>80?'…':''}"`);
export const logReminderAdded   = (fid,uid,desc,due) => logActivity(fid,uid,'reminder_added',`Reminder added: "${desc}" — due ${due}`);
export const logReminderDismissed = (fid,uid,desc) => logActivity(fid,uid,'reminder_dismissed',`Reminder dismissed: "${desc}"`);
export const logContactAdded    = (fid,uid,name) => logActivity(fid,uid,'contact_added',`Contact added: ${name}`);
export const logCaseCreated     = (fid,uid,name) => logActivity(fid,uid,'case_created',`Case created for ${name}`);
export const logParentAutoComplete = (fid,uid,label) => logActivity(fid,uid,'item_auto_completed',`Auto-completed: "${label}" (all sub-tasks done)`);
