# 01 — Executive Summary
## Lumos Logic HRMS — Enterprise Implementation Documentation

---

**Document Version:** 1.0  
**Prepared By:** Lumos Logic  
**Date:** July 2026  
**Classification:** Confidential — Internal & Client Distribution  

---

## Table of Contents

1. [Purpose of This Document Suite](#1-purpose-of-this-document-suite)
2. [About the HRMS](#2-about-the-hrms)
3. [Business Objectives](#3-business-objectives)
4. [System Scope](#4-system-scope)
5. [Intended Audience](#5-intended-audience)
6. [High-Level Feature Summary](#6-high-level-feature-summary)
7. [Technology Overview](#7-technology-overview)
8. [Overall Implementation Summary](#8-overall-implementation-summary)
9. [Deployment Summary](#9-deployment-summary)
10. [Current Maturity Assessment](#10-current-maturity-assessment)
11. [Key Risks and Recommendations](#11-key-risks-and-recommendations)
12. [Documentation Suite Index](#12-documentation-suite-index)

---

## 1. Purpose of This Document Suite

This documentation suite serves as the authoritative reference for the Lumos Logic Human Resource Management System (HRMS). It is designed to support the full lifecycle of the system — from initial deployment to long-term maintenance, operational continuity, security auditing, and future enhancement.

This suite is not a developer code reference or an API specification. It is an enterprise-grade implementation and operations manual, written to ensure that any stakeholder — technical or non-technical — can understand how the HRMS is built, how it operates, how to maintain it, and how to evolve it responsibly.

Every statement in this documentation is grounded in the actual implementation as observed in the source code, database schema, configuration files, and deployment infrastructure. Where functionality is partially implemented, planned, or absent, this is explicitly stated.

---

## 2. About the HRMS

Lumos Logic HRMS is a full-stack, multi-tenant Human Resource Management System developed and maintained by Lumos Logic. It is designed to digitize and centralize all core HR operations for organizations of varying sizes — from employee onboarding to exit management, attendance tracking to payroll processing, and manual check-in to biometric device integration.

The system is delivered as a web-based Software-as-a-Service (SaaS) platform accessible via any modern web browser. Each subscribing organization operates within an isolated data environment, ensuring complete privacy and data separation. The platform supports three subscription tiers — Free, Gold, and Platinum — each unlocking progressively richer HR capabilities.

The HRMS is currently live in production at:

| Property | Value |
|---|---|
| Production URL | https://hrms.lumoslogic.com |
| Hosting Provider | Hostinger VPS |
| Server Location | India |
| Timezone | Asia/Kolkata (IST) — hardcoded |

---

## 3. Business Objectives

The Lumos Logic HRMS was built to address the following organizational needs:

| Objective | Description |
|---|---|
| **Centralized HR Operations** | Replace spreadsheets and disconnected tools with a single, unified HR platform |
| **Attendance Automation** | Automate attendance tracking via manual check-in and biometric device integration |
| **Leave Lifecycle Management** | Digitize leave applications, approvals, balance tracking, and audit trails |
| **Multi-Organization Support** | Support multiple independent organizations under one platform with complete data isolation |
| **Compliance and Audit Readiness** | Maintain records suitable for statutory compliance including payroll components, employee statutory fields, and login audit trails |
| **Employee Self-Service** | Provide employees with a dedicated portal to manage their own attendance, leaves, documents, payslips, and profiles without requiring HR intervention |
| **Scalable Feature Delivery** | Enable or disable HR modules per organization based on subscription plan, avoiding feature bloat for simpler use cases |
| **Integration with External Systems** | Sync HR events with Google Calendar, deliver documents via Cloudinary CDN, and receive biometric punches from ZKTeco hardware devices |
| **Security and Data Privacy** | Implement enterprise-grade authentication including two-factor authentication, password policies, role-based access control, and GDPR-aligned data export and deletion flows |

---

## 4. System Scope

### 4.1 In Scope

The HRMS covers the following functional domains:

- **Workforce Management:** Employee records, departments, designations, branches, multi-department assignments, and comprehensive employee profiles
- **Time and Attendance:** Manual check-in and check-out, break tracking, late/early detection, biometric punch integration, and attendance regularization
- **Leave Management:** Leave application, approval workflow, leave type policies, leave balance calculation, WFH tracking, and Google Calendar sync
- **Scheduling:** Shift definitions and shift roster assignment
- **Payroll:** Salary structure management, payslip generation, LOP (Loss of Pay) calculations, and statutory deductions
- **Finance Operations:** Expense reimbursement tracking and IT asset management
- **Documents:** Employee document storage, HR-managed documents, document sharing, and expiry tracking
- **People Analytics:** Attendance reports, leave reports, and dashboard analytics
- **Performance Management:** Goal setting and performance review workflows *(currently in early implementation stage)*
- **Onboarding and Exit:** New employee onboarding checklists and structured offboarding workflows
- **Announcements:** Organization-wide and targeted announcements with file attachments
- **Notifications:** In-app notification center and browser push notifications
- **Security and Access:** Multi-role access control, TOTP two-factor authentication, password policies, and session audit trails
- **Biometric Integration:** ZKTeco ADMS device integration for automated attendance recording
- **Multi-Tenancy:** Complete organization isolation under a single platform deployment

### 4.2 Out of Scope

The following are explicitly outside the current system scope:

- Payroll disbursement or banking integration (the system generates payslips but does not initiate salary transfers)
- Tax filing or government statutory portal integration (e.g., EPFO, ESIC portals)
- Recruitment or Applicant Tracking System (ATS)
- Learning Management System (LMS)
- Mobile native applications (iOS or Android)
- Advanced BI dashboards or third-party analytics integrations

---

## 5. Intended Audience

This documentation suite is written for the following audiences. Each document within the suite is tagged with the primary audience it addresses.

| Audience | Role | Primary Documents |
|---|---|---|
| **Client Stakeholders** | Decision makers, HR heads, business owners | Executive Summary, Module Overview, Roadmap |
| **System Administrators** | Org owners, root administrators managing the HRMS | Deployment Guide, Security, Database Management |
| **DevOps Engineers** | Infrastructure, CI/CD, Docker, VPS management | Deployment Guide, Disaster Recovery, Backup Strategy |
| **Backend Developers** | API development, business logic, database | System Architecture, Module Overview, Database Guidelines, Pending Tasks |
| **Frontend Developers** | React, UI, user workflows | System Architecture, Module Overview, Pending Tasks |
| **QA Engineers** | Testing, bug tracking, validation | Module Overview, Pending Tasks, Security |
| **Operations and Support Teams** | Day-to-day monitoring, incident response | Disaster Recovery, Backup Strategy, Deployment Procedures |

---

## 6. High-Level Feature Summary

The following table summarizes every implemented module in the HRMS, its availability by plan, and its current implementation status.

| Module | Free | Gold | Platinum | Status |
|---|:---:|:---:|:---:|---|
| Dashboard & Analytics | ✓ | ✓ | ✓ | Fully implemented |
| Employee Management | ✓ | ✓ | ✓ | Fully implemented |
| Departments & Designations | ✓ | ✓ | ✓ | Fully implemented |
| Attendance (Manual) | ✓ | ✓ | ✓ | Fully implemented |
| Attendance Break Tracking | ✓ | ✓ | ✓ | Fully implemented |
| Leave Management | ✓ | ✓ | ✓ | Fully implemented |
| Calendar (Team View) | ✓ | ✓ | ✓ | Fully implemented |
| Holidays | ✓ | ✓ | ✓ | Fully implemented |
| Announcements | ✓ | ✓ | ✓ | Fully implemented |
| Documents | ✓ | ✓ | ✓ | Fully implemented |
| Notifications (In-App) | ✓ | ✓ | ✓ | Fully implemented |
| Leave Policies | — | ✓ | ✓ | Fully implemented |
| Regularization | — | ✓ | ✓ | Fully implemented |
| Shifts & Roster | — | ✓ | ✓ | Fully implemented |
| Reports | — | ✓ | ✓ | Fully implemented |
| Performance Management | — | ✓ | ✓ | Partially implemented (stub) |
| Payroll & Payslips | — | ✓ | ✓ | Fully implemented |
| Expenses | — | — | ✓ | Fully implemented |
| Assets | — | — | ✓ | Fully implemented |
| Onboarding Checklists | — | — | ✓ | Fully implemented |
| Exit Management | — | — | ✓ | Fully implemented |
| Branches | — | — | ✓ | Fully implemented |
| Biometric (ZKTeco ADMS) | — | — | ✓ | Fully implemented |
| Push Notifications | — | — | ✓ | Fully implemented |
| Google Calendar Sync | — | — | ✓ | Fully implemented |
| Employee Profile V2 | ✓ | ✓ | ✓ | Fully implemented (16 sub-sections) |
| Two-Factor Authentication | ✓ | ✓ | ✓ | Fully implemented |
| GDPR Data Export & Deletion | ✓ | ✓ | ✓ | Fully implemented |
| Multi-Tenancy | ✓ | ✓ | ✓ | Fully implemented |

> **Legend:** ✓ = Available on this plan | — = Not included | *Stub* = Feature exists in UI/DB but has limited backend implementation

---

## 7. Technology Overview

### 7.1 Technology Stack Summary

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend Framework** | React | 18.3.1 | UI rendering and component management |
| **Frontend Build Tool** | Vite | 5.3.1 | Development server and production bundler |
| **Frontend Routing** | React Router DOM | 6.23.1 | Client-side routing and navigation |
| **Frontend Styling** | Tailwind CSS | 3.4.4 | Utility-first CSS framework |
| **UI Primitives** | Radix UI | Various | Accessible headless UI components |
| **Data Fetching** | TanStack React Query | 5.x | Server-state management and caching |
| **Calendar Component** | FullCalendar | 6.x | Interactive HR calendar views |
| **Charts** | Chart.js + react-chartjs-2 | 4.x | Analytics and reporting visualizations |
| **Icon Library** | Lucide React | Latest | Consistent SVG icon system |
| **Guided Tours** | Driver.js | 1.x | Onboarding user walkthroughs |
| **Backend Runtime** | Node.js | 20 (LTS) | Server-side JavaScript runtime |
| **Backend Framework** | Express.js | 4.18.2 | HTTP server and API routing |
| **Database** | PostgreSQL | 17 (Alpine) | Primary relational database |
| **DB Client** | pg (node-postgres) | Latest | PostgreSQL connection pooling |
| **DB Adapter** | Custom pg-adapter | Internal | Supabase-compatible query builder |
| **Authentication** | JSON Web Tokens (JWT) | 9.0.2 | Stateless session management |
| **Password Hashing** | bcryptjs | 2.4.3 | Secure password storage |
| **Two-Factor Auth** | otplib | 12.0.1 | TOTP-based 2FA (RFC 6238) |
| **QR Code Generation** | qrcode | 1.5.4 | 2FA QR code for authenticator apps |
| **File Uploads** | Multer | 1.4.5 | Multipart form data handling |
| **Cloud Storage** | Cloudinary SDK | 2.10.0 | Image and document CDN |
| **Email** | Nodemailer | 8.0.7 | Transactional email via Gmail SMTP |
| **Push Notifications** | web-push | 3.6.7 | VAPID-based browser push |
| **Google APIs** | googleapis | 171.4.0 | Google Calendar integration |
| **Containerization** | Docker + Compose | Latest | Application and database containers |
| **Reverse Proxy** | nginx | Latest | HTTPS termination and request routing |
| **SSL** | Let's Encrypt / Certbot | Auto-renewed | TLS certificate management |
| **Process Management** | Docker restart policy | `unless-stopped` | Automatic service recovery |

### 7.2 Architecture Pattern

The HRMS follows a **monolithic full-stack architecture** where:

- The Express.js backend serves both the REST API (`/api/*`) and the built React SPA as static files
- The React frontend communicates exclusively via the REST API
- PostgreSQL is the single source of truth for all application data
- External services (Cloudinary, Google Calendar, Gmail, Web Push, ZKTeco) are integrated as optional, fault-tolerant extensions

This architecture was chosen for **operational simplicity** — a single Docker Compose stack manages the entire application with no microservices overhead.

---

## 8. Overall Implementation Summary

### 8.1 Codebase Organization

The project is organized as a **monorepo** containing three distinct applications:

```
Leave_Tracker-HR-Dashboard-/
├── client/              # React 18 SPA — HR Admin + Employee Portal
├── backend/             # Express.js API server
│   ├── src/
│   │   ├── config/      # Database and Cloudinary configuration
│   │   ├── middleware/  # Auth, feature flags, file upload
│   │   ├── modules/     # 55 route files across 30+ modules
│   │   ├── services/    # Email, push notifications, Google Calendar
│   │   └── utils/       # Helpers, cron jobs
│   └── migrations/      # 25 SQL migration files (run manually)
├── platform-admin/      # Separate React SPA for platform management
├── nginx/               # nginx reverse proxy configuration
├── docs/                # Project documentation
├── Dockerfile           # Multi-stage Docker build
├── docker-compose.yml   # Production container orchestration
└── deploy.sh            # VPS deployment script
```

### 8.2 Backend Module Count

| Category | Count |
|---|---|
| Route modules | 30+ |
| Route files | 55 |
| Employee profile sub-routes | 16 |
| Database tables | 40+ |
| SQL migration files | 25 |
| External service integrations | 5 |

### 8.3 Frontend Page Count

| Portal | Pages |
|---|---|
| HR Admin / Root Admin | 35+ pages |
| Employee Portal | 12 pages |
| Public (Login, Register, etc.) | 5 pages |
| **Total** | **52+ pages** |

### 8.4 Multi-Tenancy Implementation

The HRMS supports **full multi-tenancy** where every organization's data is isolated at the database query level. Each database table that contains organizational data carries an `organization_id` foreign key. The authenticated user's `organization_id` is embedded in the JWT and applied to all queries automatically.

The platform supports multiple organizations simultaneously under a single deployment, each independently configurable with their own:
- Work schedules and late/early thresholds
- Feature set (via plan-based feature flags)
- Leave policies and holiday calendars
- SMTP email configuration
- Google Calendar integration
- Biometric devices

### 8.5 User Role Hierarchy

```
platform_admin  (Lumos Logic internal — manages all organizations)
    └── root_admin  (Organization owner — full control of one org)
            └── admin  (HR Manager — manages employees and operations)
                    └── employee  (Self-service portal access only)
```

### 8.6 Database Architecture

The PostgreSQL database uses a **flat schema** (single database, all organizations share tables, isolated by `organization_id`). Row-level security (RLS) is intentionally disabled because data isolation is enforced entirely at the application layer through JWT-scoped queries.

The database schema has evolved through **25 sequential migration files** that are run manually. There is no automated migration runner; migrations are applied via `psql` during deployment.

### 8.7 Authentication Architecture

Authentication is **stateless** using JSON Web Tokens (JWT). No session state is stored on the server. The JWT payload carries the user's identity, role, and organization context, and is verified on every API request by the `auth` middleware.

Optional **TOTP two-factor authentication** is supported via RFC 6238 time-based one-time passwords, compatible with Google Authenticator and Authy.

### 8.8 Email Communication

All transactional emails are sent via **Gmail SMTP** (port 587) using an App Password. The system includes 10 pre-built HTML email templates covering leave workflows, welcome messages, password resets, birthday wishes, holiday reminders, and organization registration events.

### 8.9 Background Tasks

A single **daily cron job** runs at 08:00 IST, implemented as a JavaScript `setTimeout` loop (not an OS-level cron). It delivers:
- Birthday email wishes to employees
- Birthday reminders to HR (day before)
- Holiday reminders to all employees (day before)
- Push notifications for birthday and holiday events

---

## 9. Deployment Summary

| Property | Value |
|---|---|
| Hosting | Hostinger VPS |
| Server IP | 187.127.146.194 |
| SSH Access | Root user |
| Primary Domain | hrms.lumoslogic.com |
| SSL Provider | Let's Encrypt (auto-renewed via Certbot) |
| Containerization | Docker + Docker Compose |
| App Container Port | 3000 (internal) |
| PostgreSQL Port | 5432 (VPS-local only, not publicly exposed) |
| nginx Ports | 80 (HTTP redirect) + 443 (HTTPS) |
| App Directory | /opt/lumos-hrms |
| Data Persistence | Named Docker volume `pgdata` |
| Restart Policy | `unless-stopped` (auto-recovery on crash/reboot) |
| TZ | Asia/Kolkata (IST) — set in all containers |

The production build process compiles the React frontend into static files, which are copied into the Express `public/` directory and served by the same Node.js process that serves the API. No separate static file server is required.

---

## 10. Current Maturity Assessment

| Domain | Maturity Level | Notes |
|---|---|---|
| **Core HRMS (Attendance, Leave)** | Production-ready | Fully implemented with edge case handling |
| **Employee Management** | Production-ready | Comprehensive profile with 16 sub-sections |
| **Payroll** | Production-ready | Structures + payslips; no disbursement integration |
| **Biometric Integration** | Production-ready | ZKTeco ADMS with reprocess capability |
| **Multi-Tenancy** | Production-ready | Full org isolation via JWT-scoped queries |
| **Authentication & 2FA** | Production-ready | JWT + TOTP + password policies + audit trail |
| **Documents & Assets** | Production-ready | Cloudinary-backed with expiry tracking |
| **Performance Management** | Early stage | UI exists, backend is limited; stub implementation |
| **Security Hardening** | Partial | No rate limiting on auth endpoints; no input validation library |
| **Deployment Automation** | Manual | No CI/CD pipeline; manual git pull + docker compose |
| **Database Migration Management** | Manual | No migration runner; SQL files applied via psql |
| **Monitoring & Alerting** | Not implemented | No uptime monitoring, log aggregation, or alerting |
| **Testing** | Not implemented | No automated test suite (unit, integration, or E2E) |

---

## 11. Key Risks and Recommendations

The following risks were identified during the implementation analysis. Detailed treatment of each is provided in the relevant documents within this suite.

| Risk | Severity | Document Reference |
|---|---|---|
| No rate limiting on login and password reset endpoints | **High** | 06_Security_Measures.md |
| nginx proxy port configuration mismatch (3005 vs 3000) | **High** | 11_Deployment_Procedures.md |
| No automated database backups configured | **High** | 05_Data_Backup_Strategy.md |
| No CI/CD pipeline — all deployments are manual | **Medium** | 11_Deployment_Procedures.md |
| No automated test suite | **Medium** | 04_Pending_Development_Tasks.md |
| No monitoring or alerting infrastructure | **Medium** | 07_Disaster_Recovery.md |
| Row-level security disabled on all tables | **Medium** | 06_Security_Measures.md |
| Biometric endpoint has no IP-based access control | **Medium** | 08_Biometric_Integration.md |
| No input validation library (manual field checks only) | **Medium** | 06_Security_Measures.md |
| Performance module is a stub (incomplete) | **Low** | 03_Module_Overview.md |
| Manual SQL migration management with no versioning | **Low** | 09_Database_Management.md |
| Clockify residue in schema (deprecated, not removed) | **Low** | 04_Pending_Development_Tasks.md |

---

## 12. Documentation Suite Index

| # | Document | Primary Audience | Focus |
|---|---|---|---|
| 01 | Executive Summary *(this document)* | All | Business context, scope, summary |
| 02 | System Architecture Overview | Developers, DevOps | Technical architecture, diagrams |
| 03 | Module Overview | All | Every HRMS module explained |
| 04 | Pending Development Tasks | Developers, QA | Gaps, stubs, technical debt |
| 05 | Data Backup Strategy | DevOps, Admins | Backup procedures and policies |
| 06 | Security Measures and Access Control | DevOps, Admins | Auth, RBAC, security gaps |
| 07 | Disaster Recovery Plan | DevOps, Ops | Incident response, recovery |
| 08 | Biometric Integration | Admins, Developers | ZKTeco ADMS implementation |
| 09 | Database Management Guidelines | Developers, Admins | Schema, migrations, optimization |
| 10 | Future Enhancement Roadmap | Stakeholders, Developers | Prioritized feature roadmap |
| 11 | Deployment and Maintenance Procedures | DevOps, Admins | VPS, Docker, nginx, operations |

---

*End of Document 01 — Executive Summary*

*Next: 02_System_Architecture_Overview.md*
