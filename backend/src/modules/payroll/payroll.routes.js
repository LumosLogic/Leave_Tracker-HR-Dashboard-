const express    = require('express');
const router     = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission, hasAnyPermission } = require('../../middleware/permissions');
const { orgId } = require('../../utils/helpers');
const { calculatePayroll, PayrollError } = require('../../services/payrollEngine');
const {
  generatePayrollRun,
  generateEmployeePayslip,
  lockPayrollRun,
  unlockPayrollRun,
  previewPayrollRun,
  GenerationError,
} = require('../../services/payrollGenerationService');
const { triggerManual } = require('../../services/payrollScheduler');

// ── ROUTE: POST /payroll/calculate-preview ────────────────────────────────────
// Runs the payroll engine for one employee/period. No writes. Returns the full
// calculation breakdown so HR can verify before generating the payslip.
// Moved before all other routes so it doesn't collide with parameterized paths.
router.post('/calculate-preview', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { user_id, month, year } = req.body;
    if (!user_id || !month || !year) {
      return res.status(400).json({ error: 'user_id, month, and year are required' });
    }
    const result = await calculatePayroll({
      organizationId: oId,
      userId:         parseInt(user_id, 10),
      month:          parseInt(month,   10),
      year:           parseInt(year,    10),
    });
    res.json(result);
  } catch (err) {
    if (err instanceof PayrollError) {
      return res.status(400).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: err.message });
  }
});

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// ── Audit helper (fire-and-forget) ────────────────────────────────────────────
function logPayroll({ oId, actorId, actorName, action, entityType, entityId, targetUserId, oldValues, newValues, ip }) {
  pool.query(
    `INSERT INTO payroll_audit_log
       (organization_id, actor_id, actor_name, action, entity_type, entity_id,
        target_user_id, old_values, new_values, ip_address)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [oId, actorId || null, actorName || null, action, entityType,
     entityId || null, targetUserId || null,
     oldValues  ? JSON.stringify(oldValues)  : null,
     newValues  ? JSON.stringify(newValues)  : null,
     ip || null]
  ).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3.1 — PAYROLL SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════

const SETTINGS_DEFAULTS = {
  payroll_cycle: 'monthly', payroll_date: 1,
  working_days_rule: 'calendar', fixed_working_days: 26,
  weekend_policy: 'sat_sun', count_holidays_as_paid: true,
  grace_minutes: 15, late_allowance_per_month: 3,
  early_exit_allowance_minutes: 30, half_day_after_lates: 3,
  lop_after_half_days: 2,
  pf_enabled: true, esi_enabled: true,
  professional_tax_enabled: true, tds_enabled: false,
  payslip_auto_email: true, auto_generate_payroll: false,
  auto_publish: false, timezone: 'Asia/Kolkata',
  // Phase 3.5 — per-org configurable schedule (multi-tenant)
  payroll_generation_day: null, payroll_generation_time: '01:00',
  payroll_generate_for: 'PREVIOUS',
  payroll_publish_day: null,    payroll_publish_time: '09:00',
  payroll_payout_day: null,     payroll_payout_time: null,
};

const SETTINGS_FIELDS = Object.keys(SETTINGS_DEFAULTS);

// GET /api/payroll/settings
router.get('/settings', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { data, error } = await supabase.from('payroll_settings')
      .select('*').eq('organization_id', oId).maybeSingle();
    if (error) throw error;
    res.json(data || { ...SETTINGS_DEFAULTS, organization_id: oId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payroll/settings
router.put('/settings', auth, hasPermission('payroll', 'manage_settings'), async (req, res) => {
  try {
    const oId = orgId(req);
    const payload = {};
    for (const key of SETTINGS_FIELDS) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'No valid fields provided' });
    }
    payload.updated_at = new Date().toISOString();
    payload.updated_by = req.user.id;

    const { data: existing } = await supabase.from('payroll_settings')
      .select('*').eq('organization_id', oId).maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase.from('payroll_settings')
        .update(payload).eq('organization_id', oId).select('*').single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase.from('payroll_settings')
        .insert({ ...payload, organization_id: oId }).select('*').single();
      if (error) throw error;
      result = data;
    }

    logPayroll({
      oId, actorId: req.user.id, actorName: req.user.name,
      action: 'settings_updated', entityType: 'payroll_settings',
      entityId: result.id, oldValues: existing || null, newValues: result,
      ip: req.ip,
    });

    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3.1 — VERSIONED SALARY STRUCTURES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/payroll/employees — all employees with their current salary status
// Must be defined before /salary-structures/:id to avoid param collision
router.get('/employees', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { rows, error } = await pool.query(
      `SELECT
           u.id, u.name, u.email, u.department, u.position,
           u.employee_id, u.avatar_color, u.joining_date,
           ess.id           AS salary_id,
           ess.gross_salary,
           ess.basic,
           ess.ctc,
           ess.effective_from
         FROM users u
         LEFT JOIN employee_salary_structures ess
                ON ess.user_id = u.id
               AND ess.organization_id = $1
               AND ess.effective_to IS NULL
        WHERE u.organization_id = $1
          AND u.role = 'employee'
          AND (u.status IS NULL OR u.status != 'inactive')
        ORDER BY u.name ASC`,
      [oId]
    );
    if (error) throw error;
    res.json(rows || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/salary-structures — list active salary per employee
router.get('/salary-structures', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { userId } = req.query;

    let query = supabase.from('employee_salary_structures')
      .select('*, users!employee_salary_structures_user_id_fkey(id, name, email, department, position, avatar_color, employee_id)')
      .eq('organization_id', oId)
      .is('effective_to', null)
      .order('created_at', { ascending: false });

    if (userId) query = query.eq('user_id', parseInt(userId));

    const { data, error } = await query;
    if (error) throw error;

    res.json((data || []).map(r => ({
      ...r,
      user_name:    r.users?.name,
      user_email:   r.users?.email,
      department:   r.users?.department,
      position:     r.users?.position,
      avatar_color: r.users?.avatar_color,
      employee_id:  r.users?.employee_id,
      users: undefined,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/salary-structures/history/:userId — all versions for one employee
router.get('/salary-structures/history/:userId', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId    = orgId(req);
    const userId = parseInt(req.params.userId);
    if (!userId) return res.status(400).json({ error: 'Invalid user ID' });

    // Verify employee belongs to this org
    const { data: emp } = await supabase.from('users')
      .select('id').eq('id', userId).eq('organization_id', oId).maybeSingle();
    if (!emp) return res.status(404).json({ error: 'Employee not found' });

    const { data, error } = await supabase.from('employee_salary_structures')
      .select('*, creator:users!employee_salary_structures_created_by_fkey(name)')
      .eq('organization_id', oId)
      .eq('user_id', userId)
      .order('effective_from', { ascending: false });

    if (error) throw error;
    res.json((data || []).map(r => ({
      ...r,
      created_by_name: r.creator?.name || null,
      creator: undefined,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/salary-structures/:id — single version
router.get('/salary-structures/:id', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId = orgId(req);
    const id  = parseInt(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const { data, error } = await supabase.from('employee_salary_structures')
      .select('*, users!employee_salary_structures_user_id_fkey(id, name, department, position)')
      .eq('id', id).eq('organization_id', oId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Salary structure not found' });

    res.json({ ...data, user_name: data.users?.name, users: undefined });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payroll/salary-structures — create new salary version (closes previous active)
router.post('/salary-structures', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId = orgId(req);
    const {
      user_id, effective_from,
      basic = 0, hra = 0, da = 0,
      transport_allowance = 0, medical_allowance = 0,
      special_allowance = 0, other_allowance = 0,
      employee_pf = 0, employee_esi = 0,
      professional_tax = 0, tds = 0, other_deductions = 0,
      employer_pf = 0, employer_esi = 0,
      notes,
    } = req.body;

    if (!user_id)        return res.status(400).json({ error: 'user_id is required' });
    if (!effective_from) return res.status(400).json({ error: 'effective_from is required' });

    // Verify employee belongs to this org
    const { data: employee } = await supabase.from('users')
      .select('id, name').eq('id', user_id).eq('organization_id', oId).maybeSingle();
    if (!employee) return res.status(404).json({ error: 'Employee not found in this organization' });

    const gross_salary =
      Number(basic) + Number(hra) + Number(da) +
      Number(transport_allowance) + Number(medical_allowance) +
      Number(special_allowance) + Number(other_allowance);

    const ctc = gross_salary + Number(employer_pf) + Number(employer_esi);

    const client = await pool.connect();
    let newRecord;
    try {
      await client.query('BEGIN');

      // Close the current active version (set effective_to = effective_from - 1 day)
      const closeRes = await client.query(
        `UPDATE employee_salary_structures
            SET effective_to = ($1::date - INTERVAL '1 day')::date
          WHERE organization_id = $2
            AND user_id = $3
            AND effective_to IS NULL
          RETURNING *`,
        [effective_from, oId, user_id]
      );
      const oldRecord = closeRes.rows[0] || null;

      const insertRes = await client.query(
        `INSERT INTO employee_salary_structures
           (organization_id, user_id, effective_from,
            basic, hra, da, transport_allowance, medical_allowance,
            special_allowance, other_allowance, gross_salary,
            employee_pf, employee_esi, professional_tax, tds, other_deductions,
            employer_pf, employer_esi, ctc, notes, created_by)
         VALUES
           ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING *`,
        [oId, user_id, effective_from,
         Number(basic), Number(hra), Number(da),
         Number(transport_allowance), Number(medical_allowance),
         Number(special_allowance), Number(other_allowance),
         parseFloat(gross_salary.toFixed(2)),
         Number(employee_pf), Number(employee_esi),
         Number(professional_tax), Number(tds), Number(other_deductions),
         Number(employer_pf), Number(employer_esi),
         parseFloat(ctc.toFixed(2)),
         notes || null, req.user.id]
      );
      newRecord = insertRes.rows[0];

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }

    logPayroll({
      oId, actorId: req.user.id, actorName: req.user.name,
      action: newRecord ? 'salary_updated' : 'salary_created',
      entityType: 'salary_structure', entityId: newRecord.id,
      targetUserId: user_id,
      oldValues: null,
      newValues: newRecord,
      ip: req.ip,
    });

    res.status(201).json(newRecord);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Payroll Structures ───────────────────────────────────────────────────────

// GET /api/payroll/structure?userId=
// Employees may view their own structure; admins need manage_structures permission.
router.get('/structure', auth, async (req, res) => {
  try {
    const oId = orgId(req);
    const { userId } = req.query;
    // Non-admins are always scoped to their own record regardless of userId param
    const targetId = isAdmin(req.user.role) ? (userId || req.user.id) : req.user.id;
    if (isAdmin(req.user.role) && userId && String(userId) !== String(req.user.id)) {
      // Admin querying another user — require explicit RBAC permission
      const { resolvePermissions, hasPermissionCheck } = require('../../services/permissionService');
      const perms = await resolvePermissions(req.user.id, oId);
      if (!hasPermissionCheck(perms, 'payroll', 'manage_structures')) {
        return res.status(403).json({ error: 'Permission denied. Required: payroll.manage_structures' });
      }
    }
    const { data, error } = await supabase.from('payroll_structures')
      .select('*').eq('user_id', targetId).eq('organization_id', oId)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payroll/structure
router.post('/structure', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId = orgId(req);
    const body = { ...req.body, organization_id: oId };
    delete body.id; delete body.created_at;
    const { data, error } = await supabase.from('payroll_structures').insert(body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payroll/structure/:id
router.put('/structure/:id', auth, hasPermission('payroll', 'manage_structures'), async (req, res) => {
  try {
    const oId = orgId(req);
    const body = { ...req.body };
    delete body.id; delete body.created_at; delete body.organization_id;
    const { data, error } = await supabase.from('payroll_structures')
      .update(body).eq('id', req.params.id).eq('organization_id', oId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Payslips ─────────────────────────────────────────────────────────────────

// GET /api/payroll/payslips?userId=&year=
router.get('/payslips', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId, year } = req.query;
    const targetId = isAdmin(req.user.role) && userId ? userId : req.user.id;
    let q = supabase.from('payslips')
      .select('*, users!user_id(name, department, position)')
      .eq('organization_id', oId)
      .eq('user_id', targetId)
      .order('year', { ascending: false })
      .order('month', { ascending: false });
    if (year) q = q.eq('year', year);
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/payslips/all — admin: all employees for a period
router.get('/payslips/all', auth, hasPermission('payroll', 'view_payslips'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { month, year } = req.query;
    const conditions = [`ps.organization_id = $1`];
    const params     = [oId];
    if (month) { conditions.push(`ps.month = $${params.length + 1}`); params.push(month); }
    if (year)  { conditions.push(`ps.year  = $${params.length + 1}`); params.push(Number(year)); }
    const { rows } = await pool.query(
      `SELECT ps.*,
              u.name AS user_name, u.department, u.position, u.avatar_color
         FROM payslips ps
         JOIN  users u ON u.id = ps.user_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY ps.created_at DESC`,
      params
    );
    // Shape the rows so callers receive the same nested structure Supabase used to provide
    res.json(rows.map(r => ({
      ...r,
      users: { name: r.user_name, department: r.department, position: r.position, avatar_color: r.avatar_color },
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payroll/payslips/generate — legacy single-employee payslip generation
router.post('/payslips/generate', auth, hasPermission('payroll', 'generate'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { user_id, month, year, other_deductions, notes } = req.body;
    if (!user_id || !month || !year) return res.status(400).json({ error: 'user_id, month, year required' });

    // Fetch salary structure — most recent one effective on or before this pay period
    // Secondary sort by id DESC so latest-created wins when two structures share the same date
    let { data: structures } = await supabase.from('payroll_structures')
      .select('*').eq('user_id', user_id).eq('organization_id', oId)
      .lte('effective_from', `${year}-${String(month).padStart(2,'0')}-01`)
      .order('effective_from', { ascending: false })
      .order('id', { ascending: false })
      .limit(1);
    // Fallback: if no structure matches the date filter, use the most recently created one
    if (!structures?.length) {
      const { data: fallback } = await supabase.from('payroll_structures')
        .select('*').eq('user_id', user_id).eq('organization_id', oId)
        .order('effective_from', { ascending: false })
        .order('id', { ascending: false })
        .limit(1);
      structures = fallback;
    }
    const structure = structures?.[0];
    if (!structure) return res.status(400).json({ error: 'No salary structure found for this employee' });

    // Block regeneration of locked or published payslips
    const { force } = req.body;
    const existingCheck = await pool.query(
      `SELECT id, status, locked FROM payslips
        WHERE user_id = $1 AND month = $2 AND year = $3 AND organization_id = $4`,
      [user_id, String(month).padStart(2, '0'), Number(year), oId]
    );
    const existingSlip = existingCheck.rows[0] || null;
    // Locked payslips may NEVER be overwritten — even with force=true
    if (existingSlip?.locked) {
      return res.status(409).json({
        error: 'This payslip is locked and cannot be regenerated. Unlock the payroll run first.',
        payslip_id: existingSlip.id,
        code: 'PAYSLIP_LOCKED',
      });
    }
    if (existingSlip?.status === 'published' && !force) {
      return res.status(409).json({
        error: 'This payslip has already been published. Pass force=true to regenerate.',
        payslip_id: existingSlip.id,
      });
    }

    // FIX: use actual last day of the month (not hardcoded 31 — breaks February)
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const { data: att } = await supabase.from('attendance')
      .select('status, date').eq('user_id', user_id).eq('organization_id', oId)
      .gte('date', `${year}-${String(month).padStart(2,'0')}-01`)
      .lte('date', `${year}-${String(month).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`);

    // Count working days in the month based on org work schedule
    const { data: ws } = await supabase.from('work_schedule').select('work_days').eq('organization_id', oId).limit(1).maybeSingle();
    const workDays = (ws?.work_days || '1,2,3,4,5').split(',').map(Number);
    let totalWorkingDays = 0;
    const d = new Date(Number(year), Number(month) - 1, 1);
    while (d.getMonth() === Number(month) - 1) {
      if (workDays.includes(d.getDay())) totalWorkingDays++;
      d.setDate(d.getDate() + 1);
    }

    // FIX: half_day counts as 0.5 present and 0.5 LOP — not a full present day
    const fullPresent  = (att || []).filter(a => ['present', 'wfh'].includes(a.status)).length;
    const halfDayCount = (att || []).filter(a => a.status === 'half_day').length;
    const absentCount  = (att || []).filter(a => a.status === 'absent').length;
    const leaveCount   = (att || []).filter(a => a.status === 'on_leave').length;
    const presentDays  = fullPresent + halfDayCount * 0.5;
    // FIX: approved leaves (on_leave) are NOT LOP; absents and half-days are
    const lopDays      = absentCount + halfDayCount * 0.5;

    const grossSalary  = (structure.basic || 0) + (structure.hra || 0) + (structure.da || 0) + (structure.transport_allowance || 0) + (structure.medical_allowance || 0) + (structure.other_allowances || 0);
    const perDaySalary = totalWorkingDays > 0 ? grossSalary / totalWorkingDays : 0;
    const lopAmount    = lopDays * perDaySalary;
    const totalDed     = (structure.pf_employee || 0) + (structure.esi_employee || 0) + (structure.professional_tax || 0) + (structure.tds || 0) + Number(other_deductions || 0) + lopAmount;
    const netSalary    = Math.max(0, grossSalary - totalDed);

    // Use an advisory lock keyed on (org_id, user_id, month, year) to prevent
    // two concurrent generate requests from producing duplicate payslips/notifications.
    // pg_advisory_xact_lock releases automatically at COMMIT/ROLLBACK.
    const lockKey = BigInt(oId) * 10000000n + BigInt(user_id) * 10000n + BigInt(year % 100) * 100n + BigInt(month);
    const client = await pool.connect();
    let data;
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock($1)`, [lockKey.toString()]);

      // Re-check inside lock: another concurrent request may have just locked or published
      const slipCheck = await client.query(
        `SELECT id, status, locked FROM payslips
         WHERE user_id = $1 AND month = $2 AND year = $3 AND organization_id = $4`,
        [user_id, String(month).padStart(2,'0'), Number(year), oId]
      );
      const lockedSlip = slipCheck.rows[0];
      if (lockedSlip?.locked) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Payslip is locked. Unlock the payroll run first.',
          payslip_id: lockedSlip.id,
          code: 'PAYSLIP_LOCKED',
        });
      }
      if (lockedSlip?.status === 'published' && !force) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Payslip already published. Pass force=true to regenerate.',
          payslip_id: lockedSlip.id,
        });
      }

      const upsertRes = await client.query(
        `INSERT INTO payslips
           (user_id, month, year, pay_period, basic, hra, da, transport_allowance,
            medical_allowance, other_allowances, gross_salary, pf_employee, pf_employer,
            esi_employee, esi_employer, professional_tax, tds, other_deductions,
            total_deductions, lop_days, lop_amount, net_salary, working_days, present_days,
            absent_days, leave_days, notes, status, organization_id, generated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,'generated',$28,$29)
         ON CONFLICT (user_id, month, year)
         DO UPDATE SET
           basic=$5, hra=$6, da=$7, transport_allowance=$8, medical_allowance=$9,
           other_allowances=$10, gross_salary=$11, pf_employee=$12, pf_employer=$13,
           esi_employee=$14, esi_employer=$15, professional_tax=$16, tds=$17,
           other_deductions=$18, total_deductions=$19, lop_days=$20, lop_amount=$21,
           net_salary=$22, working_days=$23, present_days=$24, absent_days=$25,
           leave_days=$26, notes=$27, status='generated', generated_by=$29
         RETURNING *`,
        [user_id, String(month).padStart(2,'0'), Number(year),
         `${String(month).padStart(2,'0')}/${year}`,
         structure.basic, structure.hra, structure.da, structure.transport_allowance,
         structure.medical_allowance, structure.other_allowances,
         parseFloat(grossSalary.toFixed(2)),
         structure.pf_employee, structure.pf_employer||0,
         structure.esi_employee, structure.esi_employer||0,
         structure.professional_tax, structure.tds,
         Number(other_deductions||0), parseFloat(totalDed.toFixed(2)),
         lopDays, parseFloat(lopAmount.toFixed(2)), parseFloat(netSalary.toFixed(2)),
         totalWorkingDays, presentDays, absentCount, leaveCount,
         notes||'', oId, req.user.id]
      );
      data = upsertRes.rows[0];

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Fire-and-forget notification after COMMIT
    supabase.from('notifications').insert({
      user_id, title: 'Payslip Generated',
      message: `Your payslip for ${String(month).padStart(2,'0')}/${year} has been generated. Net pay: ₹${netSalary.toFixed(2)}`,
      type: 'payroll', organization_id: oId,
    }).then(() => {});
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payroll/payslips/:id/publish
router.put('/payslips/:id/publish', auth, hasPermission('payroll', 'generate'), async (req, res) => {
  try {
    const oId = orgId(req);
    const id  = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid payslip ID' });

    // Verify payslip belongs to this org and is not locked before publishing
    const { rows } = await pool.query(
      `SELECT id, status, locked FROM payslips
        WHERE id = $1 AND organization_id = $2`,
      [id, oId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });
    if (rows[0].locked) {
      return res.status(409).json({ error: 'Payslip is locked and cannot be published without unlocking.' });
    }

    await pool.query(
      `UPDATE payslips SET status = 'published' WHERE id = $1 AND organization_id = $2`,
      [id, oId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3.3 — PAYROLL GENERATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

function genErrResponse(res, err) {
  if (err instanceof GenerationError) {
    return res.status(400).json({ error: err.message, code: err.code, meta: err.meta });
  }
  return res.status(500).json({ error: err.message });
}

// POST /api/payroll/preview — dry-run calculations, no writes
router.post('/preview', auth, hasPermission('payroll', 'generate'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { month, year } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year are required' });
    const result = await previewPayrollRun({
      organizationId: oId,
      month: parseInt(month, 10),
      year:  parseInt(year,  10),
    });
    res.json(result);
  } catch (err) { genErrResponse(res, err); }
});

// POST /api/payroll/generate — create a payroll run and write payslip snapshots
router.post('/generate', auth, hasPermission('payroll', 'generate'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { month, year, notes, force } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year are required' });
    const result = await generatePayrollRun({
      organizationId: oId,
      month:          parseInt(month, 10),
      year:           parseInt(year,  10),
      generatedBy:    req.user.id,
      notes:          notes  || null,
      force:          Boolean(force),
      ip:             req.ip,
    });
    res.status(201).json(result);
  } catch (err) { genErrResponse(res, err); }
});

// POST /api/payroll/lock/:id — lock a completed run (payslips become immutable)
router.post('/lock/:id', auth, hasPermission('payroll', 'lock'), async (req, res) => {
  try {
    const oId   = orgId(req);
    const runId = parseInt(req.params.id, 10);
    if (!runId) return res.status(400).json({ error: 'Invalid run ID' });
    const result = await lockPayrollRun({
      organizationId: oId,
      runId,
      actorId:   req.user.id,
      actorName: req.user.name,
      ip:        req.ip,
    });
    res.json(result);
  } catch (err) { genErrResponse(res, err); }
});

// POST /api/payroll/unlock/:id — unlock a locked run (root admin only via RBAC)
router.post('/unlock/:id', auth, hasPermission('payroll', 'unlock'), async (req, res) => {
  try {
    const oId   = orgId(req);
    const runId = parseInt(req.params.id, 10);
    if (!runId) return res.status(400).json({ error: 'Invalid run ID' });
    const result = await unlockPayrollRun({
      organizationId: oId,
      runId,
      actorId:   req.user.id,
      actorName: req.user.name,
      ip:        req.ip,
    });
    res.json(result);
  } catch (err) { genErrResponse(res, err); }
});

// GET /api/payroll/runs — list all payroll runs for the org
router.get('/runs', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { rows } = await pool.query(
      `SELECT pr.*,
              u.name  AS generated_by_name,
              lu.name AS locked_by_name
         FROM payroll_runs pr
         LEFT JOIN users u  ON u.id  = pr.generated_by
         LEFT JOIN users lu ON lu.id = pr.locked_by
        WHERE pr.organization_id = $1
        ORDER BY pr.year DESC, pr.month DESC`,
      [oId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/runs/:id — run details + per-employee breakdown
router.get('/runs/:id', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId   = orgId(req);
    const runId = parseInt(req.params.id, 10);
    if (!runId) return res.status(400).json({ error: 'Invalid run ID' });

    const runRes = await pool.query(
      `SELECT pr.*,
              u.name  AS generated_by_name,
              lu.name AS locked_by_name
         FROM payroll_runs pr
         LEFT JOIN users u  ON u.id  = pr.generated_by
         LEFT JOIN users lu ON lu.id = pr.locked_by
        WHERE pr.id = $1 AND pr.organization_id = $2`,
      [runId, oId]
    );
    if (!runRes.rows.length) return res.status(404).json({ error: 'Payroll run not found' });

    const { rows: employees } = await pool.query(
      `SELECT pre.id, pre.user_id, pre.status AS employee_status,
              pre.error_message, pre.processed_at, pre.payslip_id,
              u.name, u.employee_id, u.department, u.position, u.avatar_color,
              ps.gross_salary, ps.total_deductions, ps.net_salary,
              ps.lop_days, ps.locked
         FROM payroll_run_employees pre
         JOIN  users u ON u.id = pre.user_id
         LEFT JOIN payslips ps ON ps.id = pre.payslip_id
        WHERE pre.payroll_run_id  = $1
          AND pre.organization_id = $2
        ORDER BY u.name ASC`,
      [runId, oId]
    );

    res.json({ ...runRes.rows[0], employees });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/payslips/:id/details — full payslip breakdown (run-generated)
// Placed BEFORE /:id to ensure Express matches /details as a literal segment
router.get('/payslips/:id/details', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId       = orgId(req);
    const payslipId = parseInt(req.params.id, 10);
    if (!payslipId) return res.status(400).json({ error: 'Invalid payslip ID' });

    const { rows } = await pool.query(
      `SELECT ps.*,
              u.name, u.employee_id, u.department, u.position, u.email, u.avatar_color,
              pr.month  AS run_month,
              pr.year   AS run_year,
              pr.status AS run_status
         FROM payslips ps
         JOIN  users u ON u.id = ps.user_id
         LEFT JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
        WHERE ps.id = $1 AND ps.organization_id = $2`,
      [payslipId, oId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });

    // Non-admin employees may only view their own payslips
    const slip = rows[0];
    if (!isAdmin(req.user.role) && slip.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(slip);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3.5 — SCHEDULER API
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/payroll/scheduler/trigger — manually trigger payroll for a period
router.post('/scheduler/trigger', auth, hasPermission('payroll', 'generate'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { month, year, force } = req.body;
    if (!month || !year) return res.status(400).json({ error: 'month and year are required' });
    const result = await triggerManual({
      organizationId: oId,
      month:          parseInt(month, 10),
      year:           parseInt(year,  10),
      force:          Boolean(force),
      actorId:        req.user.id,
      actorName:      req.user.name,
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof GenerationError) {
      return res.status(400).json({ error: err.message, code: err.code, meta: err.meta });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/payroll/scheduler/runs — list scheduler run history for this org
router.get('/scheduler/runs', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId = orgId(req);
    const { rows } = await pool.query(
      `SELECT psr.*, pr.status AS run_status, pr.employee_count, pr.total_net
         FROM payroll_scheduler_runs psr
         LEFT JOIN payroll_runs pr ON pr.id = psr.payroll_run_id
        WHERE psr.organization_id = $1
        ORDER BY psr.created_at DESC
        LIMIT 100`,
      [oId]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/scheduler/email-log — email log for a payroll run
router.get('/scheduler/email-log', auth, hasPermission('payroll', 'view'), async (req, res) => {
  try {
    const oId   = orgId(req);
    const runId = parseInt(req.query.runId || '0', 10);
    const where = runId
      ? 'pel.organization_id = $1 AND pel.payroll_run_id = $2'
      : 'pel.organization_id = $1';
    const params = runId ? [oId, runId] : [oId];
    const { rows } = await pool.query(
      `SELECT pel.*, u.name, u.employee_id
         FROM payroll_email_log pel
         JOIN users u ON u.id = pel.user_id
        WHERE ${where}
        ORDER BY pel.sent_at DESC
        LIMIT 500`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/payroll/payslips/:id — single payslip by primary key
router.get('/payslips/:id', auth, async (req, res) => {
  try {
    const oId       = orgId(req);
    const payslipId = parseInt(req.params.id, 10);
    if (!payslipId) return res.status(400).json({ error: 'Invalid payslip ID' });

    const { rows } = await pool.query(
      `SELECT ps.*, u.name, u.employee_id, u.department, u.position, u.avatar_color
         FROM payslips ps
         JOIN  users u ON u.id = ps.user_id
        WHERE ps.id = $1 AND ps.organization_id = $2`,
      [payslipId, oId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });

    const slip = rows[0];
    if (!isAdmin(req.user.role) && slip.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(slip);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
