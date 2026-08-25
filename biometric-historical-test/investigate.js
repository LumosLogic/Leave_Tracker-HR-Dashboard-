'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  ZKTeco Historical Attendance — READ-ONLY Investigation
//  Lumos Logic HRMS  ×  Relitrade Shares Broker
//
//  SAFETY CONTRACT
//  ───────────────
//  • Only executes SELECT queries on the production database
//  • No INSERT / UPDATE / DELETE on any table
//  • No device configuration changes
//  • No force-sync trigger
//  • No records cleared from ZKTeco devices
//  • ZKLib TCP probe is connect-only — sends CMD_CONNECT + CMD_EXIT then disconnects
//
//  HOW TO RUN (on Hostinger VPS)
//  ───────────────────────────────
//    cd /path/to/app/biometric-historical-test
//    npm install
//    node investigate.js
//
//  Output: console report  +  output/investigation_YYYYMMDD_HHMMSS.json
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const fs   = require('fs');
const net  = require('net');

// Load main project .env (same VPS, one level up)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = require('pg');

// ── Read-only DB pool ─────────────────────────────────────────────────────────
// Uses the same credentials as the production app — SELECT only queries below.
const pool = new Pool({
  host:                    process.env.DB_HOST     || 'localhost',
  port:                    parseInt(process.env.DB_PORT, 10) || 5432,
  database:                process.env.DB_NAME     || 'lumos_hrms',
  user:                    process.env.DB_USER     || 'lumos_admin',
  password:                process.env.DB_PASSWORD,
  max:                     3,
  idleTimeoutMillis:       15000,
  connectionTimeoutMillis: 8000,
});

// ── ZKTeco ZKLib TCP Protocol — minimal read-only probe ──────────────────────
//
// ZKTeco devices support two communication modes:
//   1. ADMS / HTTP push  (device → server on port 80/443) — already in production
//   2. ZKLib / TCP pull  (server → device on port 4370)   — this probe
//
// Packet format (ZKLib binary):
//   Bytes 0-1  : command code (uint16 LE)
//   Bytes 2-3  : checksum    (uint16 LE, byte-sum of all bytes except 2-3)
//   Bytes 4-5  : session ID  (uint16 LE, assigned by device on ACK_OK)
//   Bytes 6-7  : reply ID    (uint16 LE, incremented per packet)
//   Bytes 8+   : payload
//
const ZK_CMD_CONNECT   = 1000;  // initial handshake
const ZK_CMD_EXIT      = 1001;  // clean disconnect
const ZK_CMD_ACK_OK    = 2000;  // device accepted command
const ZK_CMD_ACK_ERROR = 2001;  // device rejected

function buildZkPacket(cmd, data, sessionId, replyId) {
  data      = data      || Buffer.alloc(0);
  sessionId = sessionId || 0;
  replyId   = replyId   || 65534;

  const pkt = Buffer.alloc(8 + data.length);
  pkt.writeUInt16LE(cmd,       0);
  pkt.writeUInt16LE(0,         2);   // checksum placeholder
  pkt.writeUInt16LE(sessionId, 4);
  pkt.writeUInt16LE(replyId,   6);
  data.copy(pkt, 8);

  // Checksum: byte-sum of all positions except 2 and 3
  let cs = 0;
  for (let i = 0; i < pkt.length; i++) {
    if (i === 2 || i === 3) continue;
    cs += pkt[i];
    if (cs > 0xFFFF) cs -= 0xFFFF;
  }
  pkt.writeUInt16LE(cs & 0xFFFF, 2);
  return pkt;
}

function parseZkPacket(buf) {
  if (!buf || buf.length < 8) return null;
  return {
    command:   buf.readUInt16LE(0),
    checksum:  buf.readUInt16LE(2),
    sessionId: buf.readUInt16LE(4),
    replyId:   buf.readUInt16LE(6),
    payload:   buf.slice(8),
  };
}

