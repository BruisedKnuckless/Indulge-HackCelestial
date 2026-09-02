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
    gstNumber: { type: String, trim: true },
    location: {
      address: String,
      city: String,
      pincode: String,
      // GeoJSON [lng, lat] — order matters to MongoDB.
      coordinates: { type: [Number], default: undefined },
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
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
