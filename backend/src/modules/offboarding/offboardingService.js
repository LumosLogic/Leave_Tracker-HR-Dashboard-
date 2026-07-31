const { pool } = require('../../config/db');

const DEFAULT_OFFBOARDING_TASKS = [
  { title: 'Submit Resignation Letter (if not done)',      assigned_to: 'employee', order_index: 1  },
  { title: 'Complete Knowledge Transfer Document',         assigned_to: 'employee', order_index: 2  },
  { title: 'Return Company Assets (laptop, ID card, etc.)', assigned_to: 'employee', order_index: 3  },
  { title: 'Clear Personal Belongings',                   assigned_to: 'employee', order_index: 4  },
  { title: 'Sign Exit Interview Form',                    assigned_to: 'employee', order_index: 5  },
  { title: 'Revoke IT Access & System Accounts',          assigned_to: 'it',       order_index: 6  },
  { title: 'Revoke Building / Badge Access',              assigned_to: 'it',       order_index: 7  },
  { title: 'Remove from Email Groups / Distribution Lists', assigned_to: 'it',     order_index: 8  },
  { title: 'Conduct Exit Interview',                      assigned_to: 'hr',       order_index: 9  },
  { title: 'Process Full & Final Settlement',             assigned_to: 'finance',  order_index: 10 },
  { title: 'Issue Experience / Relieving Letter',         assigned_to: 'hr',       order_index: 11 },
  { title: 'Update Org Chart & Headcount',                assigned_to: 'hr',       order_index: 12 },
  { title: 'Inform Team & Clients of Departure',          assigned_to: 'manager',  order_index: 13 },
  { title: 'Archive Employee Records',                    assigned_to: 'hr',       order_index: 14 },
];

/**
 * Initialize offboarding checklist for a departing employee.
 * Call fire-and-forget after exit request is approved.
 * Idempotent — skips if checklist already exists for this user.
 */
async function initOffboarding(userId, orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id FROM offboarding_checklists WHERE user_id = $1 AND organization_id = $2 LIMIT 1`,
      [userId, orgId]
    );
    if (existing.rows.length) {
      await client.query('ROLLBACK');
      return;
    }

    for (const task of DEFAULT_OFFBOARDING_TASKS) {
      await client.query(
        `INSERT INTO offboarding_checklists (user_id, organization_id, title, assigned_to, order_index)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, orgId, task.title, task.assigned_to, task.order_index]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(`[offboardingService] initOffboarding failed for user ${userId}:`, err.message);
  } finally {
    client.release();
  }
}

module.exports = { initOffboarding };
