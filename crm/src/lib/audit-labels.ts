/**
 * Readable names for audit actions.
 *
 * The audit log stores stable codes so that a rename never breaks history;
 * this turns them into something an ordinary staff member can read. Anything
 * not listed falls back to a humanised form of the code rather than showing
 * nothing, so a new action is never invisible.
 */
const LABELS: Record<string, string> = {
  'setup.completed': 'Completed first-time setup',
  'user.invitation_accepted': 'Accepted an invitation',
  'user.password_changed': 'Changed their password',
  'user.invited': 'Invited a user',
  'user.role_changed': 'Changed a user role',
  'user.status_changed': 'Changed a user status',

  'person.created': 'Created this client',
  'person.updated': 'Updated this client',
  'person.archived': 'Archived this client',
  'person.restored': 'Restored this client',
  'person.identity_recorded': 'Recorded an identity document',
  'person.agent_assigned': 'Changed the agent assignment',
  'person.relationship_added': 'Added a relationship',
  'person.relationship_removed': 'Removed a relationship',
  'person.merged': 'Merged two records',
  'duplicate.dismissed': 'Marked a pair as not a duplicate',
};

export function describeAuditAction(action: string): string {
  const known = LABELS[action];
  if (known) return known;
  // 'property.price_changed' -> 'Property price changed'
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** 'first_name' -> 'First name', for the list of fields that changed. */
export function describeField(field: string): string {
  const words = field.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
