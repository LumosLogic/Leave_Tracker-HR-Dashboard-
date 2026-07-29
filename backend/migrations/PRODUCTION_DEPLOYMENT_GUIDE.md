# Production Deployment Guide
## DB Hardening — Lumos Logic HRMS
**Date:** 2026-07-29
**Environment:** Hostinger VPS · Docker · `lumos_postgres` · PostgreSQL 17.10
**Database:** `lumos_hrms` · **User:** `lumos_admin`

---

## Understanding What These Migrations Do

Before touching production, know exactly what is running:

| File | Wrapper | Atomic? | Risk if interrupted |
|---|---|---|---|
| `part1.sql` | `BEGIN` / `COMMIT` | Yes — full rollback on any error | Transaction auto-aborts; DB unchanged |
| `part2_indexes.sql` | None (required for `CONCURRENTLY`) | No — each index is independent | Failed indexes left `INVALID`; rest of DB untouched |

**Part 1** runs everything inside one transaction with `lock_timeout = 3s`. If it cannot acquire a lock within 3 seconds, it fails fast and rolls back — nothing is written.

**Part 2** uses `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction block. Each of the 40+ indexes builds independently. If any fails, it is left in `INVALID` state. The rest of the database is unaffected.

---

## Section 1 — Full Docker Backup Procedure

### 1A. Create a backup directory on the host

```bash
mkdir -p /root/backups/lumos_hrms
chmod 700 /root/backups/lumos_hrms
```

### 1B. Set a timestamp variable (use this in all filenames)

```bash
TS=$(date +%Y%m%d_%H%M%S)
echo "Backup timestamp: $TS"
```

Run this once and use `$TS` in every command below. Do **not** re-run `date` for each command — you want all files from the same backup run to share an identical timestamp.

### 1C. Custom-format backup (primary — required for selective restore)

```bash
docker exec lumos_postgres pg_dump \
  -U lumos_admin \
  -d lumos_hrms \
  --format=custom \
  --compress=9 \
  --verbose \
  --no-password \
  --file=/tmp/lumos_hrms_${TS}.backup
```

**Every flag explained:**

| Flag | Meaning |
|---|---|
| `docker exec lumos_postgres` | Run inside the `lumos_postgres` container where PostgreSQL lives. Running `pg_dump` from the host requires a network connection; running inside the container uses a UNIX socket — faster and no network latency. |
| `-U lumos_admin` | Connect as the database owner. This user has permission to dump all tables, sequences, and functions. |
| `-d lumos_hrms` | Dump only the `lumos_hrms` database, not all databases on the instance. |
| `--format=custom` / `-F c` | Custom compressed binary format. This is the only format that supports parallel restore (`pg_restore -j`), selective table restore, and can be inspected with `pg_restore --list`. Always prefer this over plain SQL for production. |
| `--compress=9` / `-Z 9` | Maximum zlib compression. Reduces file size 70–90% versus uncompressed SQL. Adds ~10% to dump time — acceptable. |
| `--verbose` / `-v` | Prints each table/index/sequence as it is dumped. Lets you confirm progress and shows exactly where the dump is when it finishes. |
| `--no-password` | Prevents `pg_dump` from prompting interactively. The `lumos_admin` user must already be configured to authenticate via `trust` or `md5` in `pg_hba.conf` inside the container, or via `.pgpass`. |
| `--file=/tmp/...` | Write to a path inside the container. We copy it to the host in the next step. Do not write directly to `/root/backups/` because that path does not exist inside the container. |

**If `lumos_admin` requires a password:**

```bash
docker exec -e PGPASSWORD='your_password_here' lumos_postgres pg_dump \
  -U lumos_admin \
  -d lumos_hrms \
  --format=custom \
  --compress=9 \
  --verbose \
  --file=/tmp/lumos_hrms_${TS}.backup
```

### 1D. Plain SQL backup (secondary — human-readable, full fidelity)

```bash
docker exec lumos_postgres pg_dump \
  -U lumos_admin \
  -d lumos_hrms \
  --format=plain \
  --verbose \
  --file=/tmp/lumos_hrms_${TS}.sql
```

**Why keep both?**
- The `.backup` (custom format) is used for `pg_restore` — supports selective and parallel restore.
- The `.sql` (plain format) is a last-resort safety net: you can read it, grep it, and pipe it into any `psql` session without `pg_restore`. Legal/audit teams can also read it directly.

### 1E. Copy both files from container to host

```bash
docker cp lumos_postgres:/tmp/lumos_hrms_${TS}.backup /root/backups/lumos_hrms/
docker cp lumos_postgres:/tmp/lumos_hrms_${TS}.sql    /root/backups/lumos_hrms/
```

**Confirm files exist and are non-zero:**

```bash
ls -lh /root/backups/lumos_hrms/
```

Expected output (sizes will vary):

```
-rw-r--r-- 1 root root  45M Jul 29 10:30 lumos_hrms_20260729_103000.backup
-rw-r--r-- 1 root root 280M Jul 29 10:31 lumos_hrms_20260729_103000.sql
```

If either file is 0 bytes, stop. The dump failed. Do not proceed with migration.

### 1F. Clean up temp files from inside the container

```bash
docker exec lumos_postgres rm /tmp/lumos_hrms_${TS}.backup /tmp/lumos_hrms_${TS}.sql
```

---

## Section 2 — Backup Verification

**Never skip this.** A backup file that cannot be restored is no backup at all.

### 2A. Verify the custom backup is a valid PostgreSQL archive

```bash
pg_restore --list /root/backups/lumos_hrms/lumos_hrms_${TS}.backup | head -80
```

This command reads the table of contents of the archive without touching any database. If the file is corrupt or incomplete, `pg_restore` will output an error here. If it prints a list of tables, sequences, and functions — the archive is structurally intact.

If `pg_restore` is not installed on the host, run it inside the container:

```bash
docker exec lumos_postgres pg_restore \
  --list /tmp/lumos_hrms_${TS}.backup | head -80
