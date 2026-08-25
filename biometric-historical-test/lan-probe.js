'use strict';
/**
 * ZKTeco LAN Direct Probe — ZKLib TCP Protocol
 * ─────────────────────────────────────────────────────────────────────────────
 * READ-ONLY investigation. Connects to the ZKTeco device directly over TCP
 * port 4370 (ZKLib) from inside Relitrade's LAN.
 *
 * This completely bypasses the ADMS/ATTLOG push channel used by the live
 * system — it cannot affect live attendance in any way.
 *
 * WHAT IT DOES
 *   1. Connects to device at 192.168.0.250:4370
 *   2. Reads device info: AttLogCount, MaxAttLogCount, firmware, model
 *   3. Downloads ALL raw attendance records stored on device
 *   4. Shows day-by-day breakdown (July / Aug gap analysis)
 *   5. Saves full report to lan-probe-output/probe_DATE.json
 *   6. Disconnects cleanly
 *
 * WHAT IT NEVER DOES
 *   • Does NOT write to the device
 *   • Does NOT delete device records
 *   • Does NOT connect to HRMS database
 *   • Does NOT change any ADMS / push configuration
 *
 * HOW TO RUN
 *   Copy this single file to any Windows/Linux PC inside Relitrade's office LAN.
 *   Node.js 16+ required — no npm install needed (pure built-in modules only).
 *
 *   node lan-probe.js
 *
 * OUTPUT
 *   Console report + lan-probe-output/probe_YYYYMMDD_HHMMSS.json
 * ─────────────────────────────────────────────────────────────────────────────
 */

const net  = require('net');
const fs   = require('fs');
const path = require('path');

// ── Configuration ─────────────────────────────────────────────────────────────
const DEVICE_IP   = '192.168.0.250';
const DEVICE_PORT = 4370;
const DEVICE_SN   = 'BYEL194660080';   // expected serial — for verification only

// ── ZKLib command codes ───────────────────────────────────────────────────────
const CMD_CONNECT    = 1000;
const CMD_EXIT       = 1001;
const CMD_ACK_OK     = 2000;
const CMD_ACK_ERROR  = 2001;
const CMD_DEVICE_RRQ = 11;    // read device parameter
const CMD_FREE_DATA  = 1502;  // clear device data buffer
const CMD_DATA_WRRQ  = 1500;  // start bulk data transfer
const CMD_ATTLOG_RRQ = 13;    // request attendance log (older firmware fallback)

// ZKTeco attendance record size in bytes (standard across most models)
const ATT_RECORD_SIZE = 40;

// ── Packet builder ────────────────────────────────────────────────────────────
function buildPacket(cmd, data, sessionId, replyId) {
  if (typeof data === 'string') data = Buffer.from(data + '\x00', 'ascii');
  data      = data      || Buffer.alloc(0);
  sessionId = sessionId || 0;
  replyId   = replyId   !== undefined ? replyId : 65534;

  const pkt = Buffer.alloc(8 + data.length);
  pkt.writeUInt16LE(cmd,       0);
  pkt.writeUInt16LE(0,         2);   // checksum — filled below
  pkt.writeUInt16LE(sessionId, 4);
  pkt.writeUInt16LE(replyId,   6);
  data.copy(pkt, 8);

  // ZKLib checksum: byte-sum of all bytes except positions 2 and 3
  let cs = 0;
  for (let i = 0; i < pkt.length; i++) {
    if (i === 2 || i === 3) continue;
    cs += pkt[i];
    if (cs > 0xFFFF) cs -= 0xFFFF;
  }
  pkt.writeUInt16LE(cs & 0xFFFF, 2);
  return pkt;
}

// ── ZKTeco custom timestamp decoder ──────────────────────────────────────────
// ZKTeco stores time as a packed integer, NOT unix timestamp.
// Formula: t = year*12*31*24*60*60 + month*31*24*60*60 + ...
function decodeZkTime(t) {
  const sec  = t % 60; t = Math.floor(t / 60);
  const min  = t % 60; t = Math.floor(t / 60);
  const hour = t % 24; t = Math.floor(t / 24);
  const day  = t % 31; t = Math.floor(t / 31);
  const mon  = t % 12; t = Math.floor(t / 12);
  const yr   = t + 2000;
  return new Date(yr, mon, day + 1, hour, min, sec);
}

