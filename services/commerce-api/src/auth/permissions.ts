// Proposed staff role rights (API_CONTRACT §11 Q3, ADMIN_SCREENS_BRIEF §0). TBC with the client:
// changing a role's rights is a one-line edit here, covered by the permissions tests.

export const ROLES = ["owner", "catalogue_manager", "marketing_editor", "operations", "support", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "catalogue.read",
  "catalogue.write",
  "catalogue.publish",
  "media.write",
  "campaigns.write",
  "campaigns.publish",
  "orders.read",
  "inventory.read",
  "inventory.adjust",
  "audit.read",
  "audit.comment",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = ["catalogue.read", "inventory.read", "audit.read"];
// Orders hold customer names, phones and addresses: only roles that serve customers see them.
const ORDERS: Permission[] = ["orders.read"];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  catalogue_manager: [...READ_ALL, "catalogue.write", "catalogue.publish", "media.write", "audit.comment"],
  // Marketing editors draft campaigns; publishing stays with the Owner until the client decides (HOMEPAGE_CAMPAIGNS_SPEC).
  marketing_editor: [...READ_ALL, "media.write", "campaigns.write", "audit.comment"],
  operations: [...READ_ALL, ...ORDERS, "inventory.adjust", "audit.comment"],
  support: [...READ_ALL, ...ORDERS, "audit.comment"],
  viewer: READ_ALL,
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...GRANTS[role]];
}
