import { Router } from 'express';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
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

/**
 * Public business profile — safe for unauthenticated access.
 * Never exposes: email, phone, passwordHash, gstNumber, preferences.
 */
router.get(
  '/users/:id/public',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .select('businessName businessType location ratingAvg ratingCount createdAt')
      .lean();

    if (!user) throw new HttpError(404, 'Business not found.');

    // Derive live counts from related collections — no fabrication.
    const [completedOrders, seekerCompletedOrders, activeListings, postedRequirements] =
      await Promise.all([
        Booking.countDocuments({ provider: user._id, status: 'completed' }),
        Booking.countDocuments({ seeker: user._id, status: 'completed' }),
        Resource.countDocuments({ owner: user._id, status: 'active' }),
        Requirement.countDocuments({ seeker: user._id, status: { $in: ['open', 'fulfilled'] } }),
      ]);

    res.json({
      profile: {
        _id: user._id,
        businessName: user.businessName,
        businessType: user.businessType || 'other',
        city: user.location?.city || null,
        ratingAvg: user.ratingAvg || 0,
        ratingCount: user.ratingCount || 0,
        completedOrders,
        seekerCompletedOrders,
        activeListings,
        postedRequirements,
        memberSince: user.createdAt,
      },
    });
  })
);

export default router;
