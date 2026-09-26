import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

export const ADMIN_ROLES = ['super_admin', 'admin'];

/**
 * Platform administrator.
 *
 * Deliberately a separate collection from User. A User is a business on the
 * marketplace — it lists, seeks, carries a cart and is ranked in search. An
 * Admin is none of those things: it operates the platform and manages business
 * data from the console, but never takes part in the marketplace itself, so it
 * carries no business fields and can never surface as a provider or seeker.
 */
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ADMIN_ROLES, default: 'admin' },
    permissions: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

adminSchema.methods.checkPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

adminSchema.statics.hashPassword = function (plain) {
  return bcrypt.hash(plain, 10);
};

// Never leak the hash through res.json().
adminSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  return obj;
};

export default mongoose.model('Admin', adminSchema);