```

### 2B. Count objects in the archive

```bash
pg_restore --list /root/backups/lumos_hrms/lumos_hrms_${TS}.backup | wc -l
```

This should be a number in the hundreds for an HRMS schema (tables, indexes, sequences, functions, views, comments). If it returns 0 or a very small number, the dump is incomplete.

### 2C. Inspect schema-only (no data written — safest verification)

```bash
pg_restore \
  --list \
  --verbose \
  /root/backups/lumos_hrms/lumos_hrms_${TS}.backup \
  2>&1 | grep -E "(TABLE|INDEX|FUNCTION|VIEW|CONSTRAINT)" | wc -l
```

### 2D. Verify the SQL backup is readable and non-empty

```bash
wc -l /root/backups/lumos_hrms/lumos_hrms_${TS}.sql
head -20 /root/backups/lumos_hrms/lumos_hrms_${TS}.sql
tail -10 /root/backups/lumos_hrms/lumos_hrms_${TS}.sql
```

The first line should read `-- PostgreSQL database dump`.
The last lines should contain `-- PostgreSQL database dump complete`.

### 2E. Confirm the backup is restorable (dry-run restore into a test DB)

This is the gold standard. It creates a temporary database, restores the backup into it, and then drops it. Nothing in `lumos_hrms` is touched.

```bash
# Create a test restore target
docker exec lumos_postgres psql \
  -U lumos_admin \
  -d postgres \
  -c "CREATE DATABASE lumos_hrms_restore_test;"

# Copy backup back into container
docker cp /root/backups/lumos_hrms/lumos_hrms_${TS}.backup \
  lumos_postgres:/tmp/lumos_hrms_${TS}.backup

# Restore into the test DB
docker exec lumos_postgres pg_restore \
  -U lumos_admin \
  -d lumos_hrms_restore_test \
  --verbose \
  --exit-on-error \
  /tmp/lumos_hrms_${TS}.backup

# Verify row counts match
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT COUNT(*) FROM users;"
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms_restore_test \
  -c "SELECT COUNT(*) FROM users;"

# Drop the test DB when satisfied
docker exec lumos_postgres psql \
  -U lumos_admin \
  -d postgres \
  -c "DROP DATABASE lumos_hrms_restore_test;"

# Clean up temp file inside container
docker exec lumos_postgres rm /tmp/lumos_hrms_${TS}.backup
```

If the restore succeeds and row counts match — your backup is confirmed restorable. Proceed with migration.

---

## Section 3 — Rollback Plan

### 3A. If Part 1 fails

Part 1 is wrapped in `BEGIN` / `COMMIT`. PostgreSQL automatically rolls back the entire transaction if any statement fails. **No manual rollback is needed.** The database is in exactly the same state as before you ran the file.

Verify the rollback happened:

```bash
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT version FROM schema_migrations WHERE version LIKE '20260729_%';"
```

If this returns 0 rows — Part 1 rolled back cleanly. Investigate the error output, fix the cause, and re-run. Part 1 is idempotent: safe to re-run after fixing the underlying issue.

The one exception: if the failure was `lock_timeout` (a different session held a lock for more than 3 seconds), no data was modified. Terminate the blocking session, wait for idle traffic, and re-run.

### 3B. If Part 2 fails mid-way

Each `CREATE INDEX CONCURRENTLY` is independent. Failure of one does **not** affect others or roll back Part 1's changes.

**Step 1** — Find any INVALID indexes:

```bash
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms -c "
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
  AND indexname NOT IN (
    SELECT i.relname
    FROM pg_index x
    JOIN pg_class i ON i.oid = x.indexrelid
    WHERE x.indisvalid
  );"
```

**Step 2** — Drop each INVALID index:

```bash
# Repeat for each invalid index name shown above
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "DROP INDEX CONCURRENTLY IF EXISTS idx_att_org_date;"
```

`DROP INDEX CONCURRENTLY` does not block reads or writes. Safe to run on a live database.

**Step 3** — Re-run Part 2. All `CREATE INDEX CONCURRENTLY IF NOT EXISTS` statements skip already-valid indexes. Only the missing ones are rebuilt.

### 3C. If migration succeeds but the application fails after deployment

**Option 1 — Fix the application** (preferred if the bug is identifiable)

```bash
# Check application logs
docker logs <app_container_name> --tail=100
```

The migration is backward-compatible by design: it only adds columns (with `DEFAULT NULL`), adds constraints (`NOT VALID` initially), creates indexes, and creates views/functions. No columns are removed, no table structures are broken.

**Option 2 — Restore from backup** (last resort)

```bash
# 1. Stop the application to prevent partial writes
docker stop <app_container_name>

# 2. Copy backup into container
docker cp /root/backups/lumos_hrms/lumos_hrms_${TS}.backup \
  lumos_postgres:/tmp/lumos_hrms_restore.backup

# 3. Terminate all connections to the database
docker exec lumos_postgres psql -U lumos_admin -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'lumos_hrms' AND pid <> pg_backend_pid();"

# 4. Drop the current database
docker exec lumos_postgres psql -U lumos_admin -d postgres \
  -c "DROP DATABASE lumos_hrms;"

