import { supabase } from "@/integrations/supabase/client";

/**
 * Extract file path from a storage URL or return the path as-is
 * Handles both old full URLs and new relative paths
 */
function extractFilePath(urlOrPath: string): string {
  // If it's already a path (doesn't start with http), return as-is
  if (!urlOrPath.startsWith('http')) {
    return urlOrPath;
  }
  
  // Extract path from URL
  // Format: https://PROJECT.supabase.co/storage/v1/object/public/BUCKET/PATH
  const match = urlOrPath.match(/\/object\/public\/[^/]+\/(.+)$/);
  if (match) {
    return match[1]; // Return just the file path
  }
  
  // If no match, return original (will likely fail, but at least we tried)
  return urlOrPath;
}

/**
 * Generate a signed URL for a file in a storage bucket
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket (or full URL for backward compatibility)
 * @param expiresIn - Expiration time in seconds (default: 24 hours)
 * @returns The signed URL string
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 24 * 60 * 60
): Promise<string> {
  // Handle both old full URLs and new relative paths
  const filePath = extractFilePath(path);
  
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(filePath, expiresIn);

  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Failed to generate signed URL");

  return data.signedUrl;
}

/**
 * Generate signed URLs for multiple files
 * @param bucket - The storage bucket name
 * @param paths - Array of file paths
 * @param expiresIn - Expiration time in seconds (default: 24 hours)
 * @returns Map of path to signed URL
 */
export async function getSignedUrls(
  bucket: string,
  paths: string[],
  expiresIn: number = 24 * 60 * 60
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  await Promise.all(
    paths.map(async (path) => {
      try {
        const signedUrl = await getSignedUrl(bucket, path, expiresIn);
        results.set(path, signedUrl);
      } catch (error) {
        console.error(`Failed to generate signed URL for ${path}:`, error);
      }
    })
  );

  return results;
}
