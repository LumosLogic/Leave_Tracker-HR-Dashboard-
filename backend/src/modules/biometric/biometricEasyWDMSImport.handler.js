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
  // xlsx may return a JS Date when cellDates: true
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  const s = String(val).trim();
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD-MM-YYYY or DD/MM/YYYY
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

  let rows; // array of arrays
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

    // Combine date + time; treat as server local time (consistent with live ZKTeco push)
    const punchTime = new Date(`${punchDateStr}T${punchTimeStr}`);
    if (isNaN(punchTime.getTime())) continue;

    if (!serialNumber) continue; // serial number required for dedup via UNIQUE constraint

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

/**
 * POST /api/biometric/import-easywdms
 * Accepts a multipart file upload, parses the EasyWDMS export,
 * inserts raw logs (bypassing go-live cutoff), and auto-reprocesses all affected PINs.
 */
async function importEasyWDMS(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const orgId = req.user.organization_id;

  // 1. Parse file
  let records;
  try {
    records = parseEasyWDMSFile(req.file.buffer, req.file.originalname);
  } catch (parseErr) {
    return res.status(422).json({ error: `File parse error: ${parseErr.message}` });
  }
  if (!records.length) {
    return res.status(422).json({ error: 'No valid records found. Check that the file is a Transaction Report with "Employee ID", "Date", "Punch Time", "Punch State", and "Serial Number" columns.' });
  }

  // 2. Create import batch record (status=processing while inserts run)
  let batchId;
  try {
    const batchRes = await pool.query(
      `INSERT INTO biometric_import_batches
         (org_id, filename, total_rows, imported_by, status)
       VALUES ($1, $2, $3, $4, 'processing')
       RETURNING id`,
      [orgId, req.file.originalname, records.length, req.user.id]
    );
    batchId = batchRes.rows[0].id;
  } catch (err) {
    return res.status(500).json({ error: `Failed to create import batch: ${err.message}` });
  }

  // 3. Insert raw logs — no go-live cutoff for historical imports
  let inserted = 0;
  let skipped  = 0;
  const errors = [];

  for (const rec of records) {
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

  // 4. Auto-reprocess all unique PINs that had new rows inserted
  const uniquePins = [...new Set(records.map(r => r.employeePin))];
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

  console.log(`[easywdms-import] batch=${batchId} total=${records.length} inserted=${inserted} skipped=${skipped} reprocessed=${reprocessed}`);

  res.json({
    ok: true,
    batch_id: batchId,
    total: records.length,
    inserted,
    skipped,
    reprocessed,
    errors,
  });
}

module.exports = { importEasyWDMS };
