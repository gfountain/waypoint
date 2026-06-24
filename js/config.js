// ─── WAYPOINT CONFIGURATION ──────────────────────────────────
// Supabase project credentials
// Safe to commit — protected by Row Level Security on all tables

export const SUPABASE_URL = 'https://bhxrumgfuviafluycyak.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJoeHJ1bWdmdXZpYWZsdXljeWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNjQwMjAsImV4cCI6MjA5NzY0MDAyMH0.4xse39KfU_BFaJ0qdgcYqASMLSzCdDjY2_6RsbvsI4s';

// App settings
export const APP_NAME = 'Waypoint';
export const APP_VERSION = '1.0.0';

// Session warning — show warning this many seconds before expiry
export const SESSION_WARNING_SECONDS = 300; // 5 minutes

// How many days ahead to show upcoming reminders in the bell
export const REMINDER_LOOKAHEAD_DAYS = 7;
