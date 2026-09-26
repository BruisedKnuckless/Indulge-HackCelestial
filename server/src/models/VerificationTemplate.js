import mongoose from 'mongoose';
import { RESOURCE_CATEGORIES } from './Resource.js';

const parameterDefinitionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ['physical', 'electrical', 'safety', 'documentation', 'cosmetic', 'performance', 'operational'],
      default: 'physical',
    },
    weight: { type: Number, required: true, min: 0, max: 1, default: 0.125 },
    ratingScale: { type: Number, default: 5 },
    required: { type: Boolean, default: true },
    evidenceRequired: { type: Boolean, default: false },
    minAcceptableScore: { type: Number, default: 3 },
  },
  { _id: false }
);

const verificationTemplateSchema = new mongoose.Schema(
  {
    templateId: { type: String, required: true, unique: true, index: true },
    category: { type: String, enum: RESOURCE_CATEGORIES, required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    version: { type: String, default: '1.0.0' },
    resourceTypeKeywords: [{ type: String, lowercase: true, trim: true }],
    parameters: [parameterDefinitionSchema],
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

verificationTemplateSchema.index({ category: 1, isDefault: 1 });

export default mongoose.model('VerificationTemplate', verificationTemplateSchema);
