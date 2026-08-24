# EasyWDMS SQL Server — Read-Only Connectivity Test

A standalone Node.js script that verifies whether our server can reach
the EasyWDMS SQL Server and read punch data from `iclock_transaction`.

**This script is read-only.**  
It never writes to EasyWDMS, never touches `Processed`, and never calls the HRMS API.

---

## What it tests

| Step | Check |
|------|-------|
| 1 | TCP connection to SQL Server |
| 2 | Server version + current time (smoke test) |
| 3 | `iclock_transaction` table exists |
| 4 | Required columns present (`emp_code`, `punch_time`, `punch_state`, `terminal_sn`, `terminal_alias`) |
| 5 | 10 most recent punch records |
| 6 | Historical range query — record count, sample rows, per-terminal breakdown |

---

## Prerequisites

- Node.js 18 or later (`node --version`)
- Network access from the machine running this script to the SQL Server host on TCP port 1433

---

## Running locally (Windows / Mac / Linux)

```bash
cd tools/easywdms-test
cp .env.example .env
# Edit .env — fill in SQL_HOST, SQL_USER, SQL_PASSWORD
npm install
npm test
```

---

## Running on the Hostinger VPS

### 1 — SSH into the server

```bash
ssh root@187.127.146.194
```

### 2 — Check Node.js is available

```bash
node --version   # needs v18+
npm --version
```

If not installed:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
```

### 3 — Copy the tool to the server

From your local machine (run outside the SSH session):
```bash
scp -r tools/easywdms-test root@187.127.146.194:/root/easywdms-test
```

Or clone/pull the repo on the server and navigate to the folder.

### 4 — Create the .env file on the server

```bash
cd /root/easywdms-test
cp .env.example .env
nano .env          # or: vi .env
```

Fill in credentials (see Configuration section below).

### 5 — Install dependencies and run

```bash
npm install
npm test
```

---

## Configuration

Copy `.env.example` to `.env` and set the following variables:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SQL_HOST` | Yes | — | IP or hostname of the EasyWDMS SQL Server |
| `SQL_PORT` | No | `1433` | SQL Server TCP port |
| `SQL_DATABASE` | No | `EasyWDMS` | Database name |
| `SQL_USER` | Yes | — | SQL Server login username |
| `SQL_PASSWORD` | Yes | — | SQL Server login password |
| `SQL_CONNECT_TIMEOUT` | No | `15000` | TCP connect timeout (ms) |
| `SQL_REQUEST_TIMEOUT` | No | `30000` | Query timeout (ms) |
| `HISTORY_FROM` | No | `2026-06-01` | Start date for historical query |
| `HISTORY_TO` | No | `2026-07-31` | End date for historical query |
| `SQL_DEBUG` | No | `false` | Set `true` for verbose mssql output |

### Example .env for Sanghavi client

```env
SQL_HOST=192.168.0.30
SQL_PORT=1433
SQL_DATABASE=EasyWDMS
SQL_USER=sa
SQL_PASSWORD=<actual password>
HISTORY_FROM=2026-06-01
HISTORY_TO=2026-07-31
```

> **Security note:** The EasyWDMS SQL Server is on the client's private LAN (192.168.0.x).
> It is not reachable directly from the Hostinger VPS without a VPN or SSH tunnel.
> See the "Connectivity scenarios" section below.

---

## Connectivity scenarios

### Scenario A — Same LAN (local test at client site)
Run the script from any machine on the same LAN as the SQL Server.
`SQL_HOST=192.168.0.30` will work directly.

### Scenario B — Hostinger VPS → client LAN via SSH tunnel

If the client has a machine on the LAN that accepts SSH:

```bash
# On the Hostinger VPS, create a tunnel:
ssh -N -L 1433:192.168.0.30:1433 user@<client-public-ip-or-bastion>
```

Then in `.env` on the VPS:
```env
SQL_HOST=127.0.0.1
SQL_PORT=1433
```

### Scenario C — Client exposes SQL Server publicly

If the client opens port 1433 on their router (firewall whitelist our VPS IP):
```env
SQL_HOST=<client-public-ip>
SQL_PORT=1433
```

---

## Reading the output

### Success
```
── Step 1 — Opening TCP connection to SQL Server
  ✓  Connected to 192.168.0.30:1433 / EasyWDMS
...
═══════════════════════════════════════════════════════════════
   RESULT: CONNECTED + DATA AVAILABLE
═══════════════════════════════════════════════════════════════
```

### Failure — with diagnosis

```
✗  CONNECTION FAILED

Reason: Connection timed out — the host at "192.168.0.30:1433" did not respond within 15000 ms.
  • Check network routing / firewall between the Hostinger VPS and the client LAN.
  • If the SQL Server is on a private LAN (192.168.x.x), a VPN or SSH tunnel is required.
  • From the VPS, try: nc -zv 192.168.0.30 1433

═══════════════════════════════════════════════════════════════
   RESULT: CONNECTION FAILED
═══════════════════════════════════════════════════════════════
```

---

## Error types and what they mean

| Error | Cause | Fix |
|-------|-------|-----|
| DNS resolution failure | `SQL_HOST` hostname not resolvable | Use IP address instead |
| Connection refused | SQL Server not running or port blocked | Check SQL Server service + firewall |
| Connection timeout | Network not reachable (private LAN, firewall) | Need VPN / SSH tunnel / public exposure |
| Authentication failure | Wrong `SQL_USER` / `SQL_PASSWORD` | Verify credentials, check Mixed Mode auth |
| Database not found | `SQL_DATABASE` name wrong | Check exact DB name in SQL Server |
| Invalid column name | `iclock_transaction` has different column names | Check Step 4 output for actual column names |

---

## Next steps (after connectivity confirmed)

Once this test passes, the permanent EasyWDMS sync feature will:
- Poll `iclock_transaction` on a schedule
- Import new records into `biometric_raw_logs`
- Map `emp_code` → HRMS user via `biometric_employee_map`
- Process into attendance records

**Do not implement this yet** — this tool is proof-of-concept only.
