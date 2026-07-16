# Biometric Integration — Pending from Client

Last updated: 2026-07-08

---

## Already Received (No Follow-Up Needed)

| # | Info | Status |
|---|---|---|
| Device list | 7 devices with serial, name, area, IP, status, transaction count | Received |
| Network type | LAN with internet access | Confirmed |
| ADMS configured | Client has already set ADMS server IP + port on all devices | Confirmed |
| Sample transactions | Real punch data from today (Employee ID, punch time, Check In/Out, area, device) | Received |

---

## Still Needed — Ask This Now

### 1. Current ADMS Server URL on the Devices

**What to ask:**
> What is the IP address and port currently set as the ADMS Server on the ZKTeco devices? (Example format: `http://203.x.x.x:8080`)

**Why it's needed:**
The devices are already pushing data to *some* server. We need to know what URL is currently configured so we can redirect it to our server. Until this is done, live punches are not reaching us.

**Blocks:** Going live with real-time data. Nothing else depends on this.

---

### 2. Employee List Export from ZKTeco WDMS

**What to ask:**
> Please export the enrolled employee list from ZKTeco WDMS software. We need at minimum:
> - Employee PIN / Enrollment Number
> - Employee Name
>
> An Excel or CSV export from the "Employee" section in WDMS is fine.

**Why it's needed:**
Every punch the device sends contains only an Employee PIN (e.g., `431`, `806`). Without the mapping of PIN → Employee Name → HRMS Account, every punch lands as unmatched. Attendance records cannot be created until this mapping is done.

**Blocks:** Phase 3 of implementation. Raw punches will still be logged even without this, but they won't create attendance records.

---

### 3. Device Model / Firmware Version (Nice to Have)

**What to ask:**
> Can you check the device screen or ZKTeco WDMS and tell us the model name? (e.g., K40, F22, UFace302, SpeedFace-V5L, or similar)

**Why it's needed:**
Different ZKTeco models have slightly different ADMS payload formats. If we know the model we can match the exact field names. However this is low priority — we can build the receiver based on standard ADMS format and adjust if anything looks off during testing.

**Blocks:** Nothing critical. Can test and fix in Phase 2.

---

## Message Template to Send Client

```
Hello Sir,

We have started development. We need just two more things from your side to go live:

1. ADMS Server URL currently on the devices:
   What is the IP address and port currently set as the ADMS server 
   on the ZKTeco devices?
   Example: http://203.x.x.x:8080
   (We need this to redirect the devices to our server.)

2. Employee List Export from ZKTeco WDMS:
   Please export the enrolled employee list from WDMS with:
   - Employee PIN / Enrollment Number
   - Employee Name
   An Excel or CSV export from the Employee section is fine.

Once we receive these two things, we can complete the integration and go live.

Thank you.
```

---

## Questions to Clarify Later (Not Urgent — Don't Block Go-Live)

These can be asked after live punches are flowing.

| Question | Why It Matters |
|---|---|
| Should biometric attendance auto-approve or go through regularization flow? | Affects attendance approval logic |
| What to do with duplicate punches within 5 minutes? | Duplicate protection rule |
| Historical data migration? How far back? | One-time import from WDMS export |
| AWS region preference for RDS? (Mumbai recommended) | Infrastructure setup |
| Client owns AWS account or billed under ours? | Billing arrangement |
| Staging environment needed? | Nice to have, not a blocker |
| OT punch types (4 = OT-in, 5 = OT-out) — track separately or same as regular? | OT hours logic |
