import LogisticsJob from '../models/LogisticsJob.js';
import User from '../models/User.js';
import Resource, { doesResourceRequireLogistics } from '../models/Resource.js';

/**
 * Automatically creates a LogisticsJob for physical transport bookings if one does not already exist.
 */
export async function ensureLogisticsJobForBooking(booking) {
  if (!booking) return null;
  const resource = booking.resource?.category ? booking.resource : await Resource.findById(booking.resource);
  if (!resource || !doesResourceRequireLogistics(resource, booking)) return null;

  const existing = await LogisticsJob.findOne({ booking: booking._id });
  if (existing) return existing;

  const [providerUser, seekerUser] = await Promise.all([
    User.findById(booking.provider),
    User.findById(booking.seeker),
  ]);

  const pickupLocation = {
    address: resource.location?.address || providerUser?.location?.address || 'Provider Facility',
    city: resource.location?.city || providerUser?.location?.city || 'Mumbai',
    pincode: providerUser?.location?.pincode,
    coordinates: resource.location?.coordinates || providerUser?.location?.coordinates,
  };

  const deliveryLocation = {
    address: seekerUser?.location?.address || 'Seeker Facility',
    city: seekerUser?.location?.city || 'Mumbai',
    pincode: seekerUser?.location?.pincode,
    coordinates: seekerUser?.location?.coordinates,
  };

  const job = await LogisticsJob.create({
    booking: booking._id,
    seeker: booking.seeker,
    provider: booking.provider,
    resource: resource._id,
    quantity: booking.requestedQuantity || 1,
    pickupLocation,
    deliveryLocation,
    scheduledPickupTime: booking.startDateTime,
    requiredDeliveryTime: booking.startDateTime,
    returnRequired: resource.category !== 'kitchen_capacity' && resource.category !== 'staff',
    status: 'unassigned',
    timeline: [
      {
        status: 'unassigned',
        timestamp: new Date(),
        notes: 'Job initialized upon booking confirmation',
      },
    ],
  });

  return job;
}
