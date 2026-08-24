/**
 * EasyWDMS SQL Server — read-only connectivity and data access test.
 *
 * What this script does:
 *   1. Reads config from environment / .env file (never hardcoded credentials)
 *   2. Opens a read-only TCP connection to the EasyWDMS SQL Server
 *   3. Verifies the iclock_transaction table exists
 *   4. Inspects the required columns (emp_code, punch_time, punch_state,
 *      terminal_sn, terminal_alias)
 *   5. Fetches the 10 most recent punch records
 *   6. Runs a historical count + sample query for a configurable date range
 *
 * What this script does NOT do:
 *   - No writes, no UPDATE, no DELETE
 *   - Does not touch the Processed column
 *   - Does not call our HRMS API
 *   - Does not interact with /iclock/, ADMS handlers, or PostgreSQL
 */

'use strict';

require('dotenv').config();
const sql = require('mssql');

// ── Config ──────────────────────────────────────────────────────────────────

const REQUIRED_COLUMNS = ['emp_code', 'punch_time', 'punch_state', 'terminal_sn', 'terminal_alias'];
const HISTORY_FROM    = process.env.HISTORY_FROM || '2026-06-01';
const HISTORY_TO      = process.env.HISTORY_TO   || '2026-07-31';

function buildConfig() {
  const host     = process.env.SQL_HOST;
  const port     = parseInt(process.env.SQL_PORT || '1433', 10);
  const database = process.env.SQL_DATABASE || 'EasyWDMS';
  const user     = process.env.SQL_USER;
  const password = process.env.SQL_PASSWORD;

  const missing = [];
  if (!host)     missing.push('SQL_HOST');
  if (!user)     missing.push('SQL_USER');
  if (password === undefined || password === null) missing.push('SQL_PASSWORD');

  if (missing.length) {
    fatal(`Missing required environment variables: ${missing.join(', ')}\n` +
          'Copy .env.example → .env and fill in the values.');
  }

  return {
    server:   host,
    port,
    database,
    user,
    password,
    options: {
      encrypt:                false, // EasyWDMS is on-premises — no TLS by default
      trustServerCertificate: true,
      enableArithAbort:       true,
      readOnlyIntent:         false, // standard connection; all queries are SELECT-only
    },
    connectionTimeout: parseInt(process.env.SQL_CONNECT_TIMEOUT || '15000', 10),
    requestTimeout:    parseInt(process.env.SQL_REQUEST_TIMEOUT  || '30000', 10),
    debug: process.env.SQL_DEBUG === 'true',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg)  { console.log(msg); }
function ok(msg)   { console.log(`  ✓  ${msg}`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }
function step(msg) { console.log(`\n── ${msg}`); }

function fatal(msg) {
  console.error(`\n✗  FATAL: ${msg}`);
  process.exit(1);
}

function classifyConnectionError(err) {
  const code = (err.code || '').toUpperCase();
  const msg  = (err.message || '').toLowerCase();

  if (code === 'ENOTFOUND' || code === 'EAI_NONAME') {
    return `DNS / hostname resolution failure — "${process.env.SQL_HOST}" could not be resolved.\n` +
           '  • Check SQL_HOST is the correct IP address or hostname.\n' +
           '  • From the Hostinger VPS, run: nslookup ' + process.env.SQL_HOST;
  }
  if (code === 'ECONNREFUSED') {
    return `Connection refused — the host responded but nothing is listening on port ${process.env.SQL_PORT || 1433}.\n` +
           '  • Confirm SQL Server is running on the target machine.\n' +
           '  • Confirm TCP/IP is enabled in SQL Server Configuration Manager.\n' +
           '  • Confirm the firewall allows inbound TCP 1433 from this server\'s IP.';
  }
  if (code === 'ETIMEOUT' || code === 'ESOCKETTIMEDOUT' || msg.includes('timeout')) {
    return `Connection timed out — the host at "${process.env.SQL_HOST}:${process.env.SQL_PORT || 1433}" did not respond within ` +
           `${process.env.SQL_CONNECT_TIMEOUT || 15000} ms.\n` +
           '  • Check network routing / firewall between the Hostinger VPS and the client LAN.\n' +
           '  • If the SQL Server is on a private LAN (192.168.x.x), a VPN or SSH tunnel is required.\n' +
           '  • From the VPS, try: nc -zv ' + process.env.SQL_HOST + ' ' + (process.env.SQL_PORT || 1433);
  }
  if (msg.includes('login failed') || msg.includes('password') || msg.includes('18456')) {
    return 'Authentication failure — SQL Server rejected the credentials.\n' +
           '  • Verify SQL_USER and SQL_PASSWORD in .env.\n' +
           '  • Confirm the login exists in SQL Server and is enabled.\n' +
           '  • Confirm SQL Server Authentication mode is ON (Mixed Mode).';
  }
  if (msg.includes('cannot open database') || msg.includes('database') && msg.includes('not found')) {
    return `Database not found — SQL Server connected but could not open "${process.env.SQL_DATABASE || 'EasyWDMS'}".\n` +
           '  • Verify SQL_DATABASE is spelled exactly as it appears in SQL Server.\n' +
           '  • Confirm the login has access to that database.';
  }
  return err.message;
}

function printRow(row, index) {
  log(`  [${String(index + 1).padStart(2, '0')}] emp_code=${row.emp_code}  ` +
      `punch_time=${row.punch_time instanceof Date
        ? row.punch_time.toISOString().replace('T', ' ').substring(0, 19)
        : row.punch_time}  ` +
      `punch_state=${row.punch_state}  ` +
      `terminal_sn=${row.terminal_sn || '(null)'}  ` +
      `terminal_alias=${row.terminal_alias || '(null)'}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('   EasyWDMS SQL Server — Read-Only Connectivity Test');
  console.log('═══════════════════════════════════════════════════════════════');

  const config = buildConfig();

  log(`\nTarget  : ${config.server}:${config.port}`);
  log(`Database: ${config.database}`);
  log(`User    : ${config.user}`);
  log(`Timeout : connect=${config.connectionTimeout}ms  query=${config.requestTimeout}ms`);

  // ── Step 1: Connect ───────────────────────────────────────────────────────
  step('Step 1 — Opening TCP connection to SQL Server');

  let pool;
  try {
    pool = await sql.connect(config);
    ok(`Connected to ${config.server}:${config.port} / ${config.database}`);
  } catch (err) {
    console.error('\n✗  CONNECTION FAILED\n');
    console.error('Reason:', classifyConnectionError(err));
    console.error('\nRaw error code   :', err.code    || '(none)');
    console.error('Raw error message:', err.message || '(none)');
    console.error('\n═══════════════════════════════════════════════════════════════');
    console.error('   RESULT: CONNECTION FAILED');
    console.error('═══════════════════════════════════════════════════════════════');
    process.exit(1);
  }

  // ── Step 2: Verify server version (smoke test) ────────────────────────────
  step('Step 2 — Server version smoke test');
  try {
    const result = await pool.request().query('SELECT @@VERSION AS version, GETDATE() AS server_time');
    const row = result.recordset[0];
    ok(`Server time : ${row.server_time}`);
    ok(`SQL version : ${String(row.version).split('\n')[0].trim()}`);
  } catch (err) {
    warn(`Could not retrieve server version: ${err.message}`);
  }

  // ── Step 3: Verify iclock_transaction exists ──────────────────────────────
  step('Step 3 — Verifying iclock_transaction table exists');
  let tableExists = false;
  try {
    const result = await pool.request()
      .input('tableName', sql.NVarChar, 'iclock_transaction')
      .query(`
        SELECT COUNT(*) AS cnt
        FROM   INFORMATION_SCHEMA.TABLES
        WHERE  TABLE_TYPE   = 'BASE TABLE'
          AND  TABLE_NAME   = @tableName
      `);
    tableExists = result.recordset[0].cnt > 0;

    if (tableExists) {
      ok('iclock_transaction table found');
    } else {
      warn('iclock_transaction table NOT FOUND in INFORMATION_SCHEMA.');
      warn('Listing all tables in this database so you can identify the correct name:');

      const allTables = await pool.request().query(`
        SELECT TABLE_NAME
        FROM   INFORMATION_SCHEMA.TABLES
        WHERE  TABLE_TYPE = 'BASE TABLE'
        ORDER  BY TABLE_NAME
      `);
      allTables.recordset.forEach(r => log(`       ${r.TABLE_NAME}`));
    }
  } catch (err) {
    warn(`Table check failed: ${err.message}`);
  }

  // ── Step 4: Column inspection ─────────────────────────────────────────────
  step('Step 4 — Inspecting required columns');
  if (tableExists) {
    try {
      const result = await pool.request()
        .input('tableName', sql.NVarChar, 'iclock_transaction')
        .query(`
          SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
          FROM   INFORMATION_SCHEMA.COLUMNS
          WHERE  TABLE_NAME = @tableName
          ORDER  BY ORDINAL_POSITION
        `);

      const allCols    = result.recordset.map(r => r.COLUMN_NAME.toLowerCase());
      const foundCols  = [];
      const missingCols = [];

      for (const col of REQUIRED_COLUMNS) {
        if (allCols.includes(col.toLowerCase())) {
          foundCols.push(col);
        } else {
          missingCols.push(col);
        }
      }

      log('\n  Full column list:');
      result.recordset.forEach(r => {
        const required = REQUIRED_COLUMNS.map(c => c.toLowerCase()).includes(r.COLUMN_NAME.toLowerCase());
        const marker   = required ? '★' : ' ';
        const width    = r.CHARACTER_MAXIMUM_LENGTH ? `(${r.CHARACTER_MAXIMUM_LENGTH})` : '';
        log(`    ${marker} ${r.COLUMN_NAME.padEnd(30)} ${r.DATA_TYPE}${width}  nullable=${r.IS_NULLABLE}`);
      });

      log('');
      if (foundCols.length)   ok(`Required columns present  : ${foundCols.join(', ')}`);
      if (missingCols.length) warn(`Required columns MISSING  : ${missingCols.join(', ')}`);
    } catch (err) {
      warn(`Column inspection failed: ${err.message}`);
    }
  } else {
    warn('Skipping column check — table not found.');
  }

  // ── Step 5: 10 most recent punch records ──────────────────────────────────
  step('Step 5 — Fetching 10 most recent punch records');
  if (tableExists) {
    try {
      const result = await pool.request().query(`
        SELECT TOP 10
          emp_code,
          punch_time,
          punch_state,
          terminal_sn,
          terminal_alias
        FROM  iclock_transaction
        ORDER BY punch_time DESC
      `);

      if (result.recordset.length === 0) {
        warn('Table exists but contains 0 rows.');
      } else {
        ok(`Returned ${result.recordset.length} row(s):`);
        result.recordset.forEach((row, i) => printRow(row, i));
      }
    } catch (err) {
      warn(`Recent-records query failed: ${err.message}`);
      if (err.message.toLowerCase().includes('invalid column')) {
        warn('One or more required columns (emp_code / punch_time / punch_state / terminal_sn / terminal_alias) may have a different name.');
        warn('Check the full column list printed in Step 4.');
      }
    }
  } else {
    warn('Skipping recent-records query — table not found.');
  }

  // ── Step 6: Historical range query ────────────────────────────────────────
  step(`Step 6 — Historical range query: ${HISTORY_FROM} → ${HISTORY_TO}`);
  if (tableExists) {
    try {
      const countResult = await pool.request()
        .input('fromDate', sql.DateTime, new Date(HISTORY_FROM + 'T00:00:00'))
        .input('toDate',   sql.DateTime, new Date(HISTORY_TO   + 'T23:59:59'))
        .query(`
          SELECT COUNT(*) AS total_records
          FROM   iclock_transaction
          WHERE  punch_time >= @fromDate
            AND  punch_time <= @toDate
        `);

      const total = countResult.recordset[0].total_records;
      ok(`Total punch records in range: ${total}`);

      if (total > 0) {
        const sampleResult = await pool.request()
          .input('fromDate', sql.DateTime, new Date(HISTORY_FROM + 'T00:00:00'))
          .input('toDate',   sql.DateTime, new Date(HISTORY_TO   + 'T23:59:59'))
          .query(`
            SELECT TOP 5
              emp_code,
              punch_time,
              punch_state,
              terminal_sn,
              terminal_alias
            FROM  iclock_transaction
            WHERE punch_time >= @fromDate
              AND punch_time <= @toDate
            ORDER BY punch_time DESC
          `);

        log(`\n  Sample (5 newest in range):`);
        sampleResult.recordset.forEach((row, i) => printRow(row, i));

        // Unique employee count in range
        const empResult = await pool.request()
          .input('fromDate', sql.DateTime, new Date(HISTORY_FROM + 'T00:00:00'))
          .input('toDate',   sql.DateTime, new Date(HISTORY_TO   + 'T23:59:59'))
          .query(`
            SELECT COUNT(DISTINCT emp_code) AS unique_employees
            FROM   iclock_transaction
            WHERE  punch_time >= @fromDate
              AND  punch_time <= @toDate
          `);
        ok(`Unique employees in range    : ${empResult.recordset[0].unique_employees}`);

        // Per-terminal breakdown
        const termResult = await pool.request()
          .input('fromDate', sql.DateTime, new Date(HISTORY_FROM + 'T00:00:00'))
          .input('toDate',   sql.DateTime, new Date(HISTORY_TO   + 'T23:59:59'))
          .query(`
            SELECT   terminal_sn, terminal_alias, COUNT(*) AS punches
            FROM     iclock_transaction
            WHERE    punch_time >= @fromDate
              AND    punch_time <= @toDate
            GROUP BY terminal_sn, terminal_alias
            ORDER BY punches DESC
          `);

        if (termResult.recordset.length) {
          log('\n  Punches by terminal:');
          termResult.recordset.forEach(r =>
            log(`    ${(r.terminal_alias || r.terminal_sn || '(unknown)').padEnd(25)} ${String(r.punches).padStart(7)} punches`)
          );
        }
      } else {
        warn(`No records found between ${HISTORY_FROM} and ${HISTORY_TO}.`);
        warn('Try adjusting HISTORY_FROM / HISTORY_TO in .env or check that punch_time column stores dates in this range.');
      }
    } catch (err) {
      warn(`Historical query failed: ${err.message}`);
    }
  } else {
    warn('Skipping historical query — table not found.');
  }

  // ── Close + final verdict ─────────────────────────────────────────────────
  await pool.close();

  console.log('\n═══════════════════════════════════════════════════════════════');
  if (tableExists) {
    console.log('   RESULT: CONNECTED + DATA AVAILABLE');
  } else {
    console.log('   RESULT: CONNECTED — but iclock_transaction table not found');
    console.log('   Check the table list printed in Step 3.');
  }
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\n✗  Unexpected error:', err.message);
  console.error('\n═══════════════════════════════════════════════════════════════');
  console.error('   RESULT: CONNECTION FAILED');
  console.error('═══════════════════════════════════════════════════════════════\n');
  process.exit(1);
});
