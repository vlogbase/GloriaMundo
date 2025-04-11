import { BullMQService } from './bullmq';

// Get the BullMQ service instance
let bullMQService: BullMQService | null = null;

/**
 * Initialize the BullMQ service
 */
export function initBullMQService(service: BullMQService): void {
  bullMQService = service;
}

/**
 * Add a job to the document processing queue
 */
export async function addJobToQueue(name: string, data: any, options?: any): Promise<string | null> {
  if (!bullMQService) {
    console.error('BullMQ service not initialized');
    return null;
  }
  
  return await bullMQService.addDocumentProcessingJob(name, data, options);
}