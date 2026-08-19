const express = require('express');
const router  = express.Router();
const { supabase, pool } = require('../../config/db');
const { auth } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
const { getOrgPolicy } = require('../../utils/orgPolicy');

function toCSV(rows, cols) {
  const header = cols.map(c => c.label).join(',');
  const lines  = rows.map(r => cols.map(c => {
    const v = r[c.key] ?? '';
    return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
  }).join(','));
  return [header, ...lines].join('\n');
}

// Helper: convert "HH:MM" to minutes
function toMins(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
// Current IST time as "HH:MM"
function nowIST() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'hour').value.padStart(2,'0')}:${parts.find(p => p.type === 'minute').value.padStart(2,'0')}`;
}
// Current IST date as "YYYY-MM-DD"
function todayIST() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); }

// GET /api/reports/attendance?year=&month=&userId=&format=csv
router.get('/attendance', auth, async (req, res) => {
  try {
    const oId    = req.user.organization_id;
    const policy = await getOrgPolicy(oId);
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

    const today   = todayIST();
    const timeNow = nowIST();

    const rows = (data || []).map(r => {
      const check_in            = r.check_in  || '';
      const check_out           = r.check_out || '';
      const total_break_minutes = r.total_break_minutes || 0;
      const is_today            = r.date === today;
      const is_live             = is_today && !!check_in && !check_out; // checked in, not yet checked out

      // Gross hours: check_out - check_in (full span)
      let gross_hours = r.gross_hours > 0 ? r.gross_hours : 0;
      if (gross_hours === 0 && check_in && check_out) {
        const mins = toMins(check_out) - toMins(check_in);
        if (mins > 0) gross_hours = Math.round((mins / 60) * 100) / 100;
      }

      // Effective (working) hours: gross - break
      let work_hours = r.work_hours || 0;
      if (work_hours === 0 && check_in && check_out) {
        const grossMins = toMins(check_out) - toMins(check_in);
        const effMins   = Math.max(0, grossMins - total_break_minutes);
        if (effMins > 0) work_hours = Math.round((effMins / 60) * 100) / 100;
      }

      // For live employees (checked in today, no checkout): compute estimated hours so far
      let estimated_hours = 0;
      if (is_live && check_in) {
        const elapsedMins = toMins(timeNow) - toMins(check_in);
        // Subtract active break time if employee is currently on break
        const breakMins = (r.break_start && !r.break_end)
          ? Math.max(0, toMins(timeNow) - toMins(r.break_start))
          : total_break_minutes;
        const effMins = Math.max(0, elapsedMins - breakMins);
        if (effMins > 0) estimated_hours = Math.round((effMins / 60) * 100) / 100;
      }

      return {
        name:                 r.users?.name || '',
        department:           r.users?.department || '',
        position:             r.users?.position || '',
        date:                 r.date,
        status:               r.status,
        check_in,
        check_out,
        break_start:          r.break_start  || '',
        break_end:            r.break_end    || '',
        total_break_minutes,
        gross_hours:          gross_hours    || 0,
        work_hours:           work_hours     || 0,
        estimated_hours,
        is_live,
        is_on_break:          !!(r.break_start && !r.break_end && !check_out),
        // For first_in_last_out orgs, total_break_minutes holds non-working gaps.
        // Expose it with a clear name so the frontend can label the column correctly.
        non_working_minutes:  policy === 'first_in_last_out' ? total_break_minutes : null,
      };
    });

    if (format === 'csv') {
      const isFilo = policy === 'first_in_last_out';
      const csv = toCSV(rows, [
        { key: 'name', label: 'Employee' },
        { key: 'department', label: 'Department' },
        { key: 'date', label: 'Date' },
        { key: 'status', label: 'Status' },
        { key: 'check_in', label: 'First In' },
        { key: 'check_out', label: 'Last Out' },
        ...(isFilo
          ? [{ key: 'non_working_minutes', label: 'Non-Working (min)' }]
          : [{ key: 'total_break_minutes', label: 'Break (min)' }]),
        { key: 'gross_hours', label: 'Total Hours' },
        { key: 'work_hours', label: 'Working Hours' },
      ]);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="attendance_report_${year||'all'}_${month||'all'}.csv"`);
      return res.send(csv);
    }
    res.json({ data: rows, meta: { attendance_policy: policy } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/leaves?year=&month=&format=csv
router.get('/leaves', auth, async (req, res) => {
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

// GET /api/reports/headcount — summary stats (role-scoped)
router.get('/headcount', auth, async (req, res) => {
  try {
    const oId = req.user.organization_id;
    // root_admin sees HR admins + employees; HR admin sees employees only
    const roleFilter = req.user.role === 'root_admin' ? ['admin', 'employee'] : ['employee'];
    const { data: users } = await supabase.from('users')
      .select('id, role, employee_status, department, date_of_joining, created_at')
      .eq('organization_id', oId)
      .in('role', roleFilter);
    const total   = users?.length || 0;
    const active  = users?.filter(u => u.employee_status === 'active' || !u.employee_status).length || 0;
    const byDept  = {};
    (users || []).forEach(u => {
      const d = u.department || 'General';
      byDept[d] = (byDept[d] || 0) + 1;
    });
    res.json({ total, active, byDepartment: byDept });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/employees?format=csv (admin only — contains PII)
router.get('/employees', auth, hasPermission('reports', 'view'), async (req, res) => {
  try {
    const oId = req.user.organization_id;
    const { format } = req.query;
    const { data, error } = await supabase.from('users')
      // BUG_128: exclude HR/admin — report shows employees only
      // BUG_159: no status filter so all statuses included when "All" selected
      // BUG_129: select employee_status (authoritative column) + employment_type for normalisation
      .select('employee_id, name, email, phone, gender, department, position, role, employment_type, employee_status, date_of_joining')
      .in('role', ['employee'])
      .eq('organization_id', oId)
      .order('name');
    if (error) throw error;

    // BUG_129: normalise employment_type (old migration stored 'full-time', app stores 'full_time')
    // BUG_159: expose employee_status as employment_status for frontend field name consistency
    const rows = (data || []).map(r => ({
      ...r,
      employment_type:   r.employment_type ? r.employment_type.replace(/-/g, '_').toLowerCase() : null,
      employment_status: r.employee_status || null,
    }));

    if (format === 'csv') {
      const csv = toCSV(rows, [
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
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
