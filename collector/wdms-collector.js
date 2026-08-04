/**
 * wdms-collector.js
 *
 * Lumos HRMS — EasyWDMS Attendance Collector Agent
 *
 * Runs on the client's Windows machine (same LAN as EasyWDMS SQL Server).
 * Every 60 seconds it pulls new attendance records from EasyWDMS SQL Server
 * and pushes them to the Lumos HRMS API.
 *
 * Setup:
 *   1. Copy this folder to the client's Windows machine
 *   2. npm install
 *   3. Copy .env.example → .env and fill in the values
 *   4. node wdms-collector.js  (or: npm run pm2 to run as background service)
 */

'use strict';

const sql    = require('mssql');
const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');

// ── Load .env manually (no dotenv dependency) ────────────────────────────────
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...rest] = line.trim().split('=');
    if (k && !k.startsWith('#') && rest.length) {
      process.env[k.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
    }
  });
}

// ── Configuration ─────────────────────────────────────────────────────────────
const CONFIG = {
  // EasyWDMS SQL Server (must be reachable from this machine)
  db: {
    server:   process.env.WDMS_DB_HOST     || '192.168.0.30',
    port:     parseInt(process.env.WDMS_DB_PORT   || '1433', 10),
    database: process.env.WDMS_DB_NAME     || 'EasyWDMS',
    user:     process.env.WDMS_DB_USER     || 'sa',
    password: process.env.WDMS_DB_PASSWORD || '',
    options: {
      encrypt:                false, // LAN — no TLS needed
      trustServerCertificate: true,
      connectTimeout:         15000,
      requestTimeout:         60000,
    },
    pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
  },

  // Lumos HRMS API
  apiUrl:    (process.env.HRMS_API_URL || 'https://hrms.recruitx-ai.com').replace(/\/$/, ''),
  apiKey:    process.env.HRMS_COLLECTOR_KEY || '',

  // How often to poll (milliseconds)
  pollMs: parseInt(process.env.POLL_INTERVAL_MS || '60000', 10),

  // Batch size — max records fetched per poll cycle
  batchSize: parseInt(process.env.BATCH_SIZE || '2000', 10),

  // EasyWDMS table/column names — adjust if your schema differs
  // Default matches standard ZKTeco EasyWDMS att_attlog schema
  table:   process.env.WDMS_TABLE    || 'att_attlog',
  colPin:  process.env.WDMS_COL_PIN  || 'USERID',      // employee PIN / enrollment number
  colTime: process.env.WDMS_COL_TIME || 'CHECKTIME',   // punch datetime
  colType: process.env.WDMS_COL_TYPE || 'CHECKTYPE',   // 0=In, 1=Out, 4=OT-In, 5=OT-Out
  colSN:   process.env.WDMS_COL_SN   || 'SN',          // device serial number

  // State file (tracks last synced timestamp to avoid re-importing old records)
  stateFile: process.env.STATE_FILE || path.join(__dirname, 'collector-state.json'),
};

// ── Validate required config ──────────────────────────────────────────────────
function validateConfig() {
  const missing = [];
  if (!CONFIG.apiKey)              missing.push('HRMS_COLLECTOR_KEY');
  if (!CONFIG.db.password)         missing.push('WDMS_DB_PASSWORD');
  if (missing.length) {
    log(`ERROR: Missing required config: ${missing.join(', ')}`);
    log('Copy .env.example → .env and fill in the missing values.');
    process.exit(1);
  }
}

// ── State management (last sync timestamp) ────────────────────────────────────
function loadState() {
  try {
    if (fs.existsSync(CONFIG.stateFile)) {
      return JSON.parse(fs.readFileSync(CONFIG.stateFile, 'utf8'));
    }
  } catch (_) {}
  // Default: start from 1 Aug 2026 (as per client requirement)
  return { lastSync: '2026-08-01T00:00:00.000Z', totalImported: 0, knownSerials: [] };
}

function saveState(state) {
  fs.writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2), 'utf8');
}

