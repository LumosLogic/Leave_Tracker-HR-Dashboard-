const XLSX = require('xlsx');
const { pool } = require('../../config/db-pg-adapter');
const { reprocessPin } = require('./biometricReprocess.util');

// EasyWDMS "Punch State" values → punch_type integers (ZKTeco convention)
const PUNCH_STATE_MAP = {
  'check in':  0,
  'check-in':  0,
  'checkin':   0,
  'in':        0,
  'check out': 1,
  'check-out': 1,
  'checkout':  1,
  'out':       1,
};

function normalizeDateStr(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/**
 * Parse an EasyWDMS Transaction Report file.
 * Accepts .xlsx, .xls, .csv, .tsv, .txt (tab-separated).
 * Returns array of { employeePin, punchTime, punchType, area, deviceSerial, rawPayload }.
 */
function parseEasyWDMSFile(buffer, originalname) {
  const ext = (originalname || '').split('.').pop().toLowerCase();

  let rows;
  if (ext === 'tsv' || ext === 'txt') {
    const str = buffer.toString('utf8');
    rows = str.split('\n').map(line =>
      line.replace(/\r$/, '').split('\t').map(c => c.trim())
    );
  } else {
    const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  }

  // Locate the header row — the one containing "Employee ID"
  let headerIdx = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = rows[i].map(c => String(c).trim().toLowerCase());
    if (cells.some(c => c === 'employee id' || c === 'employeeid')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error(
      'Header row with "Employee ID" not found. ' +
      'Please export the Transaction Report from EasyWDMS without modification.'
    );
  }

  const headers = rows[headerIdx].map(c => String(c).trim().toLowerCase());
  const get = (row, name) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? String(row[idx] ?? '').trim() : '';
  };

  const records = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every(c => !String(c).trim())) continue;

    const employeePin  = get(row, 'employee id');
    const dateVal      = row[headers.indexOf('date')];
    const punchTimeStr = get(row, 'punch time');
    const punchState   = get(row, 'punch state').toLowerCase();
    const area         = get(row, 'area') || get(row, 'device name') || null;
    const serialNumber = get(row, 'serial number');
    const firstName    = get(row, 'first name');
    const department   = get(row, 'department');
    const uploadTime   = get(row, 'upload time');
    const temperature  = get(row, 'actual temperature');

    if (!employeePin || !dateVal || !punchTimeStr) continue;

    const punchType = PUNCH_STATE_MAP[punchState];
    if (punchType === undefined) continue;

    const punchDateStr = normalizeDateStr(dateVal);
    if (!punchDateStr) continue;

    const punchTime = new Date(`${punchDateStr}T${punchTimeStr}`);
    if (isNaN(punchTime.getTime())) continue;

    if (!serialNumber) continue;

    records.push({
      employeePin: String(employeePin),
      punchTime,
      punchType,
      area,
      deviceSerial: serialNumber,
      rawPayload: { firstName, department, uploadTime, temperature, area, serialNumber },
    });
  }

  return records;
}

// ── Shared: parse file + device whitelist + optional date-range filter ────────
// Returns { validRecords, filteredRecords, skippedDevices } or throws.
async function _parseAndFilter(file, orgId, dateFrom, dateTo) {
  const records = parseEasyWDMSFile(file.buffer, file.originalname);
  if (!records.length) throw { status: 422, message: 'No valid records found. Check that the file is a Transaction Report with "Employee ID", "Date", "Punch Time", "Punch State", and "Serial Number" columns.' };

  // Device whitelist
  const devRes = await pool.query(
    `SELECT serial_number FROM biometric_devices WHERE org_id = $1`,
    [orgId]
  );
  const allowedSerials = new Set(devRes.rows.map(d => d.serial_number).filter(Boolean));
  const skippedDevices = {};
  const validRecords = records.filter(rec => {
    if (allowedSerials.has(rec.deviceSerial)) return true;
    skippedDevices[rec.deviceSerial] = (skippedDevices[rec.deviceSerial] || 0) + 1;
    return false;
  });

  // Optional date-range filter
  let filteredRecords = validRecords;
  if (dateFrom || dateTo) {
    const from = dateFrom ? new Date(dateFrom + 'T00:00:00') : null;
    const to   = dateTo   ? new Date(dateTo   + 'T23:59:59') : null;
    filteredRecords = validRecords.filter(rec => {
      if (from && rec.punchTime < from) return false;
      if (to   && rec.punchTime > to)   return false;
      return true;
    });
  }

  return { records, validRecords, filteredRecords, skippedDevices };
}

