require('dotenv').config();
const bcrypt   = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  console.log('\n── Current users in database ──────────────────');
  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .order('role');

  if (error) { console.error('DB error:', error.message); return; }

  users.forEach(u => console.log(`  [${u.role}]  ${u.email}  —  ${u.name}`));

  // ── Reset passwords to known values ──────────────────────────────────────
  console.log('\n── Resetting passwords ─────────────────────────');

  const resets = [
    { role: 'root_admin', password: 'root@123'    },
    { role: 'admin',      password: 'admin123'    },
    { role: 'employee',   password: 'password123' },
  ];

  for (const { role, password } of resets) {
    const hash = bcrypt.hashSync(password, 10);
    const { error } = await supabase.from('users').update({ password: hash }).eq('role', role);
    if (error) {
      console.log(`  ❌  ${role}: ${error.message}`);
    } else {
      const count = users.filter(u => u.role === role).length;
      console.log(`  ✓   ${role} (${count} user${count !== 1 ? 's' : ''}) → "${password}"`);
    }
  }

  console.log('\n── Login credentials ───────────────────────────');
  console.log('  Root Admin : root@company.com     /  root@123');
  console.log('  HR Admin   : admin@company.com    /  admin123');
  console.log('  Employee   : alice@company.com    /  password123\n');
}

run();
