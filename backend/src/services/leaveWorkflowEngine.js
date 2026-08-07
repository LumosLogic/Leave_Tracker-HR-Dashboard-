/**
 * leaveWorkflowEngine.js
 *
 * Dynamic multi-level leave approval workflow engine.
 *
 * Supported approver types:
 *   reporting_manager  — resolved from users.reporting_to
 *   department_head    — resolved from departments.head_user_id (employee's primary dept)
 *   hr_admin           — any user with role 'admin' or 'root_admin'
 *   root_admin         — any user with role 'root_admin'
 *   specific_user      — fixed user_id stored in level.role_reference
 *
 * Backward compatibility:
 *   Old leaves (workflow_id = NULL) continue to use the legacy pending_dept /
 *   pending_root flow unchanged. This engine is only invoked for NEW leaves.
 */

const { supabase, pool } = require('../config/db');

// ── Default workflow inserted for every new organization ──────────────────────
const DEFAULT_WORKFLOW_LEVELS = [
  { level_number: 1, role_type: 'reporting_manager', level_label: 'Reporting Manager', is_required: false },
  { level_number: 2, role_type: 'hr_admin',          level_label: 'HR Admin',          is_required: true  },
];

// ─────────────────────────────────────────────────────────────────────────────
// getOrgWorkflow
// Returns the active workflow with sorted levels.
// If none exists, auto-creates the default 2-level workflow.
// ─────────────────────────────────────────────────────────────────────────────
async function getOrgWorkflow(oId) {
  const { data } = await supabase
    .from('leave_workflows')
    .select(`
      id, workflow_name, organization_id,
      leave_workflow_levels(id, level_number, role_type, role_reference, level_label, is_required)
    `)
    .eq('organization_id', oId)
    .eq('active', true)
    .maybeSingle();

  if (data) {
    return {
      id:            data.id,
      workflow_name: data.workflow_name,
      organization_id: data.organization_id,
      levels: (data.leave_workflow_levels || []).sort((a, b) => a.level_number - b.level_number),
    };
  }

  // ── Auto-create default workflow ──────────────────────────────────────────
  const { data: wf, error: wfErr } = await supabase
    .from('leave_workflows')
    .insert({ organization_id: oId, workflow_name: 'Default Approval Workflow', active: true })
    .select()
    .single();
  if (wfErr) throw new Error('Failed to create default workflow: ' + wfErr.message);

  const { data: levels, error: lvlErr } = await supabase
    .from('leave_workflow_levels')
    .insert(DEFAULT_WORKFLOW_LEVELS.map(l => ({ ...l, workflow_id: wf.id })))
    .select();
  if (lvlErr) throw new Error('Failed to create default workflow levels: ' + lvlErr.message);

  return {
    id:            wf.id,
    workflow_name: wf.workflow_name,
    organization_id: oId,
    levels: (levels || []).sort((a, b) => a.level_number - b.level_number),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveApprover
// Given a workflow level and the employee submitting, returns the specific
// user_id who should approve (or null for role-based approvers).
// ─────────────────────────────────────────────────────────────────────────────
async function resolveApprover(level, employeeId, oId) {
  const label = level.level_label || level.role_type.replace(/_/g, ' ');

  switch (level.role_type) {
    case 'reporting_manager': {
      const { data: emp } = await supabase.from('users')
        .select('reporting_to')
        .eq('id', employeeId)
        .eq('organization_id', oId)
        .maybeSingle();
      const uid = emp?.reporting_to;
      if (!uid || uid === employeeId) return { userId: null, label };
      return { userId: uid, label };
    }

    case 'department_head': {
      const { data: emp } = await supabase.from('users')
        .select('department_id')
        .eq('id', employeeId)
        .eq('organization_id', oId)
        .maybeSingle();
      if (!emp?.department_id) return { userId: null, label };
      const { data: dept } = await supabase.from('departments')
        .select('head_user_id')
        .eq('id', emp.department_id)
        .eq('organization_id', oId)
        .maybeSingle();
      const uid = dept?.head_user_id;
      if (!uid || uid === employeeId) return { userId: null, label };
      return { userId: uid, label };
    }

    // Role-based: any user with that role can approve; no specific user stored
    case 'hr_admin':
    case 'root_admin':
      return { userId: null, label };

    case 'specific_user': {
      const uid = level.role_reference ? parseInt(level.role_reference, 10) : null;
      return { userId: uid || null, label };
    }

    default:
      return { userId: null, label };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// canUserApproveLevel
// Pure function — given a level config and user info, returns true/false.
// ─────────────────────────────────────────────────────────────────────────────
function canUserApproveLevel(level, userId, userRole, currentApproverId) {
  switch (level.role_type) {
    case 'reporting_manager':
    case 'department_head':
    case 'specific_user':
      return currentApproverId !== null && currentApproverId === userId;
    case 'hr_admin':
      return ['admin', 'root_admin'].includes(userRole);
    case 'root_admin':
      return userRole === 'root_admin';
    default:
      return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// checkCanApprove
// Returns { can: boolean, level: object|null }
// ─────────────────────────────────────────────────────────────────────────────
async function checkCanApprove(leave, userId, userRole) {
  if (!leave.workflow_id || leave.status !== 'pending_approval') {
    return { can: false, level: null };
  }

  const workflow = await getOrgWorkflow(leave.organization_id);
  const currentLevel = workflow.levels.find(l => l.level_number === leave.current_level);
  if (!currentLevel) return { can: false, level: null };

  const can = canUserApproveLevel(currentLevel, userId, userRole, leave.current_approver_id);
  return { can, level: currentLevel };
}

// ─────────────────────────────────────────────────────────────────────────────
// initWorkflow
// Called when an employee submits a leave.
// Walks levels in order, finds the first that has a resolvable approver
// (or is required), and returns the initial state to store on the leave.
// ─────────────────────────────────────────────────────────────────────────────
async function initWorkflow(employeeId, oId) {
  const workflow = await getOrgWorkflow(oId);
  const levels = workflow.levels;

  if (!levels.length) {
    // No levels configured → immediate approval (admin bypass)
    return { status: 'pending_approval', workflow_id: workflow.id, current_level: null, current_approver_id: null };
  }

  for (const level of levels) {
    const { userId } = await resolveApprover(level, employeeId, oId);
    const isResolvable = userId !== null || ['hr_admin', 'root_admin'].includes(level.role_type);

    // Skip optional levels with no resolvable approver
    if (!isResolvable && !level.is_required) continue;

    return {
      status:              'pending_approval',
      workflow_id:         workflow.id,
      current_level:       level.level_number,
      current_approver_id: userId,
    };
  }

  // All levels were skippable — use first required level or first level
  const fallback = levels.find(l => l.is_required) || levels[0];
  const { userId: fbUid } = await resolveApprover(fallback, employeeId, oId);
  return {
    status:              'pending_approval',
    workflow_id:         workflow.id,
    current_level:       fallback.level_number,
    current_approver_id: fbUid,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// findNextLevel
// Returns { level, approverId } for the next approver, or null (final approved).
// Skips optional levels with no resolvable approver.
// Does NOT perform any DB writes.
// ─────────────────────────────────────────────────────────────────────────────
async function findNextLevel(workflow, afterLevelNum, employeeId, oId) {
  const remaining = workflow.levels
    .filter(l => l.level_number > afterLevelNum)
    .sort((a, b) => a.level_number - b.level_number);

  for (const level of remaining) {
    const { userId } = await resolveApprover(level, employeeId, oId);
    const isResolvable = userId !== null || ['hr_admin', 'root_admin'].includes(level.role_type);

    if (!isResolvable && !level.is_required) {
      // Caller (route) should log the skip
      continue;
    }

    return { level, approverId: userId };
  }

  return null; // no more levels → final approval
}

// ─────────────────────────────────────────────────────────────────────────────
// getMyPendingLeaves
// Returns leaves that are currently pending THIS user's action.
// Used by /my-approvals endpoint.
// ─────────────────────────────────────────────────────────────────────────────
async function getMyPendingLeaves(userId, userRole, oId) {
  // We need to join leaves → workflow_levels to check role_type
  const { rows } = await pool.query(
    `SELECT
       l.*,
       u.name, u.email, u.department, u.avatar_color, u.position,
       wl.role_type      AS current_level_role_type,
       wl.level_label    AS current_level_label
     FROM leaves l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN leave_workflow_levels wl
       ON wl.workflow_id = l.workflow_id AND wl.level_number = l.current_level
     WHERE l.organization_id = $1
       AND l.status = 'pending_approval'
       AND l.workflow_id IS NOT NULL
       AND l.deleted_at IS NULL
       AND (
         -- Specific approver (reporting_manager / department_head / specific_user)
         (wl.role_type IN ('reporting_manager','department_head','specific_user')
          AND l.current_approver_id = $2)
         OR
         -- HR Admin: any admin or root_admin can action
         (wl.role_type = 'hr_admin' AND $3 = ANY(ARRAY['admin','root_admin']))
         OR
         -- Root Admin: only root_admin
         (wl.role_type = 'root_admin' AND $3 = 'root_admin')
       )
     ORDER BY l.created_at ASC`,
    [oId, userId, userRole]
  );

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// updateWorkflow
// Replace all levels for an org's active workflow.
// levels = [{ level_number, role_type, role_reference?, level_label?, is_required? }]
// ─────────────────────────────────────────────────────────────────────────────
async function updateWorkflow(oId, workflowName, newLevels) {
  let workflow = await getOrgWorkflow(oId);

  // Update name + timestamp
  const { error: wfErr } = await supabase
    .from('leave_workflows')
    .update({ workflow_name: workflowName || workflow.workflow_name, updated_at: new Date().toISOString() })
    .eq('id', workflow.id);
  if (wfErr) throw new Error('Failed to update workflow: ' + wfErr.message);

  // Delete existing levels
  const { error: delErr } = await supabase
    .from('leave_workflow_levels')
    .delete()
    .eq('workflow_id', workflow.id);
  if (delErr) throw new Error('Failed to delete old levels: ' + delErr.message);

  if (!newLevels.length) {
    return { ...workflow, workflow_name: workflowName || workflow.workflow_name, levels: [] };
  }

  // Insert new levels
  const { data: inserted, error: insErr } = await supabase
    .from('leave_workflow_levels')
    .insert(newLevels.map((l, i) => ({
      workflow_id:    workflow.id,
      level_number:   l.level_number ?? (i + 1),
      role_type:      l.role_type,
      role_reference: l.role_reference || null,
      level_label:    l.level_label    || null,
      is_required:    l.is_required    !== false,
    })))
    .select();
  if (insErr) throw new Error('Failed to insert new levels: ' + insErr.message);

  return {
    ...workflow,
    workflow_name: workflowName || workflow.workflow_name,
    levels: (inserted || []).sort((a, b) => a.level_number - b.level_number),
  };
}

module.exports = {
  getOrgWorkflow,
  resolveApprover,
  canUserApproveLevel,
  checkCanApprove,
  initWorkflow,
  findNextLevel,
  getMyPendingLeaves,
  updateWorkflow,
};
