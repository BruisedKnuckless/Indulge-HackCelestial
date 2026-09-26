import { env } from './env.js';
import Admin from '../models/Admin.js';

/**
 * Platform-admin identity.
 *
 * Admins are their own accounts in their own collection (models/Admin.js),
 * signed in at /admin/login with their own token type. They are NOT business
 * Users: every User in this marketplace is both provider and seeker depending
 * on context, and an administrator is neither — it manages business data from
 * the console without ever taking part in the marketplace.
 *
 * Accounts come from two places:
 *   - the seed, which upserts the development admin (admin@indulge.com);
 *   - ADMIN_EMAIL + ADMIN_PASSWORD on the API service, upserted at every boot,
 *     which is how a production deployment gets its administrator.
 */

/**
 * Every seeded account, the development admin included, uses this password,
 * and it is published in the README. On a public deployment it would make the
 * console administrable by anyone who read the repo, so production refuses it
 * at login no matter which admin account carries it.
 */
export const PUBLISHED_DEMO_PASSWORD = 'indulge123';

/**
 * Accepted names for the bootstrap email. ADMIN_EMAIL is canonical; the plural
 * is the variable earlier versions of this app used, and a deployment that
 * still sets it should keep working once ADMIN_PASSWORD is added. Only the
 * first address of a comma-separated list is used.
 */
const EMAIL_KEYS = ['ADMIN_EMAIL', 'ADMIN_EMAILS'];

const firstEmail = (raw) =>
  (raw || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)[0] || null;

/** Is this password acceptable for an admin sign-in in the given environment? */
export function adminPasswordAllowed(password, nodeEnv = env.nodeEnv) {
  return !(nodeEnv === 'production' && password === PUBLISHED_DEMO_PASSWORD);
}

/**
 * The admin account the environment asks for, or null. Pure, so the rules can
 * be checked without booting a server.
 */
export function readBootstrapAdmin(vars = process.env, nodeEnv = env.nodeEnv) {
  let email = null;
  let source = null;
  for (const key of EMAIL_KEYS) {
    email = firstEmail(vars[key]);
    if (email) {
      source = key;
      break;
    }
  }
  const password = vars.ADMIN_PASSWORD || '';

  if (!email) return null;
  if (!password) {
    return { email, source, error: `${source} is set but ADMIN_PASSWORD is not.` };
  }
  if (!adminPasswordAllowed(password, nodeEnv)) {
    return { email, source, error: 'ADMIN_PASSWORD is the published demo password, which production refuses.' };
  }
  return { email, source, password, name: (vars.ADMIN_NAME || '').trim() || 'Platform Admin' };
}

/**
 * Create or update the environment's admin account. Idempotent: one account
 * per email however many times the service restarts, and the password follows
 * ADMIN_PASSWORD so rotating it is a redeploy rather than a database edit.
 */
export async function ensureBootstrapAdmin(vars = process.env) {
  const wanted = readBootstrapAdmin(vars);
  if (!wanted || wanted.error) return wanted;

  const existing = await Admin.findOne({ email: wanted.email });
  if (!existing) {
    await Admin.create({
      name: wanted.name,
      email: wanted.email,
      passwordHash: await Admin.hashPassword(wanted.password),
      role: 'super_admin',
    });
    return { ...wanted, action: 'created' };
  }

  if (!(await existing.checkPassword(wanted.password)) || !existing.isActive) {
    existing.passwordHash = await Admin.hashPassword(wanted.password);
    existing.isActive = true;
    await existing.save();
    return { ...wanted, action: 'updated' };
  }
  return { ...wanted, action: 'unchanged' };
}

/**
 * Why the console is or is not reachable, for the boot banner.
 *
 * A request without an admin token gets 401/404 from /api/admin by design,
 * which is indistinguishable from a bug when you are staring at a deployment.
 * Saying it out loud once at startup is the difference between a two-minute
 * fix and an afternoon.
 */
export async function adminConfigStatus(bootstrap = readBootstrapAdmin()) {
  const active = await Admin.countDocuments({ isActive: true });
  const notes = [];

  if (bootstrap?.error) notes.push(`Admin bootstrap skipped — ${bootstrap.error}`);
  else if (bootstrap) notes.push(`Admin account ${bootstrap.email} ensured (from ${bootstrap.source}).`);

  if (!active) {
    notes.push(
      'Admin console is LOCKED — there are no admin accounts. Set ADMIN_EMAIL and ' +
        'ADMIN_PASSWORD on this service and redeploy, then sign in at /admin/login.'
    );
    return { state: 'locked', active, message: notes.join(' ') };
  }

  notes.push(`Admin console enabled — ${active} admin account(s); sign in at /admin/login.`);
  if (env.isProduction) notes.push('The published demo password is refused in production.');
  return { state: 'enabled', active, message: notes.join(' ') };
}

/** Prints the banner. Called once from server.js after the port is bound. */
export async function logAdminConfig(bootstrap, log = console.log) {
  const { state, message } = await adminConfigStatus(bootstrap);
  const mark = state === 'locked' ? '!' : '✓';
  log(`  ${mark} ${message}`);
}