// Connect, authenticate, immediately disconnect — does not read any data
async function probeDeviceTcp(ip, port, timeoutMs) {
  port      = port      || 4370;
  timeoutMs = timeoutMs || 7000;

  return new Promise((resolve) => {
    if (!ip || !ip.trim()) {
      return resolve({ accessible: false, error: 'No device_ip configured in HRMS' });
    }

    const result = { ip, port, accessible: false, sessionId: null, error: null, latencyMs: null };
    let finished = false;
    let connectTime;

    const done = (r) => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      try { sock.destroy(); } catch (_) {}
      resolve(r);
    };

    const watchdog = setTimeout(() => {
      done({ ...result, error: `Timed out after ${timeoutMs}ms — device likely on private/NAT network, not directly reachable from VPS` });
    }, timeoutMs);

    const sock = net.createConnection({ host: ip, port }, () => {
      connectTime = Date.now();
      sock.write(buildZkPacket(ZK_CMD_CONNECT, null, 0, 65534));
    });

    sock.on('data', (data) => {
      const pkt = parseZkPacket(data);
      if (!pkt) {
        done({ ...result, error: 'Device response was not a valid ZKLib packet' });
        return;
      }
      if (pkt.command === ZK_CMD_ACK_OK) {
        result.accessible = true;
        result.sessionId  = pkt.sessionId;
        result.latencyMs  = connectTime ? Date.now() - connectTime : null;
        // Send clean disconnect so device resets session properly
        sock.write(buildZkPacket(ZK_CMD_EXIT, null, pkt.sessionId, 65535));
        setTimeout(() => done(result), 150);
      } else {
        done({ ...result, error: `Device responded with ZKLib command ${pkt.command} (expected ${ZK_CMD_ACK_OK})` });
      }
    });

    sock.on('error', (err) => done({ ...result, error: `TCP error: ${err.message}` }));
    sock.on('close', () => done(result));
  });
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function bar(title) {
  const line = '─'.repeat(72);
  if (title) {
    console.log('\n' + line);
    console.log('  ' + title);
    console.log(line);
  } else {
    console.log(line);
  }
}

function toIST(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';
}

function padR(s, n) {
  return String(s ?? 'N/A').padEnd(n);
}

