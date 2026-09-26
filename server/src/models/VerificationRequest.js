import mongoose from 'mongoose';
import { RESOURCE_CATEGORIES } from './Resource.js';

export const VERIFICATION_STATUSES = [
  'pending',
  'assigned',
  'scheduled',
  'in_progress',
  'submitted',
  'under_review',
  'verified',
  'conditionally_verified',
  'rejected',
];

export const ISSUE_FLAGS = ['none', 'minor', 'major'];

const parameterResultSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, default: 'physical' },
    weight: { type: Number, required: true, min: 0, max: 1, default: 0.125 },
    ratingScale: { type: Number, default: 5 },
    required: { type: Boolean, default: true },
    evidenceRequired: { type: Boolean, default: false },
    rating: { type: Number, min: 1, max: 5, default: null },
    notes: { type: String, default: '' },
    photos: [{ type: String }],
    issueFlag: { type: String, enum: ISSUE_FLAGS, default: 'none' },
    issueDescription: { type: String, default: '' },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    caption: { type: String, default: '' },
    parameterId: { type: String, default: null },
    issueLevel: { type: String, enum: ['none', 'minor', 'major'], default: 'none' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const verificationRequestSchema = new mongoose.Schema(
  {
    inspectionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => `INS-${Math.floor(1000 + Math.random() * 9000)}`,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: true,
      index: true,
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: RESOURCE_CATEGORIES,
      required: true,
      index: true,
    },
    resourceName: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: VERIFICATION_STATUSES,
      default: 'pending',
      index: true,
    },
    generatedTemplateId: { type: String, default: null },
    parameters: [parameterResultSchema],

    assignedTechnician: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, default: 'Rahul Sharma' },
      badge: { type: String, default: 'Senior Field Inspector' },
      phone: { type: String, default: '+91 98200 99001' },
    },

    generatedAt: { type: Date, default: Date.now },
    scheduledAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // Default next day
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    finalScore: { type: Number, min: 0, max: 100, default: null },
    conditionStatus: {
      type: String,
      enum: ['Excellent', 'Good', 'Fair', 'Needs Attention', 'Poor', null],
      default: null,
    },

    recommendedPrice: {
      basePrice: { type: Number, default: null },
      lowerBound: { type: Number, default: null },
      upperBound: { type: Number, default: null },
      score: { type: Number, default: null },
      explanation: { type: String, default: '' },
      generatedAt: { type: Date, default: null },
    },

    verificationLevel: {
      type: String,
      enum: ['Indulge Verified', 'Conditionally Verified', 'Rejected', null],
      default: null,
    },
    inspectorNotes: { type: String, default: '' },

    evidence: [evidenceSchema],

    location: {
      address: { type: String, default: '' },
      city: { type: String, default: 'Mumbai' },
    },
    quantity: { type: Number, default: 1 },
    listedPrice: { type: Number, default: 0 },
    priceUnit: { type: String, default: 'per_day' },
  },
  { timestamps: true }
);

verificationRequestSchema.index({ status: 1, scheduledAt: 1 });
verificationRequestSchema.index({ provider: 1, createdAt: -1 });

export default mongoose.model('VerificationRequest', verificationRequestSchema);
