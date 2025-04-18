import { Storage, Bucket } from '@google-cloud/storage';
import * as crypto from 'crypto';
import { URL } from 'url';

/**
 * Service for handling file storage using Google Cloud Storage-compatible APIs
 * (works with Replit object storage)
 */
class ContentStorageService {
  private storage: Storage;
  private bucket!: Bucket; // Using definite assignment assertion
  private initialized: boolean = false;
  private bucketName: string = 'gloriamundo-content';

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
        
        // Set up lifecycle rules for image expiration (1 month)
        await this.configureBucketLifecycle();
      } else {
        this.bucket = this.storage.bucket(this.bucketName);
        
        // Update lifecycle rules if they don't exist
        await this.configureBucketLifecycle();
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
   * Configure lifecycle rules for automatic file expiration
   */
  private async configureBucketLifecycle() {
    try {
      console.log(`Configuring lifecycle rules for bucket ${this.bucketName}`);
      
      // Define lifecycle rule for 30-day expiration with proper type
      const lifecycleObject = {
        lifecycle: {
          rule: [
            {
              action: {
                type: "Delete" as "Delete" // Type assertion to match required string literal
              },
              condition: {
                age: 30 // Delete objects after 30 days
              }
            }
          ]
        }
      };
      
      // Using the setMetadata method instead of direct setLifecycleRules
      await this.bucket.setMetadata(lifecycleObject);
      console.log('Bucket lifecycle rules configured successfully: 30-day expiration');
    } catch (error) {
      console.error('Error configuring bucket lifecycle rules:', error);
      // Don't throw here - this shouldn't block initialization
      console.log('Continuing without lifecycle rules (manual cleanup may be needed)');
    }
  }

  /**
   * Upload a file to object storage
   * @param fileBuffer - The file buffer to upload
   * @param mimeType - The MIME type of the file
   * @param userId - The user ID for organization/permissions
   * @returns The URL of the uploaded file
   */
  async uploadFile(fileBuffer: Buffer, mimeType: string, userId?: number): Promise<string> {
    // Ensure bucket is initialized
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Generate unique file name to prevent collisions
      const fileExtension = this.getFileExtensionFromMimeType(mimeType);
      const hashPrefix = crypto.createHash('md5').update(fileBuffer).digest('hex').substring(0, 8);
      const timestamp = Date.now();
      const userPrefix = userId ? `user_${userId}` : 'anonymous';
      const fileName = `${userPrefix}/${timestamp}_${hashPrefix}.${fileExtension}`;
      
      // Upload the file
      const file = this.bucket.file(fileName);
      
      // Upload with proper content type
      await file.save(fileBuffer, {
        metadata: {
          contentType: mimeType
        }
      });
      
      // Make the file public (this may be redundant if bucket is public)
      await file.makePublic();
      
      // Get the public URL
      const publicUrl = file.publicUrl();
      
      console.log(`Uploaded file to ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw new Error(`Failed to upload file: ${error}`);
    }
  }

  /**
   * Delete a file from object storage
   * @param fileUrl - The URL of the file to delete
   */
  async deleteFile(fileUrl: string): Promise<void> {
    // Ensure bucket is initialized
    if (!this.initialized) {
      await this.init();
    }

    try {
      // Extract file path from URL
      const url = new URL(fileUrl);
      
      // The pathname will include the bucket name in the URL
      // Format: /BUCKET_NAME/user_X/TIMESTAMP_HASH.ext
      const pathParts = url.pathname.split('/');
      
      // To get the full file path within the bucket, we need to remove the bucket name
      // and reconstruct the path (user_id/timestamp_hash.ext)
      const bucketIndex = pathParts.findIndex(part => part === this.bucketName);
      
      // Get all parts after the bucket name
      let filePath = '';
      
      if (bucketIndex >= 0 && bucketIndex < pathParts.length - 1) {
        // Use parts after bucket name for the file path
        filePath = pathParts.slice(bucketIndex + 1).join('/');
      } else {
        // Fallback: use the last two parts (user_id/filename.ext)
        if (pathParts.length >= 2) {
          filePath = `${pathParts[pathParts.length - 2]}/${pathParts[pathParts.length - 1]}`;
        } else {
          // Last resort: just use the filename
          filePath = pathParts[pathParts.length - 1];
        }
      }
      
      console.log(`Attempting to delete file at path: ${filePath}`);
      
      // Delete the file using the complete path
      await this.bucket.file(filePath).delete();
      
      console.log(`Successfully deleted file at path: ${filePath}`);
    } catch (error) {
      console.error("Error deleting file:", error);
      throw new Error(`Failed to delete file: ${error}`);
    }
  }

  /**
   * Get file extension from MIME type
   */
  private getFileExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      // Images
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/tiff': 'tiff',
      'image/x-icon': 'ico',
      
      // Videos
      'video/mp4': 'mp4',
      'video/mpeg': 'mpg',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/webm': 'webm',
      
      // Audio
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/midi': 'midi',
      'audio/ogg': 'ogg',
      'audio/x-m4a': 'm4a',
      
      // Documents
      'application/pdf': 'pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
      'application/vnd.ms-powerpoint': 'ppt',
      'text/plain': 'txt',
      'text/csv': 'csv',
      'application/rtf': 'rtf',
      'text/html': 'html'
    };
    
    return mimeToExt[mimeType] || 'bin';
  }
}

export const contentStorage = new ContentStorageService();