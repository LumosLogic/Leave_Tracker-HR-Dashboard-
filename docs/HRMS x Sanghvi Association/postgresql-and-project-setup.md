# PostgreSQL Setup + Project Structure Guide
**Last Updated:** 2026-07-16
**Version to use:** PostgreSQL 17.10 (Windows x86-64)

---

## Why PostgreSQL 17?

| Version | Status | Reason |
|---|---|---|
| 18.4 | Too new | Just released — some hosting providers and tools haven't caught up |
| **17.10** | **Use this** | Current stable LTS — AWS RDS supports it, Hostinger supports it, all npm packages support it |
| 16.14 | Older stable | Fine but no reason to pick older when 17 is available |
| 15.18 | Older | Skip |
| 13–14 | End of life soon | Skip |

---

## Part 1: Local Development Setup (Windows)

### Step 1: Install PostgreSQL 17.10

1. Go to the download page you have open
2. Click the **Windows x86-64** download button next to **17.10**
3. Run the installer as Administrator
4. During installation, fill in:

```
Installation Directory:  C:\Program Files\PostgreSQL\17   (default, keep it)
Components to install:   ✅ PostgreSQL Server
                         ✅ pgAdmin 4          ← the GUI tool you'll use
                         ✅ Stack Builder      (optional, can uncheck)
                         ✅ Command Line Tools
Port:                    5432                 (default, keep it)
Superuser password:      set something strong, e.g. Admin@1234
                         ⚠️ WRITE THIS DOWN — you'll need it
Locale:                  Default
```

5. Finish the installation. It will start PostgreSQL as a Windows service automatically.

---

### Step 2: Verify It Works

Open **PowerShell** and run:

```powershell
# Check if PostgreSQL is running
Get-Service -Name postgresql*

# Should show: Status = Running

# Connect via command line
psql -U postgres -h localhost -p 5432
# Enter the password you set during install
# You should see:  postgres=#
# Type \q to exit
```

If `psql` is not recognized, add it to PATH:
```
C:\Program Files\PostgreSQL\17\bin
```
Add this to System Environment Variables → PATH.

---

### Step 3: Create the Development Database

Open **pgAdmin 4** (installed with PostgreSQL) OR use psql:

**Option A — pgAdmin 4 (GUI, easier):**
1. Open pgAdmin 4 from Start Menu
2. It opens in your browser at `http://127.0.0.1:xxxxx`
3. Enter your superuser password
4. Right-click `Databases` → `Create` → `Database`
5. Name: `lumos_hrms` → Save
6. Open Query Tool on `lumos_hrms` and run the SQL below

**Option B — psql (terminal):**
```bash
psql -U postgres -h localhost
```

Then paste this:
```sql
-- Create the database
CREATE DATABASE lumos_hrms;

-- Create a dedicated user (don't use postgres superuser in your app)
CREATE USER lumos_admin WITH PASSWORD 'LumosAdmin@2026';

-- Give it full access
GRANT ALL PRIVILEGES ON DATABASE lumos_hrms TO lumos_admin;

-- Connect to the new database
\c lumos_hrms

-- Give schema permissions (required in PostgreSQL 15+)
GRANT ALL ON SCHEMA public TO lumos_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO lumos_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO lumos_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO lumos_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO lumos_admin;

-- Verify it works
\l      ← lists all databases (you should see lumos_hrms)
\q      ← exit
```

---

### Step 4: Your .env File (Local Dev)

In `backend/.env`:
```env
# Database
DATABASE_URL=postgresql://lumos_admin:LumosAdmin@2026@localhost:5432/lumos_hrms
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lumos_hrms
DB_USER=lumos_admin
DB_PASSWORD=LumosAdmin@2026

# App
NODE_ENV=development
PORT=3000
JWT_SECRET=your_jwt_secret_here_make_it_long_and_random

# Cloudinary (keep existing values)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

---

### Step 5: Node.js Connection (The Code)

Install the PostgreSQL npm package:
```bash
cd backend
npm install pg
npm install dotenv
```

`backend/src/config/db.js`:
```js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // In production (Hostinger/AWS): SSL is required
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
  // Connection pool settings
  max: 20,              // max 20 connections in pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.connect((err, client, release) => {
  if (err) {
    console.error('PostgreSQL connection failed:', err.message);
    process.exit(1);
  }
  console.log('PostgreSQL connected successfully');
  release();
});