# 5. Recreate and restore
docker exec lumos_postgres psql -U lumos_admin -d postgres \
  -c "CREATE DATABASE lumos_hrms OWNER lumos_admin;"

docker exec lumos_postgres pg_restore \
  -U lumos_admin \
  -d lumos_hrms \
  --verbose \
  --exit-on-error \
  /tmp/lumos_hrms_restore.backup

# 6. Verify restore
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM attendance; SELECT COUNT(*) FROM leaves;"

# 7. Restart the application
docker start <app_container_name>
```

---

## Section 4 — Production Deployment Order

Execute these steps in exact order. Do not skip any step.

---

### PHASE 0: Notify team

Inform all stakeholders that a database maintenance window is starting. For an HRMS, avoid peak hours (morning check-in rush, payroll run days).

---

### PHASE 1: Put application into maintenance mode

Your app runs on port 3000 behind nginx. Configure nginx to return a 503 maintenance page instead of proxying to the app:

```bash
# Create a maintenance page
cat > /var/www/html/maintenance.html << 'EOF'
<!DOCTYPE html>
<html>
<head><title>Maintenance</title></head>
<body>
<h1>System Maintenance</h1>
<p>The HRMS is undergoing scheduled maintenance. Service will resume shortly.</p>
</body>
</html>
EOF

# Edit nginx config to return 503 during maintenance
# (add a return 503 directive to your server block, then reload)
nginx -t && nginx -s reload
```

Alternatively, stop the Node.js app container directly:

```bash
docker stop <app_container_name>
```

> **Why:** Part 1 has `lock_timeout = 3s`. If active HTTP requests are holding row locks, the migration will abort on that 3-second timeout and roll back cleanly. Maintenance mode eliminates this race condition and guarantees a clean migration window.
>
> For a low-traffic HRMS (few concurrent users, no biometric pushes at this hour), you may skip this step and rely on the `lock_timeout` protection. Maintenance mode is always safer.

---

### PHASE 2: Pre-flight checks

Run all of these inside the container:

```bash
docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms
```

**Check 1 — PostgreSQL version**

```sql
SELECT version();
```

Expected: `PostgreSQL 17.10`. If different, re-validate the migration against the installed version.

**Check 2 — Database size**

```sql
SELECT pg_size_pretty(pg_database_size('lumos_hrms')) AS db_size;
```

Note this number. Compare with disk space available in Check 8.

**Check 3 — Table sizes (for estimating index build time)**

```sql
SELECT
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(oid)) AS total_size,
  pg_size_pretty(pg_relation_size(oid)) AS table_size,
  reltuples::bigint AS estimated_rows
FROM pg_class
WHERE relkind = 'r'
  AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
ORDER BY pg_total_relation_size(oid) DESC
LIMIT 15;
```

`attendance` will be your largest table. Its size determines how long the concurrent index builds take.

**Check 4 — Active sessions (must be low before Part 1)**

```sql
SELECT pid, usename, application_name, state, wait_event_type, wait_event,
       now() - query_start AS duration, left(query, 80) AS query_snippet
FROM pg_stat_activity
WHERE datname = 'lumos_hrms'
  AND pid <> pg_backend_pid()
ORDER BY duration DESC NULLS LAST;
```

What to look for:
- Any sessions in `active` state with long-running queries — these can trigger `lock_timeout` in Part 1
- Sessions in `idle in transaction` state — these hold locks without doing anything and are the most dangerous

**Check 5 — Blocking locks**

```sql
SELECT
  blocking.pid          AS blocking_pid,
  blocking.query        AS blocking_query,
  blocked.pid           AS blocked_pid,
  blocked.query         AS blocked_query,
  now() - blocked.query_start AS blocked_duration
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.datname = 'lumos_hrms';
```

Expected: 0 rows. If any rows appear, terminate the blocking session before proceeding:

```sql
SELECT pg_terminate_backend(<blocking_pid>);
```

**Check 6 — Long-running transactions (idle in transaction)**

```sql
SELECT pid, usename, state, wait_event,
       now() - xact_start AS transaction_age,
       left(query, 100) AS last_query
FROM pg_stat_activity
WHERE datname = 'lumos_hrms'
  AND state = 'idle in transaction'
  AND xact_start < now() - interval '30 seconds';
```

Expected: 0 rows. Terminate any you find.

**Check 7 — WAL health**

```sql
SELECT
  pg_current_wal_lsn()                           AS current_wal_lsn,
  pg_size_pretty(pg_wal_lsn_diff(
    pg_current_wal_lsn(), '0/0'))                 AS total_wal_generated,
  (SELECT count(*) FROM pg_stat_replication)      AS replication_slots_active;
```

```sql
-- Show replication lag if replicas are connected
SELECT
  client_addr, state,
  sent_lsn, write_lsn, flush_lsn, replay_lsn,
  pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS replication_lag
FROM pg_stat_replication;
```

**Check 8 — Disk space (run on host, not inside psql)**

```bash
df -h /var/lib/docker
```

Rule of thumb: ensure at least `2 × db_size` of free disk space exists before starting. The backup alone requires `1 × db_size`. Part 2 indexes can add 10–30% of `attendance` table size in additional disk usage.

**Check 9 — Docker container health**

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker stats lumos_postgres --no-stream
```

Expected: container `Up`, `healthy`. If the container shows `(unhealthy)`, investigate before proceeding:

```bash
docker inspect lumos_postgres | grep -A 10 '"Health"'
```

---

### PHASE 3: Take the backup

