const express    = require('express');
const router     = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth, adminOnly } = require('../../middleware/auth');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// ─── Payroll Structures ───────────────────────────────────────────────────────

// GET /api/payroll/structure?userId=
router.get('/structure', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { userId } = req.query;
    if (!isAdmin(req.user.role) && String(userId) !== String(req.user.id))
      return res.status(403).json({ error: 'Forbidden' });
    const { data, error } = await supabase.from('payroll_structures')
      .select('*').eq('user_id', userId || req.user.id).eq('organization_id', oId)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payroll/structure
router.post('/structure', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const body = { ...req.body, organization_id: oId };
    delete body.id; delete body.created_at;
    const { data, error } = await supabase.from('payroll_structures').insert(body).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payroll/structure/:id
router.put('/structure/:id', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
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
router.get('/payslips/all', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
    const { month, year } = req.query;
    let q = supabase.from('payslips')
      .select('*, users!user_id(name, department, position, avatar_color)')
      .eq('organization_id', oId)
      .order('created_at', { ascending: false });
    if (month) q = q.eq('month', month);
    if (year)  q = q.eq('year',  Number(year));
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/payroll/payslips/generate — generate payslip for a user+month
router.post('/payslips/generate', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const oId = req.user.organization_id;
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

    // HIGH-18: Block regeneration of a published payslip unless force=true is explicitly set.
    const { force } = req.body;
    const { data: existingSlip } = await supabase.from('payslips')
      .select('id, status')
      .eq('user_id', user_id).eq('month', String(month).padStart(2, '0'))
      .eq('year', Number(year)).eq('organization_id', oId)
      .maybeSingle();
    if (existingSlip?.status === 'published' && !force) {
      return res.status(409).json({
        error: 'This payslip has already been published and distributed. Pass force=true to regenerate.',
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

      // Re-check published status inside the lock (another concurrent request may have just published)
      const slipCheck = await client.query(
        `SELECT id, status FROM payslips
         WHERE user_id = $1 AND month = $2 AND year = $3 AND organization_id = $4`,
        [user_id, String(month).padStart(2,'0'), Number(year), oId]
      );
      const lockedSlip = slipCheck.rows[0];
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
router.put('/payslips/:id/publish', auth, adminOnly, async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const { error } = await supabase.from('payslips')
      .update({ status: 'published' }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
