import VerificationTemplate from '../../models/VerificationTemplate.js';
import { logger } from '../../utils/logger.js';

/**
 * Built-in Category Inspection Parameter Presets.
 * These act as the deterministic guideline baseline and fallback.
 */
export const DEFAULT_CATEGORY_TEMPLATES = {
  // 1. BANQUET CHAIRS & FURNITURE
  furniture: {
    templateId: 'tpl_furniture_banquet_chairs',
    category: 'furniture',
    title: 'Banquet Chairs & Event Furniture Inspection',
    description: 'Guidelines for evaluating structural integrity, finish, stability, and cleanliness of event furniture.',
    resourceTypeKeywords: ['chair', 'chiavari', 'table', 'furniture', 'sofa', 'stool', 'bench', 'podium'],
    parameters: [
      {
        id: 'param_furniture_qty',
        name: 'Quantity Verification',
        description: 'Physically count and verify total count matches the declared listing quantity.',
        category: 'physical',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_furniture_structural',
        name: 'Structural Integrity',
        description: 'Inspect frame, joints, welds, and load-bearing legs for cracks, warping, or weakening.',
        category: 'safety',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_furniture_stability',
        name: 'Stability & Leveling',
        description: 'Test stability on a level surface. Check for wobble, uneven leg feet, or tipping risk.',
        category: 'safety',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_furniture_finish',
        name: 'Finish / Paint & Coating',
        description: 'Examine gold/varnish/lacquer coating for scratches, chipping, peeling, or oxidation.',
        category: 'cosmetic',
        weight: 0.10,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_furniture_seat_condition',
        name: 'Seat & Cushion Condition',
        description: 'Check seat pads, upholstery fabric, foam firmness, tears, and securing ties/velcro.',
        category: 'cosmetic',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_furniture_cleanliness',
        name: 'Cleanliness & Hygiene',
        description: 'Ensure surfaces are free from food stains, beverage spills, grease, dust, or odors.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_furniture_visible_damage',
        name: 'Visible Damage & Defect Check',
        description: 'Identify any splintering, deep gouges, rust patches, or broken crossbars.',
        category: 'physical',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_furniture_overall',
        name: 'Overall Event Readiness',
        description: 'Assess if the batch is presentable and ready for high-end hospitality / wedding deployment.',
        category: 'operational',
        weight: 0.05,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
    ],
  },

  // 2. AV EQUIPMENT & PROJECTORS
  av_equipment: {
    templateId: 'tpl_av_projector_audio',
    category: 'av_equipment',
    title: 'AV Equipment & Projector Inspection Guidelines',
    description: 'Comprehensive functional, optical, acoustic, and electrical verification for professional AV gear.',
    resourceTypeKeywords: ['projector', 'screen', 'speaker', 'audio', 'mic', 'amplifier', 'mixer', 'display', 'av'],
    parameters: [
      {
        id: 'param_av_power_on',
        name: 'Power-On & Boot Test',
        description: 'Test cold boot-up, indicator LEDs, cooling fan startup sound, and normal boot cycle.',
        category: 'electrical',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_av_display_quality',
        name: 'Display Quality & Sharpness',
        description: 'Project test image / video; evaluate sharpness, focus uniformity, color gamut, and dead pixels.',
        category: 'performance',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_av_brightness',
        name: 'Brightness & Lumens Output',
        description: 'Verify projector lamp/laser brightness in ambient lighting conditions.',
        category: 'performance',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_av_lens_condition',
        name: 'Lens & Optics Condition',
        description: 'Check glass lens for scratches, dust ingress, fungus, or physical distortion.',
        category: 'physical',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_av_ports',
        name: 'HDMI & Signal Input Ports',
        description: 'Test all physical ports (HDMI 1/2, USB-C, VGA, Audio Out) for snug fit and clean signal transfer.',
        category: 'electrical',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_av_remote',
        name: 'Remote & Control Panel',
        description: 'Test infrared/Bluetooth remote response and physical on-chassis control buttons.',
        category: 'operational',
        weight: 0.05,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_av_audio',
        name: 'Audio Output & Internal Speakers',
        description: 'Check speaker clarity, crackle-free audio output at peak volumes, and 3.5mm jack.',
        category: 'performance',
        weight: 0.10,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_av_damage',
        name: 'Physical Casing & Thermal Vents',
        description: 'Inspect chassis for dents, cracked plastics, dropped impact marks, and clean ventilation vents.',
        category: 'physical',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_av_accessories',
        name: 'Accessories & Cabling',
        description: 'Confirm power cable, HDMI cable, carry bag/case, and mounting brackets are intact.',
        category: 'operational',
        weight: 0.08,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_av_serial',
        name: 'Serial Number & Identity Tag',
        description: 'Verify manufacturer serial number matches listing details and is clearly legible.',
        category: 'documentation',
        weight: 0.07,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
    ],
  },

  // 3. BANQUET SPACES / HALLS
  banquet_space: {
    templateId: 'tpl_banquet_space_venue',
    category: 'banquet_space',
    title: 'Banquet Space & Venue Inspection Guidelines',
    description: 'Evaluation criteria covering guest capacity, AC, acoustics, lighting, hygiene, and emergency egress.',
    resourceTypeKeywords: ['hall', 'banquet', 'ballroom', 'lawn', 'rooftop', 'terrace', 'venue', 'space'],
    parameters: [
      {
        id: 'param_space_capacity',
        name: 'Capacity & Usable Area',
        description: 'Verify square footage and safe maximum guest capacity against declared capacity.',
        category: 'safety',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_space_layout',
        name: 'Seating & Stage Setup Flexibility',
        description: 'Assess room layout versatility (cluster, theater, classroom) and obstruction-free sightlines.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_space_cleanliness',
        name: 'Cleanliness & Floor Finish',
        description: 'Inspect flooring (marble, carpet, tiles), wall paneling, and overall cleanliness standards.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_space_ac',
        name: 'AC & Climate Control',
        description: 'Test central chiller / split HVAC cooling efficacy, airflow, and thermostat controls.',
        category: 'performance',
        weight: 0.12,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_space_lighting',
        name: 'Lighting & Dimmers',
        description: 'Check chandeliers, cove ambient lights, spot fixtures, and stage illumination controls.',
        category: 'electrical',
        weight: 0.08,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_space_washrooms',
        name: 'Washroom Facilities & Hygiene',
        description: 'Inspect guest rest rooms: running water, flush systems, hand dryers, and cleanliness.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_space_parking',
        name: 'Parking & Valet Access',
        description: 'Verify valet drop-off porch, guest parking capacity, and approach road condition.',
        category: 'operational',
        weight: 0.08,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_space_av',
        name: 'AV & Acoustic Insulation',
        description: 'Inspect built-in PA speakers, acoustic damping, stage power points, and echo control.',
        category: 'performance',
        weight: 0.07,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_space_safety',
        name: 'Safety & Fire Emergency Exits',
        description: 'Verify marked illuminated fire exit doors, unblocked stairwells, and extinguisher dates.',
        category: 'safety',
        weight: 0.12,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_space_overall',
        name: 'Overall Facility Condition',
        description: 'Holistic assessment of luxury hospitality finish and guest experience.',
        category: 'operational',
        weight: 0.08,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
    ],
  },

  // 4. VEHICLES
  vehicle: {
    templateId: 'tpl_vehicle_fleet',
    category: 'vehicle',
    title: 'Commercial Fleet & Transport Vehicle Guidelines',
    description: 'Mechanical, safety, documentation, and passenger comfort inspection for event logistics vehicles.',
    resourceTypeKeywords: ['van', 'truck', 'bus', 'tempo', 'car', 'vehicle', 'ev', 'carrier'],
    parameters: [
      {
        id: 'param_veh_documents',
        name: 'Registration & Fitness Documents',
        description: 'Verify RC book, commercial vehicle fitness certificate, and valid insurance policy.',
        category: 'documentation',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_veh_exterior',
        name: 'Exterior Body & Paintwork',
        description: 'Inspect paint, body panels, bumpers, glass, and mirrors for accident damage or rust.',
        category: 'physical',
        weight: 0.12,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_veh_interior',
        name: 'Interior Cabin & Upholstery',
        description: 'Check seat upholstery, seatbelts, floor mats, ceiling liner, and dashboard condition.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_veh_tyres',
        name: 'Tyres & Tread Depth',
        description: 'Check tread depth on all 4 road wheels + spare tyre; look for sidewall bulges.',
        category: 'safety',
        weight: 0.12,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_veh_lights',
        name: 'Lights & Turn Indicators',
        description: 'Test high/low beams, fog lights, brake lights, reverse lights, and hazard flashers.',
        category: 'safety',
        weight: 0.08,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_veh_engine',
        name: 'Engine Start & Idle Test',
        description: 'Start cold engine; listen for irregular idling, belt squeal, exhaust smoke, or warning lights.',
        category: 'performance',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_veh_ac',
        name: 'Cabin AC & Heating',
        description: 'Test air conditioning cooling power and blower fan speeds across all cabin zones.',
        category: 'performance',
        weight: 0.08,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_veh_fuel_odo',
        name: 'Odometer Reading & Fuel Level',
        description: 'Record verifiable odometer reading and verify fuel/charge gauge accuracy.',
        category: 'documentation',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_veh_damage',
        name: 'Visible Damage & Dents',
        description: 'Document any pre-existing dents, scrapes, or windshield chips.',
        category: 'physical',
        weight: 0.10,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
    ],
  },

  // 5. PARKING
  parking: {
    templateId: 'tpl_parking_facility',
    category: 'parking',
    title: 'Parking Bay & Lot Facility Guidelines',
    description: 'Access, security, surface, marking, and drainage criteria for hospitality parking spaces.',
    resourceTypeKeywords: ['parking', 'bay', 'lot', 'garage', 'basement', 'valet'],
    parameters: [
      {
        id: 'param_park_capacity',
        name: 'Slot Count & Dimensions',
        description: 'Verify number of bays, standard vehicle clearance, and SUV bay availability.',
        category: 'physical',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_park_surface',
        name: 'Pavement & Surface Condition',
        description: 'Inspect asphalt/concrete surface for potholes, oil slicks, cracks, or waterlogging.',
        category: 'physical',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_park_markings',
        name: 'Markings & Directional Signage',
        description: 'Check visibility of painted stall lines, entry/exit arrows, and height restriction bars.',
        category: 'operational',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_park_lighting',
        name: 'Lighting & Night Visibility',
        description: 'Evaluate lumen coverage, absence of dark blind spots, and emergency power backup.',
        category: 'safety',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_park_security',
        name: 'CCTV & Security Coverage',
        description: 'Verify operational CCTV camera angles covering all vehicle entry/exit points.',
        category: 'safety',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_park_access',
        name: 'Gate & Barrier Access Control',
        description: 'Test boom barriers, ticket dispensers, or security guard post checkpoint.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
      {
        id: 'param_park_cleanliness',
        name: 'Cleanliness & Storm Drainage',
        description: 'Ensure drainage grates are clean and no monsoon stagnant water pools exist.',
        category: 'operational',
        weight: 0.10,
        ratingScale: 5,
        required: false,
        evidenceRequired: false,
      },
    ],
  },

  // 6. KITCHEN CAPACITY
  kitchen_capacity: {
    templateId: 'tpl_kitchen_commercial',
    category: 'kitchen_capacity',
    title: 'Commercial Cloud & Hotel Kitchen Guidelines',
    description: 'Hygiene, burner safety, refrigeration, and commercial cooking capacity standards.',
    resourceTypeKeywords: ['kitchen', 'cooking', 'burner', 'refrigerator', 'bakery', 'catering', 'prep'],
    parameters: [
      {
        id: 'param_kitch_burners',
        name: 'Commercial Range & Burner Health',
        description: 'Test high-pressure gas burners, pilot lights, flame consistency, and manifold valves.',
        category: 'safety',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_kitch_gas_safety',
        name: 'Gas Line & Emergency Cutoff Valves',
        description: 'Verify gas leak sensors, external emergency shut-off valves, and fire blankets.',
        category: 'safety',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_kitch_refrigeration',
        name: 'Refrigeration & Deep Freezer Temps',
        description: 'Inspect walk-in cooler / upright freezers; verify temperature gauges below 4°C / -18°C.',
        category: 'performance',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_kitch_hygiene',
        name: 'Hygiene & Pest Control Compliance',
        description: 'Inspect food prep countertops, insect killer traps, and current pest control record.',
        category: 'operational',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_kitch_exhaust',
        name: 'Exhaust Hood & Grease Traps',
        description: 'Test commercial exhaust CFM suction and inspect baffle filters for grease accumulation.',
        category: 'operational',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_kitch_drainage',
        name: 'Washing Stations & Floor Drainage',
        description: 'Check three-compartment sink, hot water supply, grease trap discharge, and non-slip floor.',
        category: 'operational',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
    ],
  },

  // 7. STAFF
  staff: {
    templateId: 'tpl_staff_hospitality',
    category: 'staff',
    title: 'Hospitality & Event Staff Verification',
    description: 'Identity, grooming, skills, hygiene, and verification parameters for hospitality staff teams.',
    resourceTypeKeywords: ['staff', 'waiter', 'bartender', 'chef', 'steward', 'hostess', 'crew'],
    parameters: [
      {
        id: 'param_staff_identity',
        name: 'Identity & Police/KYC Verification',
        description: 'Verify government ID, address proof, and work eligibility for all rostered personnel.',
        category: 'documentation',
        weight: 0.25,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_staff_grooming',
        name: 'Grooming & Uniform Standards',
        description: 'Inspect uniform cleanliness, ironed press, name badges, hairnets, and personal hygiene.',
        category: 'operational',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_staff_hygiene_cert',
        name: 'Food Safety & Health Certifications',
        description: 'Verify mandatory food handler health certificates where applicable.',
        category: 'documentation',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_staff_communication',
        name: 'Service Etiquette & Communication',
        description: 'Assess professional communication, guest hospitality demeanour, and language fluency.',
        category: 'operational',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_staff_readiness',
        name: 'Shift Punctuality & Readiness',
        description: 'Confirm attendance tracking, backup availability, and supervisor-to-staff ratio.',
        category: 'operational',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
    ],
  },

  // 8. OTHER / GENERAL RESOURCES
  other: {
    templateId: 'tpl_other_general_resource',
    category: 'other',
    title: 'General Hospitality Asset Verification Guidelines',
    description: 'Standard multi-point physical, operational, and safety parameters for unclassified assets.',
    resourceTypeKeywords: ['general', 'miscellaneous', 'equipment', 'asset'],
    parameters: [
      {
        id: 'param_gen_quantity',
        name: 'Declared Quantity Verification',
        description: 'Physically count total available units against declared listing quantity.',
        category: 'physical',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_gen_structural',
        name: 'Physical Integrity & Casing',
        description: 'Inspect for external damage, cracks, loose fittings, or structural weakness.',
        category: 'physical',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
      {
        id: 'param_gen_functional',
        name: 'Operational & Functional Test',
        description: 'Perform complete functional test under normal intended working load.',
        category: 'performance',
        weight: 0.25,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_gen_cleanliness',
        name: 'Cleanliness & Cosmetic Finish',
        description: 'Evaluate aesthetic condition, cleanliness, and absence of stains or odors.',
        category: 'operational',
        weight: 0.15,
        ratingScale: 5,
        required: true,
        evidenceRequired: false,
      },
      {
        id: 'param_gen_safety',
        name: 'Safety Standards & Electrical Grounding',
        description: 'Ensure no exposed sharp edges, frayed wires, or safety hazards for guest events.',
        category: 'safety',
        weight: 0.20,
        ratingScale: 5,
        required: true,
        evidenceRequired: true,
      },
    ],
  },
};

/**
 * Base abstract guideline generator contract.
 */
export class BaseGuidelineGenerator {
  async generate(_resourceInput) {
    throw new Error('generate() must be implemented by subclass.');
  }
}

/**
 * TemplateGuidelineGenerator
 * Deterministic, rule/template-based generator matching category, keyword taxonomy,
 * or custom admin-defined VerificationTemplates in MongoDB.
 */
export class TemplateGuidelineGenerator extends BaseGuidelineGenerator {
  /**
   * Generates inspection parameters given resource listing attributes.
   * @param {Object} resourceInput
   * @param {string} resourceInput.category
   * @param {string} [resourceInput.resourceType]
   * @param {string} resourceInput.resourceName
   * @param {string} [resourceInput.description]
   * @param {Object} [resourceInput.metadata]
   * @returns {Promise<{ templateId: string, parameters: Array }>}
   */
  async generate({ category, resourceType, resourceName = '', description = '', metadata = {} }) {
    const normCategory = (category || 'other').toLowerCase();
    const searchableText = `${resourceName} ${resourceType || ''} ${description}`.toLowerCase();

    // 1. First check if a custom VerificationTemplate exists in the database
    try {
      const dbTemplates = await VerificationTemplate.find({
        category: normCategory,
        isActive: true,
      }).lean();

      if (dbTemplates && dbTemplates.length > 0) {
        // Try keyword match first
        const keywordMatch = dbTemplates.find((tpl) =>
          tpl.resourceTypeKeywords?.some((kw) => kw && searchableText.includes(kw.toLowerCase()))
        );

        const chosenTemplate = keywordMatch || dbTemplates.find((tpl) => tpl.isDefault) || dbTemplates[0];

        if (chosenTemplate && chosenTemplate.parameters?.length > 0) {
          return {
            templateId: chosenTemplate.templateId,
            parameters: chosenTemplate.parameters.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              category: p.category || 'physical',
              weight: p.weight,
              ratingScale: p.ratingScale || 5,
              required: Boolean(p.required),
              evidenceRequired: Boolean(p.evidenceRequired),
              rating: null,
              notes: '',
              photos: [],
              issueFlag: 'none',
              issueDescription: '',
            })),
          };
        }
      }
    } catch (err) {
      logger.warn('Failed to query custom VerificationTemplate from DB, falling back to built-in presets:', {
        error: err.message,
      });
    }

    // 2. Fall back to built-in presets
    const preset = DEFAULT_CATEGORY_TEMPLATES[normCategory] || DEFAULT_CATEGORY_TEMPLATES.other;

    return {
      templateId: preset.templateId,
      parameters: preset.parameters.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        category: p.category || 'physical',
        weight: p.weight,
        ratingScale: p.ratingScale || 5,
        required: Boolean(p.required),
        evidenceRequired: Boolean(p.evidenceRequired),
        rating: null,
        notes: '',
        photos: [],
        issueFlag: 'none',
        issueDescription: '',
      })),
    };
  }
}

/**
 * ModelGuidelineGeneratorAdapter
 * Pluggable adapter interface designed for future trained ML / LLM inspection models.
 * For now, transparently delegates to the template engine unless an external model is configured.
 */
export class ModelGuidelineGeneratorAdapter extends BaseGuidelineGenerator {
  constructor(fallbackGenerator = new TemplateGuidelineGenerator(), modelConfig = {}) {
    super();
    this.fallback = fallbackGenerator;
    this.modelConfig = modelConfig;
  }

  async generate(resourceInput) {
    // When a model endpoint or inference function is provided in the future:
    if (this.modelConfig.modelEndpoint) {
      try {
        // e.g. const res = await fetch(this.modelConfig.modelEndpoint, { ... });
        // return await res.json();
      } catch (err) {
        logger.warn('ML Model Guideline invocation failed, falling back to template engine:', {
          error: err.message,
        });
      }
    }

    // Default: use the robust template engine
    return this.fallback.generate(resourceInput);
  }
}

// Singleton instance providing the active guideline generator
export const guidelineGenerator = new ModelGuidelineGeneratorAdapter(new TemplateGuidelineGenerator());

export async function generateInspectionGuidelines(resourceInput) {
  return guidelineGenerator.generate(resourceInput);
}