```bash
TS=$(date +%Y%m%d_%H%M%S)
echo "=== Starting backup at $TS ==="

docker exec lumos_postgres pg_dump \
  -U lumos_admin -d lumos_hrms \
  --format=custom --compress=9 --verbose \
  --file=/tmp/lumos_hrms_${TS}.backup

docker exec lumos_postgres pg_dump \
  -U lumos_admin -d lumos_hrms \
  --format=plain --verbose \
  --file=/tmp/lumos_hrms_${TS}.sql

docker cp lumos_postgres:/tmp/lumos_hrms_${TS}.backup /root/backups/lumos_hrms/
docker cp lumos_postgres:/tmp/lumos_hrms_${TS}.sql    /root/backups/lumos_hrms/

docker exec lumos_postgres rm /tmp/lumos_hrms_${TS}.backup /tmp/lumos_hrms_${TS}.sql

ls -lh /root/backups/lumos_hrms/
echo "=== Backup complete ==="
```

---

### PHASE 4: Verify the backup

```bash
pg_restore --list /root/backups/lumos_hrms/lumos_hrms_${TS}.backup | wc -l
head -5 /root/backups/lumos_hrms/lumos_hrms_${TS}.sql
tail -5 /root/backups/lumos_hrms/lumos_hrms_${TS}.sql
```

Both files must be non-zero. The SQL file must end with `-- PostgreSQL database dump complete`. Only proceed if verification passes.

---

### PHASE 5: Run Part 1

Copy the migration files to the VPS and into the container:

```bash
# SCP from your local machine to the VPS
scp backend/migrations/production_db_hardening_part1.sql \
  root@187.127.146.194:/root/
scp backend/migrations/production_db_hardening_part2_indexes.sql \
  root@187.127.146.194:/root/

# On the VPS: copy into the container
docker cp /root/production_db_hardening_part1.sql \
  lumos_postgres:/tmp/production_db_hardening_part1.sql
docker cp /root/production_db_hardening_part2_indexes.sql \
  lumos_postgres:/tmp/production_db_hardening_part2_indexes.sql
```

Run Part 1:

```bash
echo "=== Starting Part 1 at $(date) ==="

docker exec lumos_postgres psql \
  -U lumos_admin \
  -d lumos_hrms \
  -v ON_ERROR_STOP=1 \
  -f /tmp/production_db_hardening_part1.sql \
  2>&1 | tee /root/part1_$(date +%Y%m%d_%H%M%S).log

echo "=== Part 1 exit code: $? — completed at $(date) ==="
```

**Flags explained:**

| Flag | Meaning |
|---|---|
| `-v ON_ERROR_STOP=1` | Stop immediately on any SQL error and return a non-zero exit code. Without this, `psql` continues after errors and the exit code is always 0 regardless of failures. |
| `tee /root/part1_*.log` | Writes the full output to a log file AND to your terminal simultaneously. This is your audit trail. |

**What you will see in the output:**

```
BEGIN
SET
CREATE TABLE          ← schema_migrations table (Section 0)
INSERT 0 0            ← Section 1 data cleanup (0 rows = clean data)
NOTICE: Deduped 3 holiday group(s)
ALTER TABLE           ← Section 2: adding deleted_at columns
ALTER TABLE           ← Section 3: FK fixes
CREATE INDEX          ← Section 4: UNIQUE indexes (inside transaction)
ALTER TABLE           ← Section 5: CHECK constraints NOT VALID
ALTER TABLE           ← Section 6: NOT NULL constraints
ALTER TABLE           ← Section 7: DEFAULT values
CREATE VIEW           ← Section 9: helper views
CREATE FUNCTION       ← Section 10: validation functions
COMMENT               ← Section 11: dead table docs
INSERT 0 1            ← Section 12: migration version records (×13)
COMMIT
...
NOTICE: Validated chk_attendance_status   ← Section 5B (post-commit)
NOTICE: Validated chk_attendance_hours
...
```

**If Part 1 fails:** The output will show `ERROR:` followed by `ROLLBACK`. Check the log:

```bash
grep -E "(ERROR|ROLLBACK|FATAL)" /root/part1_*.log
```

The database is unchanged. Fix the error and re-run. Part 1 is idempotent.

**Common Part 1 errors and fixes:**

| Error | Cause | Fix |
|---|---|---|
| `canceling statement due to lock timeout` | Another session held a lock for >3s | Identify and terminate the blocking session, then re-run |
| `canceling statement due to statement timeout` | A single statement took >5 minutes | Investigate the specific statement in the log |
| `duplicate key value violates unique constraint` | Deduplication in Section 1 missed rows | Run the dedup query manually, then re-run |
| `relation "..." does not exist` | A table referenced does not exist | Check `IF EXISTS` guards; report the table name |
| `column "..." does not exist` | Schema drift | Check column-existence guards; report the column name |

---

### PHASE 6: Post-Part-1 verification

