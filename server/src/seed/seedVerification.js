import mongoose from 'mongoose';
import User from '../models/User.js';
import Resource from '../models/Resource.js';
import VerificationTemplate from '../models/VerificationTemplate.js';
import VerificationRequest from '../models/VerificationRequest.js';
import { DEFAULT_CATEGORY_TEMPLATES } from '../services/verification/guideline.service.js';
import { createVerificationForResource, submitInspection } from '../services/verification/verification.service.js';
import { logger } from '../utils/logger.js';

export async function seedVerificationData() {
  try {
    // 1. Seed or Upsert Verification Templates
    for (const [catKey, tpl] of Object.entries(DEFAULT_CATEGORY_TEMPLATES)) {
      await VerificationTemplate.updateOne(
        { templateId: tpl.templateId },
        {
          $set: {
            category: tpl.category,
            title: tpl.title,
            description: tpl.description,
            resourceTypeKeywords: tpl.resourceTypeKeywords,
            parameters: tpl.parameters,
            isDefault: true,
            isActive: true,
          },
        },
        { upsert: true }
      );
    }

    // 2. Ensure dedicated Field Inspector user exists
    const inspectorEmail = 'inspector@indulge.com';
    let inspector = await User.findOne({ email: inspectorEmail });
    if (!inspector) {
      const passwordHash = await User.hashPassword('indulge123');
      inspector = await User.create({
        businessName: 'Rahul Sharma (Senior Field Inspector)',
        email: inspectorEmail,
        passwordHash,
        phone: '+91 98200 99001',
        businessType: 'other',
        userType: 'inspector',
        location: {
          address: 'Indulge HQ, Powai',
          city: 'Mumbai',
          coordinates: [72.9051, 19.1176],
        },
      });
      logger.info('Created default field inspector account:', { email: inspectorEmail });
    }

    // 3. Check existing resources and create verification requests if missing
    const resources = await Resource.find({ status: { $ne: 'archived' } }).limit(10);
    for (let i = 0; i < resources.length; i++) {
      const r = resources[i];
      let vr = await VerificationRequest.findOne({ resource: r._id });
      if (!vr) {
        vr = await createVerificationForResource(r, null);
      }

      // Populate realistic sample states for demonstration
      if (vr && vr.status === 'pending') {
        if (i === 1) {
          // One scheduled
          vr.status = 'scheduled';
          vr.scheduledAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // Today in 4h
          await vr.save();
        } else if (i === 2) {
          // One in progress with some ratings filled
          vr.status = 'in_progress';
          vr.startedAt = new Date(Date.now() - 30 * 60 * 1000);
          if (vr.parameters?.length > 0) {
            vr.parameters[0].rating = 5;
            vr.parameters[0].notes = 'Count confirmed exactly matching declaration.';
            if (vr.parameters[1]) {
              vr.parameters[1].rating = 4;
              vr.parameters[1].notes = 'Solid joints, minimal wear.';
            }
          }
          await vr.save();
          await Resource.findByIdAndUpdate(r._id, { verificationStatus: 'in_progress' });
        } else if (i === 3) {
          // One fully verified
          const ratingsPayload = vr.parameters.map((p, idx) => ({
            id: p.id,
            rating: idx % 3 === 0 ? 5 : 4,
            notes: 'Verified in great working and cosmetic condition during field visit.',
            issueFlag: 'none',
          }));
          await submitInspection(vr._id, inspector, {
            parameters: ratingsPayload,
            inspectorNotes: 'Thorough field inspection completed. Resource approved for high-trust marketplace badge.',
          });
        }
      }
    }

    logger.info('Verification seed data processed successfully.');
  } catch (err) {
    logger.error('Error during verification seeding:', { error: err.message });
  }
}