/**
 * POST /api/biometric/preview-easywdms
 * Parse the file, run device validation + optional date-range filter,
 * check DB for existing duplicates — returns counts WITHOUT writing anything.
 * Safe to call any number of times; reads-only.
 */
async function previewEasyWDMS(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const orgId    = req.user.organization_id;
  const dateFrom = (req.body.date_from || '').trim() || null;
  const dateTo   = (req.body.date_to   || '').trim() || null;

  let parsed;
  try {
    parsed = await _parseAndFilter(req.file, orgId, dateFrom, dateTo);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Parse/filter failed' });
  }

  const { records, validRecords, filteredRecords, skippedDevices } = parsed;

  if (validRecords.length === 0) {
    const summary = Object.entries(skippedDevices).map(([sn, n]) => `${sn} (${n})`).join(', ');
    return res.status(422).json({ error: `No records from registered devices. Unregistered: ${summary}` });
  }

  // Check how many of the filtered records already exist in biometric_raw_logs
  let existingCount = 0;
  if (filteredRecords.length > 0) {
    try {
      const ds  = filteredRecords.map(r => r.deviceSerial);
      const eps = filteredRecords.map(r => r.employeePin);
      const pts = filteredRecords.map(r => r.punchTime.toISOString());

      const dupRes = await pool.query(
        `WITH incoming AS (
           SELECT * FROM unnest($2::text[], $3::text[], $4::timestamptz[])
           AS t(device_serial, employee_pin, punch_time)
         )
         SELECT COUNT(*) AS cnt FROM incoming i
         WHERE EXISTS (
           SELECT 1 FROM biometric_raw_logs r
           WHERE r.org_id       = $1
             AND r.device_serial = i.device_serial
             AND r.employee_pin  = i.employee_pin
             AND r.punch_time    = i.punch_time
         )`,
        [orgId, ds, eps, pts]
      );
      existingCount = parseInt(dupRes.rows[0].cnt, 10);
    } catch (err) {
      console.warn('[preview-easywdms] Duplicate check failed (non-fatal):', err.message);
    }
  }

  const dates   = filteredRecords.map(r => r.punchTime.toISOString().slice(0, 10));
  const minDate = dates.length ? dates.reduce((a, b) => a < b ? a : b) : null;
  const maxDate = dates.length ? dates.reduce((a, b) => a > b ? a : b) : null;

  res.json({
    ok:                true,
    total_in_file:     records.length,
    invalid_device:    records.length - validRecords.length,
    after_date_filter: filteredRecords.length,
    existing_in_db:    existingCount,
    new_records:       Math.max(0, filteredRecords.length - existingCount),
    date_range:        { from: minDate, to: maxDate },
    unique_pin_count:  new Set(filteredRecords.map(r => r.employeePin)).size,
    skipped_devices:   skippedDevices,
  });
}

/**
 * POST /api/biometric/import-easywdms
 * Accepts a multipart file upload, parses the EasyWDMS export,
 * validates device serials against registered devices,
 * inserts raw logs (bypassing go-live cutoff), and auto-reprocesses
 * all affected PINs using the org's attendance policy.
 *
 * Optional body fields (multipart):
 *   date_from  YYYY-MM-DD  — only import records on or after this date
 *   date_to    YYYY-MM-DD  — only import records on or before this date
 */
