/**
 * migrate-from-supabase.js
 * Migrates LumosLogic employee + leave data from Supabase → new PostgreSQL.
 *
 * Run on VPS inside Docker:
 *   docker exec lumos_app node backend/scripts/migrate-from-supabase.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { createClient } = require('@supabase/supabase-js');
const { Pool }         = require('pg');

// ── Supabase (source) ──────────────────────────────────────────────────────────
const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPA_URL || !SUPA_KEY) {
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}
const supa = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── PostgreSQL (destination) ───────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'postgres',
  port:     parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME     || 'lumos_hrms',
  user:     process.env.DB_USER     || 'lumos_admin',
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 30000,
});

const OLD_ORG_ID = 1; // LumosLogic org_id in Supabase

async function run() {
  const client = await pool.connect();
  console.log('\n🚀 Starting Supabase → PostgreSQL migration...\n');

  try {

    // ── STEP 1: Create LumosLogic org in new DB ───────────────────────────────
    console.log('📦 Step 1: Creating LumosLogic organization...');

    const { rows: existingOrg } = await client.query(
      `SELECT id FROM organizations WHERE slug = 'lumoslogic'`
    );

    let newOrgId;
    if (existingOrg.length > 0) {
      newOrgId = existingOrg[0].id;
      console.log(`   ⏭  LumosLogic already exists (org_id=${newOrgId})`);
    } else {
      // Fetch org details from Supabase
      const { data: orgData } = await supa.from('organizations')
        .select('name, slug, domain, logo_url, total_annual_leaves, plan')
        .eq('id', OLD_ORG_ID).maybeSingle();

      const { rows: [org] } = await client.query(
        `INSERT INTO organizations (name, slug, domain, logo_url, total_annual_leaves, plan, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW()) RETURNING id`,
        [
          orgData?.name || 'LumosLogic',
          orgData?.slug || 'lumoslogic',
          orgData?.domain || null,
          orgData?.logo_url || null,
          orgData?.total_annual_leaves || 18,
          orgData?.plan || 'platinum',
        ]
      );
      newOrgId = org.id;
      console.log(`   ✅ LumosLogic created (org_id=${newOrgId})`);

      // Enable all feature flags for LumosLogic
      const features = ['announcements','regularization','leave_policies','shifts','onboarding',
        'exit_management','payroll','expenses','assets','reports','performance','documents',
        'google_calendar','push_notifications','biometric','branches','statutory'];
      for (const key of features) {
        await client.query(
          `INSERT INTO organization_features (organization_id, feature_key, enabled)
           VALUES ($1, $2, true) ON CONFLICT (organization_id, feature_key) DO NOTHING`,
          [newOrgId, key]
        );
      }

      // Create default work schedule
      const { data: ws } = await supa.from('work_schedule')
        .select('*').eq('organization_id', OLD_ORG_ID).limit(1).maybeSingle();
      await client.query(
        `INSERT INTO work_schedule (organization_id, start_time, end_time, late_threshold, early_exit_threshold, half_day_hours, work_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
        [newOrgId,
          ws?.start_time || '09:00', ws?.end_time || '18:00',
          ws?.late_threshold || '09:30', ws?.early_exit_threshold || '17:00',
          ws?.half_day_hours || 4.5, ws?.work_days || '1,2,3,4,5']
      );
    }

    // ── STEP 2: Migrate Users (Employees) ────────────────────────────────────
    console.log('\n👥 Step 2: Migrating employees...');

    const { data: supaUsers, error: usersErr } = await supa.from('users')
      .select(`
        id, name, email, password, role,
        department, position, avatar_color,
        date_of_birth, phone, date_of_joining,
        employee_id, status, gender,
        emergency_contact_name, emergency_contact_phone,
        address, city, state, pincode,
        pan_number, aadhaar_number, uf_number,
        bank_name, bank_account_number, bank_ifsc,
        force_password_change
      `)
      .eq('organization_id', OLD_ORG_ID);

    if (usersErr) throw new Error('Supabase users fetch error: ' + usersErr.message);
    console.log(`   Found ${supaUsers.length} users in Supabase`);

    // Map old user_id → new user_id
    const userIdMap = {};

    for (const u of supaUsers) {
      // Check if already migrated (by email + org)
      const { rows: exists } = await client.query(
        `SELECT id FROM users WHERE email = $1 AND organization_id = $2`,
        [u.email, newOrgId]
      );

      if (exists.length > 0) {
        userIdMap[u.id] = exists[0].id;
        console.log(`   ⏭  ${u.email} already exists → id=${exists[0].id}`);
        continue;
      }

      const { rows: [newUser] } = await client.query(
        `INSERT INTO users (
          name, email, password, role, organization_id,
          department, position, avatar_color,
          date_of_birth, phone, date_of_joining,
          employee_id, status, gender,
          emergency_contact_name, emergency_contact_phone,
          address, city, state, pincode,
          pan_number, aadhaar_number, uf_number,
          bank_name, bank_account_number, bank_ifsc,
          force_password_change, created_at
        ) VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,
          $9,$10,$11,
          $12,$13,$14,
          $15,$16,
          $17,$18,$19,$20,
          $21,$22,$23,
          $24,$25,$26,
          $27, NOW()
        ) RETURNING id`,
        [
          u.name, u.email, u.password, u.role || 'employee', newOrgId,
          u.department || null, u.position || null, u.avatar_color || '#3525cd',
          u.date_of_birth || null, u.phone || null, u.date_of_joining || null,
          u.employee_id || null, u.status || 'active', u.gender || null,
          u.emergency_contact_name || null, u.emergency_contact_phone || null,
          u.address || null, u.city || null, u.state || null, u.pincode || null,
          u.pan_number || null, u.aadhaar_number || null, u.uf_number || null,
          u.bank_name || null, u.bank_account_number || null, u.bank_ifsc || null,
          u.force_password_change || false,
        ]
      );

      userIdMap[u.id] = newUser.id;
      console.log(`   ✅ ${u.email} (${u.role}) → new id=${newUser.id}`);
    }

    console.log(`   ✅ ${Object.keys(userIdMap).length} users migrated`);

    // ── STEP 3: Migrate Leaves ────────────────────────────────────────────────
    console.log('\n📋 Step 3: Migrating leaves...');

    const { data: supaLeaves, error: leavesErr } = await supa.from('leaves')
      .select('*')
      .eq('organization_id', OLD_ORG_ID)
      .order('created_at', { ascending: true });

    if (leavesErr) throw new Error('Supabase leaves fetch error: ' + leavesErr.message);
    console.log(`   Found ${supaLeaves.length} leave records in Supabase`);

    let leavesInserted = 0, leavesSkipped = 0;

    for (const l of supaLeaves) {
      const newUserId = userIdMap[l.user_id];
      if (!newUserId) { leavesSkipped++; continue; } // user not migrated

      const newApprovedBy = l.approved_by ? (userIdMap[l.approved_by] || null) : null;

      try {
        await client.query(
          `INSERT INTO leaves (
            user_id, organization_id, start_date, end_date,
            leave_type, leave_time, half_type,
            reason, status,
            approved_by, approved_at,
            created_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            newUserId, newOrgId,
            l.start_date, l.end_date,
            l.leave_type || 'casual',
            l.leave_time || 'full',
            l.half_type || null,
            l.reason || '',
            l.status || 'pending',
            newApprovedBy,
            l.approved_at || null,
            l.created_at || new Date().toISOString(),
          ]
        );
        leavesInserted++;
      } catch (e) {
        // Skip duplicates silently
        leavesSkipped++;
      }
    }

    console.log(`   ✅ ${leavesInserted} leaves inserted, ${leavesSkipped} skipped`);

    // ── STEP 4: Migrate Departments ───────────────────────────────────────────
    console.log('\n🏢 Step 4: Migrating departments...');
    try {
      const { data: depts } = await supa.from('departments')
        .select('name, description').eq('organization_id', OLD_ORG_ID);
      for (const d of depts || []) {
        await client.query(
          `INSERT INTO departments (name, description, organization_id)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [d.name, d.description || null, newOrgId]
        );
      }
      console.log(`   ✅ ${(depts || []).length} departments migrated`);
    } catch (e) { console.log(`   ⚠️  Departments skip: ${e.message}`); }

    // ── STEP 5: Migrate Holidays ──────────────────────────────────────────────
    console.log('\n🎉 Step 5: Migrating holidays...');
    try {
      const { data: holidays } = await supa.from('holidays')
        .select('name, date, type, description').eq('organization_id', OLD_ORG_ID);
      for (const h of holidays || []) {
        await client.query(
          `INSERT INTO holidays (name, date, type, description, organization_id)
           VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
          [h.name, h.date, h.type || 'public', h.description || null, newOrgId]
        );
      }
      console.log(`   ✅ ${(holidays || []).length} holidays migrated`);
    } catch (e) { console.log(`   ⚠️  Holidays skip: ${e.message}`); }

    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n✅ Migration complete!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`  LumosLogic org_id in new DB : ${newOrgId}`);
    console.log(`  Users migrated              : ${Object.keys(userIdMap).length}`);
    console.log(`  Leaves migrated             : ${leavesInserted}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n  Login URL : http://187.127.146.194:3005');
    console.log('  Employees can log in with their existing email + password\n');

  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(() => process.exit(1));
