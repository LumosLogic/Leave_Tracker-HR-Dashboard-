const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const { supabase } = require('../../config/db');
const { auth, adminOnly, isAdminRole } = require('../../middleware/auth');
const { orgId } = require('../../utils/helpers');
const { sendMail, welcomeEmployeeHtml } = require('../../services/emailService');

// ─── Employees: List ──────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    // root_admin sees all non-root users (HR admins + employees); others see only employees
    const roleFilter = req.user.role === 'root_admin' ? ['admin', 'employee'] : ['employee'];
    const { data: users } = await supabase.from('users')
      .select('id, name, email, role, department, position, avatar_color, date_of_birth, created_at, phone, personal_email, joining_date, employment_type, work_mode, employee_status, ctc, salary_effective_date, clockify_user_id')
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
    const { data, error } = await supabase.from('users')
      .insert({ name, email: email.toLowerCase(), password: hashed, role: role||'employee', department: department||'General', position: position||'Staff', avatar_color: avatar_color||'#4F46E5', date_of_birth: date_of_birth||null, force_password_change: true, organization_id: orgId(req) })
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
      clockify_user_id,
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
      clockify_user_id:     clockify_user_id?.trim() || null,
    };
    if (password) update.password = bcrypt.hashSync(password, 10);
    const { data, error } = await supabase.from('users').update(update)
      .eq('id', req.params.id).eq('organization_id', orgId(req))
      .select('id, name, email, role, department, position, avatar_color, date_of_birth, phone, personal_email, joining_date, employment_type, work_mode, employee_status, ctc, salary_effective_date, clockify_user_id').single();
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