```bash
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms << 'EOF'

-- 1. Confirm migration versions were committed (expect 13 rows)
SELECT version, description FROM schema_migrations
WHERE version LIKE '20260729_%' ORDER BY version;

-- 2. Confirm soft-delete columns exist (expect 8 tables)
SELECT table_name, column_name FROM information_schema.columns
WHERE column_name = 'deleted_at' AND table_schema = 'public'
ORDER BY table_name;

-- 3. Confirm helper views exist (expect 7 views)
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public' AND table_name LIKE 'v_%'
ORDER BY table_name;

-- 4. Confirm CHECK constraints exist with validation state
SELECT r.relname, c.conname,
       CASE c.convalidated WHEN TRUE THEN 'VALIDATED' ELSE 'NOT YET VALIDATED' END AS state
FROM pg_constraint c
JOIN pg_class r ON r.oid = c.conrelid
JOIN pg_namespace n ON n.oid = r.relnamespace
WHERE c.contype = 'c' AND n.nspname = 'public' AND c.conname LIKE 'chk_%'
ORDER BY r.relname;

-- 5. Quick data sanity checks (all should return 0)
SELECT 'invalid user role'    AS check_name, COUNT(*) AS bad_rows
  FROM users WHERE role NOT IN ('employee','admin','root_admin','platform_admin')
UNION ALL
SELECT 'draft payslips',      COUNT(*) FROM payslips WHERE status = 'draft'
UNION ALL
SELECT 'negative work_hours', COUNT(*) FROM attendance WHERE work_hours < 0
UNION ALL
SELECT 'duplicate holidays',  COUNT(*) FROM (
  SELECT organization_id, date FROM holidays
  GROUP BY 1,2 HAVING COUNT(*) > 1) d
UNION ALL
SELECT 'duplicate payslips',  COUNT(*) FROM (
  SELECT user_id, month, year, organization_id FROM payslips
  GROUP BY 1,2,3,4 HAVING COUNT(*) > 1) d;

EOF
```

**Expected results:**
- 13 rows in `schema_migrations` (versions `20260729_001` through `20260729_013`)
- 8 tables with `deleted_at` column
- 7 views starting with `v_`
- 19 CHECK constraints (some `NOT YET VALIDATED` is fine — Section 5B handles that)
- All data sanity checks return 0

**If any check fails:** Do NOT proceed to Part 2. Investigate before continuing.

---

### PHASE 7: Run Part 2

Part 2 must run outside any transaction, directly via `psql`. The `\gset` and `\if` metacommands in the file require `psql` — they cannot be executed via JDBC, node-postgres, or any other driver.

```bash
echo "=== Starting Part 2 at $(date) ==="

docker exec lumos_postgres psql \
  -U lumos_admin \
  -d lumos_hrms \
  -f /tmp/production_db_hardening_part2_indexes.sql \
  2>&1 | tee /root/part2_$(date +%Y%m%d_%H%M%S).log

echo "=== Part 2 exit code: $? — completed at $(date) ==="
```

> **Note:** `-v ON_ERROR_STOP=1` is NOT used for Part 2. Part 2 already has `\set ON_ERROR_STOP on` at the top of the file. An error in the prerequisite `DO $$` block will stop execution immediately. Individual `CREATE INDEX CONCURRENTLY` failures leave that index INVALID but allow subsequent indexes to proceed.

**Monitor index build progress in a second terminal while Part 2 runs:**

```bash
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms -c "
SELECT
  phase,
  blocks_done,
  blocks_total,
  ROUND(blocks_done::numeric / NULLIF(blocks_total,0) * 100, 1) AS pct_complete,
  index_name
FROM pg_stat_progress_create_index
ORDER BY pct_complete DESC;"
```

---

### PHASE 8: Verify all indexes are valid

```bash
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms << 'EOF'

-- Show status of all indexes created by Part 2
SELECT
  pi.tablename,
  pi.indexname,
  CASE WHEN x.indisvalid THEN 'VALID' ELSE '*** INVALID — NEEDS REBUILD ***' END AS state
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index  x  ON x.indexrelid = ic.oid
WHERE pi.indexname IN (
  'idx_att_org_date','idx_att_org_user_date','idx_att_org_status_date',
  'idx_att_org_date_pattern','idx_att_wfh_partial',
  'idx_leaves_org_user_status','idx_leaves_org_status_created',
  'idx_leaves_org_dates','idx_leaves_org_user_type','idx_leaves_pending_partial',
  'idx_notif_org_user_read',
  'idx_holidays_org_date','idx_holidays_org_date_pattern',
  'idx_users_org_role','idx_users_org_active_partial','idx_users_org_dept',
  'idx_expenses_org_status_created','idx_expenses_org_user','idx_expenses_pending_partial',
  'idx_assets_org_status','idx_assets_org_assigned',
  'idx_exit_org_status','idx_exit_org_user',
  'idx_onboarding_org_user','idx_onboarding_user_completed',
  'idx_perf_goals_org_user','idx_perf_reviews_org_user',
  'idx_ann_org_pinned_date',
  'idx_dept_org','idx_desig_org',
  'idx_shift_assign_org_date','idx_shift_assign_org_user_date',
  'idx_payroll_struct_user_org_eff','idx_payroll_struct_org',
  'idx_att_reg_org_status_created','idx_att_reg_org_user',
  'idx_leave_policies_org_active',
  'idx_payslips_org_period','idx_payslips_user_period',
  'idx_emp_docs_org_employee','idx_events_org_date'
)
ORDER BY
  CASE WHEN x.indisvalid THEN 1 ELSE 0 END,  -- INVALID first
  pi.tablename, pi.indexname;

-- Summary count
SELECT
  COUNT(*) FILTER (WHERE x.indisvalid)     AS valid_indexes,
  COUNT(*) FILTER (WHERE NOT x.indisvalid) AS invalid_indexes_require_rebuild
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index  x  ON x.indexrelid = ic.oid
WHERE pi.indexname LIKE 'idx_%'
  AND pi.schemaname = 'public';

EOF
```

Expected: `invalid_indexes_require_rebuild = 0`. If any indexes are INVALID, see Section 3B for the drop-and-rebuild procedure, then re-run Part 2 before proceeding.

---

### PHASE 9: Smoke-test the application

