import User from '../models/User.js';
import { createAuditLog } from '../models/AuditLog.js';

/**
 * Standard Indian GSTIN Regex:
 * 15 characters: 2 digits (State Code), 5 letters, 4 digits, 1 letter (PAN), 1 entity code, 1 'Z', 1 check digit.
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

/**
 * Standard Indian Udyam Registration Regex:
 * Format: UDYAM-XX-00-0000000 (e.g. UDYAM-MH-01-0012345)
 */
export const UDYAM_REGEX = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/i;

/**
 * Validates the syntax of an Indian GSTIN.
 */
export function isValidGstinFormat(gstin) {
  if (!gstin || typeof gstin !== 'string') return false;
  return GSTIN_REGEX.test(gstin.trim().toUpperCase());
}

/**
 * Validates the syntax of an Indian Udyam registration number.
 */
export function isValidUdyamFormat(udyam) {
  if (!udyam || typeof udyam !== 'string') return false;
  return UDYAM_REGEX.test(udyam.trim().toUpperCase());
}

/**
 * Normalizes a company/business name for tolerant matching:
 * - Lowercase & trim
 * - Remove punctuation
 * - Expand/normalize common corporate suffixes (pvt ltd, limited, etc.)
 */
export function normalizeBusinessName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .toLowerCase()
    .replace(/[.,/#!$%^&*;:{}=\-_`~()'"?]/g, ' ')
    .replace(/\bprivate limited\b/g, 'pvt ltd')
    .replace(/\bprivate ltd\b/g, 'pvt ltd')
    .replace(/\bpvt\.?\s*ltd\.?\b/g, 'pvt ltd')
    .replace(/\blimited\b/g, 'ltd')
    .replace(/\bltd\.?\b/g, 'ltd')
    .replace(/\bllp\b/g, 'llp')
    .replace(/\bincorporated\b/g, 'inc')
    .replace(/\bcorporation\b/g, 'corp')
    .replace(/\bcompany\b/g, 'co')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tokenize a business name into significant words (ignoring trivial words).
 */
function getSignificantTokens(normalizedName) {
  const STOP_WORDS = new Set(['the', 'and', 'of', 'in', 'at', 'for', 'co', 'group', 'services']);
  return normalizedName
    .split(' ')
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Tolerant comparison between submitted business name and official GST legal/trade name.
 * Prevents false rejection of cosmetic differences (e.g. "Pvt. Ltd." vs "Private Limited"),
 * but flags genuine mismatches for admin review.
 */
export function compareBusinessNames(submittedName, officialName) {
  if (!submittedName || !officialName) {
    return { match: false, score: 0, reason: 'Missing name for comparison' };
  }

  const normSubmitted = normalizeBusinessName(submittedName);
  const normOfficial = normalizeBusinessName(officialName);

  if (normSubmitted === normOfficial) {
    return { match: true, score: 1.0, reason: 'Exact normalized match' };
  }

  const tokensSubmitted = getSignificantTokens(normSubmitted);
  const tokensOfficial = getSignificantTokens(normOfficial);

  if (!tokensSubmitted.length || !tokensOfficial.length) {
    return { match: false, score: 0, reason: 'Insufficient significant tokens' };
  }

  const setSubmitted = new Set(tokensSubmitted);
  const setOfficial = new Set(tokensOfficial);

  // Compute Jaccard overlap on significant tokens
  const intersection = [...setSubmitted].filter((t) => setOfficial.has(t));
  const union = new Set([...tokensSubmitted, ...tokensOfficial]);
  const jaccardScore = intersection.length / union.size;

  // Check if all primary tokens of either name are completely contained in the other
  const submittedContainedInOfficial = tokensSubmitted.every((t) => setOfficial.has(t));
  const officialContainedInSubmitted = tokensOfficial.every((t) => setSubmitted.has(t));

  if (submittedContainedInOfficial || officialContainedInSubmitted || jaccardScore >= 0.4) {
    return {
      match: true,
      score: Math.max(jaccardScore, 0.8),
      reason: 'Tolerant token overlap match',
    };
  }

  return {
    match: false,
    score: jaccardScore,
    reason: `Submitted name "${submittedName}" differs from registered name "${officialName}"`,
  };
}

/**
 * Pluggable Verification Provider Abstraction.
 * In production, this integrates with real GSTN / MCA / API gateways.
 * Without an official provider API configured, it safely defaults to manual review.
 * Never fabricates verification data.
 */
export class VerificationProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.GST_API_KEY;
    this.endpoint = config.endpoint || process.env.GST_API_ENDPOINT;
  }

  /**
   * Safe GST verification lookup.
   * If no external provider is configured, returns pending manual review record.
   */
  async lookupGstin(gstin) {
    const cleanGstin = String(gstin || '').trim().toUpperCase();
    if (!isValidGstinFormat(cleanGstin)) {
      return {
        success: false,
        status: 'invalid_format',
        error: 'Invalid GSTIN format.',
      };
    }

    // When no external API credentials are provided:
    if (!this.apiKey || !this.endpoint) {
      return {
        success: true,
        source: 'manual',
        status: 'pending',
        gstin: cleanGstin,
        note: 'Submitted for manual or administrative verification.',
      };
    }

    // External provider hook (for future production enterprise API integrations)
    try {
      const response = await fetch(`${this.endpoint}/gstin/${cleanGstin}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!response.ok) {
        return { success: false, status: 'provider_error', error: 'Verification provider error.' };
      }
      const data = await response.json();
      return {
        success: true,
        source: 'provider',
        status: data.status || 'verified',
        gstin: cleanGstin,
        legalName: data.legalName,
        tradeName: data.tradeName,
        state: data.state,
        constitution: data.constitution,
        verifiedAt: new Date(),
      };
    } catch (err) {
      return {
        success: false,
        status: 'network_error',
        error: err.message,
      };
    }
  }
}

export const defaultVerificationProvider = new VerificationProvider();

/**
 * Admin action: Update verification status for a business user.
 * Records the change in immutable AuditLog.
 */
export async function adminUpdateVerification({
  targetUserId,
  adminUser,
  status,
  notes = '',
  methods,
  businessVerified,
  payoutVerified,
  contactVerified,
  gstVerification,
  udyamVerification,
}) {
  const user = await User.findById(targetUserId);
  if (!user) throw new Error('Business user not found.');

  const previousState = {
    verificationStatus: user.verificationStatus,
    verificationMethods: [...(user.verificationMethods || [])],
    businessVerified: user.businessVerified,
    payoutVerified: user.payoutVerified,
    contactVerified: user.contactVerified,
    suspended: user.suspended,
    verificationNotes: user.verificationNotes,
  };

  // Apply status transition
  if (status) {
    user.verificationStatus = status;
    if (status === 'verified') {
      user.businessVerified = true;
    } else if (status === 'rejected' || status === 'unverified') {
      user.businessVerified = false;
    }
  }

  if (typeof businessVerified === 'boolean') {
    user.businessVerified = businessVerified;
  }
  if (typeof payoutVerified === 'boolean') {
    user.payoutVerified = payoutVerified;
  }
  if (typeof contactVerified === 'boolean') {
    user.contactVerified = contactVerified;
  }
  if (Array.isArray(methods)) {
    user.verificationMethods = Array.from(new Set([...user.verificationMethods, ...methods]));
  }
  if (notes) {
    user.verificationNotes = notes;
  }
  if (gstVerification) {
    user.gstVerification = {
      ...(user.gstVerification || {}),
      ...gstVerification,
    };
  }
  if (udyamVerification) {
    user.udyamVerification = {
      ...(user.udyamVerification || {}),
      ...udyamVerification,
    };
  }

  await user.save();

  const newState = {
    verificationStatus: user.verificationStatus,
    verificationMethods: user.verificationMethods,
    businessVerified: user.businessVerified,
    payoutVerified: user.payoutVerified,
    contactVerified: user.contactVerified,
    suspended: user.suspended,
    verificationNotes: user.verificationNotes,
  };

  const auditAction =
    status === 'verified'
      ? 'admin_verify_business'
      : status === 'rejected'
      ? 'admin_reject_business'
      : status === 'needs_review'
      ? 'admin_request_review'
      : `admin_verification_${status || 'update'}`;

  // Audit log recording
  await createAuditLog({
    action: auditAction,
    actorType: 'admin',
    actorId: adminUser._id,
    actorEmail: adminUser.email,
    targetType: 'user',
    targetId: user._id,
    previousState,
    newState,
    reason: notes,
    metadata: {
      businessName: user.businessName,
    },
  });

  return user;
}

/**
 * Returns safe public verification badges for a user profile.
 * Never leaks private metadata, certificates, or documents.
 */
export function getSafePublicBadges(user) {
  if (!user) return [];
  const badges = [];

  if (user.isDemoBusiness && (user.verificationStatus === 'verified' || user.businessVerified)) {
    badges.push('Demo Verified Business');
    return badges;
  }

  if (user.businessVerified || user.verificationStatus === 'verified') {
    badges.push('Verified Business');
  }

  if (
    user.verificationMethods?.includes('gst') &&
    user.gstVerification?.status === 'verified'
  ) {
    badges.push('GST Verified');
  }

  if (
    user.verificationMethods?.includes('udyam') &&
    user.udyamVerification?.status === 'verified'
  ) {
    badges.push('Udyam Verified');
  }

  if (user.payoutVerified) {
    badges.push('Payout Verified');
  }

  return badges;
}
