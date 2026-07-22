/**
 * db.js — PostgreSQL database client (via pg adapter)
 * Exports { supabase, pool, seed } where `supabase` is a Supabase-compatible
 * query builder backed by PostgreSQL.
 */

const { supabase, pool } = require('./db-pg-adapter');

async function seed() { /* no-op — run migrations separately */ }

module.exports = { supabase, pool, seed };