```bash
# Restart the application
docker start <app_container_name>

# Wait for Node.js to bind
sleep 5

# Check app is listening
docker logs <app_container_name> --tail=20
```

**Manual smoke tests:**

```bash
# Health check
curl -s http://localhost:3000/api/health

# Login (replace with real credentials)
curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourorg.com","password":"..."}' | jq .

# List employees (use JWT from login response)
curl -s http://localhost:3000/api/employees \
  -H "Authorization: Bearer <token>" | jq '.length'

# Today's attendance
curl -s "http://localhost:3000/api/attendance/today" \
  -H "Authorization: Bearer <token>" | jq .
```

**Key things to verify:**
1. Login works for both `admin` and `employee` role users
2. Dashboard loads without errors
3. Leave list loads
4. Attendance page loads
5. No `500` errors in Docker logs: `docker logs <app_container_name> --tail=50`

---

### PHASE 10: Remove maintenance mode

```bash
# Restore nginx to proxy mode (reverse of Phase 1)
nginx -t && nginx -s reload
```

Or if you only stopped the app container, Phase 9 already restarted it — no further action needed.

---

## Section 5 — Pre-Flight Safety Checklist

Copy and run this entire block in one `psql` session before touching anything:

```bash
docker exec -it lumos_postgres psql -U lumos_admin -d lumos_hrms
```

```sql
-- ── PostgreSQL version ─────────────────────────────────────────
SELECT version();
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();

-- ── Database size ──────────────────────────────────────────────
SELECT
  pg_size_pretty(pg_database_size(current_database())) AS db_size,
  pg_size_pretty(pg_total_relation_size('attendance'))  AS attendance_table_size,
  pg_size_pretty(pg_total_relation_size('leaves'))      AS leaves_table_size,
  pg_size_pretty(pg_total_relation_size('users'))       AS users_table_size;

-- ── Active sessions ────────────────────────────────────────────
SELECT
  pid, usename, application_name, client_addr,
  state, wait_event_type, wait_event,
  now() - query_start   AS query_age,
  now() - xact_start    AS transaction_age,
  left(query, 100)      AS query_snippet
FROM pg_stat_activity
WHERE datname = current_database()
  AND pid    <> pg_backend_pid()
ORDER BY transaction_age DESC NULLS LAST;

-- ── Blocking locks ─────────────────────────────────────────────
SELECT
  blocking.pid                AS blocking_pid,
  left(blocking.query, 80)   AS blocking_query,
  blocked.pid                 AS blocked_pid,
  left(blocked.query, 80)    AS blocked_query,
  now() - blocked.query_start AS blocked_for
FROM pg_stat_activity blocked
JOIN pg_stat_activity blocking
  ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
WHERE blocked.datname = current_database();

-- ── Long-running transactions (idle in transaction) ────────────
SELECT
  pid, usename, state,
  now() - xact_start  AS transaction_age,
  left(query, 100)    AS last_query
FROM pg_stat_activity
WHERE datname  = current_database()
  AND state    = 'idle in transaction'
  AND xact_start < now() - interval '10 seconds'
ORDER BY transaction_age DESC;

-- ── WAL health ─────────────────────────────────────────────────
SELECT
  pg_current_wal_lsn()                         AS current_lsn,
  pg_walfile_name(pg_current_wal_lsn())         AS current_wal_file,
  (SELECT count(*) FROM pg_stat_replication)    AS replica_count;

SELECT
  client_addr, state,
  sent_lsn, write_lsn, flush_lsn, replay_lsn,
  pg_size_pretty(pg_wal_lsn_diff(sent_lsn, replay_lsn)) AS replication_lag
FROM pg_stat_replication;

-- ── Table bloat / dead tuples ──────────────────────────────────
-- High dead tuples on attendance = VACUUM needed before Part 1 UPDATEs
SELECT relname, n_dead_tup, n_live_tup,
       ROUND(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) AS dead_pct,
       last_autovacuum, last_vacuum
FROM pg_stat_user_tables
WHERE relname IN ('attendance','leaves','users','payslips','expenses','holidays')
ORDER BY dead_pct DESC;

-- ── Existing indexes on key tables ────────────────────────────
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('attendance','leaves','users','payslips')
ORDER BY tablename, indexname;

-- ── Check if Part 1 has already run (idempotency check) ────────
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'schema_migrations' AND table_schema = 'public'
) AS migrations_table_exists;

SELECT * FROM schema_migrations
WHERE version LIKE '20260729_%'
ORDER BY version;
-- If rows exist, Part 1 already ran. Re-running is safe (idempotent).
```

**Linux disk check (host, outside psql):**

```bash
# Available disk space
df -h /var/lib/docker /root

# Docker container disk usage
docker system df -v | grep lumos_postgres

# Available memory (index builds use work_mem)
free -h

# PostgreSQL process resource usage
docker stats lumos_postgres --no-stream
```

---

## Section 6 — Recovery Checklist

### 6A. Part 1 fails

**What happened:** `psql` exited with a non-zero code. The log shows `ERROR:` followed by `ROLLBACK`.

**PostgreSQL guarantee:** The `BEGIN`/`COMMIT` wrapper means the entire transaction was rolled back. The database is byte-for-byte identical to before you started.

**Recovery steps:**

1. Read the error:
   ```bash
   grep -A 5 "ERROR" /root/part1_*.log
   ```

