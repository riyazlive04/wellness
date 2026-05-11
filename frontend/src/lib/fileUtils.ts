import { 
  FileText, File, FileSpreadsheet, FileAudio, FileVideo, 
  FileImage, FileType
} from "lucide-react";

export const ACCEPTED_FILE_TYPES = {
  'image/*': ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'audio/*': ['.mp3', '.wav', '.m4a', '.ogg'],
  'video/*': ['.mp4', '.mov', '.avi', '.webm']
};

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function getFileIcon(fileType: string | null) {
  if (!fileType) return File;
  
  if (fileType.startsWith('image/')) return FileImage;
  if (fileType === 'application/pdf') return FileType;
  if (fileType.startsWith('audio/')) return FileAudio;
  if (fileType.startsWith('video/')) return FileVideo;
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || fileType === 'text/csv') {
    return FileSpreadsheet;
  }
  if (fileType.includes('document') || fileType.includes('word') || fileType === 'text/plain') {
    return FileText;
  }
  
  return File;
}

export function getFileDisplayName(fileType: string | null): string {
  if (!fileType) return 'File';
  
  if (fileType.startsWith('image/')) return 'Image';
  if (fileType === 'application/pdf') return 'PDF';
  if (fileType.startsWith('audio/')) return 'Audio';
  if (fileType.startsWith('video/')) return 'Video';
  if (fileType.includes('spreadsheet') || fileType.includes('excel')) return 'Spreadsheet';
  if (fileType === 'text/csv') return 'CSV';
  if (fileType.includes('document') || fileType.includes('word')) return 'Document';
  if (fileType === 'text/plain') return 'Text';
  
  return 'File';
}

export function isPreviewable(fileType: string | null): boolean {
  if (!fileType) return false;
  
  return fileType.startsWith('image/') || 
         fileType === 'application/pdf' ||
         fileType.startsWith('audio/') ||
         fileType.startsWith('video/');
}

export function handleFileClick(url: string, fileType: string | null, fileName?: string) {
  // Browser can display these - open in new tab
  if (isPreviewable(fileType)) {
    window.open(url, '_blank');
  } else {
    // Download other files
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export function getAcceptString(): string {
  return Object.entries(ACCEPTED_FILE_TYPES)
    .flatMap(([mime, extensions]) => [mime, ...extensions])
    .join(',');
}

/**
 * Format file size from bytes to human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Check if file type is an image
 */
export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}
