import User from '../../models/User.js';
import { HttpError } from '../../middleware/error.middleware.js';
import { resolveDefaultCoordinates } from '../../utils/location.js';

const INDULGE_HQ = { type: 'Point', address: 'Indulge HQ', city: 'Mumbai', coordinates: [72.9051, 19.1176] };

/**
 * Creates a technician (a User with userType 'inspector'). Shared by admin
 * creation and public self-registration so both produce the same account.
 * Callers validate their own input; this only enforces email uniqueness.
 */
export async function createTechnicianAccount({ name, email, password, phone, title, employeeId, city }) {
  const displayName = String(name).trim();
  const normalisedEmail = String(email).trim().toLowerCase();
  if (await User.exists({ email: normalisedEmail })) {
    throw new HttpError(409, 'An account with that email already exists.');
  }

  const cityName = String(city || '').trim();
  let location;
  if (cityName) {
    location = { type: 'Point', address: cityName, city: cityName, coordinates: resolveDefaultCoordinates({ city: cityName }) };
  } else {
    const hq = await User.findOne({ userType: 'inspector' }).select('location').lean();
    location = hq?.location?.coordinates?.length ? hq.location : INDULGE_HQ;
  }

  return User.create({
    businessName: displayName,
    email: normalisedEmail,
    passwordHash: await User.hashPassword(password),
    phone,
    businessType: 'other',
    customBusinessType: 'Indulge inspection team',
    userType: 'inspector',
    inspectorProfile: { displayName, title: title || 'Field Technician', employeeId },
    location,
  });
}
