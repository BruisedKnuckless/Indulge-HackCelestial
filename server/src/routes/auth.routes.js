import { Router } from 'express';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import Resource from '../models/Resource.js';
import Requirement from '../models/Requirement.js';
import { signToken, requireAuth } from '../middleware/auth.middleware.js';
import { asyncHandler, HttpError } from '../middleware/error.middleware.js';
import { validate, registerSchema, loginSchema } from '../middleware/validate.middleware.js';
import { getSafePublicBadges } from '../services/verification.service.js';

export function resolveDefaultCoordinates(loc) {
  if (Array.isArray(loc?.coordinates) && loc.coordinates.length === 2 && !isNaN(loc.coordinates[0]) && !isNaN(loc.coordinates[1])) {
    return [Number(loc.coordinates[0]), Number(loc.coordinates[1])];
  }
  if (loc?.longitude !== undefined && loc?.latitude !== undefined && !isNaN(loc.longitude) && !isNaN(loc.latitude)) {
    return [Number(loc.longitude), Number(loc.latitude)];
  }
  const text = `${loc?.city || ''} ${loc?.address || ''} ${loc?.formattedAddress || ''} ${loc?.state || ''}`.toLowerCase();
  if (text.includes('mumbai') || text.includes('bombay') || text.includes('andheri') || text.includes('bkc') || text.includes('bandra') || text.includes('juhu') || text.includes('powai')) {
    return [72.8777, 19.0760];
  }
  if (text.includes('navi mumbai') || text.includes('vashi') || text.includes('belapur') || text.includes('mahape')) {
    return [73.0297, 19.0330];
  }
  if (text.includes('kalyan')) return [73.1355, 19.2437];
  if (text.includes('dombivli')) return [73.0970, 19.2144];
  if (text.includes('bhiwandi')) return [73.0631, 19.2967];
  if (text.includes('pune')) return [73.8567, 18.5204];
  if (text.includes('bengaluru') || text.includes('bangalore')) return [77.5946, 12.9716];
  if (text.includes('delhi') || text.includes('gurgaon') || text.includes('noida')) return [77.2090, 28.6139];
  if (text.includes('hyderabad')) return [78.4867, 17.3850];
  if (text.includes('chennai')) return [80.2707, 13.0827];
  if (text.includes('kolkata')) return [88.3639, 22.5726];
  if (text.includes('ahmedabad')) return [72.5714, 23.0225];
  // Default to central MMR / Thane hub
  return [72.9781, 19.2183];
}

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
      gstin,
      notGstRegistered,
      udyamNumber,
      constitution,
      cin,
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

    const resolvedGstin = (gstin || gstNumber || '').trim().toUpperCase() || undefined;
    const isNotGst = Boolean(notGstRegistered);
    const resolvedUdyam = (udyamNumber || '').trim().toUpperCase() || undefined;

    if (resolvedGstin && resolvedGstin.length !== 15) {
      throw new HttpError(400, 'GSTIN must be a 15-character alphanumeric number.');
    }

    let initialVerificationStatus = 'unverified';
    const initialMethods = [];
    let initialGstVerification = undefined;
    let initialUdyamVerification = undefined;

    if (resolvedGstin) {
      initialVerificationStatus = 'pending';
      initialGstVerification = {
        gstin: resolvedGstin,
        status: 'pending',
        source: 'manual',
      };
    }

    if (resolvedUdyam) {
      if (initialVerificationStatus === 'unverified') initialVerificationStatus = 'pending';
      initialUdyamVerification = {
        udyamNumber: resolvedUdyam,
        status: 'pending',
        source: 'manual',
      };
    }

    let normalizedLocation = undefined;
    if (location && typeof location === 'object') {
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
        coordinates: resolveDefaultCoordinates(location),
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
          coordinates: resolveDefaultCoordinates(hubLocation),
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
      gstNumber: resolvedGstin,
      gstin: resolvedGstin,
      notGstRegistered: isNotGst,
      udyamNumber: resolvedUdyam,
      constitution,
      cin,
      verificationStatus: initialVerificationStatus,
      verificationMethods: initialMethods,
      verificationSource: null,
      isDemoBusiness: false,
      contactVerified: false,
      businessVerified: false,
      payoutVerified: false,
      gstVerification: initialGstVerification,
      udyamVerification: initialUdyamVerification,
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
      'gstin',
      'udyamNumber',
      'constitution',
      'preferences',
      'logisticsProfile',
    ];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'gstin') {
          const val = (req.body.gstin || '').trim().toUpperCase();
          req.user.gstin = val;
          req.user.gstNumber = val;
          if (val && req.user.verificationStatus === 'unverified') {
            req.user.verificationStatus = 'pending';
            req.user.gstVerification = {
              gstin: val,
              status: 'pending',
              source: 'manual',
            };
          }
        } else if (key === 'udyamNumber') {
          const val = (req.body.udyamNumber || '').trim().toUpperCase();
          req.user.udyamNumber = val;
        } else if (key === 'logisticsProfile' && typeof req.body[key] === 'object' && req.body[key] !== null) {
          req.user.logisticsProfile = {
            ...(req.user.logisticsProfile?.toObject?.() || req.user.logisticsProfile || {}),
            ...req.body.logisticsProfile,
          };
        } else if (key === 'location' && typeof req.body[key] === 'object' && req.body[key] !== null) {
          const loc = req.body.location;
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
            coordinates: resolveDefaultCoordinates({
              ...loc,
              coordinates: loc.coordinates || req.user.location?.coordinates,
            }),
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
 * Only exposes verified public badges.
 * Never exposes: email, phone, passwordHash, gstNumber, gstin, gstVerification, udyamNumber, preferences, internal notes.
 */
router.get(
  '/users/:id/public',
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
      .select('businessName businessType location ratingAvg ratingCount createdAt verificationStatus verificationMethods businessVerified payoutVerified isDemoBusiness gstVerification.status udyamVerification.status')
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

    const safeBadges = getSafePublicBadges(user);
    const isDemoVerified = Boolean(user.isDemoBusiness && (user.verificationStatus === 'verified' || user.businessVerified));
    const isVerified = Boolean(user.businessVerified || user.verificationStatus === 'verified');
    const isGstVerified = Boolean(user.verificationMethods?.includes('gst') && user.gstVerification?.status === 'verified');
    const isUdyamVerified = Boolean(user.verificationMethods?.includes('udyam') && user.udyamVerification?.status === 'verified');
    const isPayoutVerified = Boolean(user.payoutVerified);

    res.json({
      profile: {
        _id: user._id,
        businessName: user.businessName,
        businessType: user.businessType || 'other',
        city: user.location?.city || null,
        ratingAvg: user.ratingAvg || 0,
        ratingCount: user.ratingCount || 0,
        isVerified,
        isDemoVerified,
        isGstVerified,
        isUdyamVerified,
        isPayoutVerified,
        verificationBadges: safeBadges,
        completedOrders,
        seekerCompletedOrders,
        activeListings,
        postedRequirements,
        memberSince: user.createdAt,
      },
      safeBadges,
      isVerifiedBusiness: isVerified,
      isDemoBusiness: isDemoVerified,
      verificationStatus: user.verificationStatus || 'unverified',
    });
  })
);

export default router;
