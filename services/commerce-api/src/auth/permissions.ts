// Proposed staff role rights (API_CONTRACT §11 Q3, ADMIN_SCREENS_BRIEF §0). TBC with the client:
// changing a role's rights is a one-line edit here, covered by the permissions tests.

export const ROLES = ["owner", "catalogue_manager", "marketing_editor", "operations", "support", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "catalogue.read",
  "catalogue.write",
  "catalogue.publish",
  "inventory.read",
  "inventory.adjust",
  "audit.read",
  "audit.comment",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = ["catalogue.read", "inventory.read", "audit.read"];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  catalogue_manager: [...READ_ALL, "catalogue.write", "catalogue.publish", "audit.comment"],
  marketing_editor: [...READ_ALL, "audit.comment"],
  operations: [...READ_ALL, "inventory.adjust", "audit.comment"],
  support: [...READ_ALL, "audit.comment"],
  viewer: READ_ALL,
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...GRANTS[role]];
}