// ── Logger ────────────────────────────────────────────────────────────────────
function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}] ${msg}`);
}

// ── SQL Server connection with retry ──────────────────────────────────────────
async function connectWithRetry() {
  while (true) {
    try {
      log(`Connecting to SQL Server ${CONFIG.db.server}/${CONFIG.db.database}...`);
      const pool = await new sql.ConnectionPool(CONFIG.db).connect();
      log('SQL Server connected.');
      return pool;
    } catch (err) {
      log(`Connection failed: ${err.message}`);
      log('Retrying in 30 seconds...');
      await sleep(30000);
    }
  }
}

// ── Ping known device serials to keep last_seen fresh when idle ───────────────
async function pingKnownDevices() {
  const state = loadState();
  const serials = state.knownSerials || [];
  if (!serials.length) return;

  for (const sn of serials) {
    try {
      await axios.post(
        `${CONFIG.apiUrl}/api/biometric/collector-ping`,
        { device_serial: sn },
        { headers: { 'Content-Type': 'application/json', 'x-collector-key': CONFIG.apiKey }, timeout: 10000 }
      );
      log(`  Heartbeat ping sent for device ${sn}`);
    } catch (err) {
      log(`  Ping failed for ${sn}: ${err.response?.data?.error || err.message}`);
    }
  }
}

// ── Single poll cycle ─────────────────────────────────────────────────────────
async function poll(pool) {
  const state = loadState();
  const since = new Date(state.lastSync);

  log(`Polling since ${state.lastSync}...`);

  // Query EasyWDMS for new records
  const result = await pool.request()
    .input('since', sql.DateTime, since)
    .input('top',   sql.Int,      CONFIG.batchSize)
    .query(`
      SELECT TOP (@top)
        CAST(${CONFIG.colPin}  AS VARCHAR(50)) AS employee_pin,
        ${CONFIG.colTime}                       AS punch_time,
        ISNULL(${CONFIG.colType}, 0)            AS punch_type,
        CAST(${CONFIG.colSN}   AS VARCHAR(100)) AS device_serial
      FROM [${CONFIG.table}]
      WHERE ${CONFIG.colTime} > @since
        AND ${CONFIG.colSN}   IS NOT NULL
        AND CAST(${CONFIG.colPin} AS VARCHAR(50)) <> ''
      ORDER BY ${CONFIG.colTime} ASC
    `);

  const records = result.recordset;

  if (!records.length) {
    log('No new records found.');
    await pingKnownDevices();
    return;
  }

  log(`Found ${records.length} new record(s). Grouping by device...`);

  // Group punches by device serial
  const byDevice = {};
  let latestTime = since;

  for (const r of records) {
    const sn  = (r.device_serial || '').trim();
    const pin = (r.employee_pin  || '').trim();
    if (!sn || !pin) continue;

    if (!byDevice[sn]) byDevice[sn] = [];
    byDevice[sn].push({
      employee_pin: pin,
      punch_time:   r.punch_time instanceof Date
                      ? r.punch_time.toISOString()
                      : String(r.punch_time),
      punch_type: parseInt(r.punch_type ?? 0, 10),
    });

    if (r.punch_time > latestTime) latestTime = r.punch_time;
  }

  // Push each device's records to HRMS API
  let totalImported = 0;
  let totalSkipped  = 0;

  for (const [sn, punches] of Object.entries(byDevice)) {
    try {
      const resp = await axios.post(
        `${CONFIG.apiUrl}/api/biometric/collector-push`,
        { device_serial: sn, punches },
        {
          headers: {
            'Content-Type':    'application/json',
            'x-collector-key': CONFIG.apiKey,
          },
          timeout: 60000,
        }
      );
      const { imported, skipped, errors } = resp.data;
      log(`  Device ${sn}: imported=${imported} skipped=${skipped}`);
      if (errors?.length) log(`  Errors: ${errors.join('; ')}`);
      totalImported += imported || 0;
      totalSkipped  += skipped  || 0;
    } catch (err) {
      const msg = err.response?.data?.error || err.message;
      log(`  ERROR pushing device ${sn}: ${msg}`);
      // Don't advance lastSync — retry next cycle
      return;
    }
  }

  // Advance lastSync to latest record time + 1ms (avoid re-fetching boundary)
  const newSync = new Date(latestTime instanceof Date ? latestTime.getTime() + 1 : latestTime);
  const newTotal = (state.totalImported || 0) + totalImported;

  // Merge any new device serials seen this cycle into the known set (for idle pings)
  const prevSerials = new Set(state.knownSerials || []);
  Object.keys(byDevice).forEach(sn => prevSerials.add(sn));

  saveState({ lastSync: newSync.toISOString(), totalImported: newTotal, knownSerials: [...prevSerials] });

  log(`Done. Cycle total: imported=${totalImported} skipped=${totalSkipped}. All-time: ${newTotal}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  log('==============================================');
  log(' Lumos HRMS — EasyWDMS Collector Agent v1.0 ');
  log('==============================================');

  validateConfig();

  log(`HRMS API  : ${CONFIG.apiUrl}`);
  log(`SQL Server: ${CONFIG.db.server}:${CONFIG.db.port} / ${CONFIG.db.database}`);
  log(`Table     : ${CONFIG.table}`);
  log(`Interval  : ${CONFIG.pollMs / 1000}s`);

  const pool = await connectWithRetry();

  // Handle graceful shutdown
  process.on('SIGINT',  () => { log('Shutting down...'); pool.close(); process.exit(0); });
  process.on('SIGTERM', () => { log('Shutting down...'); pool.close(); process.exit(0); });

  // First poll immediately on startup
  try {
    await poll(pool);
  } catch (err) {
    log(`First poll error: ${err.message}`);
  }

  // Then poll on interval forever
  while (true) {
    await sleep(CONFIG.pollMs);
    try {
      await poll(pool);
    } catch (err) {
      log(`Poll error: ${err.message}`);
      // If connection dropped, reconnect
      if (err.code === 'ECONNRESET' || err.code === 'ESOCKET' || err.originalError?.code === 'ESOCKET') {
        log('Reconnecting to SQL Server...');
        try { await pool.close(); } catch (_) {}
        try {
          const newPool = await connectWithRetry();
          Object.assign(pool, newPool); // replace pool reference
        } catch (_) {}
      }
    }
  }
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