module.exports = pool;
```

Test the connection:
```js
// Quick test script: backend/test-db.js
require('dotenv').config();
const pool = require('./src/config/db');

async function test() {
  const result = await pool.query('SELECT NOW() as current_time');
  console.log('DB time:', result.rows[0].current_time);
  process.exit(0);
}

test().catch(console.error);
```

```bash
node test-db.js
# Should print: DB time: 2026-07-16T...
```

---

### Step 6: Query Pattern (Replacing Supabase)

```js
const pool = require('../config/db');

// OLD (Supabase):
const { data, error } = await supabase
  .from('users')
  .select('*')
  .eq('organization_id', orgId)
  .eq('employment_status', 'active');

// NEW (pg):
const result = await pool.query(
  `SELECT * FROM users
   WHERE organization_id = $1
   AND employment_status = $2`,
  [orgId, 'active']
);
const data = result.rows;
```

```js
// OLD (Supabase insert):
const { data, error } = await supabase
  .from('attendance')
  .insert({ user_id: userId, date: today, check_in: time });

// NEW (pg):
const result = await pool.query(
  `INSERT INTO attendance (user_id, date, check_in, organization_id)
   VALUES ($1, $2, $3, $4)
   RETURNING *`,
  [userId, today, time, orgId]
);
const data = result.rows[0];
```

```js
// OLD (Supabase upsert):
await supabase.from('attendance').upsert(row, { onConflict: 'user_id,date,organization_id' });

// NEW (pg):
await pool.query(
  `INSERT INTO attendance (user_id, date, organization_id, check_in, source)
   VALUES ($1, $2, $3, $4, $5)
   ON CONFLICT (user_id, date, organization_id)
   DO UPDATE SET check_in = EXCLUDED.check_in, source = EXCLUDED.source`,
  [userId, date, orgId, checkIn, 'biometric']
);
```

---

## Part 2: Hostinger VPS Setup (When Ready to Deploy)

### Step 1: Get a Hostinger VPS

**Minimum plan for this project: KVM2**
- 4 vCPU, 8 GB RAM, 100 GB NVMe SSD
- Ubuntu 22.04 LTS (choose this OS)
- Why KVM2 minimum: biometric devices push concurrent punches, PostgreSQL needs RAM for queries

### Step 2: Connect to VPS via SSH

```bash
# From your local machine
ssh root@YOUR_VPS_IP

# Or if they give you a different username
ssh ubuntu@YOUR_VPS_IP
```

### Step 3: Install PostgreSQL 17 on Ubuntu VPS

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Add PostgreSQL official repo (for version 17)
sudo apt install -y curl ca-certificates
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
sudo sh -c 'echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'

# Install PostgreSQL 17
sudo apt update
sudo apt install -y postgresql-17

# Start and enable on boot
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify
sudo systemctl status postgresql
# Should show: Active: active (running)
```

### Step 4: Create DB on VPS

```bash
# Switch to postgres user
sudo -u postgres psql

# Run these:
CREATE DATABASE lumos_hrms;
CREATE USER lumos_admin WITH PASSWORD 'VeryStrongPassword@VPS2026';
GRANT ALL PRIVILEGES ON DATABASE lumos_hrms TO lumos_admin;
\c lumos_hrms
GRANT ALL ON SCHEMA public TO lumos_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO lumos_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO lumos_admin;
\q
```

### Step 5: Security — Keep Port 5432 Local Only

PostgreSQL on VPS must NEVER be exposed to the internet. Your Node.js app runs on the same server, so they talk via localhost.

```bash
# Edit PostgreSQL config
sudo nano /etc/postgresql/17/main/pg_hba.conf

# Make sure this line exists (local connections only):
# host    all    lumos_admin    127.0.0.1/32    scram-sha-256

# NEVER add 0.0.0.0/0 — that exposes your DB to the entire internet

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Step 6: Install Node.js + PM2 on VPS

```bash
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify
node --version   # should show v20.x.x
npm --version

# Install PM2 (process manager — keeps Node running after crashes, reboots)
sudo npm install -g pm2
```

### Step 7: Install Nginx (Reverse Proxy)

```bash
sudo apt install -y nginx