async function importEasyWDMS(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const orgId    = req.user.organization_id;
  const dateFrom = (req.body.date_from || '').trim() || null;
  const dateTo   = (req.body.date_to   || '').trim() || null;

  // 1. Parse + device whitelist + date-range filter
  let parsed;
  try {
    parsed = await _parseAndFilter(req.file, orgId, dateFrom, dateTo);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Parse failed' });
  }

  const { records, validRecords, filteredRecords, skippedDevices } = parsed;

  if (validRecords.length === 0) {
    const skippedSummary = Object.entries(skippedDevices)
      .map(([sn, n]) => `${sn} (${n} records)`)
      .join(', ');
    return res.status(422).json({
      error: `No records from registered devices. Unregistered: ${skippedSummary}. ` +
        `Register these device serial numbers first or export only from configured devices.`,
    });
  }

  const importRecords = filteredRecords; // alias for clarity

  // 2. Create import batch record (status=processing while inserts run)
  let batchId;
  try {
    const batchRes = await pool.query(
      `INSERT INTO biometric_import_batches
         (org_id, filename, total_rows, imported_by, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id`,
      [orgId, req.file.originalname, importRecords.length, req.user.id]
    );
    batchId = batchRes.rows[0].id;
  } catch (err) {
    return res.status(500).json({ error: `Failed to create import batch: ${err.message}` });
  }

  // 3. Insert raw logs — no go-live cutoff for historical imports
  let inserted = 0;
  let skipped  = 0;
  const errors = [];

  for (const rec of importRecords) {
    try {
      const result = await pool.query(
        `INSERT INTO biometric_raw_logs
           (org_id, device_serial, employee_pin, punch_time, punch_type, area,
            raw_payload, processed, source, import_batch_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false, 'easywdms_import', $8)
         ON CONFLICT (device_serial, punch_time, employee_pin) DO NOTHING
         RETURNING id`,
        [
          orgId,
          rec.deviceSerial,
          rec.employeePin,
          rec.punchTime.toISOString(),
          rec.punchType,
          rec.area,
          JSON.stringify(rec.rawPayload),
          batchId,
        ]
      );
      if (result.rows.length) inserted++;
      else skipped++;
    } catch (err) {
      skipped++;
      if (errors.length < 20) {
        errors.push(`PIN ${rec.employeePin} @ ${rec.punchTime.toISOString().slice(0, 19)}: ${err.message}`);
      }
    }
  }

  // 4. Auto-reprocess all unique PINs that had new rows — policy-aware via reprocessPin
  const uniquePins = [...new Set(importRecords.map(r => r.employeePin))];
  let reprocessed = 0;
  for (const pin of uniquePins) {
    try {
      const r = await reprocessPin(orgId, pin);
      reprocessed += r.processed;
    } catch (err) {
      if (errors.length < 20) errors.push(`Reprocess PIN ${pin}: ${err.message}`);
    }
  }

  // 5. Finalise batch record
  await pool.query(
    `UPDATE biometric_import_batches
     SET inserted = $1, skipped = $2, error_count = $3, status = 'completed'
     WHERE id = $4`,
    [inserted, skipped, errors.length, batchId]
  );

  const skippedDeviceSummary = Object.entries(skippedDevices)
    .map(([sn, n]) => `${sn}: ${n} records`)
    .join(', ');

  console.log(
    `[easywdms-import] batch=${batchId} total=${records.length} ` +
    `filtered=${importRecords.length} inserted=${inserted} skipped=${skipped} ` +
    `reprocessed=${reprocessed}` +
    (skippedDeviceSummary ? ` skipped_devices=[${skippedDeviceSummary}]` : '')
  );

  res.json({
    ok:          true,
    batch_id:    batchId,
    total:       records.length,
    valid:       importRecords.length,
    inserted,
    skipped,
    reprocessed,
    errors,
    ...(Object.keys(skippedDevices).length > 0 && {
      skipped_devices:         skippedDevices,
      skipped_devices_warning: `Records from unregistered devices were ignored: ${skippedDeviceSummary}`,
    }),
  });
}

module.exports = { importEasyWDMS, previewEasyWDMS };
