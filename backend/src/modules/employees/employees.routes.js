const express = require('express');
const router  = express.Router();
const bcrypt   = require('bcryptjs');
const { db, pool } = require('../../config/db');
const { auth, isAdminRole } = require('../../middleware/auth');
const { hasPermission } = require('../../middleware/permissions');
const { orgId, getOrgContext } = require('../../utils/helpers');
const { sendMail, welcomeEmployeeHtml, preOnboardingRequestHtml, credentialsEmailHtml } = require('../../services/emailService');
const crypto = require('crypto');
const { initOnboarding } = require('../onboarding/onboardingService');
const upload     = require('../../middleware/upload');
const cloudinary = require('../../config/cloudinary');

// ─── NEW COLUMNS (biometric / Sanghavi) added to the standard employee fields ──
const EMPLOYEE_PUBLIC_COLS = [
  'id', 'name', 'email', 'role', 'department', 'position', 'avatar_color',
  'date_of_birth', 'created_at', 'phone', 'personal_email', 'joining_date',
  'employment_type', 'work_mode', 'employee_status', 'ctc', 'salary_effective_date',
  // new HRMS columns
  'device_enrollment_id', 'branch_id', 'grade', 'division', 'sub_division',
  'salutation', 'middle_name', 'surname', 'location', 'pay_cadre',
  'weekly_off_day', 'work_hours_per_day',
  // personal profile fields
  'gender', 'blood_group', 'marital_status', 'nationality', 'religion',
  'citizenship', 'height', 'weight',
].join(', ');

// Sensitive statutory fields — admin only (last_credentials_sent_at added via startup migration)
const EMPLOYEE_ADMIN_COLS = EMPLOYEE_PUBLIC_COLS + ', aadhar_no, pan_number, uan_no, pf_applicable, pf_no, esi_applicable, esi_no, ot_applicable, ot_rate, force_password_change, last_credentials_sent_at';

// ─── Employees: List ──────────────────────────────────────────────────────────
// BUG_059 / BUG_068: By default exclude inactive/resigned/terminated employees so
// they do not appear in Calendar, TeamCalendar, Reports, or any other consumer of
// this endpoint.  Pass ?include_inactive=true to retrieve all statuses (used by
// the Employees management page itself so HR can explicitly filter for them).
const INACTIVE_STATUSES = ['inactive', 'resigned', 'terminated'];

