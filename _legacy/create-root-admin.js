require('dotenv').config();
const bcrypt   = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const email    = 'root@company.com';
  const password = 'root@123';

  // Check if already exists
  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) {
    console.log('✓ Root admin already exists:', email);
    process.exit(0);
  }

  const { data, error } = await supabase.from('users').insert({
    name:         'Root Admin',
    email:        email,
    password:     bcrypt.hashSync(password, 10),
    role:         'root_admin',
    department:   'Management',
    position:     'Chief Executive Officer',
    avatar_color: '#1E40AF',
  }).select('id, name, email, role').single();

  if (error) { console.error('❌ Error:', error.message); process.exit(1); }

  console.log('✅ Root admin created!');
  console.log('   Email:    ', email);
  console.log('   Password: ', password);
  console.log('   Role:     ', data.role);
}

run();