# Create config for your app
sudo nano /etc/nginx/sites-available/lumos-hrms
```

Nginx config:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Frontend (React build)
    location / {
        root /var/www/lumos-hrms/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # ZKTeco ADMS endpoints (no /api prefix — device firmware hardcodes this path)
    location /iclock {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 10s;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/lumos-hrms /etc/nginx/sites-enabled/
sudo nginx -t        # test config
sudo systemctl restart nginx

# Add SSL (free via Let's Encrypt)
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### Step 8: Deploy Your App on VPS

```bash
# Clone your repo on VPS
cd /var/www
git clone https://github.com/your-username/your-repo.git lumos-hrms
cd lumos-hrms/backend

# Install dependencies
npm install

# Create .env on VPS
nano .env
# Add all production env vars (DATABASE_URL pointing to localhost:5432)

# Run migrations
node src/migrations/run.js   ← we'll build this

# Start with PM2
pm2 start src/server.js --name lumos-hrms-backend
pm2 startup    ← auto-start on reboot
pm2 save

# Build and deploy frontend
cd ../frontend
npm install
npm run build
# Built files go to frontend/dist/ — Nginx serves them
```

---

## Part 3: AWS RDS Migration (Later — Zero Code Changes)

When you're ready to move from Hostinger to AWS:

```bash
# 1. Dump from Hostinger VPS
pg_dump "postgresql://lumos_admin:password@localhost:5432/lumos_hrms" \
  --no-owner --no-acl -f lumos_hrms_backup.sql

# 2. Create RDS PostgreSQL 17 instance in AWS Console
#    - Engine: PostgreSQL 17
#    - Instance: db.t3.medium
#    - Storage: 50 GB GP3
#    - DB name: lumos_hrms
#    - Master username: lumos_admin

# 3. Restore to RDS
psql "postgresql://lumos_admin:password@your-rds-endpoint.rds.amazonaws.com:5432/lumos_hrms" \
  < lumos_hrms_backup.sql

# 4. Update ONE env var on your backend
DATABASE_URL=postgresql://lumos_admin:password@your-rds-endpoint.rds.amazonaws.com:5432/lumos_hrms

# 5. Restart backend
pm2 restart lumos-hrms-backend

