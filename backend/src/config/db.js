/**
 * db.js — unified database client
 *
 * DB_TYPE=postgres  → pg adapter (local PostgreSQL / Sanghavi)
 * DB_TYPE unset     → Supabase client (default / existing behaviour)
 *
 * Export shape (both paths):
 *   { supabase, seed, pool? }
 *
 * `supabase` always has a `.from(table)` method that returns a chainable
 * query builder returning { data, error }.
 */

if (process.env.DB_TYPE === 'postgres') {
  // ── PostgreSQL path ────────────────────────────────────────────────────────
  const { supabase, pool } = require('./db-pg-adapter');

  async function seed() { /* no-op for postgres — run migrations separately */ }

  module.exports = { supabase, pool, seed };

} else {
  // ── Supabase path (default) ───────────────────────────────────────────────
  const { createClient } = require('@supabase/supabase-js');
  const bcrypt           = require('bcryptjs');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('\n❌ Missing Supabase credentials in .env file');
    console.error('   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required\n');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false }
  });

  // ─── Auto-seed demo data on first run ──────────────────────────────────────
  async function seed() {
    // Seed holidays independently (works even if users already exist)
    try {
      const { count: hCount } = await supabase.from('holidays').select('*', { count: 'exact', head: true });
      if (hCount === 0) {
        await supabase.from('holidays').insert([
          { name: "New Year's Day",   date: '2026-01-01', type: 'public',   description: 'New Year celebration',        organization_id: 1 },
          { name: 'Republic Day',     date: '2026-01-26', type: 'public',   description: 'National holiday',            organization_id: 1 },
          { name: 'Holi',             date: '2026-03-03', type: 'public',   description: 'Festival of colors',          organization_id: 1 },
          { name: 'Good Friday',      date: '2026-04-03', type: 'public',   description: 'Christian holiday',           organization_id: 1 },
          { name: 'Eid ul-Fitr',      date: '2026-04-12', type: 'public',   description: 'Festival of breaking fast',   organization_id: 1 },
          { name: 'Guru Purnima',     date: '2026-07-10', type: 'public',   description: 'Hindu festival',              organization_id: 1 },
          { name: 'Muharram',         date: '2026-07-17', type: 'public',   description: 'Islamic new year',            organization_id: 1 },
          { name: 'Independence Day', date: '2026-08-15', type: 'public',   description: 'National holiday',            organization_id: 1 },
          { name: 'Ganesh Chaturthi', date: '2026-08-30', type: 'public',   description: 'Hindu festival',              organization_id: 1 },
          { name: 'Gandhi Jayanti',   date: '2026-10-02', type: 'public',   description: 'National holiday',            organization_id: 1 },
          { name: 'Diwali',           date: '2026-10-28', type: 'public',   description: 'Festival of lights',          organization_id: 1 },
          { name: 'Christmas Day',    date: '2026-12-25', type: 'public',   description: 'Christmas celebration',       organization_id: 1 },
        ]);
        console.log('✓ Holidays seeded');
      }
    } catch (e) { /* table may not exist yet — run schema.sql first */ }

    // Seed events independently
    try {
      const { count: eCount } = await supabase.from('events').select('*', { count: 'exact', head: true });
      if (eCount === 0) {
        await supabase.from('events').insert([
          { title: 'Annual Appraisal Week', date: '2026-07-01', end_date: '2026-07-05', description: 'Performance review discussions with managers', organization_id: 1 },
          { title: 'Q3 All Hands Meeting',  date: '2026-08-01', description: 'Quarterly company-wide meeting — attendance mandatory', organization_id: 1 },
          { title: 'Company Anniversary',   date: '2026-09-15', description: 'Celebrating excellence!', organization_id: 1 },
        ]);
        console.log('✓ Events seeded');
      }
    } catch (e) { /* table may not exist yet */ }

    const { count } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (count > 0) return;

    console.log('Seeding database with demo data…');

    // Work schedule
    await supabase.from('work_schedule').insert({
      start_time: '09:00', end_time: '18:00',
      late_threshold: '09:30', early_exit_threshold: '17:00',
      half_day_hours: 4.5, work_days: '1,2,3,4,5'
    });

    // Clockify config placeholder
    await supabase.from('clockify_config').insert({ api_key: '', workspace_id: '' });

    // Users
    const avatarColors = ['#4F46E5','#10B981','#F59E0B','#EF4444','#8B5CF6','#F97316'];
    const rawUsers = [
      { name:'Root Admin',     email:'root@company.com',   password:'root@123',    role:'root_admin', department:'Management',     position:'Chief Executive Officer', avatar_color: '#1E40AF' },
      { name:'Admin HR',       email:'admin@company.com',  password:'admin123',    role:'admin',     department:'Human Resources', position:'HR Manager',        avatar_color: avatarColors[0] },
      { name:'Alice Johnson',  email:'alice@company.com',  password:'password123', role:'employee',  department:'Engineering',     position:'Senior Developer',   avatar_color: avatarColors[1] },
      { name:'Bob Martinez',   email:'bob@company.com',    password:'password123', role:'employee',  department:'Engineering',     position:'Frontend Developer', avatar_color: avatarColors[2] },
      { name:'Carol Williams', email:'carol@company.com',  password:'password123', role:'employee',  department:'Design',          position:'UI/UX Designer',     avatar_color: avatarColors[3] },
      { name:'David Chen',     email:'david@company.com',  password:'password123', role:'employee',  department:'Marketing',       position:'Marketing Lead',     avatar_color: avatarColors[4] },
      { name:'Eve Thompson',   email:'eve@company.com',    password:'password123', role:'employee',  department:'Sales',           position:'Sales Executive',    avatar_color: avatarColors[5] },
    ];

    const usersToInsert = rawUsers.map(u => ({
      ...u, password: bcrypt.hashSync(u.password, 10)
    }));

    const { data: insertedUsers } = await supabase.from('users').insert(usersToInsert).select();
    const admin    = insertedUsers.find(u => u.role === 'admin');
    const [alice, bob, carol, david, eve] = insertedUsers.filter(u => u.role === 'employee');

    // Attendance records
    const attendance = [
      { user_id: alice.id, date:'2026-04-01', check_in:'09:05', check_out:'18:30', status:'present',  is_late:false, is_early_exit:false, work_hours:9.42 },
      { user_id: alice.id, date:'2026-04-02', check_in:'09:45', check_out:'18:00', status:'present',  is_late:true,  is_early_exit:false, work_hours:8.25 },
      { user_id: alice.id, date:'2026-04-03', check_in:'09:00', check_out:'13:30', status:'half_day', is_late:false, is_early_exit:true,  work_hours:4.5  },
      { user_id: alice.id, date:'2026-04-06', status:'on_leave' },
      { user_id: alice.id, date:'2026-04-07', status:'on_leave' },
      { user_id: alice.id, date:'2026-04-08', status:'on_leave' },
      { user_id: alice.id, date:'2026-04-09', status:'on_leave' },
      { user_id: alice.id, date:'2026-04-10', check_in:'09:15', check_out:'18:45', status:'present',  is_late:false, is_early_exit:false, work_hours:9.5  },
      { user_id: bob.id,   date:'2026-04-01', check_in:'09:20', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:8.67 },
      { user_id: bob.id,   date:'2026-04-02', status:'absent' },
      { user_id: bob.id,   date:'2026-04-03', check_in:'10:15', check_out:'18:30', status:'present',  is_late:true,  is_early_exit:false, work_hours:8.25 },
      { user_id: bob.id,   date:'2026-04-06', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: bob.id,   date:'2026-04-07', check_in:'09:10', check_out:'18:15', status:'present',  is_late:false, is_early_exit:false, work_hours:9.08 },
      { user_id: bob.id,   date:'2026-04-08', status:'absent' },
      { user_id: bob.id,   date:'2026-04-09', check_in:'09:30', check_out:'16:30', status:'half_day', is_late:false, is_early_exit:true,  work_hours:7.0  },
      { user_id: bob.id,   date:'2026-04-10', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-01', check_in:'09:05', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-02', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-03', check_in:'09:10', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-06', check_in:'08:55', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-07', check_in:'09:20', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-08', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-09', check_in:'09:05', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: carol.id, date:'2026-04-10', check_in:'09:15', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-01', check_in:'09:45', check_out:'18:30', status:'present',  is_late:true,  is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-02', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-03', check_in:'09:55', check_out:'18:30', status:'present',  is_late:true,  is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-06', check_in:'09:35', check_out:'18:30', status:'present',  is_late:true,  is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-07', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-08', check_in:'10:00', check_out:'19:00', status:'present',  is_late:true,  is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-09', check_in:'09:10', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: david.id, date:'2026-04-10', check_in:'09:40', check_out:'18:30', status:'present',  is_late:true,  is_early_exit:false, work_hours:9.0  },
      { user_id: eve.id,   date:'2026-04-01', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: eve.id,   date:'2026-04-02', check_in:'09:05', check_out:'16:00', status:'present',  is_late:false, is_early_exit:true,  work_hours:6.92 },
      { user_id: eve.id,   date:'2026-04-03', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: eve.id,   date:'2026-04-06', check_in:'09:30', check_out:'14:00', status:'half_day', is_late:false, is_early_exit:true,  work_hours:4.5  },
      { user_id: eve.id,   date:'2026-04-07', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: eve.id,   date:'2026-04-08', check_in:'09:10', check_out:'18:30', status:'present',  is_late:false, is_early_exit:false, work_hours:9.33 },
      { user_id: eve.id,   date:'2026-04-09', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
      { user_id: eve.id,   date:'2026-04-10', check_in:'09:00', check_out:'18:00', status:'present',  is_late:false, is_early_exit:false, work_hours:9.0  },
    ];

    await supabase.from('attendance').insert(attendance);

    // Leaves
    await supabase.from('leaves').insert([
      { user_id: alice.id, start_date:'2026-04-06', end_date:'2026-04-09', leave_type:'annual',  reason:'Family vacation',    status:'approved', approved_by: admin.id, approved_at: '2026-04-01T10:00:00Z' },
      { user_id: carol.id, start_date:'2026-04-17', end_date:'2026-04-18', leave_type:'sick',    reason:'Medical appointment', status:'pending'  },
      { user_id: eve.id,   start_date:'2026-04-14', end_date:'2026-04-15', leave_type:'casual',  reason:'Personal work',      status:'rejected', approved_by: admin.id, approved_at: '2026-04-05T14:00:00Z' },
      { user_id: bob.id,   start_date:'2026-04-14', end_date:'2026-04-14', leave_type:'sick',    reason:'Not feeling well',   status:'pending'  },
    ]);

    // Sample birthdays
    await supabase.from('users').update({ date_of_birth: '1995-05-11' }).eq('email', 'alice@company.com');
    await supabase.from('users').update({ date_of_birth: '1993-05-14' }).eq('email', 'bob@company.com');
    await supabase.from('users').update({ date_of_birth: '1997-06-10' }).eq('email', 'carol@company.com');
    await supabase.from('users').update({ date_of_birth: '1990-07-22' }).eq('email', 'david@company.com');
    await supabase.from('users').update({ date_of_birth: '1994-08-05' }).eq('email', 'eve@company.com');

    console.log('✓ Database seeded successfully');
    console.log('  Admin:    admin@company.com / admin123');
    console.log('  Employee: alice@company.com / password123\n');
  }

  module.exports = { supabase, seed };
}
