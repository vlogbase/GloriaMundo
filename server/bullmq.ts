import { Queue, Worker, QueueEvents, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

/**
 * BullMQ service for managing background jobs
 * This provides a unified interface for document processing jobs
 */
export class BullMQService {
  private redisClient: IORedis;
  private documentProcessingQueue: Queue;
  private documentQueueEvents: QueueEvents;
  private isRedisAvailable: boolean = false;
  
  constructor() {
    // Initialize Redis connection options
    const redisConnectionOptions: ConnectionOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6380', 10), // Default to 6380 for Azure Redis (SSL port)
      password: process.env.REDIS_PASSWORD || '',
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false, // Recommended for some cloud Redis providers
      tls: process.env.REDIS_PORT === '6380' ? {} : undefined // Required for Azure Cache for Redis which uses SSL
    };
    
    try {
      // Initialize Redis client
      this.redisClient = new IORedis(redisConnectionOptions);
      
      // Set up error handling for Redis connection
      this.redisClient.on('error', (err) => {
        console.error('Redis connection error:', err);
        this.isRedisAvailable = false;
      });
      
      this.redisClient.on('connect', () => {
        console.log('Successfully connected to Redis');
        this.isRedisAvailable = true;
      });
      
      // Initialize BullMQ queue for document processing
      this.documentProcessingQueue = new Queue('document-processing', {
        connection: redisConnectionOptions,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
          removeOnComplete: true, // Remove jobs after completion
          removeOnFail: 100, // Keep the last 100 failed jobs
        }
      });
      
      // Set up queue events for logging
      this.documentQueueEvents = new QueueEvents('document-processing', { connection: redisConnectionOptions });
      
      this.documentQueueEvents.on('completed', ({ jobId }) => {
        console.log(`Job ${jobId} completed successfully`);
      });
      
      this.documentQueueEvents.on('failed', ({ jobId, failedReason }) => {
        console.error(`Job ${jobId} failed with reason: ${failedReason}`);
      });
      
      console.log('BullMQ service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize BullMQ service:', error);
      this.isRedisAvailable = false;
    }
  }
  
  /**
   * Check if Redis is available for job processing
   */
  public isAvailable(): boolean {
    return this.isRedisAvailable;
  }
  
  /**
   * Add a job to the document processing queue
   */
  public async addDocumentProcessingJob(name: string, data: any, options?: any): Promise<string | null> {
    if (!this.isRedisAvailable) {
      console.log('Redis not available, using fallback mode');
      // Fallback: Process immediately in-memory (non-persistent)
      setTimeout(() => {
        console.log(`Processing job "${name}" in fallback mode`);
        // Implementation would depend on job type
      }, 100);
      return null;
    }
    
    try {
      const job = await this.documentProcessingQueue.add(name, data, options);
      return job.id;
    } catch (error) {
      console.error(`Failed to add job "${name}" to queue:`, error);
      return null;
    }
  }
  
  /**
   * Close Redis connections
   */
  public async close(): Promise<void> {
    try {
      await this.documentProcessingQueue.close();
      await this.documentQueueEvents.close();
      await this.redisClient.quit();
    } catch (error) {
      console.error('Error closing BullMQ service:', error);
    }
  }
}