const express = require('express');
const router  = express.Router();
const { supabase } = require('../db');

function toCSV(rows, cols) {
  const header = cols.map(c => c.label).join(',');
  const lines  = rows.map(r => cols.map(c => {
    const v = r[c.key] ?? '';
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
  }).join(','));
  return [header, ...lines].join('\n');
}

// GET /api/reports/attendance?year=&month=&userId=&format=csv
router.get('/attendance', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { year, month, userId, format } = req.query;
    let q = supabase.from('attendance')
      .select('*, users(name, department, position)')
      .eq('organization_id', oId)
      .order('date', { ascending: false });
    if (year && month) {
      q = q.gte('date', `${year}-${String(month).padStart(2,'0')}-01`)
           .lte('date', `${year}-${String(month).padStart(2,'0')}-31`);
    } else if (year) {
      q = q.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
    }
    if (userId) q = q.eq('user_id', userId);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map(r => ({
      name:       r.users?.name || '',
      department: r.users?.department || '',
      position:   r.users?.position || '',
      date:       r.date,
      status:     r.status,
      check_in:   r.check_in || '',
      check_out:  r.check_out || '',
      work_hours: r.work_hours || 0,
      is_late:    r.is_late ? 'Yes' : 'No',
      early_exit: r.is_early_exit ? 'Yes' : 'No',
    }));

    if (format === 'csv') {
      const csv = toCSV(rows, [
        { key: 'name', label: 'Employee' },
        { key: 'department', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'status', label: 'Status' },
        { key: 'check_in', label: 'Check In' },
        { key: 'check_out', label: 'Check Out' },
        { key: 'work_hours', label: 'Work Hours' },
        { key: 'is_late', label: 'Late' },
        { key: 'early_exit', label: 'Early Exit' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_report_${year||'all'}_${month||'all'}.csv"`);
      return res.send(csv);
    }
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/leaves?year=&month=&format=csv
router.get('/leaves', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { year, month, format, status } = req.query;
    let q = supabase.from('leaves')
      .select('*, users!leaves_user_id_fkey(name, department), approver:users!leaves_approved_by_fkey(name)')
      .eq('organization_id', oId)
      .order('start_date', { ascending: false });
    if (year && month) {
      q = q.gte('start_date', `${year}-${String(month).padStart(2,'0')}-01`)
           .lte('start_date', `${year}-${String(month).padStart(2,'0')}-31`);
    } else if (year) {
      q = q.gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`);
    }
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;

    const rows = (data || []).map(r => ({
      name:        r.users?.name || '',
      department:  r.users?.department || '',
      leave_type:  r.leave_type,
      start_date:  r.start_date,
      end_date:    r.end_date,
      leave_time:  r.leave_time,
      status:      r.status,
      reason:      r.reason || '',
      approved_by: r.approver?.name || '',
    }));

    if (format === 'csv') {
      const csv = toCSV(rows, [
        { key: 'name', label: 'Employee' },
        { key: 'department', label: 'Department' },
        { key: 'leave_type', label: 'Leave Type' },
        { key: 'start_date', label: 'From' },
        { key: 'end_date', label: 'To' },
        { key: 'leave_time', label: 'Duration' },
        { key: 'status', label: 'Status' },
        { key: 'reason', label: 'Reason' },
        { key: 'approved_by', label: 'Approved By' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="leave_report_${year||'all'}.csv"`);
      return res.send(csv);
    }
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/headcount — summary stats
router.get('/headcount', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { data: users } = await supabase.from('users').select('id, role, employment_status, department, date_of_joining, created_at').eq('organization_id', oId);
    const total   = users?.length || 0;
    const active  = users?.filter(u => u.employment_status === 'active' || !u.employment_status).length || 0;
    const byDept  = {};
    (users || []).forEach(u => {
      const d = u.department || 'General';
      byDept[d] = (byDept[d] || 0) + 1;
    });
    res.json({ total, active, byDepartment: byDept });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/employees?format=csv
router.get('/employees', async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { format } = req.query;
    const { data, error } = await supabase.from('users')
      .select('employee_id, name, email, phone, gender, department, position, role, employment_type, employment_status, date_of_joining')
      .eq('organization_id', oId)
      .order('name');
    if (error) throw error;

    if (format === 'csv') {
      const csv = toCSV(data || [], [
        { key: 'employee_id', label: 'Employee ID' },
        { key: 'name', label: 'Name' },
        { key: 'email', label: 'Email' },
        { key: 'phone', label: 'Phone' },
        { key: 'gender', label: 'Gender' },
        { key: 'department', label: 'Department' },
        { key: 'position', label: 'Position' },
        { key: 'employment_type', label: 'Type' },
        { key: 'employment_status', label: 'Status' },
        { key: 'date_of_joining', label: 'Joining Date' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="employee_list.csv"');
      return res.send(csv);
    }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