2. Common causes and fixes:

   | Error | Cause | Fix |
   |---|---|---|
   | `canceling statement due to lock timeout` | Another session held a lock for >3s | Terminate the blocking session (Check 5), then re-run |
   | `canceling statement due to statement timeout` | A single statement took >5 minutes | Unlikely in Part 1. Investigate the specific statement in the log. |
   | `duplicate key value violates unique constraint` | Deduplication in Section 1 missed rows | Run the dedup query manually, then re-run |
   | `relation "..." does not exist` | A table referenced does not exist | The `IF EXISTS` guards should prevent this. Report the table name. |
   | `column "..." does not exist` | Schema drift | Inspect the column-existence guards. Report the column name. |

3. After fixing the root cause, re-run Part 1. It is idempotent — all `CREATE ... IF NOT EXISTS` and `ON CONFLICT DO NOTHING` guards make it safe to re-run.

---

### 6B. Part 2 fails halfway

**What happened:** One or more `CREATE INDEX CONCURRENTLY` failed. The log shows `ERROR:` in the middle of the output.

**What is affected:** Only the index(es) that failed. Part 1's changes are fully committed and unaffected. Other indexes from Part 2 that succeeded are valid.

**Recovery steps:**

1. Find all INVALID indexes:
   ```sql
   SELECT schemaname, tablename, indexname
   FROM pg_indexes pi
   JOIN pg_class ic ON ic.relname = pi.indexname
   JOIN pg_index  x  ON x.indexrelid = ic.oid
   WHERE pi.schemaname = 'public'
     AND NOT x.indisvalid;
   ```

2. Drop each INVALID index:
   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS idx_att_org_date;
   -- repeat for each invalid index
   ```

3. Re-run Part 2. All `IF NOT EXISTS` guards skip valid indexes; only missing ones are rebuilt.

4. Common causes of index build failure:

   | Cause | Symptom | Fix |
   |---|---|---|
   | Disk full | `ERROR: could not write to file` | Free disk space, then rebuild |
   | Out of shared memory | `ERROR: out of shared memory` | `SET maintenance_work_mem = '512MB';` in the session, then rebuild |
   | Duplicate values in UNIQUE index | `ERROR: could not create unique index` | Part 1 Section 1 dedup should have prevented this. Find remaining duplicates manually. |
   | Session killed | Index left in INVALID state | Drop CONCURRENTLY, then rebuild |

---

### 6C. Power failure during migration

PostgreSQL is crash-safe. The WAL ensures the database can always be recovered to a consistent state.

**If the power cut happened during Part 1 (inside the transaction):**

PostgreSQL will replay its WAL on next startup and roll back any uncommitted transaction. The database will be in exactly the pre-migration state.

```bash
docker start lumos_postgres
docker logs lumos_postgres --follow
# Look for: "database system is ready to accept connections"

# Verify Part 1 did not commit:
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT version FROM schema_migrations WHERE version LIKE '20260729_%';"
# If 0 rows — Part 1 rolled back. Re-run from scratch.
```

**If the power cut happened during Part 2 (CONCURRENTLY index build):**

The database is consistent. The index being built at the time of the crash will be INVALID. Follow the 6B procedure to drop and rebuild it.

```bash
docker start lumos_postgres
docker logs lumos_postgres --follow

# Find invalid indexes
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms -c "
SELECT indexname FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index x ON x.indexrelid = ic.oid
WHERE pi.schemaname = 'public' AND NOT x.indisvalid;"

# Drop and rebuild each, then re-run Part 2
```

---

### 6D. Docker container restarts unexpectedly during migration

Same as power failure from PostgreSQL's perspective. The container's PostgreSQL process will crash-recover via WAL on next start.

**Additional Docker-specific check:**

```bash
# Was there an OOM kill?
dmesg | grep -i "oom\|kill" | tail -20

# Check Docker restart logs
docker inspect lumos_postgres | grep -A 5 '"RestartCount"'
```

If the container was OOM-killed during index build, set a higher `maintenance_work_mem` before rebuilding:

```bash
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "ALTER SYSTEM SET maintenance_work_mem = '256MB';"
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT pg_reload_conf();"
```

Then drop the INVALID indexes and re-run Part 2.

---

### 6E. A `CREATE INDEX CONCURRENTLY` is interrupted mid-build

`CREATE INDEX CONCURRENTLY` performs multiple passes over the table. If interrupted at any point, it leaves an INVALID index behind. An INVALID index is a live hazard: PostgreSQL's write path will try to maintain it on every INSERT/UPDATE/DELETE, adding overhead for no query benefit. **Drop INVALID indexes immediately after discovering them.**

```sql
-- Identify
SELECT indexname, tablename
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index  x  ON x.indexrelid = ic.oid
WHERE NOT x.indisvalid AND pi.schemaname = 'public';

-- Drop (safe — non-blocking)
DROP INDEX CONCURRENTLY IF EXISTS <indexname>;
```

Then re-run Part 2. The `IF NOT EXISTS` clause will skip all valid indexes and only rebuild the missing ones.

---

## Quick Reference — All Commands at a Glance

```bash
# ── SET TIMESTAMP (do this once, reuse $TS everywhere) ────────
TS=$(date +%Y%m%d_%H%M%S)

# ── BACKUP ────────────────────────────────────────────────────
mkdir -p /root/backups/lumos_hrms
docker exec lumos_postgres pg_dump -U lumos_admin -d lumos_hrms -F c -Z 9 -v -f /tmp/lumos_hrms_${TS}.backup
docker exec lumos_postgres pg_dump -U lumos_admin -d lumos_hrms -F p -v    -f /tmp/lumos_hrms_${TS}.sql
docker cp lumos_postgres:/tmp/lumos_hrms_${TS}.backup /root/backups/lumos_hrms/
docker cp lumos_postgres:/tmp/lumos_hrms_${TS}.sql    /root/backups/lumos_hrms/
docker exec lumos_postgres rm /tmp/lumos_hrms_${TS}.backup /tmp/lumos_hrms_${TS}.sql

