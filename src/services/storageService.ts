import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';

export interface UploadProgressCallback {
  (progressPercent: number): void;
}

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit
export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateImageFile(file: File): void {
  if (!file) {
    throw new Error('No file provided for upload.');
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Image size exceeds the 5MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB).`);
  }
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
  }
}

export function validateStoragePath(path: string): string {
  const normalized = (path || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const segments = normalized.split('/');
  if (segments[0] !== 'restaurants' || !segments[1] || segments[1].trim() === '') {
    throw new Error('Storage path must be restaurant-scoped: /restaurants/{restaurantId}/...');
  }
  return normalized;
}

/**
 * Uploads an image file to Firebase Storage.
 * Production rules strictly enforce:
 * - Restaurant-scoped pathing (/restaurants/{restaurantId}/...)
 * - File size <= 5MB and MIME-type validation (JPEG, PNG, WebP)
 * - No silent downgrades to large base64 Data URLs in Firestore
 */
export async function uploadImage(
  path: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<string> {
  validateImageFile(file);
  const normalizedPath = validateStoragePath(path);

  const fileExt = file.name.split('.').pop() || 'jpg';
  const uniqueFileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${fileExt}`;
  const storageRef = ref(storage, `${normalizedPath}/${uniqueFileName}`);

  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
    customMetadata: {
      originalName: file.name
    }
  });

  return new Promise((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) {
          onProgress(Math.round(progress));
        }
      },
      (error) => {
        console.error('Firebase Storage upload error:', error);
        reject(
          new Error(
            `Cloud Storage upload failed (${error.code || 'storage-error'}). Please check network connectivity and bucket permissions.`
          )
        );
      },
      async () => {
        try {
          const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
          resolve(downloadUrl);
        } catch (err: any) {
          console.error('Failed to obtain download URL:', err);
          reject(new Error('Image uploaded but failed to retrieve secure public URL.'));
        }
      }
    );
  });
}