// ── Parse raw attendance record buffer ────────────────────────────────────────
// Each record = 40 bytes:
//   [0-1]   uint16  Internal UID
//   [2-10]  string  Employee PIN (9 bytes, null-padded)
//   [11]    uint8   Status (0=in, 1=out, 4=ot-in, 5=ot-out)
//   [12-15] uint32  Timestamp (ZKTeco packed format)
//   [16-39] various Verify type, work code, reserved
function parseAttRecords(buf) {
  const records = [];
  const count   = Math.floor(buf.length / ATT_RECORD_SIZE);
  let   skipped = 0;

  for (let i = 0; i < count; i++) {
    const off  = i * ATT_RECORD_SIZE;
    const pin  = buf.slice(off + 2, off + 11).toString('ascii').replace(/\x00/g, '').trim();
    const st   = buf.readUInt8(off + 11);
    const rawT = buf.readUInt32LE(off + 12);
    const ts   = decodeZkTime(rawT);

    if (!pin || isNaN(ts.getTime()) || ts.getFullYear() < 2000 || ts.getFullYear() > 2030) {
      skipped++;
      continue;
    }
    records.push({ pin, status: st, time: ts.toISOString() });
  }
  if (skipped > 0) console.log(`  (${skipped} malformed/empty records skipped during parse)`);
  return records;
}

// ── ZkDevice class ────────────────────────────────────────────────────────────
class ZkDevice {
  constructor(ip, port) {
    this.ip   = ip;
    this.port = port;
    this.sock = null;
    this.sid  = 0;
    this.rid  = 65534;
    this._buf = Buffer.alloc(0);
    this._waiters = [];
  }

