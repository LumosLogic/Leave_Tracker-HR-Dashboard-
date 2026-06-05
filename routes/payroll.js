const express    = require('express');
const router     = express.Router();
const { supabase } = require('../db');

function isAdmin(role) { return role === 'admin' || role === 'root_admin'; }

// ─── Payroll Structures ───────────────────────────────────────────────────────

// GET /api/payroll/structure?userId=
router.get('/structure', async (req, res) => {
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
router.post('/structure', async (req, res) => {
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
router.put('/structure/:id', async (req, res) => {
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
router.get('/payslips', async (req, res) => {
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
router.get('/payslips/all', async (req, res) => {
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
router.post('/payslips/generate', async (req, res) => {
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

    const { data, error } = await supabase.from('payslips').upsert({
      user_id, month: String(month).padStart(2,'0'), year: Number(year),
      pay_period: `${String(month).padStart(2,'0')}/${year}`,
      basic: structure.basic, hra: structure.hra, da: structure.da,
      transport_allowance: structure.transport_allowance,
      medical_allowance: structure.medical_allowance,
      other_allowances: structure.other_allowances,
      gross_salary: parseFloat(grossSalary.toFixed(2)),
      pf_employee: structure.pf_employee,
      pf_employer: structure.pf_employer || 0,
      esi_employee: structure.esi_employee,
      esi_employer: structure.esi_employer || 0,
      professional_tax: structure.professional_tax, tds: structure.tds,
      other_deductions: Number(other_deductions || 0),
      total_deductions: parseFloat(totalDed.toFixed(2)),
      lop_days: lopDays, lop_amount: parseFloat(lopAmount.toFixed(2)),
      net_salary: parseFloat(netSalary.toFixed(2)),
      working_days: totalWorkingDays,
      present_days: presentDays,
      absent_days: absentCount,
      leave_days: leaveCount,
      notes: notes || '', status: 'generated',
      organization_id: oId, generated_by: req.user.id,
    }, { onConflict: 'user_id,month,year' }).select().single();
    if (error) throw error;

    // Notify employee
    await supabase.from('notifications').insert({
      user_id, title: 'Payslip Generated',
      message: `Your payslip for ${String(month).padStart(2,'0')}/${year} has been generated. Net pay: ₹${netSalary.toFixed(2)}`,
      type: 'payroll', organization_id: oId,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/payroll/payslips/:id/publish
router.put('/payslips/:id/publish', async (req, res) => {
  try {
    if (!isAdmin(req.user.role)) return res.status(403).json({ error: 'Admin only' });
    const { error } = await supabase.from('payslips')
      .update({ status: 'published' }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