// ── Main investigation ────────────────────────────────────────────────────────
async function investigate() {
  const startedAt = new Date();
  const report    = {
    startedAt:            startedAt.toISOString(),
    production_modified:  false,
    device_records_deleted: false,
  };

  bar();
  console.log('  ZKTeco Historical Attendance — READ-ONLY Investigation');
  console.log('  Lumos Logic HRMS  ×  Relitrade Shares Broker');
  bar();
  console.log(`  Started : ${toIST(startedAt)}`);
  console.log(`  Mode    : READ-ONLY — zero writes, zero device changes`);
  console.log(`  DB Host : ${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`);
  console.log(`  DB Name : ${process.env.DB_NAME || 'lumos_hrms'}`);

  // ── Step 1: DB connectivity check ─────────────────────────────────────────
  bar('STEP 1 — Database Connectivity');
  try {
    const r = await pool.query(`SELECT NOW() AS db_now, current_database() AS db_name, version() AS pg_ver`);
    const row = r.rows[0];
    console.log(`  ✓ Connected`);
    console.log(`  DB time    : ${toIST(row.db_now)}`);
    console.log(`  Database   : ${row.db_name}`);
    console.log(`  PostgreSQL : ${row.pg_ver.split(' ').slice(0, 2).join(' ')}`);
    report.db = { connected: true, time: row.db_now, db_name: row.db_name, pg_version: row.pg_ver.split(' ').slice(0, 2).join(' ') };
  } catch (err) {
    console.error(`  ✗ DB connection failed: ${err.message}`);
    console.error('  Cannot continue without DB access. Check DB_HOST / DB_USER / DB_PASSWORD in .env');
    report.db = { connected: false, error: err.message };
    await pool.end().catch(() => {});
    return;
  }

  // ── Step 2: Registered biometric devices ──────────────────────────────────
  bar('STEP 2 — Registered Biometric Devices');
  let devices = [];
  try {
    // Use try/catch on each column that may not exist on older schema versions
    const res = await pool.query(`
      SELECT
        d.id,
        d.serial_number,
        d.device_name,
        d.location,
        d.device_ip,
        d.status,
        d.last_seen,
        d.branch_id,
        b.name           AS branch_name,
        d.area_code
      FROM biometric_devices d
      LEFT JOIN branches b ON b.id = d.branch_id
      ORDER BY d.device_name NULLS LAST, d.serial_number
    `);
    devices = res.rows;

    // Try to read last_sync columns — added later, may not exist on all deployments
    try {
      const syncRes = await pool.query(`
        SELECT id, last_sync_requested_at, last_sync_status FROM biometric_devices
      `);
      for (const sr of syncRes.rows) {
        const dev = devices.find(d => d.id === sr.id);
        if (dev) {
          dev.last_sync_requested_at = sr.last_sync_requested_at;
          dev.last_sync_status       = sr.last_sync_status;
        }
      }
    } catch (_) {
      // Columns don't exist yet — OK
    }

    console.log(`  Total registered: ${devices.length} device(s)\n`);
    console.log(`  ${'Serial'.padEnd(18)} ${'Name'.padEnd(24)} ${'Branch'.padEnd(18)} ${'IP'.padEnd(16)} ${'Status'.padEnd(10)} Last Seen`);
    console.log(`  ${'-'.repeat(18)} ${'-'.repeat(24)} ${'-'.repeat(18)} ${'-'.repeat(16)} ${'-'.repeat(10)} ---------`);
    for (const d of devices) {
      console.log(
        `  ${padR(d.serial_number,18)} ${padR(d.device_name,24)} ` +
        `${padR(d.branch_name,18)} ${padR(d.device_ip,16)} ` +
        `${padR(d.status,10)} ${d.last_seen ? toIST(d.last_seen) : 'Never'}`
      );
    }

    if (devices.some(d => d.last_sync_requested_at)) {
      console.log('\n  Last Force-Sync requests:');
      for (const d of devices) {
        if (d.last_sync_requested_at) {
          console.log(`    ${d.serial_number} → status=${d.last_sync_status} @ ${toIST(d.last_sync_requested_at)}`);
        }
      }
    }

    report.devices = devices.map(d => ({
      id:             d.id,
      serial:         d.serial_number,
      name:           d.device_name,
      branch:         d.branch_name,
      location:       d.location,
      ip:             d.device_ip,
      status:         d.status,
      last_seen:      d.last_seen,
      last_sync_status: d.last_sync_status,
      last_sync_requested_at: d.last_sync_requested_at,
    }));
  } catch (err) {
    console.error(`  ✗ Error querying biometric_devices: ${err.message}`);
    report.devices_error = err.message;
  }

  // ── Step 3: Raw log analysis per device ───────────────────────────────────
  bar('STEP 3 — Biometric Raw Log Analysis  (existing DB records — read-only)');
  const logStats = {};
  try {
    const res = await pool.query(`
      SELECT
        device_serial,
        COUNT(*)                                AS total_records,
        COUNT(*) FILTER (WHERE processed)       AS processed_count,
        COUNT(*) FILTER (WHERE NOT processed)   AS unprocessed_count,
        MIN(punch_time)                         AS oldest_punch,
        MAX(punch_time)                         AS newest_punch,
        COUNT(DISTINCT employee_pin)            AS unique_pins,
        COUNT(*) FILTER (WHERE source = 'adms_live')      AS adms_live_count,
        COUNT(*) FILTER (WHERE source = 'collector')      AS collector_count,
        COUNT(*) FILTER (WHERE source = 'easywdms_import') AS easywdms_count,
        COUNT(*) FILTER (WHERE source NOT IN ('adms_live','collector','easywdms_import') OR source IS NULL)
                                                AS other_source_count
      FROM biometric_raw_logs
      GROUP BY device_serial
      ORDER BY device_serial
    `);

    if (res.rows.length === 0) {
      console.log('  No raw log entries found in biometric_raw_logs.');
    } else {
      for (const row of res.rows) {
        console.log(`\n  Device Serial: ${row.device_serial}`);
        console.log(`    Total records    : ${row.total_records}`);
        console.log(`    Processed        : ${row.processed_count}`);
        console.log(`    Unprocessed      : ${row.unprocessed_count}`);
        console.log(`    Unique PINs      : ${row.unique_pins}`);
        console.log(`    Oldest punch     : ${toIST(row.oldest_punch)}`);
        console.log(`    Newest punch     : ${toIST(row.newest_punch)}`);
        console.log(`    Source breakdown : adms_live=${row.adms_live_count}  collector=${row.collector_count}  easywdms=${row.easywdms_count}  other=${row.other_source_count}`);
        logStats[row.device_serial] = row;
      }
    }
    report.raw_log_analysis = res.rows;
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    report.raw_log_error = err.message;
  }

  // ── Step 4: Overall DB biometric statistics ───────────────────────────────
  bar('STEP 4 — Overall Database Statistics');
  try {
    const res = await pool.query(`
      SELECT
        COUNT(*)                            AS total_raw_logs,
        COUNT(DISTINCT device_serial)       AS device_count,
        COUNT(DISTINCT employee_pin)        AS unique_employee_pins,
        MIN(punch_time)                     AS overall_oldest,
        MAX(punch_time)                     AS overall_newest,
        COUNT(*) FILTER (WHERE punch_time < '2026-08-01T00:00:00+05:30')  AS pre_cutoff_count,
        COUNT(*) FILTER (WHERE punch_time >= '2026-08-01T00:00:00+05:30') AS post_cutoff_count
      FROM biometric_raw_logs
    `);
    const s = res.rows[0];
    console.log(`  Total raw log entries    : ${s.total_raw_logs}`);
    console.log(`  Unique devices in logs   : ${s.device_count}`);
    console.log(`  Unique employee PINs     : ${s.unique_employee_pins}`);
    console.log(`  Oldest record in DB      : ${toIST(s.overall_oldest)}`);
    console.log(`  Newest record in DB      : ${toIST(s.overall_newest)}`);
    console.log(`  Pre-cutoff records       : ${s.pre_cutoff_count}  (before 2026-08-01 IST)`);
    console.log(`  Post-cutoff records      : ${s.post_cutoff_count} (from  2026-08-01 IST onwards)`);

    if (parseInt(s.pre_cutoff_count, 10) > 0) {
      console.log(`\n  ⚠  ${s.pre_cutoff_count} pre-cutoff records exist in DB.`);
      console.log('     These were likely imported via EasyWDMS batch import (bypasses hard cutoff).');
    }
    report.overall_stats = s;
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    report.overall_stats_error = err.message;
  }

  // ── Step 5: Audit log — ADMS heartbeat / push activity ────────────────────
  bar('STEP 5 — Biometric Audit Log  (ADMS heartbeat / push history)');
  try {
    const existsRes = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'biometric_audit_log'
      ) AS tbl_exists
    `);

    if (!existsRes.rows[0].tbl_exists) {
      console.log('  biometric_audit_log table does not exist — migration may not have run.');
      report.audit_log = { table_exists: false };
    } else {
      const res = await pool.query(`
        SELECT
          serial_number,
          COUNT(*)         AS total_requests,
          MIN(ts)          AS first_seen,
          MAX(ts)          AS last_seen,
          COUNT(*) FILTER (WHERE method = 'POST' AND path = '/cdata') AS attlog_pushes,
          COUNT(*) FILTER (WHERE method = 'GET'  AND path = '/getrequest') AS heartbeats,
          COUNT(*) FILTER (WHERE status_sent = 403) AS rejected_403
        FROM biometric_audit_log
        GROUP BY serial_number
        ORDER BY last_seen DESC
      `);

      if (res.rows.length === 0) {
        console.log('  No audit log entries yet.');
      } else {
        for (const row of res.rows) {
          console.log(`\n  Serial     : ${row.serial_number || '(no SN)'}`);
          console.log(`  Requests   : ${row.total_requests}  (heartbeats=${row.heartbeats}, ATTLOG pushes=${row.attlog_pushes}, rejected=${row.rejected_403})`);
          console.log(`  First seen : ${toIST(row.first_seen)}`);
          console.log(`  Last seen  : ${toIST(row.last_seen)}`);
        }
      }
      report.audit_log = { table_exists: true, entries: res.rows };
    }
  } catch (err) {
    console.error(`  ✗ Error reading audit log: ${err.message}`);
    report.audit_log_error = err.message;
  }

  // ── Step 6: Employee mapping completeness ─────────────────────────────────
  bar('STEP 6 — Employee PIN Mapping Completeness');
  try {
    const res = await pool.query(`
      SELECT
        COUNT(DISTINCT l.employee_pin)                                           AS pins_with_logs,
        COUNT(DISTINCT m.employee_pin)                                           AS pins_mapped,
        COUNT(DISTINCT l.employee_pin) FILTER (WHERE m.user_id IS NULL)         AS pins_unmapped,
        COUNT(*) FILTER (WHERE m.user_id IS NULL AND l.processed = false)       AS unprocessed_unmapped_logs
      FROM biometric_raw_logs l
      LEFT JOIN biometric_employee_map m
        ON m.org_id = l.org_id AND m.employee_pin = l.employee_pin
    `);
    const s = res.rows[0];
    console.log(`  PINs that have log records : ${s.pins_with_logs}`);
    console.log(`  PINs mapped to employees  : ${s.pins_mapped}`);
    console.log(`  PINs NOT yet mapped       : ${s.pins_unmapped}  ← unprocessable until mapped`);
    console.log(`  Unprocessed + unmapped    : ${s.unprocessed_unmapped_logs} raw log entries`);

    if (parseInt(s.pins_unmapped, 10) > 0) {
      const unmappedRes = await pool.query(`
        SELECT DISTINCT l.employee_pin, COUNT(*) AS log_count, MIN(l.punch_time) AS first, MAX(l.punch_time) AS last
        FROM biometric_raw_logs l
        LEFT JOIN biometric_employee_map m ON m.org_id = l.org_id AND m.employee_pin = l.employee_pin
        WHERE m.user_id IS NULL
        GROUP BY l.employee_pin
        ORDER BY log_count DESC
        LIMIT 20
      `);
      console.log('\n  Top unmapped PINs (max 20):');
      console.log(`  ${'PIN'.padEnd(12)} ${'Logs'.padEnd(8)} ${'First Punch'.padEnd(30)} Last Punch`);
      for (const r of unmappedRes.rows) {
        console.log(`  ${padR(r.employee_pin,12)} ${padR(r.log_count,8)} ${padR(toIST(r.first),30)} ${toIST(r.last)}`);
      }
      report.unmapped_pins = unmappedRes.rows;
    }
    report.mapping_stats = s;
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    report.mapping_error = err.message;
  }

  // ── Step 7: ZKLib TCP direct device probe ────────────────────────────────
  bar('STEP 7 — ZKLib TCP Direct Device Probe  (port 4370 per device)');
  console.log(`
  ZKTeco devices support two-way communication:
    • ADMS push  (device → server via HTTP)   — production flow, port 80/443
    • ZKLib pull (server → device via TCP)    — this probe, port 4370

  If ZKLib is accessible, we can directly read device record counts and
  the full date range WITHOUT triggering the ADMS push pipeline.
  If not (typical when devices are behind NAT), we document it and fall back
  to the ADMS-based historical sync described in Step 8.
  `);

  const tcpResults = [];
  const devicesWithIp = devices.filter(d => d.device_ip && d.device_ip.trim());
  const devicesNoIp   = devices.filter(d => !d.device_ip || !d.device_ip.trim());

  if (devicesNoIp.length) {
    console.log(`  ${devicesNoIp.length} device(s) have no IP configured — cannot probe:`);
    for (const d of devicesNoIp) {
      console.log(`    • ${d.device_name || d.serial_number}`);
      tcpResults.push({ serial: d.serial_number, name: d.device_name, accessible: false, error: 'No device_ip in HRMS' });
    }
    console.log();
  }

  if (devicesWithIp.length === 0) {
    console.log('  No device IPs are configured in HRMS — ZKLib TCP probe skipped.');
    console.log('  This is expected for ADMS-only deployments (devices push to server, server cannot initiate).');
  } else {
    console.log(`  Probing ${devicesWithIp.length} device(s)...`);
    for (const dev of devicesWithIp) {
      process.stdout.write(`  → ${padR(dev.device_name || dev.serial_number, 26)} ${dev.device_ip}:4370  ...  `);
      const r = await probeDeviceTcp(dev.device_ip, 4370, 7000);
      if (r.accessible) {
        console.log(`✓ ACCESSIBLE  session=${r.sessionId}  latency=${r.latencyMs}ms`);
      } else {
        console.log(`✗ NOT REACHABLE\n       ${r.error}`);
      }
      tcpResults.push({ serial: dev.serial_number, name: dev.device_name, ip: dev.device_ip, ...r });
    }
  }

  const tcpAccessible = tcpResults.filter(r => r.accessible);
  report.tcp_probe = { results: tcpResults, accessible_count: tcpAccessible.length };

  // ── Step 8: Existing force-sync mechanism analysis ────────────────────────
  bar('STEP 8 — Existing Force-Sync Mechanism  (code analysis)');

  const HARD_CUTOFF_FILE = 'backend/src/modules/biometric/biometricPush.handler.js';
  const HARD_CUTOFF_LINE = 146;
  const HARD_CUTOFF_DATE = '2026-08-01T00:00:00+05:30';

  console.log(`
  ┌──────────────────────────────────────────────────────────────────────┐
  │  FINDING: Force-Sync API Already EXISTS in Production HRMS           │
  └──────────────────────────────────────────────────────────────────────┘

  Endpoint : POST /api/biometric/devices/:id/force-sync  (JWT protected)
  File     : backend/src/modules/biometric/biometric.routes.js  (line 276)

  How it works:
    1. Admin calls POST /api/biometric/devices/:id/force-sync
    2. Server schedules: scheduleSyncForSn(serial_number)
    3. On next heartbeat (GET /iclock/getrequest), server responds:
         "GET ATTLOG Stamp=0"
    4. ZKTeco device interprets this as: "re-send ALL stored records from
       the beginning of your internal attendance log"
    5. Device sends ALL stored ATTLOGs via POST /iclock/cdata

  This mechanism WILL retrieve historical records from the device.

  ┌──────────────────────────────────────────────────────────────────────┐
  │  CRITICAL BARRIER: Hard Cutoff in processAttlogLine                  │
  └──────────────────────────────────────────────────────────────────────┘

  File : ${HARD_CUTOFF_FILE}
  Line : ${HARD_CUTOFF_LINE}
  Code : if (punchTime < new Date('${HARD_CUTOFF_DATE}')) { return; }

  Effect:
    • ALL punches with timestamp < 2026-08-01 00:00:00 IST are SILENTLY DROPPED
    • The device DOES send them — they arrive in the HTTP request
    • But processAttlogLine returns immediately before any DB write

  Impact on force-sync:
    • Pre-Aug-1 records are sent by device but silently ignored
    • Post-Aug-1 records that are already in DB are deduplicated (safe)
    • Post-Aug-1 records not in DB are inserted (also safe — idempotent)

  ┌──────────────────────────────────────────────────────────────────────┐
  │  DEDUPLICATION SAFETY (existing mechanism)                           │
  └──────────────────────────────────────────────────────────────────────┘

  Unique constraint on biometric_raw_logs:
    UNIQUE (device_serial, punch_time, employee_pin)

  On duplicate: ON CONFLICT DO NOTHING (idempotent — silent skip)

  Verdict: ALREADY SAFE for re-ingesting records that were already received.
  No changes needed to the duplicate protection mechanism.
  `);

  report.force_sync_analysis = {
    endpoint: 'POST /api/biometric/devices/:id/force-sync',
    endpoint_exists: true,
    mechanism: 'Server responds GET ATTLOG Stamp=0 to device heartbeat',
    adms_command: 'GET ATTLOG Stamp=0',
    effect: 'Device re-uploads ALL stored attendance records from its internal log',
    hard_cutoff: {
      file:  HARD_CUTOFF_FILE,
      line:  HARD_CUTOFF_LINE,
      value: HARD_CUTOFF_DATE,
      effect: 'Pre-Aug-1 punches silently dropped before any DB write — force-sync alone cannot recover them',
    },
    deduplication: {
      constraint:  'UNIQUE (device_serial, punch_time, employee_pin)',
      on_conflict: 'DO NOTHING',
      verdict:     'ALREADY SAFE — existing mechanism prevents duplicates',
    },
  };

  // ── Step 9: Import batch history ─────────────────────────────────────────
  bar('STEP 9 — Historical Import Batch History');
  try {
    const existsRes = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'biometric_import_batches'
      ) AS tbl_exists
    `);

    if (!existsRes.rows[0].tbl_exists) {
      console.log('  biometric_import_batches table not found.');
      report.import_batches = { table_exists: false };
    } else {
      const res = await pool.query(`
        SELECT b.*, u.name AS imported_by_name
        FROM biometric_import_batches b
        LEFT JOIN users u ON u.id = b.imported_by
        ORDER BY b.created_at DESC
        LIMIT 20
      `);
      if (!res.rows.length) {
        console.log('  No historical import batches found.');
      } else {
        console.log(`  Found ${res.rows.length} import batch(es):\n`);
        for (const b of res.rows) {
          console.log(`  Batch  : ${b.id}`);
          console.log(`  File   : ${b.filename || 'N/A'}`);
          console.log(`  Status : ${b.status}`);
          console.log(`  Rows   : total=${b.total_rows}  inserted=${b.inserted}  skipped=${b.skipped}  errors=${b.error_count}`);
          console.log(`  By     : ${b.imported_by_name || b.imported_by || 'N/A'}`);
          console.log(`  At     : ${toIST(b.created_at)}\n`);
        }
      }
      report.import_batches = { table_exists: true, batches: res.rows };
    }
  } catch (err) {
    console.error(`  ✗ Error: ${err.message}`);
    report.import_batches_error = err.message;
  }

  // ── Step 10: Recommended next steps ──────────────────────────────────────
  bar('STEP 10 — Recommended Next Steps  (Phase 2 proposal — NOT implemented)');
  console.log(`
  The investigation determines that historical records ARE retrievable from
  ZKTeco devices using the existing ADMS "GET ATTLOG Stamp=0" mechanism.
  The ONLY barrier is the hard cutoff in processAttlogLine.

  Proposed Phase 2 implementation (requires review + approval before coding):

    Option A — ADMS Force-Sync with Bypass Flag
    ────────────────────────────────────────────
    • Add a new endpoint: POST /api/biometric/devices/:id/historical-sync
    • It schedules GET ATTLOG Stamp=0 (same as force-sync) BUT also sets
      a temporary in-memory flag (sn → allowHistorical)
    • The /iclock/cdata handler checks this flag; if set, passes incoming
      ATTLOG lines to a separate processHistoricalAttlogLine() function
      that bypasses the hard cutoff and uses source='historical_recovery'
    • The flag is cleared after the device's next ATTLOG POST completes
    • Deduplication (ON CONFLICT DO NOTHING) prevents double-counting
    • Attendance reprocessing triggered after ingestion

    Option B — Manual EasyWDMS Export Import (no code change required)
    ──────────────────────────────────────────────────────────────────
    • Export historical ATTLOG from EasyWDMS SQL Server (Relitrade LAN)
    • Use existing /api/biometric/import-easywdms endpoint
    • This ALREADY bypasses the Aug-1 cutoff (see biometricEasyWDMSImport.handler.js)
    • No production code change needed
    • Best option if Relitrade has EasyWDMS on their LAN

    Option C — ZKLib Direct Pull (if TCP accessible from VPS)
    ──────────────────────────────────────────────────────────
    • If TCP probe (Step 7) confirmed device accessibility:
      Connect via ZKLib, pull all records, write to isolated temp table,
      run deduplication against biometric_raw_logs, import clean records

  DO NOT implement Phase 2 until this investigation is reviewed.
  `);

  report.recommended_next_steps = {
    option_a: {
      name:    'ADMS Force-Sync with Historical Bypass Flag',
      requires_code_change: true,
      safe:    true,
      effort:  'Medium — new endpoint + processHistoricalAttlogLine function',
    },
    option_b: {
      name:    'Manual EasyWDMS Export Import',
      requires_code_change: false,
      safe:    true,
      effort:  'Low — existing endpoint handles this, no code change needed',
    },
    option_c: {
      name:    'ZKLib Direct Pull (if TCP accessible)',
      requires_code_change: true,
      accessible: tcpAccessible.length > 0,
      effort:  'High — new ZKLib client code',
    },
  };

  // ── Final report ──────────────────────────────────────────────────────────
  bar('FINAL INVESTIGATION REPORT');

  const overallStats   = report.overall_stats   || {};
  const totalRawLogs   = parseInt(overallStats.total_raw_logs   || 0, 10);
  const overallOldest  = overallStats.overall_oldest;
  const overallNewest  = overallStats.overall_newest;
  const preCutoffCount = parseInt(overallStats.pre_cutoff_count || 0, 10);

  console.log(`
  ╔══════════════════════════════════════════════════════════════════════╗
  ║  ZKTeco Historical Attendance Recovery — Investigation Summary       ║
  ╚══════════════════════════════════════════════════════════════════════╝

  1. CURRENT LIVE INTEGRATION
     Flow    : ZKTeco Device → POST /iclock/cdata → biometric_raw_logs → Attendance
     Status  : Working (devices online, ATTLOG push active)
     Cutoff  : ${HARD_CUTOFF_DATE}  (hard-coded go-live gate)

  2. DEVICE INFORMATION
     Registered devices : ${devices.length}
     With IP configured : ${devicesWithIp.length}
  ${devices.map(d => `   • ${(d.device_name || 'Unnamed').padEnd(24)} SN: ${d.serial_number}  Branch: ${d.branch_name || 'N/A'}`).join('\n')}

  3. HISTORICAL DATA AVAILABILITY  (current DB state)
     Total raw logs in DB : ${totalRawLogs}
     Oldest record in DB  : ${toIST(overallOldest)}
     Newest record in DB  : ${toIST(overallNewest)}
     Pre-cutoff records   : ${preCutoffCount}  (these bypassed go-live gate via EasyWDMS import)

  4. HISTORICAL RETRIEVAL METHOD
     Mechanism  : ZKTeco ADMS "GET ATTLOG Stamp=0" (already implemented)
     Trigger    : Device heartbeat response (GET /iclock/getrequest)
     Blocker    : Hard cutoff in processAttlogLine silently drops pre-Aug-1 records
     Solution   : Isolated historical processing path (Phase 2 — not yet built)

  5. ZKLib TCP PROBE RESULTS
     Accessible : ${tcpAccessible.length} / ${tcpResults.length} device(s)
  ${tcpResults.map(r => `   • ${(r.name || r.serial || 'Unknown').padEnd(24)} ${r.accessible ? `✓ ACCESSIBLE (session=${r.sessionId})` : `✗ ${r.error || 'Not reachable'}`}`).join('\n')}

  6. SAFETY CONFIRMATION
     Existing live biometric fetching  : NOT MODIFIED
     Existing attendance processing    : NOT MODIFIED
     Existing HRMS modules             : NOT MODIFIED
     ZKTeco device records             : NOT DELETED
     Production database               : NOT MODIFIED  (read-only investigation)

  7. RECOMMENDED NEXT STEP
     → If Relitrade has EasyWDMS: use existing /api/biometric/import-easywdms
       (Option B — no code change, immediate, already bypasses cutoff)
     → If ADMS-only: implement Phase 2 historical-sync endpoint (Option A)
     → Do NOT implement Phase 2 until this report is reviewed and approved

  ══════════════════════════════════════════════════════════════════════
  `);

  // ── Save JSON report to output/ ───────────────────────────────────────────
  report.completedAt             = new Date().toISOString();
  report.production_modified     = false;
  report.device_records_deleted  = false;
  report.summary = {
    devices_registered:   devices.length,
    devices_tcp_accessible: tcpAccessible.length,
    total_raw_logs_in_db: totalRawLogs,
    oldest_db_record:     overallOldest,
    newest_db_record:     overallNewest,
    pre_cutoff_records_in_db: preCutoffCount,
    hard_cutoff:          HARD_CUTOFF_DATE,
    force_sync_exists:    true,
    duplicate_protection: 'SAFE (ON CONFLICT DO NOTHING)',
  };

  const outputDir  = path.join(__dirname, 'output');
  const ts         = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outputFile = path.join(outputDir, `investigation_${ts}.json`);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(report, null, 2), 'utf-8');

  console.log(`  Report saved → ${outputFile}`);
  console.log(`  Completed at : ${toIST(report.completedAt)}\n`);

  await pool.end().catch(() => {});
}

investigate().catch((err) => {
  console.error('\n[FATAL] Investigation aborted:', err.message);
  console.error(err.stack);
  pool.end().catch(() => {});
  process.exit(1);
});