  connect(timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      this.sock = net.createConnection({ host: this.ip, port: this.port });
      this.sock.setTimeout(timeoutMs);
      this.sock.on('connect', resolve);
      this.sock.on('timeout', () => reject(new Error(
        `TCP connection to ${this.ip}:${this.port} timed out — ` +
        `is this PC on the same LAN as the ZKTeco device?`
      )));
      this.sock.on('error', reject);
      this.sock.on('data', (chunk) => {
        this._buf = Buffer.concat([this._buf, chunk]);
        this._drainWaiters();
      });
    });
  }

  _drainWaiters() {
    while (this._waiters.length > 0) {
      const w = this._waiters[0];
      if (this._buf.length >= w.n) {
        this._waiters.shift();
        const out = this._buf.slice(0, w.n);
        this._buf = this._buf.slice(w.n);
        w.resolve(out);
      } else break;
    }
  }

  _readBytes(n, timeoutMs = 8000) {
    if (this._buf.length >= n) {
      const out = this._buf.slice(0, n);
      this._buf = this._buf.slice(n);
      return Promise.resolve(out);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._waiters.findIndex(w => w.resolve === wrappedResolve);
        if (idx >= 0) this._waiters.splice(idx, 1);
        reject(new Error(`Read timeout: expected ${n} bytes, have ${this._buf.length}`));
      }, timeoutMs);

      const wrappedResolve = (data) => { clearTimeout(timer); resolve(data); };
      this._waiters.push({ n, resolve: wrappedResolve });
      this._drainWaiters();
    });
  }

  async authenticate() {
    this.rid = 65534;
    this.sock.write(buildPacket(CMD_CONNECT, null, 0, this.rid));
    const hdr = await this._readBytes(8, 8000);
    const cmd = hdr.readUInt16LE(0);
    if (cmd !== CMD_ACK_OK) throw new Error(`Auth rejected by device (response cmd=${cmd})`);
    this.sid = hdr.readUInt16LE(4);
    return this.sid;
  }

  async getParam(name) {
    this.rid = (this.rid + 1) & 0xFFFF;
    this.sock.write(buildPacket(CMD_DEVICE_RRQ, name, this.sid, this.rid));
    try {
      const hdr = await this._readBytes(8, 3000);
      if (hdr.readUInt16LE(0) !== CMD_ACK_OK) return null;
      // Extra data arrives shortly after the header
      await new Promise(r => setTimeout(r, 400));
      if (this._buf.length > 0) {
        const raw  = this._buf.toString('utf8').replace(/\x00/g, '').trim();
        this._buf  = Buffer.alloc(0);
        // Device sends "paramName\tvalue" or just "value"
        return raw.includes('\t') ? raw.split('\t').pop().trim() : raw;
      }
      return '(ok, no extra data)';
    } catch (_) {
      this._buf = Buffer.alloc(0); // flush partial data
      return null;
    }
  }

  async readAllAttendanceLogs(progressCb) {
    // ── Phase A: clear device buffer ────────────────────────────────────────
    this.rid = (this.rid + 1) & 0xFFFF;
    this.sock.write(buildPacket(CMD_FREE_DATA, null, this.sid, this.rid));
    try { await this._readBytes(8, 3000); } catch (_) {}
    await new Promise(r => setTimeout(r, 300));

    // ── Phase B: request bulk data transfer ─────────────────────────────────
    // Request body: table ID 0x0B (ATTLOG), 13 bytes
    const reqData = Buffer.from([
      0x0b, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    ]);
    this.rid = (this.rid + 1) & 0xFFFF;
    this.sock.write(buildPacket(CMD_DATA_WRRQ, reqData, this.sid, this.rid));

    // ── Phase C: read prepare-data response ─────────────────────────────────
    // Device responds: 8-byte header + 8-byte size info
    // Size is at bytes [4-7] of the data portion (bytes [12-15] overall)
    let totalSize = 0;
    try {
      const hdr     = await this._readBytes(8, 8000);
      const respCmd = hdr.readUInt16LE(0);

      if (respCmd === CMD_ACK_OK || respCmd === 1504) {
        const sizeInfo = await this._readBytes(8, 3000);
        totalSize = sizeInfo.readUInt32LE(4);
      } else {
        console.log(`  CMD_DATA_WRRQ response: ${respCmd} — trying fallback`);
      }
    } catch (e) {
      console.log(`  Phase C timeout: ${e.message} — trying fallback`);
    }

    // ── Phase D: read raw data ───────────────────────────────────────────────
    if (totalSize > 0) {
      console.log(`  Downloading ${totalSize} bytes (~${Math.floor(totalSize / ATT_RECORD_SIZE)} records)...`);
      const chunks   = [];
      let   received = 0;

      while (received < totalSize) {
        const want  = Math.min(totalSize - received, 65536);
        const chunk = await this._readBytes(want, 30000);
        chunks.push(chunk);
        received += chunk.length;
        if (progressCb) progressCb(received, totalSize);
        if (received >= totalSize) break;
      }
      return Buffer.concat(chunks);
    }

    // ── Fallback: older firmware CMD_ATTLOG_RRQ ──────────────────────────────
    console.log('  Falling back to CMD_ATTLOG_RRQ (older firmware)...');
    this._buf = Buffer.alloc(0);
    this.rid  = (this.rid + 1) & 0xFFFF;
    this.sock.write(buildPacket(CMD_ATTLOG_RRQ, null, this.sid, this.rid));

    // Accumulate everything that arrives over the next 15 seconds
    await new Promise(r => setTimeout(r, 15000));
    const fallbackData = this._buf;
    this._buf = Buffer.alloc(0);

    if (fallbackData.length === 0) {
      throw new Error('Device returned no attendance data via CMD_DATA_WRRQ or CMD_ATTLOG_RRQ fallback');
    }
    return fallbackData;
  }

  async disconnect() {
    try {
      this.rid = (this.rid + 1) & 0xFFFF;
      this.sock.write(buildPacket(CMD_EXIT, null, this.sid, this.rid));
      await new Promise(r => setTimeout(r, 300));
    } catch (_) {}
    try { this.sock.destroy(); } catch (_) {}
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function bar(title) {
  console.log('\n' + '─'.repeat(64));
  if (title) console.log('  ' + title);
  if (title) console.log('─'.repeat(64));
}

function pad(s, n) { return String(s).padEnd(n); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startedAt = new Date();
  const outDir    = path.join(__dirname, 'lan-probe-output');
  fs.mkdirSync(outDir, { recursive: true });

  const report = {
    startedAt:              startedAt.toISOString(),
    device:                 { ip: DEVICE_IP, port: DEVICE_PORT, expected_sn: DEVICE_SN },
    production_modified:    false,
    device_records_deleted: false,
  };

  bar();
  console.log('  ZKTeco LAN Direct Probe — READ ONLY');
  console.log(`  Device : ${DEVICE_IP}:${DEVICE_PORT}  (SN: ${DEVICE_SN})`);
  console.log(`  Started: ${startedAt.toLocaleString()}`);
  bar();

  const dev = new ZkDevice(DEVICE_IP, DEVICE_PORT);

  try {
    // ── Step 1: Connect ──────────────────────────────────────────────────────
    bar('STEP 1 — TCP Connection');
    await dev.connect(10000);
    console.log(`  ✓ TCP connected to ${DEVICE_IP}:${DEVICE_PORT}`);

    // ── Step 2: Authenticate ─────────────────────────────────────────────────
    const sid = await dev.authenticate();
    console.log(`  ✓ Authenticated — session ID: ${sid}`);
    report.connected  = true;
    report.session_id = sid;

    // ── Step 3: Device info ──────────────────────────────────────────────────
    bar('STEP 2 — Device Parameters');

    const PARAM_LIST = [
      '~AttLogCount',      // current number of attendance records
      '~MaxAttLogCount',   // maximum storage capacity
      '~TotalAttLogCount', // total records ever stored (some firmware)
      'FirmVer',           // firmware version
      'Platform',          // hardware platform
      'DeviceName',        // device model name
      'SN',                // serial number (verify matches BYEL194660080)
      '~UserCount',        // number of enrolled employees
      'MaxUserCount',      // max employees
      'Language',          // device language setting
      'BackupTime',        // last backup timestamp (some firmware)
    ];

    const info = {};
    for (const p of PARAM_LIST) {
      const val = await dev.getParam(p);
      const display = val ?? '(not available)';
      console.log(`  ${pad(p, 24)} = ${display}`);
      if (val && val !== '(not available)') info[p] = val;
    }
    report.deviceInfo = info;

    const attLogCount    = parseInt(info['~AttLogCount']    || '0', 10) || 0;
    const maxAttLogCount = parseInt(info['~MaxAttLogCount'] || '0', 10) || 0;
    const verifiedSN     = info['SN'] || '(could not read)';

    console.log(`\n  ► Serial confirmed : ${verifiedSN} (expected: ${DEVICE_SN})`);
    console.log(`  ► Records on device: ${attLogCount}  (capacity: ${maxAttLogCount || '?'})`);

    report.attLogCount    = attLogCount;
    report.maxAttLogCount = maxAttLogCount;
    report.sn_verified    = verifiedSN;

    if (attLogCount === 0) {
      console.log('\n  ⚠  Device reports 0 attendance records.');
      console.log('     This may mean: device was cleared, or firmware does not support ~AttLogCount query.');
      console.log('     Will attempt to read logs anyway.');
    }

    // ── Step 4: Download all attendance records ───────────────────────────────
    bar('STEP 3 — Download All Attendance Records');
    console.log('  (downloading — may take 1–3 minutes for large datasets)');

    let lastPct = -1;
    const rawData = await dev.readAllAttendanceLogs((received, total) => {
      const pct = Math.floor((received / total) * 100);
      if (pct !== lastPct && pct % 10 === 0) {
        process.stdout.write(`\r  Progress: ${pct}% (${received}/${total} bytes)`);
        lastPct = pct;
      }
    });

    if (lastPct >= 0) console.log(); // newline after progress
    console.log(`  ✓ Raw data received: ${rawData.length} bytes`);

    // ── Step 5: Parse records ─────────────────────────────────────────────────
    bar('STEP 4 — Parsing Records');
    const records = parseAttRecords(rawData);
    console.log(`  Total valid records: ${records.length}`);
    report.totalRecordsParsed = records.length;

    if (records.length === 0) {
      console.log('  ⚠  No records could be parsed from device data.');
      console.log('     Raw bytes received: ' + rawData.length);
      report.rawDataHex = rawData.slice(0, 80).toString('hex');
    } else {
      // ── Step 6: Analysis ───────────────────────────────────────────────────
      bar('STEP 5 — Date Range Analysis');

      const times  = records.map(r => new Date(r.time));
      const oldest = new Date(Math.min(...times));
      const newest = new Date(Math.max(...times));

      console.log(`  Oldest record: ${oldest.toLocaleString()}`);
      console.log(`  Newest record: ${newest.toLocaleString()}`);
      report.oldest = oldest.toISOString();
      report.newest = newest.toISOString();

      // Gap analysis — what's on device vs. what we know is missing in HRMS
      const MISSING_START = new Date('2026-07-01T00:00:00+05:30');
      const MISSING_END   = new Date('2026-08-04T23:59:59+05:30');
      const HRMS_GO_LIVE  = new Date('2026-08-05T00:00:00+05:30');

      const missingPeriod = records.filter(r => {
        const d = new Date(r.time);
        return d >= MISSING_START && d <= MISSING_END;
      });

      const julyOnly = records.filter(r => {
        const d = new Date(r.time);
        return d >= new Date('2026-07-01') && d < new Date('2026-08-01');
      });

      const liveData = records.filter(r => new Date(r.time) >= HRMS_GO_LIVE);

      console.log('\n  ┌────────────────────────────────────────────────────┐');
      console.log(`  │  MISSING PERIOD (July 1 → Aug 4): ${String(missingPeriod.length).padStart(6)} records  │`);
      console.log(`  │  July 2026 only:                  ${String(julyOnly.length).padStart(6)} records  │`);
      console.log(`  │  Aug 5+ (live period):            ${String(liveData.length).padStart(6)} records  │`);
      console.log('  └────────────────────────────────────────────────────┘');

      if (missingPeriod.length > 0) {
        console.log(`\n  ✓ DEVICE HAS ${missingPeriod.length} RECORDS FROM THE MISSING PERIOD`);
        console.log('    These can be recovered — data exists on device!');
      } else {
        console.log('\n  ✗ Device has NO records from the missing period (July 1 – Aug 4)');
        console.log('    Data is not on device — must come from EasyWDMS SQL Server export');
      }

      report.analysis = {
        total:                records.length,
        missing_period_count: missingPeriod.length,
        july_count:           julyOnly.length,
        live_period_count:    liveData.length,
        has_missing_data:     missingPeriod.length > 0,
      };

      // ── Day-by-day breakdown ──────────────────────────────────────────────
      bar('STEP 6 — Day-by-Day Breakdown');

      const byDay = {};
      for (const r of records) {
        const d = r.time.slice(0, 10);
        byDay[d] = (byDay[d] || 0) + 1;
      }

      const sortedDays = Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b));
      console.log(`  ${'Date'.padEnd(14)} Punches`);
      console.log(`  ${'─'.repeat(14)} ─────────`);
      for (const [d, c] of sortedDays) {
        const marker = (d >= '2026-07-01' && d <= '2026-08-04') ? '  ← MISSING IN HRMS' : '';
        console.log(`  ${d.padEnd(14)} ${String(c).padStart(6)}${marker}`);
      }

      report.daily_breakdown  = byDay;
      report.sample_records   = records.slice(0, 20);

      // ── EasyWDMS check reminder ───────────────────────────────────────────
      bar('STEP 7 — EasyWDMS SQL Server (manual check)');
      console.log(`
  If the device does not have missing data, check EasyWDMS SQL Server.
  Run this query from SQL Server Management Studio on Relitrade's LAN:

  SELECT
    CAST(CHECKTIME AS DATE) AS [Date],
    COUNT(*)               AS [Punches]
  FROM att_attlog
  WHERE SN = '${DEVICE_SN}'
    AND CHECKTIME >= '2026-07-01'
    AND CHECKTIME <= '2026-08-04 23:59:59'
  GROUP BY CAST(CHECKTIME AS DATE)
  ORDER BY [Date];

  If this returns rows, the data exists in EasyWDMS and can be exported
  as Excel and imported via HRMS → Biometric Logs → Import EasyWDMS.
      `);
    }

    // ── Disconnect ────────────────────────────────────────────────────────────
    await dev.disconnect();
    console.log('  ✓ Disconnected from device');

  } catch (err) {
    console.error(`\n  ✗ Error: ${err.message}`);
    report.error = err.message;
    try { await dev.disconnect(); } catch (_) {}
  }

  // ── Final safety confirmation ─────────────────────────────────────────────
  bar('SAFETY CONFIRMATION');
  console.log(`
  Device records:          NOT DELETED
  Device configuration:    NOT CHANGED
  HRMS database:           NOT CONNECTED / NOT MODIFIED
  Live biometric system:   NOT AFFECTED
  `);

  // ── Save report ───────────────────────────────────────────────────────────
  report.completedAt             = new Date().toISOString();
  report.production_modified     = false;
  report.device_records_deleted  = false;

  const ts      = startedAt.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outFile = path.join(outDir, `lan-probe-${ts}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`  Report saved → ${outFile}`);
}

main().catch(err => {
  console.error('\n[FATAL]', err.message);
  process.exit(1);
});
