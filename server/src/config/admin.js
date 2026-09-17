import { env } from './env.js';

/**
 * Platform-admin identity.
 *
 * Deliberately NOT a field on User. Every account in this marketplace is both
 * provider and seeker depending on context, and several routes assume there is
 * no role column to branch on — see CLAUDE.md. Platform administration is a
 * different axis entirely: it is a property of the *deployment*, not of the
 * business record, so it lives in configuration.
 *
 * Set ADMIN_EMAILS to a comma-separated list. The demo login is the default so
 * the console is reachable on a fresh checkout with no .env at all.
 */
const DEFAULT_ADMIN_EMAILS = ['ops@grandorchid.in'];

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** Resolved allowlist — configured value wins, demo account is the fallback. */
export function adminEmails() {
  if (ADMIN_EMAILS.length) return ADMIN_EMAILS;
  // In production an unset allowlist should lock the console, not hand it to a
  // seeded demo account that everyone knows the password to.
  return env.nodeEnv === 'production' ? [] : DEFAULT_ADMIN_EMAILS;
}

export function isPlatformAdmin(user) {
  if (!user?.email) return false;
  return adminEmails().includes(String(user.email).toLowerCase());
}

/**
 * Session payload for the client. `isPlatformAdmin` is computed, never stored,
 * so revoking access is a config change and a re-login rather than a migration.
 */
export function sessionUser(user) {
  return { ...user.toJSON(), isPlatformAdmin: isPlatformAdmin(user) };
}
