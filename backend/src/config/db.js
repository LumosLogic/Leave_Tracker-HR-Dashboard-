/**
 * db.js — PostgreSQL database client (via pg adapter)
 * Exports { db, pool, seed } where `db` is a query builder backed by PostgreSQL.
 */

const { db, pool } = require('./db-pg-adapter');

async function seed() { /* no-op — run migrations separately */ }

module.exports = { db, pool, seed };
