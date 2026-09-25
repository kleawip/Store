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
  "orders.manage",
  "orders.refund",
  "discounts.read",
  "discounts.manage",
  "reports.read",
  "inventory.read",
  "inventory.adjust",
  "audit.read",
  "audit.comment",
  "staff.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const READ_ALL: Permission[] = ["catalogue.read", "inventory.read", "audit.read"];
// Sales and GST reports (revenue) are Owner-only until the client decides otherwise.
// Orders hold customer names, phones and addresses: only roles that serve customers see them.
const ORDERS: Permission[] = ["orders.read"];

const GRANTS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  catalogue_manager: [...READ_ALL, "catalogue.write", "catalogue.publish", "media.write", "audit.comment"],
  // Marketing editors draft campaigns; publishing stays with the Owner until the client decides (HOMEPAGE_CAMPAIGNS_SPEC).
  // Discount codes cost money: everyone who talks to customers can see them; only the Owner creates or changes them (TBC).
  marketing_editor: [...READ_ALL, "media.write", "campaigns.write", "discounts.read", "audit.comment"],
  // Operations run fulfilment; refunds and cancelling paid orders stay with the Owner (TBC with the client).
  operations: [...READ_ALL, ...ORDERS, "orders.manage", "inventory.adjust", "discounts.read", "audit.comment"],
  support: [...READ_ALL, ...ORDERS, "discounts.read", "audit.comment"],
  viewer: READ_ALL,
};

export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...GRANTS[role]];
}
