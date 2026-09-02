import { Router } from 'express';
import User from '../models/User.js';
import { signToken, requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';

const router = Router();

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { businessName, email, password, phone, businessType, location, gstNumber } = req.body;

    if (!businessName || !email || !password) {
      throw new HttpError(400, 'Business name, email and password are required.');
    }
    if (password.length < 6) {
      throw new HttpError(400, 'Passwords must be at least 6 characters.');
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new HttpError(409, 'An account already exists with that email.');

    const user = await User.create({
      businessName,
      email: email.toLowerCase(),
      passwordHash: await User.hashPassword(password),
      phone,
      businessType,
      gstNumber,
      location,
    });

    res.status(201).json({ user, token: signToken(user._id) });
  })
);

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });

    // Same message either way so the endpoint can't be used to enumerate accounts.
    if (!user || !(await user.checkPassword(password || ''))) {
      throw new HttpError(401, 'Email or password is incorrect.');
    }

    res.json({ user, token: signToken(user._id) });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ user: req.user });
  })
);

router.patch(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const allowed = ['businessName', 'phone', 'businessType', 'location', 'gstNumber', 'preferences'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) req.user[key] = req.body[key];
    }
    await req.user.save();
    res.json({ user: req.user });
  })
);

export default router;