# That's it. Zero code changes.
```

---

## Part 4: Project Folder Structure

### Current State (Problem)

```
Leave_Tracker-HR-Dashboard-/
├── server.js          ← 3,500+ lines, everything mixed together
├── db.js              ← Supabase client
├── client/            ← React frontend
├── platform-admin/    ← Platform admin React app
├── routes/            ← 16 route files, flat list
└── migrations/        ← SQL files
```

### Target Structure (Production HRMS)

```
Leave_Tracker-HR-Dashboard-/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js               ← PostgreSQL pool (pg package)
│   │   │   └── cloudinary.js       ← Cloudinary setup
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.js             ← JWT verify (extracted from server.js)
│   │   │   ├── featureFlag.js      ← org feature flag check
│   │   │   ├── roleCheck.js        ← admin / employee guard
│   │   │   └── upload.js           ← multer setup
│   │   │
│   │   ├── modules/                ← self-contained feature modules
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.controller.js
│   │   │   │   └── auth.service.js
│   │   │   │
│   │   │   ├── employees/
│   │   │   │   ├── employees.routes.js
│   │   │   │   ├── employees.controller.js
│   │   │   │   └── employees.service.js
│   │   │   │
│   │   │   ├── attendance/
│   │   │   │   ├── attendance.routes.js
│   │   │   │   ├── attendance.controller.js
│   │   │   │   └── attendance.service.js
│   │   │   │
│   │   │   ├── leaves/
│   │   │   ├── payroll/
│   │   │   ├── departments/
│   │   │   ├── designations/
│   │   │   ├── shifts/
│   │   │   ├── reports/
│   │   │   ├── documents/
│   │   │   ├── assets/
│   │   │   ├── expenses/
│   │   │   ├── announcements/
│   │   │   ├── notifications/
│   │   │   ├── performance/
│   │   │   ├── onboarding/
│   │   │   ├── exit/
│   │   │   ├── regularization/
│   │   │   ├── holidays/
│   │   │   ├── leave-policies/
│   │   │   │
│   │   │   ├── biometric/          ← NEW — ZKTeco integration
│   │   │   │   ├── biometric.routes.js
│   │   │   │   ├── biometric.controller.js
│   │   │   │   ├── biometric.service.js
│   │   │   │   └── adms.handler.js   ← the /iclock/cdata receiver
│   │   │   │
│   │   │   ├── branches/           ← NEW
│   │   │   │   ├── branches.routes.js
│   │   │   │   ├── branches.controller.js
│   │   │   │   └── branches.service.js
│   │   │   │
│   │   │   └── platform/           ← platform admin
│   │   │       ├── platform.routes.js
│   │   │       ├── platform.controller.js
│   │   │       └── platform.service.js
│   │   │
│   │   └── server.js               ← thin: middleware + mount all routers
│   │
│   ├── migrations/
│   │   ├── runner.js               ← runs migration files in order
│   │   ├── 001_initial_schema.sql  ← existing schema
│   │   ├── 002_hrms_modules.sql    ← payroll, docs, assets, etc.
│   │   ├── 003_biometric.sql       ← biometric tables + attendance columns
│   │   └── 004_extended_profile.sql ← branches + employee extended fields
│   │
│   ├── package.json
│   ├── .env                        ← never commit this
│   ├── .env.example                ← commit this (no real values)
│   └── .gitignore
│
├── frontend/                       ← renamed from client/
│   ├── src/
│   │   ├── components/             ← reusable UI components
│   │   │   ├── ui/                 ← shadcn/radix base components
│   │   │   ├── layout/             ← Sidebar, Navbar, Layout wrapper
│   │   │   └── shared/             ← Tables, Modals, Forms used across pages
│   │   │
│   │   ├── pages/                  ← one file per route/page
│   │   │   ├── admin/              ← HR admin pages
│   │   │   ├── employee/           ← employee portal pages
│   │   │   └── public/             ← Login, Register, Landing
│   │   │
│   │   ├── hooks/                  ← custom React hooks
│   │   │   ├── useAuth.js
│   │   │   ├── useAttendance.js
│   │   │   └── ...
│   │   │
│   │   ├── services/               ← all API calls in one place
│   │   │   ├── api.js              ← base axios instance (token + base URL)
│   │   │   ├── auth.service.js
│   │   │   ├── employees.service.js
│   │   │   ├── attendance.service.js
│   │   │   └── ...
│   │   │
│   │   ├── context/                ← React context providers
│   │   │   ├── AuthContext.jsx
│   │   │   └── OrgContext.jsx
│   │   │
│   │   └── utils/                  ← formatters, date helpers, constants
│   │
│   ├── package.json
│   └── vite.config.js
│
├── platform-admin/                 ← stays as separate React app
│   └── ...
│
├── docker-compose.yml              ← local dev: one command spins everything up
├── .gitignore                      ← root level
└── README.md
```

---

## Part 5: The Controller → Service Pattern (Why It Matters)

Every module follows this 3-layer structure:

```
routes.js          → Maps URL to controller function
controller.js      → Handles HTTP: reads req, calls service, sends res
service.js         → Business logic + DB queries
```

### Example: employees module

```js
// employees.routes.js
const router = require('express').Router();
const { verifyToken } = require('../../middleware/auth');
const { requireAdmin } = require('../../middleware/roleCheck');
const ctrl = require('./employees.controller');

router.get('/',     verifyToken, ctrl.getAll);
router.get('/:id',  verifyToken, ctrl.getOne);
router.post('/',    verifyToken, requireAdmin, ctrl.create);
router.put('/:id',  verifyToken, requireAdmin, ctrl.update);
router.delete('/:id', verifyToken, requireAdmin, ctrl.remove);

module.exports = router;
```

```js
// employees.controller.js
const service = require('./employees.service');

exports.getAll = async (req, res) => {
  try {
    const employees = await service.getAll(req.user.organization_id, req.query);
    res.json({ success: true, data: employees });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const employee = await service.getById(req.params.id, req.user.organization_id);
    if (!employee) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: employee });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
```

```js
// employees.service.js
const pool = require('../../config/db');

