const { pool } = require('../../config/db');

const DEFAULT_TASKS = [
  { title: 'Complete Personal Information Form',  assigned_to: 'employee', order_index: 1  },
  { title: 'Upload Aadhaar Card / ID Proof',      assigned_to: 'employee', order_index: 2  },
  { title: 'Upload Address Proof',                assigned_to: 'employee', order_index: 3  },
  { title: 'Provide Bank Account Details',        assigned_to: 'employee', order_index: 4  },
  { title: 'Read & Acknowledge Company Policies', assigned_to: 'employee', order_index: 5  },
  { title: 'Verify Documents',                    assigned_to: 'hr',       order_index: 6  },
  { title: 'Create Company Email',                assigned_to: 'hr',       order_index: 7  },
  { title: 'Create HRMS Account',                 assigned_to: 'hr',       order_index: 8  },
  { title: 'Complete HR Orientation',             assigned_to: 'hr',       order_index: 9  },
  { title: 'Assign Buddy / Mentor',               assigned_to: 'hr',       order_index: 10 },
  { title: 'Laptop & Equipment Setup',            assigned_to: 'it',       order_index: 11 },
  { title: 'Software & Tool Access',              assigned_to: 'it',       order_index: 12 },
  { title: 'Meet Reporting Manager',              assigned_to: 'manager',  order_index: 13 },
  { title: 'Team Introduction',                   assigned_to: 'manager',  order_index: 14 },
  { title: 'Assign First Task',                   assigned_to: 'manager',  order_index: 15 },
  { title: 'Complete First Week Review',          assigned_to: 'manager',  order_index: 16 },
];

/**
 * Initialize onboarding checklist for a newly created employee.
 * Uses its own pg client so it is independent of the caller's transaction.
 * Safe to call fire-and-forget — failures are logged but do not surface to the caller.
 */
async function initOnboarding(userId, orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM onboarding_checklists WHERE user_id = $1 AND organization_id = $2 LIMIT 1`,
      [userId, orgId]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return;
    }

    for (const task of DEFAULT_TASKS) {
      await client.query(
        `INSERT INTO onboarding_checklists (user_id, organization_id, title, assigned_to, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, orgId, task.title, task.assigned_to, task.order_index]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[onboardingService] initOnboarding failed for user ${userId}:`, err.message);
  } finally {
    client.release();
  }
}

module.exports = { initOnboarding };
