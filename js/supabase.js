// ─── SUPABASE CLIENT ─────────────────────────────────────────
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

export const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
