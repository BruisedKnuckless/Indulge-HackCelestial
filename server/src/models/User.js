import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const BUSINESS_TYPES = [
  'hotel',
  'restaurant',
  'caterer',
  'banquet_venue',
  'resort',
  'event_organizer',
  'other',
];

const userSchema = new mongoose.Schema(
  {
    businessName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    phone: { type: String, trim: true },
    businessType: { type: String, enum: BUSINESS_TYPES, default: 'other' },
    customBusinessType: { type: String, trim: true },
    gstNumber: { type: String, trim: true },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      address: String,
      formattedAddress: String,
      addressLine2: String,
      city: String,
      state: String,
      pincode: String,
      postalCode: String,
      placeId: String,
      // GeoJSON [lng, lat] — order matters to MongoDB.
      coordinates: { type: [Number], default: undefined },
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },

    // Platform moderation. NOT a role — it says nothing about whether this
    // business provides or seeks, only whether it may transact at all. A
    // suspended account is rejected at requireAuth, so every route is covered
    // without each one having to remember the check.
    suspended: { type: Boolean, default: false, index: true },
    suspendedAt: Date,
    suspensionReason: String,

    // Account architecture: business (default) or logistics_partner.
    userType: {
      type: String,
      enum: ['business', 'logistics_partner'],
      default: 'business',
      index: true,
    },

    // Dedicated profile for logistics partner accounts.
    logisticsProfile: {
      serviceArea: [String],
      hubLocation: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point',
        },
        address: String,
        formattedAddress: String,
        addressLine2: String,
        city: String,
        state: String,
        pincode: String,
        postalCode: String,
        placeId: String,
        coordinates: { type: [Number], default: undefined },
      },
      operatingStatus: {
        type: String,
        enum: ['active', 'available', 'busy', 'offline'],
        default: 'active',
      },
      vehicleInfo: { type: mongoose.Schema.Types.Mixed },
      capacityDescription: { type: String, trim: true },
      completedJobs: { type: Number, default: 0 },
      rating: { type: Number, default: 5.0 },
    },

    preferences: {
      preferredProviders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      preferredResourceTypes: [String],
    },
  },
  { timestamps: true }
);

userSchema.index({ 'location.coordinates': '2dsphere' });

userSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

userSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

// Never leak the hash through res.json().
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('User', userSchema);
