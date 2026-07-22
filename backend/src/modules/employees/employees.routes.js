const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const { supabase } = require('../../config/db');
const { auth, adminOnly, isAdminRole } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');
const { sendMail, welcomeEmployeeHtml } = require('../../services/emailService');

// ─── NEW COLUMNS (biometric / Sanghavi) added to the standard employee fields ──
const EMPLOYEE_PUBLIC_COLS = [
  'id', 'name', 'email', 'role', 'department', 'position', 'avatar_color',
  'date_of_birth', 'created_at', 'phone', 'personal_email', 'joining_date',
  'employment_type', 'work_mode', 'employee_status', 'ctc', 'salary_effective_date',
  // new HRMS columns
  'device_enrollment_id', 'branch_id', 'grade', 'division', 'sub_division',
  'salutation', 'middle_name', 'surname', 'location', 'pay_cadre',
  'weekly_off_day', 'work_hours_per_day',
].join(', ');

// Sensitive statutory fields — admin only
const EMPLOYEE_ADMIN_COLS = EMPLOYEE_PUBLIC_COLS + ', aadhar_no, pan_number, uan_no, pf_applicable, pf_no, esi_applicable, esi_no, ot_applicable, ot_rate';

// ─── Employees: List ──────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    // root_admin sees all non-root users (HR admins + employees); others see only employees
    const roleFilter = req.user.role === 'root_admin' ? ['admin', 'employee'] : ['employee'];
    const cols = isAdminRole(req.user.role) ? EMPLOYEE_ADMIN_COLS : EMPLOYEE_PUBLIC_COLS;
    const { data: users } = await supabase.from('users')
      .select(cols)
      .eq('organization_id', orgId(req))
      .in('role', roleFilter)
      .order('name');

    // Attach multi-department assignments
    const ids = (users || []).map(u => u.id);
    let deptMap = {};
    if (ids.length > 0) {
      const { data: ud } = await supabase.from('user_departments')
        .select('user_id, department_id, role_in_dept, departments(id, name)')
        .in('user_id', ids);
      (ud || []).forEach(r => {
        if (!deptMap[r.user_id]) deptMap[r.user_id] = [];
        deptMap[r.user_id].push({ id: r.department_id, name: r.departments?.name || '', role: r.role_in_dept });
      });
    }

    res.json((users || []).map(u => ({ ...u, departments: deptMap[u.id] || [] })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees: Create ────────────────────────────────────────────────────────
router.post('/', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, department, position, avatar_color, date_of_birth } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    if (role === 'root_admin' && req.user.role !== 'root_admin') {
      return res.status(403).json({ error: 'Only root admins can create root_admin accounts' });
    }
    const hashed = bcrypt.hashSync(password, 10);
    const {
      device_enrollment_id, branch_id, grade, division, sub_division,
      salutation, middle_name, surname, location, pay_cadre,
      weekly_off_day, work_hours_per_day,
    } = req.body;
    const { data, error } = await supabase.from('users')
      .insert({
        name, email: email.toLowerCase(), password: hashed,
        role: role || 'employee', department: department || 'General',
        position: position || 'Staff', avatar_color: avatar_color || '#4F46E5',
        date_of_birth: date_of_birth || null,
        force_password_change: true,
        organization_id: orgId(req),
        // new columns
        device_enrollment_id: device_enrollment_id || null,
        branch_id:            branch_id            || null,
        grade:                grade                || null,
        division:             division             || null,
        sub_division:         sub_division         || null,
        salutation:           salutation           || null,
        middle_name:          middle_name          || null,
        surname:              surname              || null,
        location:             location             || null,
        pay_cadre:            pay_cadre            || null,
        weekly_off_day:       weekly_off_day       || null,
        work_hours_per_day:   work_hours_per_day   || null,
      })
      .select('id, name, email, role, department, position, avatar_color, date_of_birth').single();
    if (error?.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    if (error) throw new Error(error.message);

    // Sync department junction table if department_ids provided
    const department_ids = req.body.department_ids;
    if (data && Array.isArray(department_ids) && department_ids.length > 0) {
      try {
        await supabase.from('user_departments').insert(
          department_ids.map(dId => ({ user_id: data.id, department_id: parseInt(dId), role_in_dept: 'Member', organization_id: orgId(req) }))
        );
      } catch (err) {}
    }

    sendMail({ to: email, subject: 'Welcome to Lumens HR — Your Account Details', html: welcomeEmployeeHtml({ name, email, department: department||'General', position: position||'Staff' }, password) });
    // Log member added event
    Promise.resolve(
      supabase.from('platform_activity').insert({ event_type: 'member_added', organization_id: orgId(req), description: `Member added: ${name} (${email})`, metadata: { name, email, role: role||'employee', org_id: orgId(req) } })
    ).catch(() => {});
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees: Update ────────────────────────────────────────────────────────
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const {
      name, email, role, department, position, avatar_color, password, date_of_birth, department_ids,
      phone, personal_email, joining_date, employment_type, work_mode, employee_status, ctc, salary_effective_date,
      // new HRMS columns
      device_enrollment_id, branch_id, grade, division, sub_division,
      salutation, middle_name, surname, location, pay_cadre,
      weekly_off_day, work_hours_per_day,
    } = req.body;
    if (role === 'root_admin' && req.user.role !== 'root_admin') {
      return res.status(403).json({ error: 'Only root admins can assign the root_admin role' });
    }
    const update = {
      name, email, role, department, position, avatar_color,
      date_of_birth:        date_of_birth        || null,
      phone:                phone                || null,
      personal_email:       personal_email       || null,
      joining_date:         joining_date         || null,
      employment_type:      employment_type      || null,
      work_mode:            work_mode            || null,
      employee_status:      employee_status      || null,
      ctc:                  ctc                  || null,
      salary_effective_date: salary_effective_date || null,
      // new HRMS columns
      device_enrollment_id: device_enrollment_id || null,
      branch_id:            branch_id            || null,
      grade:                grade                || null,
      division:             division             || null,
      sub_division:         sub_division         || null,
      salutation:           salutation           || null,
      middle_name:          middle_name          || null,
      surname:              surname              || null,
      location:             location             || null,
      pay_cadre:            pay_cadre            || null,
      weekly_off_day:       weekly_off_day       || null,
      work_hours_per_day:   work_hours_per_day   || null,
    };
    if (password) update.password = bcrypt.hashSync(password, 10);
    const cols = isAdminRole(req.user.role) ? EMPLOYEE_ADMIN_COLS : EMPLOYEE_PUBLIC_COLS;
    const { data, error } = await supabase.from('users').update(update)
      .eq('id', req.params.id).eq('organization_id', orgId(req))
      .select(cols).single();
    if (error) throw new Error(error.message);

    // Sync multi-department assignments if provided
    if (Array.isArray(department_ids)) {
      await supabase.from('user_departments').delete().eq('user_id', req.params.id);
      if (department_ids.length > 0) {
        await supabase.from('user_departments').insert(
          department_ids.map(dId => ({ user_id: parseInt(req.params.id), department_id: dId, role_in_dept: 'Member', organization_id: orgId(req) }))
        );
      }
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees: Update Statutory Fields ──────────────────────────────────────
// PUT /api/employees/:id/statutory — admin only, accepts PF/ESI/OT statutory fields
router.put('/:id/statutory', auth, adminOnly, async (req, res) => {
  try {
    const {
      pf_applicable, pf_no, esi_applicable, esi_no,
      ot_applicable, ot_rate,
      aadhar_no, pan_number, uan_no,
    } = req.body;

    const update = {};
    if (pf_applicable  !== undefined) update.pf_applicable  = pf_applicable;
    if (pf_no          !== undefined) update.pf_no          = pf_no          || null;
    if (esi_applicable !== undefined) update.esi_applicable = esi_applicable;
    if (esi_no         !== undefined) update.esi_no         = esi_no         || null;
    if (ot_applicable  !== undefined) update.ot_applicable  = ot_applicable;
    if (ot_rate        !== undefined) update.ot_rate        = ot_rate        || null;
    if (aadhar_no      !== undefined) update.aadhar_no      = aadhar_no      || null;
    if (pan_number     !== undefined) update.pan_number     = pan_number     || null;
    if (uan_no         !== undefined) update.uan_no         = uan_no         || null;

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'No statutory fields provided' });
    }

    const { data, error } = await supabase.from('users')
      .update(update)
      .eq('id', req.params.id)
      .eq('organization_id', orgId(req))
      .select('id, pf_applicable, pf_no, esi_applicable, esi_no, ot_applicable, ot_rate, aadhar_no, pan_number, uan_no')
      .single();
    if (error) throw new Error(error.message);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees: Delete ────────────────────────────────────────────────────────
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    const { data: emp } = await supabase.from('users').select('name, email').eq('id', req.params.id).maybeSingle();
    await supabase.from('users').delete().eq('id', req.params.id).eq('organization_id', orgId(req));
    // Log member removed event
    if (emp) {
      Promise.resolve(
        supabase.from('platform_activity').insert({ event_type: 'member_removed', organization_id: orgId(req), description: `Member removed: ${emp.name} (${emp.email})`, metadata: { name: emp.name, email: emp.email, org_id: orgId(req) } })
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