# ── VERIFY BACKUP ─────────────────────────────────────────────
pg_restore --list /root/backups/lumos_hrms/lumos_hrms_${TS}.backup | wc -l
head -5 /root/backups/lumos_hrms/lumos_hrms_${TS}.sql
tail -5 /root/backups/lumos_hrms/lumos_hrms_${TS}.sql

# ── COPY MIGRATIONS INTO CONTAINER ───────────────────────────
docker cp /root/production_db_hardening_part1.sql lumos_postgres:/tmp/
docker cp /root/production_db_hardening_part2_indexes.sql lumos_postgres:/tmp/

# ── RUN PART 1 ────────────────────────────────────────────────
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -v ON_ERROR_STOP=1 -f /tmp/production_db_hardening_part1.sql \
  2>&1 | tee /root/part1_$(date +%Y%m%d_%H%M%S).log

# ── POST-PART-1 SANITY CHECK ──────────────────────────────────
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT COUNT(*) FROM schema_migrations WHERE version LIKE '20260729_%';"
# Expected: 13

# ── RUN PART 2 ────────────────────────────────────────────────
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -f /tmp/production_db_hardening_part2_indexes.sql \
  2>&1 | tee /root/part2_$(date +%Y%m%d_%H%M%S).log

# ── VERIFY INDEXES ────────────────────────────────────────────
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms -c "
SELECT
  COUNT(*) FILTER (WHERE x.indisvalid)     AS valid_indexes,
  COUNT(*) FILTER (WHERE NOT x.indisvalid) AS invalid_indexes_require_rebuild
FROM pg_indexes pi
JOIN pg_class ic ON ic.relname = pi.indexname
JOIN pg_index  x  ON x.indexrelid = ic.oid
WHERE pi.indexname LIKE 'idx_%' AND pi.schemaname = 'public';"
# Expected: invalid_indexes_require_rebuild = 0

# ── DROP AND REBUILD AN INVALID INDEX (if needed) ────────────
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "DROP INDEX CONCURRENTLY IF EXISTS <indexname>;"
# Then re-run Part 2

# ── FULL RESTORE (LAST RESORT) ────────────────────────────────
docker stop <app_container_name>
docker cp /root/backups/lumos_hrms/lumos_hrms_${TS}.backup lumos_postgres:/tmp/restore.backup
docker exec lumos_postgres psql -U lumos_admin -d postgres \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='lumos_hrms' AND pid<>pg_backend_pid();"
docker exec lumos_postgres psql -U lumos_admin -d postgres -c "DROP DATABASE lumos_hrms;"
docker exec lumos_postgres psql -U lumos_admin -d postgres -c "CREATE DATABASE lumos_hrms OWNER lumos_admin;"
docker exec lumos_postgres pg_restore -U lumos_admin -d lumos_hrms --exit-on-error -v /tmp/restore.backup
docker exec lumos_postgres psql -U lumos_admin -d lumos_hrms \
  -c "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM attendance; SELECT COUNT(*) FROM leaves;"
docker start <app_container_name>
```

---

## Deployment Checklist

Use this as a tick-off list on the day of deployment.

### Pre-Deployment
- [ ] Team notified of maintenance window
- [ ] Picked a low-traffic time window (not morning check-in, not payroll day)
- [ ] Logged into VPS (`ssh root@187.127.146.194`)
- [ ] Verified Docker container is healthy (`docker ps`)
- [ ] Checked disk space — at least `2 × db_size` free
- [ ] Set `TS=$(date +%Y%m%d_%H%M%S)`

### Backup
- [ ] Custom-format `.backup` file created inside container
- [ ] Plain SQL `.sql` file created inside container
- [ ] Both files copied to host `/root/backups/lumos_hrms/`
- [ ] Both files are non-zero size (`ls -lh`)
- [ ] `pg_restore --list ... | wc -l` returns a non-zero count
- [ ] SQL file ends with `-- PostgreSQL database dump complete`

### Pre-flight
- [ ] No active blocking locks (Check 5 returns 0 rows)
- [ ] No `idle in transaction` sessions older than 30s (Check 6 returns 0 rows)
- [ ] WAL is healthy (Check 7 shows no replication lag)
- [ ] Application put into maintenance mode or stopped

### Part 1
- [ ] Migration files copied into container (`docker cp`)
- [ ] Part 1 ran to completion (`exit code 0`)
- [ ] Log saved to `/root/part1_*.log`
- [ ] `schema_migrations` shows 13 rows for `20260729_%`
- [ ] 8 tables have `deleted_at` column
- [ ] 7 helper views exist
- [ ] All data sanity checks return 0 bad rows

### Part 2
- [ ] Part 2 ran to completion (log shows no `ERROR`)
- [ ] Log saved to `/root/part2_*.log`
- [ ] Index validity check: `invalid_indexes_require_rebuild = 0`

### Post-Deployment
- [ ] Application restarted
- [ ] Login works (admin + employee)
- [ ] Dashboard loads
- [ ] Leave list loads
- [ ] Attendance page loads
- [ ] No 500 errors in `docker logs`
- [ ] Maintenance mode removed / nginx restored
- [ ] Team notified: maintenance window complete
- [ ] Migration log files archived

---

*The most critical rule: take the backup, verify it restores, then run the migrations. Both migration files are production-hardened (idempotent, locked, guarded). As long as your backup is solid, you have a clean recovery path for every failure scenario above.*