exports.getAll = async (orgId, filters = {}) => {
  const { branch_id, department_id, status, search } = filters;
  const params = [orgId];
  let where = 'WHERE u.organization_id = $1';

  if (status) {
    params.push(status);
    where += ` AND u.employment_status = $${params.length}`;
  }
  if (branch_id) {
    params.push(branch_id);
    where += ` AND u.branch_id = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    where += ` AND u.name ILIKE $${params.length}`;
  }

  const result = await pool.query(
    `SELECT u.*, b.name as branch_name, d.name as department_name
     FROM users u
     LEFT JOIN branches b ON u.branch_id = b.id
     LEFT JOIN departments d ON d.id = (
       SELECT department_id FROM user_departments
       WHERE user_id = u.id LIMIT 1
     )
     ${where}
     ORDER BY u.name ASC`,
    params
  );

  return result.rows;
};

exports.getById = async (id, orgId) => {
  const result = await pool.query(
    `SELECT * FROM users WHERE id = $1 AND organization_id = $2`,
    [id, orgId]
  );
  return result.rows[0];
};
```

### The thin `server.js`

```js
// server.js — should be under 80 lines
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

// Middleware
app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));  // ← REQUIRED for ZKTeco ADMS

// ADMS endpoints — NO JWT auth (ZKTeco devices cannot send tokens)
app.use('/iclock', require('./modules/biometric/adms.handler'));

// All API routes — JWT protected inside each router
app.use('/api/auth',           require('./modules/auth/auth.routes'));
app.use('/api/employees',      require('./modules/employees/employees.routes'));
app.use('/api/attendance',     require('./modules/attendance/attendance.routes'));
app.use('/api/leaves',         require('./modules/leaves/leaves.routes'));
app.use('/api/departments',    require('./modules/departments/departments.routes'));
app.use('/api/branches',       require('./modules/branches/branches.routes'));
app.use('/api/biometric',      require('./modules/biometric/biometric.routes'));
app.use('/api/payroll',        require('./modules/payroll/payroll.routes'));
app.use('/api/shifts',         require('./modules/shifts/shifts.routes'));
app.use('/api/reports',        require('./modules/reports/reports.routes'));
app.use('/api/documents',      require('./modules/documents/documents.routes'));
app.use('/api/assets',         require('./modules/assets/assets.routes'));
app.use('/api/expenses',       require('./modules/expenses/expenses.routes'));
app.use('/api/announcements',  require('./modules/announcements/announcements.routes'));
app.use('/api/notifications',  require('./modules/notifications/notifications.routes'));
app.use('/api/performance',    require('./modules/performance/performance.routes'));
app.use('/api/onboarding',     require('./modules/onboarding/onboarding.routes'));
app.use('/api/exit',           require('./modules/exit/exit.routes'));
app.use('/api/regularization', require('./modules/regularization/regularization.routes'));
app.use('/api/leave-policies', require('./modules/leave-policies/leavePolicies.routes'));
app.use('/api/holidays',       require('./modules/holidays/holidays.routes'));
app.use('/api/platform',       require('./modules/platform/platform.routes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

---

## Part 6: Docker Compose — One Command Local Dev

`docker-compose.yml` at root:
```yaml
version: '3.8'

services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: lumos_hrms
      POSTGRES_USER: lumos_admin
      POSTGRES_PASSWORD: LumosAdmin@2026
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://lumos_admin:LumosAdmin@2026@db:5432/lumos_hrms
      NODE_ENV: development
    depends_on:
      - db
    volumes:
      - ./backend:/app
      - /app/node_modules

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules

volumes:
  postgres_data:
```

```bash
# Start everything with one command
docker-compose up

# First time: also run migrations
docker-compose exec backend node migrations/runner.js
```

---

## Quick Reference: Connection Strings

| Environment | DATABASE_URL |
|---|---|
| Local (after install) | `postgresql://lumos_admin:LumosAdmin@2026@localhost:5432/lumos_hrms` |
| Docker local | `postgresql://lumos_admin:LumosAdmin@2026@db:5432/lumos_hrms` |
| Hostinger VPS | `postgresql://lumos_admin:STRONG_PASS@localhost:5432/lumos_hrms` |
| AWS RDS | `postgresql://lumos_admin:STRONG_PASS@xxxxx.ap-south-1.rds.amazonaws.com:5432/lumos_hrms` |

**The only thing that changes between environments is this one env var. Zero code changes.**

---

## Step-by-Step: What To Do Right Now

```
1. Download PostgreSQL 17.10 (Windows x86-64) — from the page you have open
2. Run installer, set password, install pgAdmin 4
3. Open psql or pgAdmin → run the CREATE DATABASE / CREATE USER SQL above
4. Confirm connection works: psql -U lumos_admin -h localhost -d lumos_hrms
5. Tell me when done → we start restructuring the project folders
```
