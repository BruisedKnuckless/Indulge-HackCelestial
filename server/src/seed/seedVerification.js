import User from '../models/User.js';
import Resource from '../models/Resource.js';
import VerificationTemplate from '../models/VerificationTemplate.js';
import { DEFAULT_CATEGORY_TEMPLATES } from '../services/verification/guideline.service.js';
import { createVerificationForResource, assignTechnician, INSPECTABLE_CATEGORIES } from '../services/verification/verification.service.js';
import { logger } from '../utils/logger.js';

/**
 * Inspection seed data.
 *
 * Nothing here fabricates a result: every seeded inspection is left pending
 * or assigned, and only a technician working through the checklist can move
 * a listing to verified.
 */

const PASSWORD = 'indulge123';
const HQ = { type: 'Point', address: 'Indulge HQ, Powai', city: 'Mumbai', coordinates: [72.9051, 19.1176] };

export const TECHNICIANS = [
  {
    email: 'inspector@indulge.com',
    displayName: 'Rahul Sharma',
    title: 'Senior Field Technician',
    employeeId: 'IND-T-014',
    phone: '+91 98200 99001',
  },
  {
    email: 'priya.tech@indulge.com',
    displayName: 'Priya Nair',
    title: 'Field Technician',
    employeeId: 'IND-T-022',
    phone: '+91 98200 99002',
  },
];

/** The demo products the inspection flow is shown with. */
const img = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=70`;
export const INSPECTION_DEMO_RESOURCES = [
  {
    owner: 'kalpataru',
    title: 'Dell Latitude 5420 Laptop',
    category: 'av_equipment',
    description: 'Business laptop for presentations, registration desks and show control. Windows 11 Pro, charger included.',
    highlights: ['Intel Core i5 11th Gen', '16GB RAM', '512GB SSD', '14" Full HD display'],
    brand: 'Dell',
    model: 'Latitude 5420',
    declaredCondition: 'Excellent',
    specifications: { Processor: 'Intel Core i5-1145G7', RAM: '16GB', Storage: '512GB SSD', Display: '14 inch FHD', OS: 'Windows 11 Pro' },
    accessories: ['65W charger', 'Laptop sleeve'],
    totalQuantity: 1,
    unit: 'unit',
    pricing: { basePrice: 12000, priceUnit: 'per_event', minRentalPeriodHours: 8 },
    tags: ['laptop', 'presentation', 'registration'],
    images: [img('1496181133206-80ce9b88a853')],
  },
  {
    owner: 'grandOrchid',
    title: 'Apple iPhone 14 (event check-in device)',
    category: 'other',
    description: 'iPhone 14 used for guest check-in and ticket scanning. Supplied reset, with case and cable.',
    highlights: ['128GB', 'Battery health 89%', 'Unlocked'],
    brand: 'Apple',
    model: 'iPhone 14',
    declaredCondition: 'Good',
    specifications: { Storage: '128GB', 'Battery health': '89%', Colour: 'Midnight' },
    accessories: ['USB-C to Lightning cable', 'Silicone case'],
    totalQuantity: 1,
    unit: 'unit',
    pricing: { basePrice: 1500, priceUnit: 'per_day', minRentalPeriodHours: 8 },
    tags: ['phone', 'check-in', 'scanner'],
    images: [img('1663499482523-1c0c1bae4ce1')],
  },
  {
    owner: 'blueBay',
    title: 'Toyota Innova Crysta (7-seater)',
    category: 'vehicle',
    description: 'Diesel Innova Crysta for VIP guest transfers. Chauffeur available on request.',
    highlights: ['7 seats, AC', '2.4L diesel', 'Automatic', 'Valid permit and insurance'],
    brand: 'Toyota',
    model: 'Innova Crysta',
    declaredCondition: 'Good',
    specifications: { Fuel: 'Diesel', Transmission: 'Automatic', Seats: '7', Odometer: '48,000 km' },
    accessories: ['Spare tyre', 'First-aid kit', 'Fire extinguisher'],
    totalQuantity: 1,
    unit: 'unit',
    capacity: 7,
    pricing: { basePrice: 5500, priceUnit: 'per_day', minRentalPeriodHours: 6 },
    tags: ['car', 'vip', 'transfer'],
    images: [img('1549317661-bd32c8ce0db2')],
  },
  {
    owner: 'seasons',
    title: '50 Banquet Chairs',
    category: 'furniture',
    description: 'Wooden banquet chairs with cushioned seats, stackable, in a lot of 50.',
    highlights: ['Lot of 50', 'Cushioned seat', 'Stackable'],
    declaredCondition: 'Good',
    specifications: { Material: 'Wooden' },
    totalQuantity: 50,
    unit: 'unit',
    pricing: { basePrice: 60, priceUnit: 'per_unit', minRentalPeriodHours: 8 },
    tags: ['chairs', 'banquet'],
    images: [img('1519167758481-83f550bb49b3')],
  },
];

/** Upsert the category templates (the generator's last-resort fallback). */
export async function seedVerificationTemplates() {
  for (const tpl of Object.values(DEFAULT_CATEGORY_TEMPLATES)) {
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
}

/** Technician accounts. Idempotent; never resets an existing password. */
export async function ensureTechnicians() {
  const passwordHash = await User.hashPassword(PASSWORD);
  const out = {};
  for (const t of TECHNICIANS) {
    let user = await User.findOne({ email: t.email });
    if (!user) {
      user = await User.create({
        businessName: t.displayName,
        email: t.email,
        passwordHash,
        phone: t.phone,
        businessType: 'other',
        customBusinessType: 'Indulge inspection team',
        userType: 'inspector',
        inspectorProfile: { displayName: t.displayName, title: t.title, employeeId: t.employeeId },
        location: HQ,
      });
    } else if (user.userType === 'inspector' && !user.inspectorProfile?.displayName) {
      user.businessName = t.displayName;
      user.inspectorProfile = { displayName: t.displayName, title: t.title, employeeId: t.employeeId };
      await user.save();
    }
    out[t.email] = user;
  }
  return out;
}

/**
 * Called from runSeed after the marketplace is seeded: demo products, a
 * generated protocol and a pending inspection for every physical listing,
 * and the Dell laptop assigned to Rahul.
 */
export async function seedInspections(users) {
  const technicians = await ensureTechnicians();

  const demo = [];
  for (const r of INSPECTION_DEMO_RESOURCES) {
    const owner = users[r.owner];
    demo.push(
      await Resource.create({
        ...r,
        owner: owner._id,
        location: { address: owner.location.address, city: owner.location.city, coordinates: owner.location.coordinates },
      })
    );
  }

  // Deterministic baseline only: seeding must not depend on, or pay for, an LLM.
  const physical = await Resource.find({ category: { $in: INSPECTABLE_CATEGORIES } });
  const inspections = {};
  for (const resource of physical) {
    inspections[resource.title] = await createVerificationForResource(resource, null, { ai: false });
  }

  const dell = inspections['Dell Latitude 5420 Laptop'];
  if (dell) await assignTechnician(dell, technicians['inspector@indulge.com']._id, null, { scheduledAt: new Date(Date.now() + 2 * 3600 * 1000) });

  return { technicians, demo, inspections };
}

/** Boot-time upkeep for a persistent database (templates + technician accounts). */
export async function seedVerificationData() {
  try {
    await seedVerificationTemplates();
    await ensureTechnicians();
  } catch (err) {
    logger.error('Error during verification seeding:', { error: err.message });
  }
}
