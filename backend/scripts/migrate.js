/**
 * migrate.js — runs all SQL migration files against PostgreSQL
 * Called by docker-entrypoint.sh before the app starts.
 * Safe to run on every startup (all migrations use IF NOT EXISTS / ON CONFLICT).
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'lumos_hrms',
  user:     process.env.DB_USER     || 'lumos_admin',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 30000,
});

const MIGRATIONS = [
  'backend/migrations/full_schema.sql',
  'backend/migrations/sanghavi_migration.sql',
];

async function run() {
  const root = path.join(__dirname, '../../');

  console.log('\n📦 Running database migrations...');

  for (const rel of MIGRATIONS) {
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) {
      console.warn(`  ⚠️  Not found, skipping: ${rel}`);
      continue;
    }
    try {
      const sql = fs.readFileSync(file, 'utf8');
      await pool.query(sql);
      console.log(`  ✅ ${rel}`);
    } catch (err) {
      // Individual statement errors that are safe to ignore (already applied)
      if (err.code === '42701' || err.code === '42P07') {
        console.log(`  ✅ ${rel} (already applied)`);
      } else {
        console.error(`  ❌ ${rel}: ${err.message}`);
        throw err;
      }
    }
  }

  await pool.end();
  console.log('✅ Migrations complete\n');
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
