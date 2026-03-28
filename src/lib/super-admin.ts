export const SUPER_ADMIN_FAKE_ID = "__super_admin__";
const DEFAULT_SUPER_ADMIN_USERNAME = "admin";

export function getSuperAdminUsername(): string {
  const value = process.env.SUPERADMIN_USERNAME?.trim();
  return value || DEFAULT_SUPER_ADMIN_USERNAME;
}

export function isSuperAdminIdentifier(identifier: string): boolean {
  return identifier.trim().toLowerCase() === getSuperAdminUsername().toLowerCase();
}

export function isSuperAdminUserId(userId: string | null | undefined): boolean {
  return userId === SUPER_ADMIN_FAKE_ID;
}

export function hasSuperAdminPasswordConfigured(): boolean {
  return Boolean(process.env.SUPERADMIN_PASSWORD_HASH || process.env.SUPERADMIN_PASSWORD);
}
