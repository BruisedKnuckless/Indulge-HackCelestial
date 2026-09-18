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
 * Set ADMIN_EMAILS to a comma-separated list of existing account emails.
 */

/**
 * Fallback for local development only.
 *
 * This account's password is published in the README, so handing it the console
 * on a public deployment would make the whole platform administrable by anyone
 * who read the repo. Production therefore requires ADMIN_EMAILS to be set
 * explicitly — see adminEmails() below.
 */
const DEFAULT_ADMIN_EMAILS = ['ops@grandorchid.in'];

export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const isProduction = () => env.nodeEnv === 'production';

/** Resolved allowlist — configured value wins, demo account is the fallback. */
export function adminEmails() {
  if (ADMIN_EMAILS.length) return ADMIN_EMAILS;
  return isProduction() ? [] : DEFAULT_ADMIN_EMAILS;
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

/**
 * Why the console is or is not reachable, for the boot banner.
 *
 * A locked console answers 404 to every request so it is not advertised, which
 * is correct but indistinguishable from a bug when you are staring at a
 * deployment. Saying it out loud once at startup is the difference between a
 * two-minute fix and an afternoon.
 */
export function adminConfigStatus() {
  if (ADMIN_EMAILS.length) {
    return {
      state: 'configured',
      emails: ADMIN_EMAILS,
      message: `Admin console enabled for: ${ADMIN_EMAILS.join(', ')}`,
    };
  }
  if (isProduction()) {
    return {
      state: 'locked',
      emails: [],
      message:
        'Admin console is LOCKED — ADMIN_EMAILS is not set and NODE_ENV=production. ' +
        '/api/admin answers 404 and /admin will bounce to the homepage for every account. ' +
        'Set ADMIN_EMAILS=you@yourbusiness.com on this service and redeploy to enable it.',
    };
  }
  return {
    state: 'development-fallback',
    emails: DEFAULT_ADMIN_EMAILS,
    message: `Admin console enabled for the demo account (${DEFAULT_ADMIN_EMAILS.join(', ')}) because ADMIN_EMAILS is unset and this is not production. Set ADMIN_EMAILS before deploying.`,
  };
}

/** Prints the banner. Called once from server.js after the port is bound. */
export function logAdminConfig(log = console.log) {
  const { state, message } = adminConfigStatus();
  const mark = state === 'locked' ? '!' : '✓';
  log(`  ${mark} ${message}`);
}
