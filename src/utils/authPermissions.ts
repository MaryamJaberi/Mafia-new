import { User } from 'firebase/auth';

export const SUPER_ADMIN_EMAIL = 'm.jaberi1212@gmail.com';

/**
 * Checks whether the currently authenticated user is the designated Super Admin
 * who has exclusive access to QA test suites, test reports, and game content management.
 */
export function isSuperAdmin(user: User | null | undefined): boolean {
  if (!user || !user.email) return false;
  return user.email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
}