router.get('/', auth, hasPermission('employees', 'view'), async (req, res) => {
  try {
    // root_admin sees all non-root users (HR admins + employees); others see only employees
    const roleFilter = req.user.role === 'root_admin' ? ['admin', 'employee'] : ['employee'];
    const cols = isAdminRole(req.user.role) ? EMPLOYEE_ADMIN_COLS : EMPLOYEE_PUBLIC_COLS;
    let query = db.from('users')
      .select(cols)
      .eq('organization_id', orgId(req))
      .in('role', roleFilter)
      .order('name');

    // BUG_059: exclude inactive/resigned/terminated unless the caller explicitly
    // opts in with ?include_inactive=true (only the employee management page does this).
    // adapter's not_in case wraps with (IS NULL OR NOT IN) so NULL-status employees
    // (treated as active) are always included.
    if (req.query.include_inactive !== 'true') {
      query = query.not('employee_status', 'in', INACTIVE_STATUSES);
    }

    const { data: users } = await query;

    // Attach multi-department assignments
    const ids = (users || []).map(u => u.id);
    let deptMap = {};
    if (ids.length > 0) {
      const { data: ud } = await db.from('user_departments')
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
router.post('/', auth, hasPermission('employees', 'create'), async (req, res) => {
  try {
    const { name, email, password, role, department, position, avatar_color, date_of_birth } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, password required' });
    // BUG_154: validate email format before uniqueness check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return res.status(400).json({ error: 'Please enter a valid Company Email address (e.g. name@company.com).' });
    if (role === 'root_admin' && req.user.role !== 'root_admin') {
      return res.status(403).json({ error: 'Only root admins can create root_admin accounts' });
    }

    // Global email uniqueness — no two users across any org may share an email
    const { data: dupEmail } = await db.from('users').select('id').eq('email', email.toLowerCase().trim()).maybeSingle();
    if (dupEmail) return res.status(400).json({ error: 'This email is already registered on the platform. Each user must have a unique email address.' });

    // BUG_051: duplicate employee name within same org
    const { data: dupName } = await db.from('users')
      .select('id').eq('organization_id', orgId(req)).ilike('name', name.trim()).maybeSingle();
    if (dupName) return res.status(400).json({ error: 'An employee with this name already exists in your organisation.' });

    const hashed = bcrypt.hashSync(password, 10);
    const {
      device_enrollment_id, branch_id, grade, division, sub_division,
      salutation, middle_name, surname, location, pay_cadre,
      weekly_off_day, work_hours_per_day, designation_id,
    } = req.body;
    // user INSERT + department assignments must be atomic.
    // A user with no department assignments is a valid partial state we must prevent.
    const department_ids = req.body.department_ids;
    const client = await pool.connect();
    let newUser;
    try {
      await client.query('BEGIN');

      const userRes = await client.query(
        `INSERT INTO users
           (name, email, password, role, department, position, avatar_color,
            date_of_birth, force_password_change, organization_id,
            device_enrollment_id, branch_id, grade, division, sub_division,
            salutation, middle_name, surname, location, pay_cadre,
            weekly_off_day, work_hours_per_day, designation_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         RETURNING id, name, email, role, department, position, avatar_color, date_of_birth`,
        [name, email.toLowerCase(), hashed, role||'employee', department||'General',
         position||'Staff', avatar_color||'#4F46E5', date_of_birth||null, orgId(req),
         device_enrollment_id||null, branch_id||null, grade||null, division||null,
         sub_division||null, salutation||null, middle_name||null, surname||null,
         location||null, pay_cadre||null, weekly_off_day||null, work_hours_per_day||null,
         designation_id ? parseInt(designation_id) : null]
      );
      newUser = userRes.rows[0];

      if (Array.isArray(department_ids) && department_ids.length > 0) {
        for (const dId of department_ids) {
          await client.query(
            `INSERT INTO user_departments (user_id, department_id, role_in_dept, organization_id)
             VALUES ($1,$2,'Member',$3)
             ON CONFLICT (user_id, department_id) DO NOTHING`,
            [newUser.id, parseInt(dId), orgId(req)]
          );
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
      throw err;
    } finally {
      client.release();
    }

    // Fire-and-forget side effects after COMMIT
    getOrgContext(orgId(req)).then(({ orgName, orgEmail }) => {
      sendMail({ to: email, subject: `Welcome to ${orgName || 'the Team'} — Your Account Details`, html: welcomeEmployeeHtml({ name, email, department: department||'General', position: position||'Staff' }, password, orgName, orgEmail) });
    });
    db.from('platform_activity').insert({ event_type: 'member_added', organization_id: orgId(req), description: `Member added: ${name} (${email})`, metadata: { name, email, role: role||'employee', org_id: orgId(req) } }).then(() => {});

    // Auto-initialize onboarding checklist (fire-and-forget)
    if ((role || 'employee') === 'employee') {
      initOnboarding(newUser.id, orgId(req)).catch(() => {});

      // Pre-onboarding document request email — ask the new employee to upload
      // their joining documents before the onboarding checklist begins.
      if (email) {
        const { data: org } = await db.from('organizations')
          .select('name').eq('id', orgId(req)).maybeSingle().catch(() => ({ data: null }));
        const portalUrl = `${process.env.FRONTEND_URL || 'https://hrms.lumoslogic.com'}/portal/documents`;
        sendMail({
          to: email,
          subject: `Action Required — Upload Your Joining Documents`,
          html: preOnboardingRequestHtml({ name, orgName: org?.name || 'Your Organisation', portalUrl }),
        });
      }
    }

    // Assign matching RBAC system role (fire-and-forget; harmless if RBAC tables not yet migrated)
    const rbacSlugMap = { employee: 'employee', admin: 'hr_admin', root_admin: 'root_admin' };
    const rbacSlug = rbacSlugMap[role || 'employee'];
    if (rbacSlug) {
      db.from('roles')
        .select('id')
        .eq('org_id', orgId(req))
        .eq('slug', rbacSlug)
        .maybeSingle()
        .then(({ data: sysRole }) => {
          if (sysRole?.id) {
            return db.from('user_roles').insert({
              user_id:     newUser.id,
              role_id:     sysRole.id,
              org_id:      orgId(req),
              assigned_by: req.user.id,
            });
          }
        })
        .catch(() => {});
    }
    const data = newUser;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees: Update ────────────────────────────────────────────────────────
router.put('/:id', auth, hasPermission('employees', 'edit'), async (req, res) => {
  try {
    const {
      name, email, role, department, position, avatar_color, password, date_of_birth, department_ids,
      phone, personal_email, joining_date, employment_type, work_mode, employee_status, ctc, salary_effective_date,
      // new HRMS columns
      device_enrollment_id, branch_id, grade, division, sub_division,
      salutation, middle_name, surname, location, pay_cadre,
      weekly_off_day, work_hours_per_day, designation_id,
      // personal profile fields
      gender, blood_group, marital_status, nationality, religion,
      citizenship, height, weight,
    } = req.body;
    if (role === 'root_admin' && req.user.role !== 'root_admin') {
      return res.status(403).json({ error: 'Only root admins can assign the root_admin role' });
    }

    // If email is being changed, verify it's not already taken by another user anywhere on the platform
    if (email) {
      const { data: dupEmail } = await db.from('users')
        .select('id').eq('email', email.toLowerCase().trim()).neq('id', parseInt(req.params.id)).maybeSingle();
      if (dupEmail) return res.status(400).json({ error: 'This email is already registered on the platform. Each user must have a unique email address.' });
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
      designation_id:       designation_id ? parseInt(designation_id) : null,
      // personal profile fields
      gender:               gender               || null,
      blood_group:          blood_group          || null,
      marital_status:       marital_status       || null,
      nationality:          nationality          || null,
      religion:             religion             || null,
      citizenship:          citizenship          || null,
      height:               height               || null,
      weight:               weight               || null,
    };
    if (password) update.password = bcrypt.hashSync(password, 10);
    // Use a transaction when department_ids are provided — DELETE then INSERT must be atomic.
    // Without it, a crash between DELETE and INSERT leaves the employee with no departments.
    const empId = parseInt(req.params.id);
    let data;

    if (Array.isArray(department_ids)) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // M-12: keep users.department text in sync with the primary department name.
        // The text column is the legacy denormalized field consumed by leave emails and reports.
        if (department_ids.length > 0) {
          const dRes = await client.query(
            'SELECT name FROM departments WHERE id = $1 AND organization_id = $2',
            [department_ids[0], orgId(req)]
          );
          if (dRes.rows[0]?.name) update.department = dRes.rows[0].name;
        } else {
          update.department = '';
        }

        // Update user fields
        const setClauses = Object.entries(update)
          .filter(([, v]) => v !== undefined)
          .map(([k], i) => `"${k}" = $${i + 3}`)
          .join(', ');
        const vals = Object.entries(update).filter(([, v]) => v !== undefined).map(([, v]) => v);
        const userRes = await client.query(
          `UPDATE users SET ${setClauses} WHERE id = $1 AND organization_id = $2 RETURNING *`,
          [empId, orgId(req), ...vals]
        );
        data = userRes.rows[0];

        // Guard: if the UPDATE matched no rows the empId belongs to another org — abort now.
        // Without this check the DELETE below would execute on a cross-tenant user and commit.
        if (!userRes.rows[0]) throw new Error('Employee not found in this organisation');

        // Replace department assignments atomically (org-scoped to prevent cross-tenant wipe)
        await client.query(`DELETE FROM user_departments WHERE user_id = $1 AND organization_id = $2`, [empId, orgId(req)]);
        for (const dId of department_ids) {
          await client.query(
            `INSERT INTO user_departments (user_id, department_id, role_in_dept, organization_id)
             VALUES ($1,$2,'Member',$3)
             ON CONFLICT (user_id, department_id) DO NOTHING`,
            [empId, dId, orgId(req)]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      // No department change — plain user update
      const cols = isAdminRole(req.user.role) ? EMPLOYEE_ADMIN_COLS : EMPLOYEE_PUBLIC_COLS;
      const { data: updated, error } = await db.from('users').update(update)
        .eq('id', empId).eq('organization_id', orgId(req))
        .select(cols).single();
      if (error) throw new Error(error.message);
      data = updated;
    }

    // Auto-sync device_enrollment_id → biometric_employee_map
    // Runs after user update succeeds so the mapping is always consistent with the stored PIN.
    if (device_enrollment_id !== undefined) {
      const cleanPin = device_enrollment_id ? String(device_enrollment_id).trim() : null;
      try {
        if (cleanPin) {
          // Upsert: reassign PIN to this user if it was previously mapped to someone else
          await pool.query(
            `INSERT INTO biometric_employee_map (org_id, employee_pin, user_id)
             VALUES ($1, $2, $3)
             ON CONFLICT (org_id, employee_pin) DO UPDATE SET user_id = EXCLUDED.user_id`,
            [orgId(req), cleanPin, empId]
          );
          // Remove any old mappings this user had under a different PIN
          await pool.query(
            `DELETE FROM biometric_employee_map
             WHERE org_id = $1 AND user_id = $2 AND employee_pin != $3`,
            [orgId(req), empId, cleanPin]
          );
        } else {
          // PIN cleared — remove all mappings for this user
          await pool.query(
            `DELETE FROM biometric_employee_map WHERE org_id = $1 AND user_id = $2`,
            [orgId(req), empId]
          );
        }
      } catch (mapErr) {
        console.error('[employees] biometric_employee_map sync error:', mapErr.message);
      }
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Employees: Update Statutory Fields ──────────────────────────────────────
// PUT /api/employees/:id/statutory — admin only, accepts PF/ESI/OT statutory fields
router.put('/:id/statutory', auth, hasPermission('employees', 'edit'), async (req, res) => {
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

    const { data, error } = await db.from('users')
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
router.delete('/:id', auth, hasPermission('employees', 'delete'), async (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    // Org-scoped pre-fetch prevents reading PII from another org's employee for the audit log
    const { data: emp } = await db.from('users').select('name, email').eq('id', req.params.id).eq('organization_id', orgId(req)).maybeSingle();
    await db.from('users').delete().eq('id', req.params.id).eq('organization_id', orgId(req));
    // Log member removed event
    if (emp) {
      Promise.resolve(
        db.from('platform_activity').insert({ event_type: 'member_removed', organization_id: orgId(req), description: `Member removed: ${emp.name} (${emp.email})`, metadata: { name: emp.name, email: emp.email, org_id: orgId(req) } })
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /employees/:id/avatar — admin uploads profile photo for any employee ─
router.post('/:id/avatar', auth, isAdminRole, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `hrms/${orgId(req)}/avatars`,
          resource_type: 'image',
          transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
        },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });
    const { error } = await db.from('users')
      .update({ avatar_url: result.secure_url })
      .eq('id', req.params.id)
      .eq('organization_id', orgId(req));
    if (error) throw new Error(error.message);
    res.json({ avatar_url: result.secure_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /employees/me/avatar — employee uploads their own profile photo ──────
router.post('/me/avatar', auth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        {
          folder: `hrms/${orgId(req)}/avatars`,
          resource_type: 'image',
          transformation: [{ width: 200, height: 200, crop: 'fill', gravity: 'face' }],
        },
        (err, r) => err ? reject(err) : resolve(r)
      ).end(req.file.buffer);
    });
    const { error } = await db.from('users')
      .update({ avatar_url: result.secure_url })
      .eq('id', req.user.id);
    if (error) throw new Error(error.message);
    res.json({ avatar_url: result.secure_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Send Login Credentials ───────────────────────────────────────────────────
// Generates a secure temp password, stores it hashed, forces password change,
// emails the employee, and logs the action. Safe to call multiple times.
router.post('/:id/send-credentials', auth, async (req, res) => {
  try {
    if (!isAdminRole(req.user.role)) return res.status(403).json({ error: 'Admin access required' });
    const oId   = orgId(req);
    const empId = parseInt(req.params.id, 10);

    // Ensure last_credentials_sent_at column exists (idempotent)
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_credentials_sent_at TIMESTAMPTZ`).catch(() => {});

    // Fetch employee — must belong to this org
    const { data: emp } = await db.from('users')
      .select('id, name, email, department, position, role, status')
      .eq('id', empId)
      .eq('organization_id', oId)
      .maybeSingle();

    if (!emp)        return res.status(404).json({ error: 'Employee not found in your organization' });
    if (!emp.email)  return res.status(400).json({ error: 'Employee has no email address on record' });
    if (emp.status === 'inactive') return res.status(400).json({ error: 'Cannot send credentials to a deactivated account' });

    // Generate a secure 12-char temp password (letters + digits + symbols, avoidng ambiguous chars)
    const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&';
    const tempPassword = Array.from(crypto.randomBytes(12))
      .map(b => CHARSET[b % CHARSET.length]).join('');

    const hashed    = bcrypt.hashSync(tempPassword, 10);
    const sentAt    = new Date().toISOString();

    // Update password + force change flag + timestamp (atomic)
    await db.from('users').update({
      password:                 hashed,
      force_password_change:    true,
      last_credentials_sent_at: sentAt,
    }).eq('id', empId).eq('organization_id', oId);

    // Audit log (fire-and-forget)
    db.from('platform_activity').insert({
      event_type:      'credentials_sent',
      organization_id: oId,
      description:     `Login credentials sent to ${emp.name} (${emp.email}) by ${req.user.name}`,
      metadata:        { employee_id: empId, sent_by: req.user.id, sent_by_name: req.user.name, sent_at: sentAt },
    }).then(() => {}).catch(() => {});

    // Fetch org context for email
    const { orgName, orgEmail } = await getOrgContext(oId);
    const portalUrl = process.env.FRONTEND_URL || 'https://hrms.lumoslogic.com';

    sendMail({
      to:      emp.email,
      subject: `Your ${orgName || 'HRMS'} Login Credentials`,
      html:    credentialsEmailHtml({ employee: emp, tempPassword, orgName, orgEmail, portalUrl }),
    }).catch(() => {});

    res.json({
      success:                  true,
      message:                  `Login credentials sent to ${emp.email}`,
      last_credentials_sent_at: sentAt,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
