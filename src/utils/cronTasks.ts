import cron from 'node-cron';
import { StorageManager } from './StorageManager.js';

export const initCronJobs = () => {
  cron.schedule('0 * * * *', async () => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Starting hourly garbage collection...`);

    try {
      await StorageManager.runGarbageCollection();
      console.log(`[${timestamp}] GC completed.`);
    } catch (error) {
      console.error(`[${timestamp}] GC failed:`, error);
    }
  });
};
