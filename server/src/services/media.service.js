import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { HttpError } from '../middleware/error.middleware.js';
import Resource from '../models/Resource.js';
import Booking from '../models/Booking.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const UPLOADS_DIR = path.resolve(__dirname, '../../public/uploads');

// Ensure local uploads directory exists
try {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
} catch (err) {
  logger.warn('Could not initialize uploads directory:', { error: err.message });
}

/**
 * Generates a collision-resistant, path-traversal-safe filename.
 */
export function sanitizeFilename(originalName = 'image.jpg') {
  const cleanBase = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const ext = path.extname(cleanBase).toLowerCase() || '.jpg';
  const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
  const unique = crypto.randomBytes(8).toString('hex');
  return `media-${Date.now()}-${unique}${safeExt}`;
}

/**
 * Local Disk Provider (Used in development, testing, or when Cloudinary is unset).
 */
export const LocalMediaProvider = {
  name: 'local',
  async upload(file) {
    const filename = sanitizeFilename(file.originalname);
    const destPath = path.join(UPLOADS_DIR, filename);
    await fs.promises.writeFile(destPath, file.buffer);

    const format = path.extname(filename).replace('.', '').toLowerCase();
    const publicId = `local_${path.parse(filename).name}`;
    const url = `/uploads/${filename}`;

    return {
      url,
      publicId,
      width: 1200,
      height: 800,
      format,
    };
  },

  async delete(publicId) {
    if (!publicId || !publicId.startsWith('local_')) return { deleted: false };
    const baseName = publicId.replace('local_', '');
    const possibleExts = ['.jpg', '.jpeg', '.png', '.webp'];

    for (const ext of possibleExts) {
      const target = path.join(UPLOADS_DIR, `${baseName}${ext}`);
      if (fs.existsSync(target)) {
        try {
          await fs.promises.unlink(target);
          return { deleted: true };
        } catch {
          // ignore unlink error
        }
      }
    }
    return { deleted: false };
  },
};

/**
 * Cloudinary Provider (Activated in production when environment variables are set).
 */
export const CloudinaryMediaProvider = {
  name: 'cloudinary',
  async upload(file) {
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'indulge_resources';

    // Sign request params with API secret
    const signatureStr = `folder=${folder}&timestamp=${timestamp}${env.cloudinaryApiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);
    formData.append('api_key', env.cloudinaryApiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('folder', folder);
    formData.append('signature', signature);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/image/upload`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      logger.error('Cloudinary upload failure', { status: response.status, body: errText });
      throw new HttpError(502, 'Cloudinary upload failed.');
    }

    const data = await response.json();
    return {
      url: data.secure_url || data.url,
      publicId: data.public_id,
      width: data.width,
      height: data.height,
      format: data.format,
    };
  },

  async delete(publicId) {
    if (!publicId) return { deleted: false };
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureStr = `public_id=${publicId}&timestamp=${timestamp}${env.cloudinaryApiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', env.cloudinaryApiKey);
    formData.append('timestamp', String(timestamp));
    formData.append('signature', signature);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${env.cloudinaryCloudName}/image/destroy`;
    const response = await fetch(destroyUrl, {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();
    return { deleted: data.result === 'ok' };
  },
};

/**
 * Returns active media provider based on environment configuration.
 */
export function getMediaProvider() {
  if (env.isCloudinaryConfigured) {
    return CloudinaryMediaProvider;
  }
  return LocalMediaProvider;
}

/**
 * Multer middleware with size limits and MIME filtering.
 */
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      const err = new HttpError(
        400,
        `Invalid image format "${file.mimetype}". Allowed formats: JPEG, PNG, WebP.`,
        'INVALID_IMAGE_FORMAT'
      );
      return cb(err, false);
    }
    cb(null, true);
  },
});

/**
 * Uploads media for an owned resource.
 */
export async function uploadResourceMedia({ resourceId, file, user, isPrimary = false }) {
  if (!file) throw new HttpError(400, 'Image file is required.', 'MISSING_FILE');

  const resource = await Resource.findById(resourceId);
  if (!resource) throw new HttpError(404, 'Resource not found.');

  // Ownership verification
  if (String(resource.owner) !== String(user._id)) {
    throw new HttpError(403, 'You can only upload images for your own listings.', 'UNAUTHORIZED_MEDIA_UPLOAD');
  }

  const provider = getMediaProvider();
  const uploaded = await provider.upload(file);

  const mediaItem = {
    url: uploaded.url,
    publicId: uploaded.publicId,
    width: uploaded.width,
    height: uploaded.height,
    format: uploaded.format,
    isPrimary: Boolean(isPrimary || resource.media.length === 0),
    uploadedAt: new Date(),
  };

  resource.media.push(mediaItem);
  if (!resource.images.includes(uploaded.url)) {
    resource.images.push(uploaded.url);
  }
  await resource.save();

  return {
    resource,
    media: resource.media[resource.media.length - 1],
  };
}

