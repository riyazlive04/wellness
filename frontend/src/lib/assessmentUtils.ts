/**
 * Utility functions for assessment file naming and management
 */

/**
 * Sanitize a string to be safe for filenames
 * - Convert to lowercase
 * - Replace spaces with hyphens
 * - Remove special characters
 * - Trim to max length
 */
export function sanitizeFilename(filename: string, maxLength: number = 100): string {
  return filename
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_.]/g, '')
    .replace(/-+/g, '-')
    .slice(0, maxLength);
}

/**
 * Create a slug from a name (e.g., "Mohamed Riyaz" -> "mohamed-riyaz")
 */
export function createSlug(text: string): string {
  return sanitizeFilename(text, 50);
}

/**
 * Get admin initials from profile name
 * Example: "Ahmed Youssef" -> "AY"
 */
export function getAdminInitials(adminName: string): string {
  const words = adminName.trim().split(/\s+/);
  if (words.length === 0) return 'XX';
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * Format date as YYYYMMDD
 */
export function formatDateForFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Create assessment type slug
 * Examples:
 * - "health_assessment" -> "health-assessment"
 * - "stress_card" -> "stress-card"
 * - "sleep_card" -> "sleep-card"
 */
export function createAssessmentTypeSlug(assessmentType: string): string {
  return assessmentType.replace(/_/g, '-');
}

/**
 * Generate display name for assessment file using primary rule:
 * {client_name_slug}_{assessment_type_slug}_{YYYYMMDD}_{admin_initials}.{ext}
 * 
 * @param clientName - Client's full name
 * @param assessmentType - Type of assessment (e.g., "health_assessment", "stress_card")
 * @param adminName - Admin's full name
 * @param extension - File extension (default: "pdf")
 * @param date - Date for filename (default: current date)
 * @returns Generated display name
 */
export function createDisplayName(
  clientName: string,
  assessmentType: string,
  adminName: string,
  extension: string = 'pdf',
  date: Date = new Date()
): string {
  const clientSlug = createSlug(clientName);
  const typeSlug = createAssessmentTypeSlug(assessmentType);
  const dateStr = formatDateForFilename(date);
  const initials = getAdminInitials(adminName);
  const ext = extension.startsWith('.') ? extension.substring(1) : extension;
  
  return `${clientSlug}_${typeSlug}_${dateStr}_${initials}.${ext}`;
}

/**
 * Check if display name already exists for client on same day
 * and append version number if needed (-v2, -v3, etc.)
 */
export function ensureUniqueDisplayName(
  displayName: string,
  existingNames: string[]
): string {
  if (!existingNames.includes(displayName)) {
    return displayName;
  }

  const parts = displayName.split('.');
  const ext = parts.pop();
  const baseName = parts.join('.');
  
  let version = 2;
  let uniqueName = `${baseName}-v${version}.${ext}`;
  
  while (existingNames.includes(uniqueName)) {
    version++;
    uniqueName = `${baseName}-v${version}.${ext}`;
  }
  
  return uniqueName;
}

/**
 * Validate display name
 * - Max 200 characters
 * - No HTML/script tags
 * - No directory traversal attempts
 */
export function validateDisplayName(displayName: string): { 
  valid: boolean; 
  error?: string 
} {
  if (!displayName || displayName.trim().length === 0) {
    return { valid: false, error: 'Display name cannot be empty' };
  }

  if (displayName.length > 200) {
    return { valid: false, error: 'Display name must be less than 200 characters' };
  }

  // Check for HTML/script tags
  if (/<script|<iframe|javascript:/i.test(displayName)) {
    return { valid: false, error: 'Display name contains invalid characters' };
  }

  // Check for directory traversal
  if (/\.\.\/|\.\.\\/.test(displayName)) {
    return { valid: false, error: 'Display name contains invalid path characters' };
  }

  return { valid: true };
}

/**
 * Extract file extension from filename or URL
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length > 1) {
    return parts[parts.length - 1].toLowerCase();
  }
  return 'pdf'; // default
}

/**
 * Create display name from uploaded file's original filename
 * - Sanitizes the filename
 * - Preserves extension
 * - Limits to 100 characters
 */
export function createDisplayNameFromUpload(originalFilename: string): string {
  const ext = getFileExtension(originalFilename);
  const nameWithoutExt = originalFilename.substring(0, originalFilename.lastIndexOf('.')) || originalFilename;
  const sanitized = sanitizeFilename(nameWithoutExt, 95); // Leave room for extension
  return `${sanitized}.${ext}`;
}
