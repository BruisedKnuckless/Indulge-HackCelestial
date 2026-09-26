import { Router } from 'express';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
import { signToken, requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validate, registerSchema, loginSchema } from '../middleware/validate.middleware.js';

const router = Router();

router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const {
      businessName,
      email,
      password,
      phone,
      businessType,
      customBusinessType,
      location,
      gstNumber,
      userType,
      logisticsProfile,
    } = req.body;

    if (!businessName || !email || !password) {
      throw new HttpError(400, 'Business name, email and password are required.');
    }
    if (password.length < 6) {
      throw new HttpError(400, 'Passwords must be at least 6 characters.');
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new HttpError(409, 'An account already exists with that email.');

    let normalizedLocation = undefined;
    if (location && typeof location === 'object') {
      let coords = location.coordinates;
      if (!coords && location.longitude !== undefined && location.latitude !== undefined) {
        coords = [Number(location.longitude), Number(location.latitude)];
      }
      normalizedLocation = {
        type: 'Point',
        address: location.address || location.formattedAddress || '',
        formattedAddress: location.formattedAddress || location.address || '',
        addressLine2: location.addressLine2 || '',
        city: location.city || '',
        state: location.state || '',
        pincode: location.pincode || location.postalCode || '',
        postalCode: location.postalCode || location.pincode || '',
        placeId: location.placeId || '',
        coordinates: Array.isArray(coords) && coords.length === 2 ? coords.map(Number) : undefined,
      };
    }

    let normalizedLogisticsProfile = undefined;
    if (userType === 'logistics_partner') {
      const lp = logisticsProfile || {};
      let serviceArea = lp.serviceArea;
      if (typeof serviceArea === 'string') {
        serviceArea = serviceArea.split(',').map((s) => s.trim()).filter(Boolean);
      } else if (!Array.isArray(serviceArea)) {
        serviceArea = [];
      }

      let hubLocation = lp.hubLocation || normalizedLocation;
      if (hubLocation && typeof hubLocation === 'object') {
        let hubCoords = hubLocation.coordinates;
        if (!hubCoords && hubLocation.longitude !== undefined && hubLocation.latitude !== undefined) {
          hubCoords = [Number(hubLocation.longitude), Number(hubLocation.latitude)];
        }
        hubLocation = {
          type: 'Point',
          address: hubLocation.address || hubLocation.formattedAddress || '',
          formattedAddress: hubLocation.formattedAddress || hubLocation.address || '',
          addressLine2: hubLocation.addressLine2 || '',
          city: hubLocation.city || '',
          state: hubLocation.state || '',
          pincode: hubLocation.pincode || hubLocation.postalCode || '',
          postalCode: hubLocation.postalCode || hubLocation.pincode || '',
          placeId: hubLocation.placeId || '',
          coordinates: Array.isArray(hubCoords) && hubCoords.length === 2 ? hubCoords.map(Number) : undefined,
        };
      }

      normalizedLogisticsProfile = {
        serviceArea,
        hubLocation,
        operatingStatus: lp.operatingStatus || 'active',
        vehicleInfo: lp.vehicleInfo || {},
        capacityDescription: lp.capacityDescription || '',
        completedJobs: lp.completedJobs || 0,
        rating: lp.rating || 5.0,
      };
    }

    const resolvedBusinessType = userType === 'logistics_partner' ? 'other' : (businessType || 'other');

    const user = await User.create({
      businessName,
      email: email.toLowerCase(),
      passwordHash: await User.hashPassword(password),
      phone,
      businessType: resolvedBusinessType,
      customBusinessType: resolvedBusinessType === 'other' ? customBusinessType : undefined,
      gstNumber,
      location: normalizedLocation,
      userType: userType === 'logistics_partner' ? 'logistics_partner' : 'business',
      logisticsProfile: normalizedLogisticsProfile,
    });

    res.status(201).json({ user: user, token: signToken(user._id) });
  })
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || '').toLowerCase() });

    // Same message either way so the endpoint can't be used to enumerate accounts.
    if (!user || !(await user.checkPassword(password || ''))) {
      throw new HttpError(401, 'Email or password is incorrect.');
    }

    // Fail here with a readable reason rather than handing out a token that
    // would be rejected by requireAuth on the very next request.
    if (user.suspended) {
      throw new HttpError(
        403,
        user.suspensionReason
          ? `This account is suspended: ${user.suspensionReason}`
          : 'This account has been suspended by the platform.'
      );
    }

    res.json({ user: user, token: signToken(user._id) });
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
    const allowed = [
      'businessName',
      'phone',
      'businessType',
      'customBusinessType',
      'location',
      'gstNumber',
      'preferences',
      'logisticsProfile',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'logisticsProfile' && typeof req.body[key] === 'object' && req.body[key] !== null) {
          req.user.logisticsProfile = {
            ...(req.user.logisticsProfile?.toObject?.() || req.user.logisticsProfile || {}),
            ...req.body.logisticsProfile,
          };
        } else if (key === 'location' && typeof req.body[key] === 'object' && req.body[key] !== null) {
          const loc = req.body.location;
          let coords = loc.coordinates;
          if (!coords && loc.longitude !== undefined && loc.latitude !== undefined) {
            coords = [Number(loc.longitude), Number(loc.latitude)];
          }
          req.user.location = {
            type: 'Point',
            address: loc.address || loc.formattedAddress || req.user.location?.address || '',
            formattedAddress: loc.formattedAddress || loc.address || req.user.location?.formattedAddress || '',
            addressLine2: loc.addressLine2 !== undefined ? loc.addressLine2 : req.user.location?.addressLine2,
            city: loc.city || req.user.location?.city || '',
            state: loc.state || req.user.location?.state || '',
            pincode: loc.pincode || loc.postalCode || req.user.location?.pincode || '',
            postalCode: loc.postalCode || loc.pincode || req.user.location?.postalCode || '',
            placeId: loc.placeId || req.user.location?.placeId || '',
            coordinates: Array.isArray(coords) && coords.length === 2 ? coords.map(Number) : req.user.location?.coordinates,
          };
        } else {
          req.user[key] = req.body[key];
        }
      }
    }
    if (req.user.businessType !== 'other') {
      req.user.customBusinessType = undefined;
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