/**
 * Replaces an existing media asset on an owned resource.
 */
export async function replaceResourceMedia({ resourceId, mediaId, file, user }) {
  if (!file) throw new HttpError(400, 'Image file is required.', 'MISSING_FILE');

  const resource = await Resource.findById(resourceId);
  if (!resource) throw new HttpError(404, 'Resource not found.');

  if (String(resource.owner) !== String(user._id)) {
    throw new HttpError(403, 'You can only edit media on your own listings.', 'UNAUTHORIZED_MEDIA_EDIT');
  }

  const existingMedia = resource.media.id(mediaId);
  if (!existingMedia) throw new HttpError(404, 'Media item not found on this listing.');

  const oldPublicId = existingMedia.publicId;
  const oldUrl = existingMedia.url;

  const provider = getMediaProvider();
  const uploaded = await provider.upload(file);

  existingMedia.url = uploaded.url;
  existingMedia.publicId = uploaded.publicId;
  existingMedia.width = uploaded.width;
  existingMedia.height = uploaded.height;
  existingMedia.format = uploaded.format;
  existingMedia.uploadedAt = new Date();

  // Update images array
  const imgIdx = resource.images.indexOf(oldUrl);
  if (imgIdx !== -1) {
    resource.images[imgIdx] = uploaded.url;
  } else {
    resource.images.push(uploaded.url);
  }

  await resource.save();

  // Safely delete old asset from storage
  if (oldPublicId) {
    provider.delete(oldPublicId).catch(() => {});
  }

  return { resource, media: existingMedia };
}

/**
 * Deletes media from an owned resource with historical booking safety check.
 */
export async function deleteResourceMedia({ resourceId, mediaId, user }) {
  const resource = await Resource.findById(resourceId);
  if (!resource) throw new HttpError(404, 'Resource not found.');

  if (String(resource.owner) !== String(user._id)) {
    throw new HttpError(403, 'You can only delete media on your own listings.', 'UNAUTHORIZED_MEDIA_DELETE');
  }

  const existingMedia = resource.media.id(mediaId);
  if (!existingMedia) throw new HttpError(404, 'Media item not found on this listing.');

  const targetUrl = existingMedia.url;
  const targetPublicId = existingMedia.publicId;

  // Remove subdocument from resource
  resource.media.pull(mediaId);
  resource.images = resource.images.filter((img) => img !== targetUrl);
  await resource.save();

  // Check if historical bookings exist that might reference this listing
  const hasBookings = await Booking.exists({
    resource: resource._id,
    status: { $in: ['confirmed', 'completed'] },
  });

  // If active/completed historical bookings exist, keep asset safely preserved
  // otherwise clean up storage asset
  if (!hasBookings && targetPublicId) {
    const provider = getMediaProvider();
    provider.delete(targetPublicId).catch(() => {});
  }

  return { success: true, resource };
}

/* ------------------------------------------------------------------ */
/* Inspection evidence                                                  */
/* ------------------------------------------------------------------ */

const EVIDENCE_VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
export const MAX_EVIDENCE_SIZE = 25 * 1024 * 1024; // 25 MB — short clips only

/** Photos (JPEG/PNG/WebP) and short videos captured by technicians. */
export const evidenceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype) || EVIDENCE_VIDEO_TYPES[file.mimetype]) return cb(null, true);
    cb(new HttpError(400, `Unsupported evidence format "${file.mimetype}". Use JPEG, PNG, WebP, MP4, WebM or MOV.`, 'INVALID_EVIDENCE_FORMAT'), false);
  },
});

/**
 * Store one evidence file and return { url, type }. Photos go through the
 * active media provider; videos are kept on local disk (the Cloudinary
 * provider here is image-only).
 */
export async function storeEvidenceFile(file) {
  const videoExt = EVIDENCE_VIDEO_TYPES[file.mimetype];
  if (!videoExt) {
    if (file.size > MAX_FILE_SIZE) throw new HttpError(400, 'Photos must be 5 MB or smaller.', 'FILE_TOO_LARGE');
    const uploaded = await getMediaProvider().upload(file);
    return { url: uploaded.url, type: 'photo' };
  }
  const filename = `evidence-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${videoExt}`;
  await fs.promises.writeFile(path.join(UPLOADS_DIR, filename), file.buffer);
  return { url: `/uploads/${filename}`, type: 'video' };
}
