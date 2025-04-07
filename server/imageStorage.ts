import { Storage, Bucket } from '@google-cloud/storage';
import * as crypto from 'crypto';
import { URL } from 'url';

/**
 * Service for handling image storage using Google Cloud Storage-compatible APIs
 * (works with Replit object storage)
 */
class ImageStorageService {
  private storage: Storage;
  private bucket!: Bucket; // Using definite assignment assertion
  private initialized: boolean = false;
  private bucketName: string = 'gloriamundo-images';

  constructor() {
    // Configure Storage - use environment variables if available
    const storageEndpoint = process.env.STORAGE_ENDPOINT || 'https://object-storage.replit.com';
    
    // Initialize the storage client - customize for Replit Object Storage compatibility
    const storageOptions: any = { // Using any to bypass type checking
      apiEndpoint: storageEndpoint,
      projectId: process.env.STORAGE_PROJECT_ID || 'replit',
      credentials: {
        client_email: process.env.STORAGE_CLIENT_EMAIL || 'replit',
        private_key: process.env.STORAGE_PRIVATE_KEY || 'replit'
      }
    };
    
    // Add endpoint for compatibility with Replit Object Storage
    storageOptions.endpoint = storageEndpoint;
    
    this.storage = new Storage(storageOptions);
    
    // Initialize bucket lazily in init() method
  }

  private async init() {
    if (this.initialized) return;
    
    try {
      // Check if bucket exists
      const [buckets] = await this.storage.getBuckets();
      const bucketExists = buckets.some(bucket => bucket.name === this.bucketName);
      
      if (!bucketExists) {
        console.log(`Creating bucket ${this.bucketName}`);
        [this.bucket] = await this.storage.createBucket(this.bucketName);
      } else {
        this.bucket = this.storage.bucket(this.bucketName);
      }
      
      // Make all files in the bucket publicly readable
      await this.bucket.makePublic();
      this.initialized = true;
      console.log(`Initialized bucket ${this.bucketName}`);
    } catch (error) {
      console.error("Failed to initialize storage bucket:", error);
      throw new Error("Failed to initialize storage bucket");
    }
  }

  /**
   * Upload an image to object storage
   * @param imageBuffer - The image buffer to upload
   * @param mimeType - The MIME type of the image
   * @param userId - The user ID for organization/permissions
   * @returns The URL of the uploaded image
   */
  async uploadImage(imageBuffer: Buffer, mimeType: string, userId?: number): Promise<string> {
    // Ensure bucket is initialized
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Generate unique file name to prevent collisions
      const fileExtension = this.getFileExtensionFromMimeType(mimeType);
      const hashPrefix = crypto.createHash('md5').update(imageBuffer).digest('hex').substring(0, 8);
      const timestamp = Date.now();
      const userPrefix = userId ? `user_${userId}` : 'anonymous';
      const fileName = `${userPrefix}/${timestamp}_${hashPrefix}.${fileExtension}`;
      
      // Upload the file
      const file = this.bucket.file(fileName);
      
      // Upload with proper content type
      await file.save(imageBuffer, {
        metadata: {
          contentType: mimeType
        }
      });
      
      // Make the file public (this may be redundant if bucket is public)
      await file.makePublic();
      
      // Get the public URL
      const publicUrl = file.publicUrl();
      
      console.log(`Uploaded image to ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      throw new Error(`Failed to upload image: ${error}`);
    }
  }

  /**
   * Delete an image from object storage
   * @param imageUrl - The URL of the image to delete
   */
  async deleteImage(imageUrl: string): Promise<void> {
    // Ensure bucket is initialized
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Extract file name from URL
      const url = new URL(imageUrl);
      const pathParts = url.pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      // Delete the file
      await this.bucket.file(fileName).delete();
      
      console.log(`Deleted image ${fileName}`);
    } catch (error) {
      console.error("Error deleting image:", error);
      throw new Error(`Failed to delete image: ${error}`);
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/x-icon': 'ico',
    };
    
    return mimeToExt[mimeType] || 'bin';
  }
}

export const imageStorage = new ImageStorageService();