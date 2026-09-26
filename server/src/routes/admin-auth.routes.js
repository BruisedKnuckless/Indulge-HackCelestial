import { Router } from 'express';
import Admin from '../models/Admin.js';
import { signAdminToken, requireAdmin } from '../middleware/auth.middleware.js';
import { adminPasswordAllowed } from '../config/admin.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validate, loginSchema } from '../middleware/validate.middleware.js';

/**
 * Admin sign-in, separate from /api/auth. Looks only at the Admin collection,
 * so a business account can never sign in here and an admin can never sign in
 * at the business login.
 */
const router = Router();

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email: (email || '').toLowerCase() });

    // Same message either way so the endpoint can't be used to enumerate accounts.
    if (!admin || !admin.isActive || !(await admin.checkPassword(password || ''))) {
      throw new HttpError(401, 'Email or password is incorrect.');
    }

    if (!adminPasswordAllowed(password)) {
      throw new HttpError(
        403,
        'The published demo password is disabled for admin accounts in production. ' +
          'Set ADMIN_EMAIL and ADMIN_PASSWORD on the API service and redeploy.'
      );
    }

    res.json({ admin: admin.toJSON(), token: signAdminToken(admin) });
  })
);

router.get(
  '/me',
  requireAdmin,
  asyncHandler(async (req, res) => {
    res.json({ admin: req.admin.toJSON() });
  })
);

export default router;
